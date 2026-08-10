//! Native contracts for the strict vello_svg 0.10 lane.
#![cfg(all(feature = "svg", not(target_arch = "wasm32")))]

use std::num::NonZeroUsize;

use studio_engine_vello::svg::{
    audit_svg_source, render_svg_cpu, svg_to_vello_scene, SvgNativeErrorCode,
};
use vello::peniko::Color;
use vello::wgpu;
use vello::{AaConfig, AaSupport, RenderParams, Renderer, RendererOptions};

const CURVES: &str = include_str!("fixtures/svg/curves.svg");
const GRADIENTS: &str = include_str!("fixtures/svg/gradients.svg");
const CLIP: &str = include_str!("fixtures/svg/clip.svg");
const SIZE: u32 = 128;

struct Gpu {
    device: wgpu::Device,
    queue: wgpu::Queue,
    renderer: Renderer,
}

fn gpu() -> Option<Gpu> {
    let instance = wgpu::Instance::default();
    let adapter =
        pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
            .ok()?;
    let (device, queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default())).ok()?;
    let renderer = Renderer::new(
        &device,
        RendererOptions {
            use_cpu: false,
            antialiasing_support: AaSupport::area_only(),
            num_init_threads: NonZeroUsize::new(1),
            pipeline_cache: None,
        },
    )
    .ok()?;
    Some(Gpu {
        device,
        queue,
        renderer,
    })
}

fn render_gpu(gpu: &mut Gpu, scene: &vello::Scene) -> Vec<u8> {
    let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("svg-native-test-target"),
        size: wgpu::Extent3d {
            width: SIZE,
            height: SIZE,
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
    gpu.renderer
        .render_to_texture(
            &gpu.device,
            &gpu.queue,
            scene,
            &view,
            &RenderParams {
                base_color: Color::new([0.0, 0.0, 0.0, 0.0]),
                width: SIZE,
                height: SIZE,
                antialiasing_method: AaConfig::Area,
            },
        )
        .expect("native SVG GPU render");

    let bytes_per_row = (SIZE * 4).div_ceil(256) * 256;
    let buffer = gpu.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("svg-native-test-readback"),
        size: u64::from(bytes_per_row * SIZE),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = gpu
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
            width: SIZE,
            height: SIZE,
            depth_or_array_layers: 1,
        },
    );
    gpu.queue.submit([encoder.finish()]);
    let slice = buffer.slice(..);
    let (sender, receiver) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        sender.send(result).expect("send map result");
    });
    gpu.device
        .poll(wgpu::PollType::wait_indefinitely())
        .expect("poll readback");
    receiver
        .recv()
        .expect("receive map result")
        .expect("map readback");
    let data = slice.get_mapped_range();
    let mut pixels = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for row in 0..SIZE {
        let start = (row * bytes_per_row) as usize;
        pixels.extend_from_slice(&data[start..start + (SIZE * 4) as usize]);
    }
    drop(data);
    buffer.unmap();
    pixels
}

fn directional_mismatches(from: &[u8], to: &[u8]) -> usize {
    let mut mismatches = 0;
    for y in 0..SIZE as i32 {
        for x in 0..SIZE as i32 {
            let base = ((y as u32 * SIZE + x as u32) * 4) as usize;
            let mut matched = false;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let nx = x + dx;
                    let ny = y + dy;
                    if nx < 0 || ny < 0 || nx >= SIZE as i32 || ny >= SIZE as i32 {
                        continue;
                    }
                    let other = ((ny as u32 * SIZE + nx as u32) * 4) as usize;
                    if (0..4)
                        .all(|channel| from[base + channel].abs_diff(to[other + channel]) <= 48)
                    {
                        matched = true;
                    }
                }
            }
            if !matched {
                mismatches += 1;
            }
        }
    }
    mismatches
}

fn fuzzy_mismatch_pct(a: &[u8], b: &[u8]) -> f64 {
    let directional = directional_mismatches(a, b).max(directional_mismatches(b, a));
    directional as f64 * 100.0 / f64::from(SIZE * SIZE)
}

#[test]
fn audit_accepts_authored_subset_and_reports_counts() {
    let audit = audit_svg_source(GRADIENTS).expect("gradient fixture must pass");
    assert!(audit.element_count >= 10);
    assert_eq!(audit.local_reference_count, 2);
}

#[test]
fn unsupported_semantics_reject_before_lowering() {
    let cases = [
        ("<svg><text>hidden loss</text></svg>", "element:text"),
        (
            "<svg><filter id='f'/><path filter='url(#f)' d='M0 0L1 1'/></svg>",
            "element:filter",
        ),
        (
            "<svg><mask id='m'/><path mask='url(#m)' d='M0 0L1 1'/></svg>",
            "element:mask",
        ),
        (
            "<svg><pattern id='p'/><path fill='url(#p)' d='M0 0L1 1'/></svg>",
            "element:pattern",
        ),
        (
            "<svg><image href='data:image/png;base64,AA=='/></svg>",
            "element:image",
        ),
        (
            "<svg><clipPath id='c'><rect/><circle/></clipPath><path clip-path='url(#c)' d='M0 0L1 1'/></svg>",
            "clipPath:requires-one-direct-geometry",
        ),
    ];
    for (svg, marker) in cases {
        let error = audit_svg_source(svg).expect_err(marker);
        assert_eq!(error.code, SvgNativeErrorCode::Unsupported);
        assert!(error.to_string().contains(marker), "{error}");
    }
}

#[test]
fn cpu_render_is_deterministic_and_nonempty() {
    for svg in [CURVES, GRADIENTS, CLIP] {
        let first = render_svg_cpu(svg, SIZE, SIZE).expect("first CPU render");
        let second = render_svg_cpu(svg, SIZE, SIZE).expect("second CPU render");
        assert_eq!(first, second);
        assert_eq!(first.len(), (SIZE * SIZE * 4) as usize);
        assert!(first
            .chunks_exact(4)
            .any(|pixel| pixel != [255, 255, 255, 255]));
    }
}

#[test]
fn gpu_and_cpu_are_within_native_fuzzy_gate() {
    let Some(mut gpu) = gpu() else {
        eprintln!("no native GPU adapter; SVG GPU parity test skipped");
        return;
    };
    for (name, svg) in [("curves", CURVES), ("gradients", GRADIENTS), ("clip", CLIP)] {
        let cpu = render_svg_cpu(svg, SIZE, SIZE).expect("CPU SVG render");
        let scene = svg_to_vello_scene(svg, SIZE, SIZE).expect("SVG -> Vello Scene");
        let first = render_gpu(&mut gpu, &scene);
        let second = render_gpu(&mut gpu, &scene);
        assert_eq!(first, second, "{name}: native GPU must be deterministic");
        let mismatch = fuzzy_mismatch_pct(&cpu, &first);
        assert!(
            mismatch <= 0.8,
            "{name}: CPU/GPU fuzzy mismatch {mismatch:.4}% exceeds 0.8%"
        );
    }
}

#[test]
fn simple_clip_keeps_corners_white() {
    let pixels = render_svg_cpu(CLIP, SIZE, SIZE).expect("clip CPU render");
    for (x, y) in [(2, 2), (125, 2), (2, 125), (125, 125)] {
        let offset = ((y * SIZE + x) * 4) as usize;
        assert_eq!(&pixels[offset..offset + 4], &[255, 255, 255, 255]);
    }
}

#[test]
fn target_and_resource_limits_are_explicit() {
    let invalid = render_svg_cpu(CURVES, 0, SIZE).expect_err("zero width must fail");
    assert_eq!(invalid.code, SvgNativeErrorCode::InvalidSize);
    let oversized = format!("<svg>{}</svg>", " ".repeat(2 * 1024 * 1024));
    let resource = audit_svg_source(&oversized).expect_err("oversized input must fail");
    assert_eq!(resource.code, SvgNativeErrorCode::ResourceLimit);
}
