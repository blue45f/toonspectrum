//! Velato Lottie lane native validation (ADR-0011 Velato lane).
//!
//! Lowers hand-authored Lottie fixtures (tests/fixtures/lottie/, no external
//! downloads) through `src/lottie.rs` and renders them on a headless wgpu
//! device (Metal on macOS) via the same texture/readback path as the GPU
//! parity harness. Gates:
//! - error contract: parse failures / unsupported constructs / out-of-range
//!   frames are explicit `{"code":"lottie-*"}` JSON errors (no importer panic),
//! - determinism: identical (json, frame, size) inputs produce byte-identical
//!   pixels,
//! - animation: different frames produce genuinely different pixels with the
//!   motion the fixture encodes (translation midpoint, 0°→90° rotation),
//! - clipping: a frame whose shape lies fully outside the canvas renders
//!   fully transparent without wrapping or panicking,
//! - free scaling: the composition scales to arbitrary target sizes.
//!
//! Dev-dependency only (velato + vello + pollster): nothing here ships in the
//! default wasm artifact.
#![cfg(not(target_arch = "wasm32"))]

use std::num::NonZeroUsize;

use vello::peniko::Color;
use vello::wgpu;
use vello::{AaConfig, AaSupport, RenderParams, Renderer, RendererOptions};

/// Same include-by-path pattern as tests/gpu_parity.rs + src/gpu_scene.rs:
/// the module compiles here against the dev-dependencies on plain
/// `cargo test`, and inside the library behind the `lottie` feature.
#[path = "../src/lottie.rs"]
#[allow(dead_code)]
mod lottie;

const TRANSLATING_SQUARE: &str = include_str!("fixtures/lottie/translating-square.json");
const ROTATING_BAR: &str = include_str!("fixtures/lottie/rotating-bar.json");

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

/// Renders an already-lowered vello Scene over a transparent base — the
/// native mirror of `gpu_web::render_encoded_scene_gpu`.
fn render_scene(gpu: &mut Gpu, scene: &vello::Scene, width: u32, height: u32) -> Vec<u8> {
    let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("velato-lottie-target"),
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
            scene,
            &view,
            &RenderParams {
                base_color: Color::new([0.0, 0.0, 0.0, 0.0]),
                width,
                height,
                antialiasing_method: AaConfig::Area,
            },
        )
        .expect("gpu render");

    let bytes_per_row = (width * 4).div_ceil(256) * 256;
    let buffer = gpu.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("velato-lottie-readback"),
        size: u64::from(bytes_per_row * height),
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
    gpu.device
        .poll(wgpu::PollType::wait_indefinitely())
        .expect("poll");
    let data = slice.get_mapped_range();
    let mut pixels = Vec::with_capacity((width * height * 4) as usize);
    for row in 0..height {
        let start = (row * bytes_per_row) as usize;
        pixels.extend_from_slice(&data[start..start + (width * 4) as usize]);
    }
    pixels
}

fn render_lottie(gpu: &mut Gpu, json: &str, frame: f64, width: u32, height: u32) -> Vec<u8> {
    let composition = lottie::parse_composition(json).expect("fixture parses");
    let scene =
        lottie::compose_frame_scene(&composition, frame, width, height).expect("frame lowers");
    render_scene(gpu, &scene, width, height)
}

/// FNV-1a 64 digest for log lines — equality assertions compare full byte
/// buffers, the digest is only human-readable evidence.
fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn is_red(pixels: &[u8], width: u32, x: u32, y: u32) -> bool {
    let base = ((y * width + x) * 4) as usize;
    pixels[base] > 200 && pixels[base + 1] < 50 && pixels[base + 2] < 50 && pixels[base + 3] > 200
}

fn is_blue(pixels: &[u8], width: u32, x: u32, y: u32) -> bool {
    let base = ((y * width + x) * 4) as usize;
    pixels[base] < 50 && pixels[base + 1] < 50 && pixels[base + 2] > 200 && pixels[base + 3] > 200
}

fn red_stats(pixels: &[u8], width: u32, height: u32) -> (usize, f64) {
    let mut count = 0usize;
    let mut x_sum = 0f64;
    for y in 0..height {
        for x in 0..width {
            if is_red(pixels, width, x, y) {
                count += 1;
                x_sum += f64::from(x);
            }
        }
    }
    let mean_x = if count == 0 { f64::NAN } else { x_sum / count as f64 };
    (count, mean_x)
}

// ---------------------------------------------------------------------------
// Error contract (no GPU required)
// ---------------------------------------------------------------------------

#[test]
fn parse_rejects_invalid_json_with_explicit_code() {
    let error = lottie::parse_composition("{\"v\":").expect_err("must reject");
    assert!(
        error.contains("\"code\":\"lottie-parse-failed\""),
        "unexpected error payload: {error}"
    );
}

#[test]
fn parse_rejects_layer_without_scalar_rotation_instead_of_panicking() {
    // velato 0.11's importer hits todo!() on a layer transform without `ks.r`
    // (src/import/converters.rs conv_transform); the schema pre-pass must turn
    // that into an explicit unsupported error before the importer runs.
    let missing_rotation = TRANSLATING_SQUARE.replace("\"r\": { \"a\": 0, \"k\": 0 },\n", "");
    assert!(
        !missing_rotation.contains("\"r\": { \"a\": 0, \"k\": 0 },"),
        "fixture edit failed to drop the layer rotation"
    );
    let error = lottie::parse_composition(&missing_rotation).expect_err("must reject");
    assert!(
        error.contains("\"code\":\"lottie-unsupported\"") && error.contains("rotation"),
        "unexpected error payload: {error}"
    );
}

#[test]
fn parse_rejects_add_blend_mode_instead_of_panicking() {
    // Blend Add (bm:16) is unimplemented!() in velato's conv_blend_mode.
    let with_add_blend = TRANSLATING_SQUARE.replace("\"ty\": 4,", "\"ty\": 4,\n      \"bm\": 16,");
    let error = lottie::parse_composition(&with_add_blend).expect_err("must reject");
    assert!(
        error.contains("\"code\":\"lottie-unsupported\"") && error.contains("Add"),
        "unexpected error payload: {error}"
    );
}

/// `Result::expect_err` needs `T: Debug` and vello's `Scene` is not — unwrap
/// the Err arm by hand.
fn expect_scene_err(
    result: Result<vello::Scene, String>,
    context: &str,
) -> String {
    match result {
        Err(error) => error,
        Ok(_) => panic!("{context}: expected an explicit error, got a scene"),
    }
}

#[test]
fn frame_and_size_gates_are_explicit() {
    let composition = lottie::parse_composition(TRANSLATING_SQUARE).expect("fixture parses");
    for bad_frame in [-1.0, 61.0, f64::NAN, f64::INFINITY] {
        let error = expect_scene_err(
            lottie::compose_frame_scene(&composition, bad_frame, 128, 128),
            "bad frame",
        );
        assert!(
            error.contains("\"code\":\"lottie-frame-out-of-range\""),
            "frame {bad_frame}: unexpected error payload: {error}"
        );
    }
    for (width, height) in [(0u32, 128u32), (128, 0), (70_000, 128)] {
        let error = expect_scene_err(
            lottie::compose_frame_scene(&composition, 0.0, width, height),
            "bad size",
        );
        assert!(
            error.contains("\"code\":\"lottie-invalid-size\""),
            "{width}x{height}: unexpected error payload: {error}"
        );
    }
}

// ---------------------------------------------------------------------------
// GPU behavior gates (skip when the host exposes no adapter)
// ---------------------------------------------------------------------------

#[test]
fn lottie_frames_render_deterministically() {
    let Some(mut gpu) = gpu() else {
        eprintln!("SKIP: no wgpu adapter available on this host");
        return;
    };
    for (name, json) in [
        ("translating-square", TRANSLATING_SQUARE),
        ("rotating-bar", ROTATING_BAR),
    ] {
        for frame in [0.0, 30.0] {
            let first = render_lottie(&mut gpu, json, frame, 128, 128);
            let second = render_lottie(&mut gpu, json, frame, 128, 128);
            eprintln!(
                "{name} frame {frame}: fnv1a64 {:016x} / {:016x}",
                fnv1a64(&first),
                fnv1a64(&second)
            );
            assert_eq!(
                first, second,
                "{name} frame {frame}: identical inputs must produce identical pixels"
            );
        }
    }
}

#[test]
fn translation_keyframes_move_the_square_and_clip_off_canvas() {
    let Some(mut gpu) = gpu() else {
        eprintln!("SKIP: no wgpu adapter available on this host");
        return;
    };
    let start = render_lottie(&mut gpu, TRANSLATING_SQUARE, 0.0, 128, 128);
    let middle = render_lottie(&mut gpu, TRANSLATING_SQUARE, 30.0, 128, 128);
    let end = render_lottie(&mut gpu, TRANSLATING_SQUARE, 60.0, 128, 128);

    assert_ne!(start, middle, "frame 0 and frame 30 must differ");
    assert_ne!(middle, end, "frame 30 and frame 60 must differ");

    // Frame 0: 32x32 red square centered at x=32 — mean red x ≈ 31.5.
    let (start_count, start_mean_x) = red_stats(&start, 128, 128);
    assert!(
        (950..=1100).contains(&start_count),
        "frame 0 red coverage {start_count} outside expected ~1024"
    );
    assert!(
        (24.0..=40.0).contains(&start_mean_x),
        "frame 0 mean red x {start_mean_x} not near 32"
    );

    // Frame 30: linear midpoint of 32 -> 160 is x=96 — interpolation is real,
    // not a snap to either keyframe.
    let (middle_count, middle_mean_x) = red_stats(&middle, 128, 128);
    assert!(
        (950..=1100).contains(&middle_count),
        "frame 30 red coverage {middle_count} outside expected ~1024"
    );
    assert!(
        (88.0..=104.0).contains(&middle_mean_x),
        "frame 30 mean red x {middle_mean_x} not near the 96 midpoint"
    );

    // Frame 60: center x=160, square spans 144..176 — fully outside the
    // 128px canvas. Must clip to a fully transparent frame (no wrap).
    assert!(
        end.iter().all(|&byte| byte == 0),
        "frame 60 must be fully transparent (square is entirely off-canvas)"
    );
}

#[test]
fn rotation_keyframes_actually_rotate_the_bar() {
    let Some(mut gpu) = gpu() else {
        eprintln!("SKIP: no wgpu adapter available on this host");
        return;
    };
    let start = render_lottie(&mut gpu, ROTATING_BAR, 0.0, 128, 128);
    let middle = render_lottie(&mut gpu, ROTATING_BAR, 30.0, 128, 128);
    let end = render_lottie(&mut gpu, ROTATING_BAR, 60.0, 128, 128);

    assert_ne!(start, middle, "frame 0 and frame 30 must differ");
    assert_ne!(middle, end, "frame 30 and frame 60 must differ");

    // Frame 0: horizontal 64x16 bar centered at (64,64) — (90,64) inside,
    // (64,90) outside.
    assert!(is_blue(&start, 128, 90, 64), "frame 0: (90,64) must be inside the bar");
    assert!(!is_blue(&start, 128, 64, 90), "frame 0: (64,90) must be outside the bar");

    // Frame 60: rotated 90° — the probes swap.
    assert!(is_blue(&end, 128, 64, 90), "frame 60: (64,90) must be inside the bar");
    assert!(!is_blue(&end, 128, 90, 64), "frame 60: (90,64) must be outside the bar");
}

#[test]
fn composition_scales_to_arbitrary_target_sizes() {
    let Some(mut gpu) = gpu() else {
        eprintln!("SKIP: no wgpu adapter available on this host");
        return;
    };
    // 128px composition rendered at 64px: the 32px square becomes ~16px
    // (≈256px² coverage); at 256px it becomes ~64px (≈4096px² coverage).
    let half = render_lottie(&mut gpu, TRANSLATING_SQUARE, 0.0, 64, 64);
    let (half_count, _) = red_stats(&half, 64, 64);
    assert!(
        (200..=320).contains(&half_count),
        "64x64 red coverage {half_count} outside expected ~256"
    );

    let double = render_lottie(&mut gpu, TRANSLATING_SQUARE, 0.0, 256, 256);
    let (double_count, double_mean_x) = red_stats(&double, 256, 256);
    assert!(
        (3900..=4300).contains(&double_count),
        "256x256 red coverage {double_count} outside expected ~4096"
    );
    assert!(
        (56.0..=72.0).contains(&double_mean_x),
        "256x256 mean red x {double_mean_x} not near the scaled center 64"
    );
}
