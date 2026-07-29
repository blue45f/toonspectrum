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
    assert_eq!(
        dirty.len(),
        usize::try_from(bounds[2] * bounds[3] * 4).expect("positive dirty size")
    );
    canvas.clear_dirty();
    assert!(!canvas.has_dirty());
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
