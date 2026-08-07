//! Vello GPU (Classic) native validation (ADR-0010 §4).
//!
//! Renders the shared vector corpus through vello 0.9 on a headless wgpu
//! device (Metal on macOS) and compares against the deterministic vello_cpu
//! lane with the same 3×3/δ48 fuzzy metric the JS diff harness uses. With
//! VELLO_GPU_PROBE=1 it also records per-scene p50/p95 timings to
//! tests/benchmarks/results/vello-gpu-native.json — the §3.2 evidence for the
//! next-gen GPU lane. Dev-dependency only: nothing here ships in the wasm.
#![cfg(not(target_arch = "wasm32"))]

use std::num::NonZeroUsize;
use std::time::Instant;

use studio_engine_vello::scene::SceneIR;
use vello::peniko::Color;
use vello::wgpu;
use vello::{AaConfig, AaSupport, RenderParams, Renderer, RendererOptions};

// Re-export so the shared module resolves `super::scene::*` identically here
// and inside the library (see src/gpu_scene.rs header).
pub use studio_engine_vello::scene;

/// SceneIR -> vello Scene encoding shared with the browser WebGPU wasm lane
/// (src/gpu_web.rs). Included by path so this harness keeps running on plain
/// `cargo test` (dev-dependency vello) while the library only carries the
/// module behind the `gpu` feature.
#[path = "../src/gpu_scene.rs"]
#[allow(dead_code)]
mod gpu_scene;

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
    let (device, queue) = pollster::block_on(
        adapter.request_device(&wgpu::DeviceDescriptor::default()),
    )
    .ok()?;
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

fn render_gpu(gpu: &mut Gpu, scene_ir: &SceneIR) -> Vec<u8> {
    let scene = gpu_scene::encode_scene(scene_ir).expect("corpus scenes carry no text");

    let width = scene_ir.width;
    let height = scene_ir.height;
    let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("vello-target"),
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
    gpu.renderer
        .render_to_texture(
            &gpu.device,
            &gpu.queue,
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
        .expect("gpu render");

    let bytes_per_row = (width * 4).div_ceil(256) * 256;
    let buffer = gpu.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("readback"),
        size: (bytes_per_row * height) as u64,
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
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    gpu.queue.submit([encoder.finish()]);
    let slice = buffer.slice(..);
    slice.map_async(wgpu::MapMode::Read, |_| {});
    gpu.device.poll(wgpu::PollType::wait_indefinitely()).expect("poll");
    let data = slice.get_mapped_range();
    let mut pixels = Vec::with_capacity((width * height * 4) as usize);
    for row in 0..height {
        let start = (row * bytes_per_row) as usize;
        pixels.extend_from_slice(&data[start..start + (width * 4) as usize]);
    }
    pixels
}

/// Same symmetric 3×3 δ48 fuzzy metric as tests/visual/cross-renderer-diff.
fn fuzzy_mismatch_pct(a: &[u8], b: &[u8], width: usize, height: usize) -> f64 {
    let directional = |from: &[u8], to: &[u8]| -> usize {
        let mut mismatches = 0;
        for y in 0..height {
            for x in 0..width {
                let base = (y * width + x) * 4;
                let mut matched = false;
                'search: for dy in -1_i64..=1 {
                    let ny = y as i64 + dy;
                    if ny < 0 || ny >= height as i64 {
                        continue;
                    }
                    for dx in -1_i64..=1 {
                        let nx = x as i64 + dx;
                        if nx < 0 || nx >= width as i64 {
                            continue;
                        }
                        let other = ((ny as usize) * width + nx as usize) * 4;
                        let mut channel_max = 0_i32;
                        for c in 0..4 {
                            let delta = (from[base + c] as i32 - to[other + c] as i32).abs();
                            channel_max = channel_max.max(delta);
                        }
                        if channel_max <= 48 {
                            matched = true;
                            break 'search;
                        }
                    }
                }
                if !matched {
                    mismatches += 1;
                }
            }
        }
        mismatches
    };
    let worst = directional(a, b).max(directional(b, a));
    worst as f64 / (width * height) as f64 * 100.0
}

fn corpus() -> Vec<(String, SceneIR)> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/corpus/vector");
    let mut scenes = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .expect("corpus dir")
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .collect();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        let name = entry.file_name().to_string_lossy().replace(".json", "");
        let json = std::fs::read_to_string(entry.path()).expect("scene json");
        // Corpus files omit defaulted fields; normalize through serde defaults
        // is handled by zod on the JS side — here we parse the full form the
        // Rust mirror requires, so fill defaults via serde_json round-trip.
        let scene = studio_engine_vello::parse_scene(&normalize(&json)).expect("scene");
        scenes.push((name, scene));
    }
    scenes
}

/// Rust serde mirror requires all fields; splice zod-style defaults in.
fn normalize(json: &str) -> String {
    let mut value: serde_json::Value = serde_json::from_str(json).expect("json");
    fn walk(node: &mut serde_json::Value) {
        let Some(obj) = node.as_object_mut() else { return };
        if obj.contains_key("kind") {
            let kind = obj
                .get("kind")
                .and_then(|k| k.as_str())
                .unwrap_or("")
                .to_string();
            obj.entry("opacity").or_insert(serde_json::json!(1.0));
            obj.entry("blend").or_insert(serde_json::json!("src-over"));
            if kind == "fill-path" {
                obj.entry("fillRule").or_insert(serde_json::json!("nonzero"));
            }
            if kind == "stroke-path" {
                obj.entry("cap").or_insert(serde_json::json!("round"));
                obj.entry("join").or_insert(serde_json::json!("round"));
                obj.entry("miterLimit").or_insert(serde_json::json!(4.0));
            }
        }
        if let Some(children) = obj.get_mut("children").and_then(|c| c.as_array_mut()) {
            for child in children {
                walk(child);
            }
        }
    }
    if let Some(nodes) = value.get_mut("nodes").and_then(|n| n.as_array_mut()) {
        for node in nodes {
            walk(node);
        }
    }
    value.to_string()
}

#[test]
fn gpu_matches_cpu_on_the_vector_corpus() {
    let Some(mut gpu) = gpu() else {
        eprintln!("SKIP: no wgpu adapter available on this host");
        return;
    };
    let mut rows = Vec::new();
    for (name, scene) in corpus() {
        let cpu = studio_engine_vello::render_scene(&scene).expect("cpu render");
        // Warm (shader/pipeline) then measure.
        let _ = render_gpu(&mut gpu, &scene);
        let mut samples = Vec::new();
        let mut gpu_pixels = Vec::new();
        for _ in 0..15 {
            let start = Instant::now();
            gpu_pixels = render_gpu(&mut gpu, &scene);
            samples.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let p50 = samples[samples.len() / 2];
        let p95 = samples[((samples.len() as f64 * 0.95) as usize).min(samples.len() - 1)];
        let mismatch = fuzzy_mismatch_pct(
            &cpu,
            &gpu_pixels,
            scene.width as usize,
            scene.height as usize,
        );
        eprintln!("{name}: fuzzy {mismatch:.4}% p50 {p50:.2}ms p95 {p95:.2}ms");
        assert!(
            mismatch <= 0.6,
            "{name}: GPU/CPU divergence {mismatch:.4}% exceeds 0.6%"
        );
        rows.push(serde_json::json!({
            "scene": name,
            "fuzzyMismatchPct": mismatch,
            "gpuP50Ms": p50,
            "gpuP95Ms": p95,
            "samplesMs": samples,
        }));
    }
    if std::env::var("VELLO_GPU_PROBE").as_deref() == Ok("1") {
        let report = serde_json::json!({
            "harness": "crates/studio-engine-vello/tests/gpu_parity.rs",
            "engine": "vello 0.9.0 (wgpu Metal headless, Area AA) vs vello_cpu 0.2.0",
            "note": "readback is test-only evidence collection; interactive path never reads back",
            "scenes": rows,
        });
        let target = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../tests/benchmarks/results/vello-gpu-native.json"
        );
        std::fs::write(target, format!("{}\n", serde_json::to_string_pretty(&report).unwrap()))
            .expect("write probe report");
        eprintln!("written: {target}");
    }
}
