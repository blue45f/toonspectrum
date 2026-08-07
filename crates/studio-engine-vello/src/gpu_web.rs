//! Browser WebGPU wasm lane (ADR-0011 lane 2, V12 §4.1 vello 0.9 Classic).
//!
//! Compiled only for `wasm32` with the `gpu` feature — i.e. the `pkg-gpu/`
//! wasm-pack artifact. The default `pkg/` CPU artifact never contains this
//! module. Entry points:
//! - [`probe_webgpu`]: adapter availability + adapter info as a JSON string.
//! - [`render_scene_gpu_json`]: SceneIR JSON -> RGBA8 pixels through
//!   vello 0.9 `render_to_texture` on the browser's WebGPU device, with a
//!   256-byte-aligned COPY_SRC readback (evidence collection lane; the
//!   interactive path never reads back).
//!
//! Scene parsing and vello Scene encoding are shared with the native Metal
//! parity harness (`crate::render::parse_scene`, `crate::gpu_scene`), so the
//! browser lane renders byte-for-byte the same encoding the native gate
//! validated.

use std::cell::RefCell;
use std::future::Future;
use std::num::NonZeroUsize;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll, Waker};

use vello::peniko::Color;
use vello::wgpu;
use vello::{AaConfig, AaSupport, RenderParams, Renderer, RendererOptions};
use wasm_bindgen::prelude::*;

use crate::gpu_scene::encode_scene;
use crate::render::parse_scene;
use crate::scene::SceneIR;

/// Cached device/queue/renderer — WebGPU adapter acquisition and vello shader
/// compilation are expensive, and the wasm main thread is single-threaded so a
/// thread_local slot is a true singleton.
struct GpuContext {
    device: wgpu::Device,
    queue: wgpu::Queue,
    renderer: RefCell<Renderer>,
}

thread_local! {
    static GPU_CONTEXT: RefCell<Option<Rc<GpuContext>>> = const { RefCell::new(None) };
}

fn webgpu_instance() -> wgpu::Instance {
    wgpu::Instance::new(wgpu::InstanceDescriptor {
        // Browser lane is WebGPU-only by contract: no silent WebGL downgrade.
        // Absence of an adapter must surface as an explicit error so the TS
        // wrapper can route to the vello_cpu wasm fallback.
        backends: wgpu::Backends::BROWSER_WEBGPU,
        ..wgpu::InstanceDescriptor::new_without_display_handle()
    })
}

async fn request_adapter() -> Result<wgpu::Adapter, String> {
    webgpu_instance()
        .request_adapter(&wgpu::RequestAdapterOptions::default())
        .await
        .map_err(|error| format!("WebGPU adapter unavailable: {error}"))
}

async fn acquire_context() -> Result<Rc<GpuContext>, String> {
    if let Some(existing) = GPU_CONTEXT.with(|slot| slot.borrow().clone()) {
        return Ok(existing);
    }
    let adapter = request_adapter().await?;
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default())
        .await
        .map_err(|error| format!("WebGPU device request failed: {error}"))?;
    let renderer = Renderer::new(
        &device,
        RendererOptions {
            use_cpu: false,
            // Same AA configuration as the native Metal parity gate.
            antialiasing_support: AaSupport::area_only(),
            num_init_threads: NonZeroUsize::new(1),
            pipeline_cache: None,
        },
    )
    .map_err(|error| format!("vello renderer init failed: {error}"))?;
    let context = Rc::new(GpuContext {
        device,
        queue,
        renderer: RefCell::new(renderer),
    });
    GPU_CONTEXT.with(|slot| *slot.borrow_mut() = Some(Rc::clone(&context)));
    Ok(context)
}

#[derive(Default)]
struct MapShared {
    result: Option<Result<(), wgpu::BufferAsyncError>>,
    waker: Option<Waker>,
}

/// Minimal oneshot future for `map_async` — the browser event loop resolves
/// the underlying `GPUBuffer.mapAsync` promise, wgpu invokes our callback,
/// and the callback wakes this future. No polling loop, no extra deps.
struct MapFuture(Rc<RefCell<MapShared>>);

impl Future for MapFuture {
    type Output = Result<(), wgpu::BufferAsyncError>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let mut shared = self.0.borrow_mut();
        if let Some(result) = shared.result.take() {
            Poll::Ready(result)
        } else {
            shared.waker = Some(cx.waker().clone());
            Poll::Pending
        }
    }
}

async fn render_scene_gpu(scene_ir: &SceneIR) -> Result<Vec<u8>, String> {
    if scene_ir.version != 11 {
        return Err(format!("invalid scene: unsupported scene version: {}", scene_ir.version));
    }
    if scene_ir.width == 0
        || scene_ir.height == 0
        || scene_ir.width > u32::from(u16::MAX)
        || scene_ir.height > u32::from(u16::MAX)
    {
        return Err(format!(
            "invalid scene: scene size out of range: {}x{}",
            scene_ir.width, scene_ir.height
        ));
    }
    let scene = encode_scene(scene_ir).map_err(|features| {
        // Same marker contract as the CPU lane so the TS wrapper can convert
        // this into UnsupportedSceneFeatureError instead of a silent skip.
        format!(
            "vello-gpu-browser provider cannot render required scene features: {}",
            features.join(", ")
        )
    })?;
    let context = acquire_context().await?;

    let width = scene_ir.width;
    let height = scene_ir.height;
    let texture = context.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("vello-gpu-browser-target"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    context
        .renderer
        .borrow_mut()
        .render_to_texture(
            &context.device,
            &context.queue,
            &scene,
            &view,
            &RenderParams {
                base_color: Color::new([
                    scene_ir.background.r,
                    scene_ir.background.g,
                    scene_ir.background.b,
                    scene_ir.background.a,
                ]),
                width,
                height,
                antialiasing_method: AaConfig::Area,
            },
        )
        .map_err(|error| format!("vello GPU render failed: {error}"))?;

    // WebGPU requires copy_texture_to_buffer rows aligned to 256 bytes.
    let bytes_per_row = (width * 4).div_ceil(256) * 256;
    let buffer = context.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("vello-gpu-browser-readback"),
        size: u64::from(bytes_per_row * height),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = context
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: None,
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    context.queue.submit([encoder.finish()]);

    let slice = buffer.slice(..);
    let shared = Rc::new(RefCell::new(MapShared::default()));
    let callback_shared = Rc::clone(&shared);
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let mut state = callback_shared.borrow_mut();
        state.result = Some(result);
        if let Some(waker) = state.waker.take() {
            waker.wake();
        }
    });
    MapFuture(shared)
        .await
        .map_err(|error| format!("readback buffer map failed: {error}"))?;

    let mut pixels = Vec::with_capacity((width * height * 4) as usize);
    {
        let data = slice.get_mapped_range();
        for row in 0..height {
            let start = (row * bytes_per_row) as usize;
            pixels.extend_from_slice(&data[start..start + (width * 4) as usize]);
        }
    }
    buffer.unmap();
    Ok(pixels)
}

/// Renders SceneIR JSON on the browser's WebGPU device and resolves with the
/// RGBA8 pixels (width * height * 4). Rejects with an explicit error when
/// WebGPU is unavailable, the scene is invalid, or it needs unsupported
/// features — never a silent fallback.
#[wasm_bindgen]
pub async fn render_scene_gpu_json(scene_json: String) -> Result<js_sys::Uint8Array, JsError> {
    let scene = parse_scene(&scene_json).map_err(|error| JsError::new(&error.to_string()))?;
    let pixels = render_scene_gpu(&scene)
        .await
        .map_err(|error| JsError::new(&error))?;
    Ok(js_sys::Uint8Array::from(pixels.as_slice()))
}

/// Probes WebGPU adapter availability. Resolves with a JSON string:
/// `{"supported":true,"adapter":{...},"engine":"..."}` or
/// `{"supported":false,"reason":"..."}`. Never rejects — probing is the one
/// operation that must be safe to call blindly.
#[wasm_bindgen]
pub async fn probe_webgpu() -> String {
    match request_adapter().await {
        Ok(adapter) => {
            let info = adapter.get_info();
            serde_json::json!({
                "supported": true,
                "adapter": {
                    "name": info.name,
                    "backend": format!("{:?}", info.backend),
                    "deviceType": format!("{:?}", info.device_type),
                    "driver": info.driver,
                    "driverInfo": info.driver_info,
                },
                "engine": format!(
                    "studio-engine-vello {} (vello 0.9 GPU, wgpu BROWSER_WEBGPU)",
                    env!("CARGO_PKG_VERSION")
                ),
            })
            .to_string()
        }
        Err(reason) => serde_json::json!({
            "supported": false,
            "reason": reason,
        })
        .to_string(),
    }
}
