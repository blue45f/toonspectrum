//! ToonStudio V11 Vello CPU adapter (matrix E04, ADR 0004).
//!
//! Role: deterministic CPU reference renderer for cross-renderer visual diff,
//! golden images and GPU-failure recovery. The canonical SceneIR schema lives
//! in `packages/studio-project-model`; this crate consumes its JSON form.

pub mod geometry;
pub mod render;
pub mod scene;

pub use geometry::{bez_path_to_path_ir_json, fit_polyline, segment_count};
pub use render::{parse_scene, render_scene, RenderError};
pub use scene::SceneIR;

use wasm_bindgen::prelude::*;

/// Renders SceneIR JSON to straight RGBA8 bytes (width * height * 4).
#[wasm_bindgen]
pub fn render_scene_json(scene_json: &str) -> Result<Vec<u8>, JsError> {
    let scene = parse_scene(scene_json).map_err(|error| JsError::new(&error.to_string()))?;
    render_scene(&scene).map_err(|error| JsError::new(&error.to_string()))
}

/// Fits a flat x,y polyline into editable cubic PathIR JSON (Kurbo E05 lane).
#[wasm_bindgen]
pub fn fit_polyline_json(points: &[f64], closed: bool, accuracy: f64) -> Result<String, JsError> {
    let path = fit_polyline(points, closed, accuracy)
        .map_err(|error| JsError::new(&error.to_string()))?;
    Ok(bez_path_to_path_ir_json(&path))
}

/// Provider identity string surfaced in descriptors and benchmark reports.
#[wasm_bindgen]
pub fn adapter_version() -> String {
    format!(
        "studio-engine-vello {} (vello_cpu 0.2)",
        env!("CARGO_PKG_VERSION")
    )
}
