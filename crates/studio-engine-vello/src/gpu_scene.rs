//! Shared SceneIR -> vello (GPU Classic) `Scene` encoding.
//!
//! Single source for the two GPU lanes so they cannot drift apart:
//! - native Metal parity harness (`tests/gpu_parity.rs`, includes this file via
//!   `#[path]` against the dev-dependency `vello`), and
//! - browser WebGPU wasm lane (`src/gpu_web.rs`, compiled behind the `gpu`
//!   feature — ADR-0011 lane 2).
//!
//! The encoding mirrors the vello_cpu reference lane in `render.rs` node for
//! node (background fill, blend layering, group clip/opacity), which is what
//! makes the δ48 fuzzy parity gate meaningful. The CPU path never touches this
//! module.
//!
//! Path resolution note: `super::scene` is `crate::scene` when compiled inside
//! the library, and the `pub use studio_engine_vello::scene;` re-export when
//! included from the integration test.

use vello::kurbo::{Affine, BezPath, Cap, Join, Point, Rect, Stroke};
use vello::peniko::{BlendMode, Brush, Color, Compose, Fill, Gradient, Mix};
use vello::Scene;

use super::scene::{
    BlendModeIR, ColorIR, FillRuleIR, PaintIR, PathIR, PathVerbIR, SceneIR, SceneNodeIR,
    StrokeCapIR, StrokeJoinIR,
};

pub fn to_bez(path: &PathIR) -> BezPath {
    let mut bez = BezPath::new();
    for verb in &path.verbs {
        match *verb {
            PathVerbIR::M { x, y } => bez.move_to(Point::new(x, y)),
            PathVerbIR::L { x, y } => bez.line_to(Point::new(x, y)),
            PathVerbIR::Q { cx, cy, x, y } => bez.quad_to(Point::new(cx, cy), Point::new(x, y)),
            PathVerbIR::C {
                c1x,
                c1y,
                c2x,
                c2y,
                x,
                y,
            } => bez.curve_to(Point::new(c1x, c1y), Point::new(c2x, c2y), Point::new(x, y)),
            PathVerbIR::Z => bez.close_path(),
        }
    }
    bez
}

pub fn to_color(c: &ColorIR, opacity: f32) -> Color {
    Color::new([c.r, c.g, c.b, c.a * opacity])
}

pub fn to_brush(paint: &PaintIR, opacity: f32) -> Brush {
    match paint {
        PaintIR::Solid { color } => Brush::Solid(to_color(color, opacity)),
        PaintIR::LinearGradient { from, to, stops } => Brush::Gradient(
            Gradient::new_linear(Point::new(from[0], from[1]), Point::new(to[0], to[1]))
                .with_stops(
                    stops
                        .iter()
                        .map(|s| (s.offset, to_color(&s.color, opacity)))
                        .collect::<Vec<(f32, Color)>>()
                        .as_slice(),
                ),
        ),
        PaintIR::RadialGradient {
            center,
            radius,
            stops,
        } => Brush::Gradient(
            Gradient::new_radial(Point::new(center[0], center[1]), *radius as f32).with_stops(
                stops
                    .iter()
                    .map(|s| (s.offset, to_color(&s.color, opacity)))
                    .collect::<Vec<(f32, Color)>>()
                    .as_slice(),
            ),
        ),
        // IR degrees -> peniko radians; conventions (from +X axis, clockwise in
        // y-down) match. end > start is guaranteed by the canonical zod schema
        // and re-checked by the CPU lane's render_scene, which every GPU-lane
        // caller mirrors through the shared corpus/parity harnesses.
        PaintIR::SweepGradient {
            center,
            start_angle_deg,
            end_angle_deg,
            stops,
        } => Brush::Gradient(
            Gradient::new_sweep(
                Point::new(center[0], center[1]),
                start_angle_deg.to_radians() as f32,
                end_angle_deg.to_radians() as f32,
            )
            .with_stops(
                stops
                    .iter()
                    .map(|s| (s.offset, to_color(&s.color, opacity)))
                    .collect::<Vec<(f32, Color)>>()
                    .as_slice(),
            ),
        ),
    }
}

pub fn to_blend(blend: BlendModeIR) -> BlendMode {
    let mix = match blend {
        BlendModeIR::SrcOver => Mix::Normal,
        BlendModeIR::Multiply => Mix::Multiply,
        BlendModeIR::Screen => Mix::Screen,
        BlendModeIR::Darken => Mix::Darken,
        BlendModeIR::Lighten => Mix::Lighten,
    };
    BlendMode::new(mix, Compose::SrcOver)
}

pub fn full_rect(scene: &SceneIR) -> Rect {
    Rect::new(0.0, 0.0, f64::from(scene.width), f64::from(scene.height))
}

/// Same rejection surface as the CPU lane (`render.rs::collect_unsupported`):
/// text islands must route to a paragraph-capable provider, never be dropped.
pub fn unsupported_features(nodes: &[SceneNodeIR]) -> Vec<String> {
    fn walk(nodes: &[SceneNodeIR], unsupported: &mut Vec<String>) {
        for node in nodes {
            match node {
                SceneNodeIR::Text { .. } => {
                    let feature = "render.text.paragraph".to_string();
                    if !unsupported.contains(&feature) {
                        unsupported.push(feature);
                    }
                }
                SceneNodeIR::Group { children, .. } => walk(children, unsupported),
                _ => {}
            }
        }
    }
    let mut unsupported = Vec::new();
    walk(nodes, &mut unsupported);
    unsupported
}

pub fn encode_nodes(out: &mut Scene, nodes: &[SceneNodeIR], canvas: Rect) {
    for node in nodes {
        match node {
            SceneNodeIR::FillPath {
                path,
                paint,
                opacity,
                blend,
                fill_rule,
                ..
            } => {
                let layered = *blend != BlendModeIR::SrcOver;
                if layered {
                    out.push_layer(Fill::NonZero, to_blend(*blend), 1.0, Affine::IDENTITY, &canvas);
                }
                let rule = match fill_rule {
                    FillRuleIR::NonZero => Fill::NonZero,
                    FillRuleIR::EvenOdd => Fill::EvenOdd,
                };
                out.fill(
                    rule,
                    Affine::IDENTITY,
                    &to_brush(paint, *opacity),
                    None,
                    &to_bez(path),
                );
                if layered {
                    out.pop_layer();
                }
            }
            SceneNodeIR::StrokePath {
                path,
                paint,
                opacity,
                blend,
                stroke_width,
                cap,
                join,
                miter_limit,
                ..
            } => {
                let layered = *blend != BlendModeIR::SrcOver;
                if layered {
                    out.push_layer(Fill::NonZero, to_blend(*blend), 1.0, Affine::IDENTITY, &canvas);
                }
                let cap = match cap {
                    StrokeCapIR::Butt => Cap::Butt,
                    StrokeCapIR::Round => Cap::Round,
                    StrokeCapIR::Square => Cap::Square,
                };
                let join = match join {
                    StrokeJoinIR::Miter => Join::Miter,
                    StrokeJoinIR::Round => Join::Round,
                    StrokeJoinIR::Bevel => Join::Bevel,
                };
                let stroke = Stroke::new(*stroke_width)
                    .with_caps(cap)
                    .with_join(join)
                    .with_miter_limit(*miter_limit);
                out.stroke(
                    &stroke,
                    Affine::IDENTITY,
                    &to_brush(paint, *opacity),
                    None,
                    &to_bez(path),
                );
                if layered {
                    out.pop_layer();
                }
            }
            SceneNodeIR::Group {
                opacity,
                blend,
                clip,
                children,
                ..
            } => {
                match clip.as_ref().map(to_bez) {
                    Some(clip_bez) => out.push_layer(
                        Fill::NonZero,
                        to_blend(*blend),
                        *opacity,
                        Affine::IDENTITY,
                        &clip_bez,
                    ),
                    None => out.push_layer(
                        Fill::NonZero,
                        to_blend(*blend),
                        *opacity,
                        Affine::IDENTITY,
                        &canvas,
                    ),
                }
                encode_nodes(out, children, canvas);
                out.pop_layer();
            }
            SceneNodeIR::Text { .. } => {
                // Unreachable: encode_scene rejects text scenes up front.
                unreachable!("text nodes are rejected before encoding");
            }
        }
    }
}

/// Encodes a full SceneIR into a vello GPU `Scene`, or reports the capability
/// tokens the caller must route elsewhere (no silent node drops).
pub fn encode_scene(scene_ir: &SceneIR) -> Result<Scene, Vec<String>> {
    let unsupported = unsupported_features(&scene_ir.nodes);
    if !unsupported.is_empty() {
        return Err(unsupported);
    }
    let mut scene = Scene::new();
    encode_nodes(&mut scene, &scene_ir.nodes, full_rect(scene_ir));
    Ok(scene)
}
