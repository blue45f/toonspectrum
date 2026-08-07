//! ToonStudio V11 Vello CPU adapter (matrix E04, ADR 0004).
//!
//! Role: deterministic CPU reference renderer for cross-renderer visual diff,
//! golden images and GPU-failure recovery. The canonical SceneIR schema lives
//! in `packages/project-model-v11`; this crate consumes its JSON form.

pub mod render;
pub mod scene;

pub use render::{parse_scene, render_scene, RenderError};
pub use scene::SceneIR;

use wasm_bindgen::prelude::*;

/// Renders SceneIR JSON to straight RGBA8 bytes (width * height * 4).
#[wasm_bindgen]
pub fn render_scene_json(scene_json: &str) -> Result<Vec<u8>, JsError> {
    let scene = parse_scene(scene_json).map_err(|error| JsError::new(&error.to_string()))?;
    render_scene(&scene).map_err(|error| JsError::new(&error.to_string()))
}

/// Provider identity string surfaced in descriptors and benchmark reports.
#[wasm_bindgen]
pub fn adapter_version() -> String {
    format!(
        "vello-adapter-v11 {} (vello_cpu 0.2)",
        env!("CARGO_PKG_VERSION")
    )
}
