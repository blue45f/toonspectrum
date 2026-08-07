//! Kurbo-backed editable stroke proxy (matrix E05, ADR 0005).
//!
//! perfect-freehand emits dense outline polygons; this stage fits them into
//! sparse, G1-continuous cubic Béziers via kurbo's area-preserving
//! simplification so strokes stay hand-editable after bake. Deterministic:
//! same points + accuracy always yield the same curves.

use vello_cpu::kurbo::simplify::{simplify_bezpath, SimplifyOptLevel, SimplifyOptions};
use vello_cpu::kurbo::{BezPath, PathEl, Point};

/// Sampled polylines have a small direction change at every vertex; kurbo's
/// default angle threshold (1e-3 rad tangent) treats each one as a corner and
/// refuses to merge. ~0.35 rad (≈20°) keeps genuine corners (letterforms,
/// ruler joints) while letting hand-drawn sampling collapse into curves.
const POLYLINE_ANGLE_THRESH: f64 = 0.35;

use crate::render::RenderError;

/// Fits an (optionally closed) polyline into a cubic-Bézier path.
///
/// `points` is a flat x,y sequence in scene space. `accuracy` is the maximum
/// area-weighted deviation in scene units — larger values produce sparser,
/// smoother control geometry.
pub fn fit_polyline(points: &[f64], closed: bool, accuracy: f64) -> Result<BezPath, RenderError> {
    if points.len() < 4 || points.len() % 2 != 0 {
        return Err(RenderError::InvalidScene(format!(
            "fit_polyline requires an even coordinate count >= 4, got {}",
            points.len()
        )));
    }
    if !(accuracy.is_finite() && accuracy > 0.0) {
        return Err(RenderError::InvalidScene(format!(
            "fit_polyline accuracy must be finite and positive, got {accuracy}"
        )));
    }
    let mut source = BezPath::new();
    source.move_to(Point::new(points[0], points[1]));
    for pair in points[2..].chunks_exact(2) {
        source.line_to(Point::new(pair[0], pair[1]));
    }
    if closed {
        source.close_path();
    }
    let options = SimplifyOptions::default()
        .opt_level(SimplifyOptLevel::Optimize)
        .angle_thresh(POLYLINE_ANGLE_THRESH);
    let simplified = simplify_bezpath(source, accuracy, &options);
    Ok(simplified)
}

/// Serializes a BezPath into the canonical PathIR verb JSON
/// (`packages/studio-project-model` `pathIRSchema`).
pub fn bez_path_to_path_ir_json(path: &BezPath) -> String {
    let mut verbs = Vec::new();
    for el in path.elements() {
        match el {
            PathEl::MoveTo(p) => verbs.push(serde_json::json!({"v":"M","x":p.x,"y":p.y})),
            PathEl::LineTo(p) => verbs.push(serde_json::json!({"v":"L","x":p.x,"y":p.y})),
            PathEl::QuadTo(c, p) => verbs.push(
                serde_json::json!({"v":"Q","cx":c.x,"cy":c.y,"x":p.x,"y":p.y}),
            ),
            PathEl::CurveTo(c1, c2, p) => verbs.push(serde_json::json!({
                "v":"C","c1x":c1.x,"c1y":c1.y,"c2x":c2.x,"c2y":c2.y,"x":p.x,"y":p.y
            })),
            PathEl::ClosePath => verbs.push(serde_json::json!({"v":"Z"})),
        }
    }
    serde_json::json!({ "verbs": verbs }).to_string()
}

/// Counts drawing segments (everything except MoveTo/ClosePath) — used by
/// tests and the fidelity lab to assert sparsification actually happened.
pub fn segment_count(path: &BezPath) -> usize {
    path.elements()
        .iter()
        .filter(|el| !matches!(el, PathEl::MoveTo(_) | PathEl::ClosePath))
        .count()
}
