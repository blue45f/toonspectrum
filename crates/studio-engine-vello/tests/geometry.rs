//! Editable-proxy fitting contracts: sparsification, determinism, closure
//! preservation and input validation.

use studio_engine_vello::{bez_path_to_path_ir_json, fit_polyline, segment_count, RenderError};

fn sine_polyline(count: usize) -> Vec<f64> {
    let mut points = Vec::with_capacity(count * 2);
    for index in 0..count {
        let t = index as f64 / (count - 1) as f64;
        points.push(t * 200.0);
        points.push(50.0 + (t * std::f64::consts::PI * 2.0).sin() * 30.0);
    }
    points
}

#[test]
fn fits_dense_smooth_polyline_into_sparse_cubics() {
    let points = sine_polyline(200);
    let fitted = fit_polyline(&points, false, 0.25).unwrap();
    let segments = segment_count(&fitted);
    // 199 line segments must collapse into a handful of editable cubics.
    assert!(segments < 40, "expected sparse fit, got {segments} segments");
    assert!(segments >= 1);
}

#[test]
fn higher_accuracy_tolerance_yields_sparser_geometry() {
    let points = sine_polyline(200);
    let tight = segment_count(&fit_polyline(&points, false, 0.05).unwrap());
    let loose = segment_count(&fit_polyline(&points, false, 2.0).unwrap());
    assert!(loose <= tight, "loose {loose} vs tight {tight}");
}

#[test]
fn fit_is_deterministic() {
    let points = sine_polyline(120);
    let a = bez_path_to_path_ir_json(&fit_polyline(&points, true, 0.5).unwrap());
    let b = bez_path_to_path_ir_json(&fit_polyline(&points, true, 0.5).unwrap());
    assert_eq!(a, b);
}

#[test]
fn closed_input_stays_closed_in_path_ir_json() {
    let square = [0.0, 0.0, 40.0, 0.0, 40.0, 40.0, 0.0, 40.0];
    let fitted = fit_polyline(&square, true, 0.1).unwrap();
    let json = bez_path_to_path_ir_json(&fitted);
    assert!(json.contains("\"v\":\"Z\""), "missing close verb: {json}");
    assert!(json.starts_with("{\"verbs\":[{\"v\":\"M\""));
}

#[test]
fn rejects_odd_or_tiny_or_nonpositive_inputs() {
    assert!(matches!(
        fit_polyline(&[0.0, 1.0, 2.0], false, 0.5),
        Err(RenderError::InvalidScene(_))
    ));
    assert!(matches!(
        fit_polyline(&[0.0, 1.0], false, 0.5),
        Err(RenderError::InvalidScene(_))
    ));
    assert!(matches!(
        fit_polyline(&[0.0, 0.0, 1.0, 1.0], false, 0.0),
        Err(RenderError::InvalidScene(_))
    ));
}
