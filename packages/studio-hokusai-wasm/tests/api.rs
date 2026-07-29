use studio_hokusai_wasm::{HokusaiBrush, HokusaiCanvas};

const TILT_BRUSH: &str = r#"{
  "version": 3,
  "settings": {
    "opaque": {
      "base_value": 0.15,
      "inputs": {
        "pressure": [[0.0, 0.0], [1.0, 0.8]]
      }
    },
    "opaque_multiply": { "base_value": 1.0 },
    "hardness": { "base_value": 0.7 },
    "radius_logarithmic": { "base_value": 2.2 },
    "dabs_per_actual_radius": { "base_value": 3.0 },
    "elliptical_dab_ratio": { "base_value": 3.0 },
    "elliptical_dab_angle": {
      "base_value": 0.0,
      "inputs": {
        "tilt_ascension": [[-180.0, -180.0], [180.0, 180.0]]
      }
    },
    "color_h": { "base_value": 0.58 },
    "color_s": { "base_value": 0.8 },
    "color_v": { "base_value": 0.55 }
  }
}"#;

const DIRTY_TILE_BRUSH: &str = r#"{
  "version": 3,
  "settings": {
    "opaque": {
      "base_value": 0.52,
      "inputs": {
        "pressure": [[0.0, -0.35], [1.0, 0.42]]
      }
    },
    "opaque_multiply": { "base_value": 1.0 },
    "hardness": { "base_value": 0.58 },
    "radius_logarithmic": { "base_value": 2.35 },
    "dabs_per_actual_radius": { "base_value": 2.75 },
    "slow_tracking": { "base_value": 3.0 },
    "tracking_noise": { "base_value": 0.055 },
    "radius_by_random": { "base_value": 0.08 },
    "anti_aliasing": { "base_value": 1.0 },
    "color_h": { "base_value": 0.075 },
    "color_s": { "base_value": 0.62 },
    "color_v": { "base_value": 0.24 }
  }
}"#;

const DIRTY_FIXTURE_WIDTH: usize = 257;
const DIRTY_FIXTURE_HEIGHT: usize = 193;
const HOKUSAI_TILE_SIZE: usize = 64;

#[derive(Clone, Copy)]
struct StrokeSample {
    x: f32,
    y: f32,
    pressure: f32,
    tilt_x: f32,
    tilt_y: f32,
    time_ms: f64,
}

fn long_curved_samples() -> Vec<StrokeSample> {
    const SAMPLE_COUNT: usize = 97;
    (0..SAMPLE_COUNT)
        .map(|index| {
            let progress = index as f32 / (SAMPLE_COUNT - 1) as f32;
            let phase = progress * std::f32::consts::TAU;
            StrokeSample {
                // Enter and leave through clipped edge tiles while crossing x=64/128/192.
                x: -8.0 + progress * 260.0,
                // The S curve crosses y=64/128 and approaches both clipped vertical edges.
                y: 96.0 + phase.sin() * 96.0,
                pressure: 0.28 + 0.68 * (phase * 1.5).sin().abs(),
                tilt_x: phase.cos() * 0.85,
                tilt_y: phase.sin() * 0.75,
                // A fast tail leaves deliberate slow-tracking work for finish_stroke.
                time_ms: 2_000.0 + index as f64 * 8.0,
            }
        })
        .collect()
}

fn checked_bounds(bounds: &[i32]) -> (usize, usize, usize, usize) {
    assert_eq!(bounds.len(), 4, "dirty bounds must be x/y/width/height");
    let x = usize::try_from(bounds[0]).expect("dirty x is non-negative");
    let y = usize::try_from(bounds[1]).expect("dirty y is non-negative");
    let width = usize::try_from(bounds[2]).expect("dirty width is non-negative");
    let height = usize::try_from(bounds[3]).expect("dirty height is non-negative");
    assert!(width > 0, "dirty width must be positive");
    assert!(height > 0, "dirty height must be positive");
    assert!(x + width <= DIRTY_FIXTURE_WIDTH, "dirty x range is clipped");
    assert!(y + height <= DIRTY_FIXTURE_HEIGHT, "dirty y range is clipped");
    assert!(
        x == 0 || x % HOKUSAI_TILE_SIZE == 0,
        "dirty x must be tile-aligned"
    );
    assert!(
        y == 0 || y % HOKUSAI_TILE_SIZE == 0,
        "dirty y must be tile-aligned"
    );
    assert!(
        x + width == DIRTY_FIXTURE_WIDTH || (x + width) % HOKUSAI_TILE_SIZE == 0,
        "dirty right edge must be tile-aligned or canvas-clipped"
    );
    assert!(
        y + height == DIRTY_FIXTURE_HEIGHT || (y + height) % HOKUSAI_TILE_SIZE == 0,
        "dirty bottom edge must be tile-aligned or canvas-clipped"
    );
    (x, y, width, height)
}

fn crop_full_frame(full: &[u8], bounds: &[i32]) -> Vec<u8> {
    let (x, y, width, height) = checked_bounds(bounds);
    let mut cropped = vec![0; width * height * 4];
    for row in 0..height {
        let source_start = ((y + row) * DIRTY_FIXTURE_WIDTH + x) * 4;
        let target_start = row * width * 4;
        cropped[target_start..target_start + width * 4]
            .copy_from_slice(&full[source_start..source_start + width * 4]);
    }
    cropped
}

fn assert_bytes_exact(actual: &[u8], expected: &[u8], context: &str) {
    assert_eq!(
        actual.len(),
        expected.len(),
        "{context}: byte lengths differ"
    );
    if let Some(index) = actual
        .iter()
        .zip(expected)
        .position(|(actual_byte, expected_byte)| actual_byte != expected_byte)
    {
        panic!(
            "{context}: first byte mismatch at {index}: actual={} expected={}",
            actual[index], expected[index]
        );
    }
}

fn assert_unchanged_outside_dirty(before: &[u8], after: &[u8], bounds: &[i32]) {
    assert_eq!(before.len(), after.len(), "full-frame lengths differ");
    let (x, y, width, height) = checked_bounds(bounds);
    let right = x + width;
    let bottom = y + height;
    for canvas_y in 0..DIRTY_FIXTURE_HEIGHT {
        for canvas_x in 0..DIRTY_FIXTURE_WIDTH {
            if (x..right).contains(&canvas_x) && (y..bottom).contains(&canvas_y) {
                continue;
            }
            let offset = (canvas_y * DIRTY_FIXTURE_WIDTH + canvas_x) * 4;
            if before[offset..offset + 4] != after[offset..offset + 4] {
                panic!(
                    "pixel outside dirty bounds changed at ({canvas_x}, {canvas_y})"
                );
            }
        }
    }
}

fn apply_dirty_frame(retained: &mut [u8], bounds: &[i32], dirty: &[u8]) {
    let (x, y, width, height) = checked_bounds(bounds);
    assert_eq!(dirty.len(), width * height * 4, "dirty payload size");
    for row in 0..height {
        let source_start = row * width * 4;
        let target_start = ((y + row) * DIRTY_FIXTURE_WIDTH + x) * 4;
        retained[target_start..target_start + width * 4]
            .copy_from_slice(&dirty[source_start..source_start + width * 4]);
    }
}

fn flush_dirty_into_retained(
    canvas: &mut HokusaiCanvas,
    retained: &mut [u8],
    context: &str,
) -> Option<Vec<i32>> {
    let full = canvas.full_frame().expect("full frame");
    let bounds = canvas.dirty_bounds().expect("dirty bounds");
    let dirty = canvas.dirty_frame().expect("dirty frame");
    if bounds.is_empty() {
        assert!(dirty.is_empty(), "{context}: empty bounds require empty bytes");
        assert_bytes_exact(retained, &full, context);
        canvas.clear_dirty();
        assert!(!canvas.has_dirty(), "{context}: clear_dirty must stay empty");
        return None;
    }

    let expected = crop_full_frame(&full, &bounds);
    assert_bytes_exact(&dirty, &expected, context);
    assert_unchanged_outside_dirty(retained, &full, &bounds);
    apply_dirty_frame(retained, &bounds, &dirty);
    assert_bytes_exact(retained, &full, context);

    canvas.clear_dirty();
    assert!(!canvas.has_dirty(), "{context}: clear_dirty must clear state");
    assert!(
        canvas.dirty_bounds().expect("cleared dirty bounds").is_empty(),
        "{context}: cleared bounds must be empty"
    );
    assert!(
        canvas.dirty_frame().expect("cleared dirty frame").is_empty(),
        "{context}: cleared frame must be empty"
    );
    Some(bounds)
}

fn render_with_dirty_flush_schedule(chunk_size: usize) -> Vec<u8> {
    assert!(chunk_size > 0, "chunk size must be positive");
    let brush = HokusaiBrush::new(DIRTY_TILE_BRUSH).expect("valid dirty-tile brush");
    let mut canvas = HokusaiCanvas::new(
        u32::try_from(DIRTY_FIXTURE_WIDTH).expect("fixture width fits u32"),
        u32::try_from(DIRTY_FIXTURE_HEIGHT).expect("fixture height fits u32"),
        0xD1_27_71,
    )
    .expect("valid non-tile-aligned canvas");
    let mut retained = vec![0; DIRTY_FIXTURE_WIDTH * DIRTY_FIXTURE_HEIGHT * 4];
    let samples = long_curved_samples();
    let mut non_empty_flushes = 0;
    let mut reached_clipped_right = false;
    let mut reached_clipped_bottom = false;

    canvas
        .begin_stroke(&brush, Some(0xD1_27_71))
        .expect("begin long stroke");
    for (index, sample) in samples.iter().enumerate() {
        canvas
            .add_sample(
                &brush,
                sample.x,
                sample.y,
                sample.pressure,
                sample.tilt_x,
                sample.tilt_y,
                sample.time_ms,
            )
            .expect("add deterministic curved sample");
        if (index + 1) % chunk_size == 0 || index + 1 == samples.len() {
            let context = format!("chunk size {chunk_size}, sample {}", index + 1);
            if let Some(bounds) =
                flush_dirty_into_retained(&mut canvas, &mut retained, &context)
            {
                non_empty_flushes += 1;
                let (x, y, width, height) = checked_bounds(&bounds);
                reached_clipped_right |= x + width == DIRTY_FIXTURE_WIDTH;
                reached_clipped_bottom |= y + height == DIRTY_FIXTURE_HEIGHT;
            }
        }
    }
    assert!(non_empty_flushes > 0, "long stroke must emit dirty patches");

    let before_finish = canvas.full_frame().expect("pre-finish full frame");
    assert_bytes_exact(
        &retained,
        &before_finish,
        "retained frame before finish tail",
    );
    let finish_painted = canvas.finish_stroke(&brush).expect("finish long stroke");
    let finish_bounds = canvas.dirty_bounds().expect("finish dirty bounds");
    assert!(
        finish_painted,
        "slow-tracking fixture must paint a finish tail"
    );
    assert!(
        !finish_bounds.is_empty(),
        "finish tail must publish an independently consumable dirty patch"
    );
    let (finish_x, finish_y, finish_width, finish_height) =
        checked_bounds(&finish_bounds);
    reached_clipped_right |= finish_x + finish_width == DIRTY_FIXTURE_WIDTH;
    reached_clipped_bottom |= finish_y + finish_height == DIRTY_FIXTURE_HEIGHT;
    assert!(
        reached_clipped_right,
        "long stroke must exercise the one-pixel clipped right tile"
    );
    assert!(
        reached_clipped_bottom,
        "long stroke must exercise the one-pixel clipped bottom tile"
    );
    let after_finish = canvas.full_frame().expect("post-finish full frame");
    assert_unchanged_outside_dirty(&before_finish, &after_finish, &finish_bounds);
    assert!(
        before_finish
            .chunks_exact(4)
            .zip(after_finish.chunks_exact(4))
            .any(|(before, after)| before != after),
        "finish tail must visibly change at least one pixel"
    );
    flush_dirty_into_retained(&mut canvas, &mut retained, "finish tail");
    assert_bytes_exact(
        &retained,
        &after_finish,
        "retained reconstruction after finish tail",
    );
    retained
}

fn render_natural(seed: u32) -> Vec<u8> {
    let brush = HokusaiBrush::natural_media();
    let mut canvas = HokusaiCanvas::new(160, 96, seed).expect("valid canvas");
    canvas
        .begin_stroke(&brush, Some(seed))
        .expect("begin stroke");
    let samples = [
        (18.0, 48.0, 0.18, -0.7, 0.2, 1_000.0),
        (42.0, 42.0, 0.36, -0.4, 0.4, 1_012.0),
        (72.0, 53.0, 0.64, 0.0, 0.7, 1_027.0),
        (108.0, 44.0, 0.86, 0.45, 0.45, 1_043.0),
        (142.0, 50.0, 0.52, 0.75, -0.1, 1_061.0),
    ];
    for (x, y, pressure, tilt_x, tilt_y, time_ms) in samples {
        canvas
            .add_sample(&brush, x, y, pressure, tilt_x, tilt_y, time_ms)
            .expect("add sample");
    }
    canvas.finish_stroke(&brush).expect("finish stroke");
    canvas.full_frame().expect("full frame")
}

#[test]
fn blank_frame_is_fully_transparent() {
    let canvas = HokusaiCanvas::new(32, 24, 7).expect("valid canvas");
    let pixels = canvas.full_frame().expect("full frame");
    assert_eq!(pixels.len(), 32 * 24 * 4);
    assert!(pixels.iter().all(|byte| *byte == 0));
    assert!(canvas.dirty_bounds().expect("dirty bounds").is_empty());
}

#[test]
fn radius_log_api_uses_log2_pixels() {
    let mut brush = HokusaiBrush::natural_media();
    brush.set_radius_log(6.0).expect("finite radius");
    assert!((brush.radius_log() - 6.0).abs() < f32::EPSILON);
}

#[test]
fn same_seed_and_samples_are_byte_deterministic() {
    assert_eq!(render_natural(0xC0FFEE), render_natural(0xC0FFEE));
}

#[test]
fn different_seeds_change_randomized_natural_media_output() {
    assert_ne!(render_natural(11), render_natural(12));
}

#[test]
fn painted_frame_keeps_transparency_and_reports_matching_dirty_payload() {
    let brush = HokusaiBrush::natural_media();
    let mut canvas = HokusaiCanvas::new(128, 96, 55).expect("valid canvas");
    canvas.begin_stroke(&brush, None).expect("begin stroke");
    canvas
        .add_sample(&brush, 24.0, 48.0, 0.35, 0.2, 0.7, 500.0)
        .expect("first sample");
    canvas
        .add_sample(&brush, 104.0, 48.0, 0.85, 0.6, 0.2, 516.0)
        .expect("second sample");
    canvas.finish_stroke(&brush).expect("finish");

    let pixels = canvas.full_frame().expect("full frame");
    assert!(
        pixels.chunks_exact(4).any(|pixel| pixel[3] > 0),
        "stroke should paint alpha"
    );
    assert!(
        pixels.chunks_exact(4).any(|pixel| pixel == [0, 0, 0, 0]),
        "untouched pixels must remain transparent"
    );

    let bounds = canvas.dirty_bounds().expect("dirty bounds");
    assert_eq!(bounds.len(), 4);
    let dirty = canvas.dirty_frame().expect("dirty frame");
    let expected = {
        let x = usize::try_from(bounds[0]).expect("non-negative dirty x");
        let y = usize::try_from(bounds[1]).expect("non-negative dirty y");
        let width = usize::try_from(bounds[2]).expect("non-negative dirty width");
        let height = usize::try_from(bounds[3]).expect("non-negative dirty height");
        let mut crop = vec![0; width * height * 4];
        for row in 0..height {
            let source_start = ((y + row) * 128 + x) * 4;
            let target_start = row * width * 4;
            crop[target_start..target_start + width * 4]
                .copy_from_slice(&pixels[source_start..source_start + width * 4]);
        }
        crop
    };
    assert_bytes_exact(&dirty, &expected, "simple dirty frame crop");
    assert_eq!(
        dirty.len(),
        usize::try_from(bounds[2] * bounds[3] * 4).expect("positive dirty size")
    );
    canvas.clear_dirty();
    assert!(!canvas.has_dirty());
}

#[test]
fn dirty_frames_reconstruct_long_curved_stroke_across_tiles_and_finish_tail() {
    let per_sample = render_with_dirty_flush_schedule(1);
    let seven_samples = render_with_dirty_flush_schedule(7);
    let thirty_one_samples = render_with_dirty_flush_schedule(31);
    let whole_stroke = render_with_dirty_flush_schedule(usize::MAX);

    assert_bytes_exact(
        &seven_samples,
        &per_sample,
        "seven-sample dirty schedule parity",
    );
    assert_bytes_exact(
        &thirty_one_samples,
        &per_sample,
        "thirty-one-sample dirty schedule parity",
    );
    assert_bytes_exact(
        &whole_stroke,
        &per_sample,
        "whole-stroke dirty schedule parity",
    );
}

#[test]
fn pressure_tilt_and_absolute_time_samples_affect_the_frame() {
    let brush = HokusaiBrush::new(TILT_BRUSH).expect("valid tilt brush");

    let render = |tilt_x: f32, tilt_y: f32, pressure: f32| {
        let mut canvas = HokusaiCanvas::new(96, 96, 900).expect("valid canvas");
        canvas
            .begin_stroke(&brush, Some(900))
            .expect("begin stroke");
        canvas
            .add_sample(&brush, 20.0, 48.0, pressure, tilt_x, tilt_y, 100.0)
            .expect("first sample");
        canvas
            .add_sample(&brush, 76.0, 48.0, pressure, tilt_x, tilt_y, 118.0)
            .expect("second sample");
        canvas.finish_stroke(&brush).expect("finish");
        canvas.full_frame().expect("full frame")
    };

    assert_ne!(render(1.0, 0.0, 0.9), render(0.0, 1.0, 0.9));
    assert_ne!(render(1.0, 0.0, 0.2), render(1.0, 0.0, 0.9));
}

#[test]
fn reset_clears_pixels_and_marks_the_whole_canvas_dirty() {
    let brush = HokusaiBrush::natural_media();
    let mut canvas = HokusaiCanvas::new(80, 64, 1).expect("valid canvas");
    canvas.begin_stroke(&brush, Some(1)).expect("begin");
    canvas
        .add_sample(&brush, 10.0, 32.0, 1.0, 0.0, 0.0, 0.0)
        .expect("first sample");
    canvas
        .add_sample(&brush, 70.0, 32.0, 1.0, 0.0, 0.0, 16.0)
        .expect("second sample");
    canvas.finish_stroke(&brush).expect("finish");
    canvas.clear_dirty();

    assert!(canvas.reset().expect("reset should succeed"));
    assert_eq!(
        canvas.dirty_bounds().expect("dirty bounds"),
        vec![0, 0, 80, 64]
    );
    assert!(
        canvas
            .full_frame()
            .expect("full frame")
            .iter()
            .all(|byte| *byte == 0)
    );
}

#[test]
fn lifecycle_transitions_end_in_an_idempotent_dispose() {
    let brush = HokusaiBrush::natural_media();
    let mut canvas = HokusaiCanvas::new(48, 48, 99).expect("valid canvas");
    assert!(!canvas.is_stroke_active());
    canvas.begin_stroke(&brush, None).expect("begin");
    assert!(canvas.is_stroke_active());
    canvas.finish_stroke(&brush).expect("finish");
    assert!(!canvas.is_stroke_active());
    canvas.dispose();
    canvas.dispose();
    assert!(canvas.is_disposed());
}
