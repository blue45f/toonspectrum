//! SceneIR -> upstream Vello Hybrid 0.2 sparse-strip scene encoding.
//!
//! This module deliberately supports the same bounded vector subset as the
//! Classic GPU encoder. Unsupported nodes fail before any GPU work so the
//! selected provider can fail closed without panicking or switching engines.

use vello_cpu::color::{AlphaColor, Srgb};
use vello_cpu::kurbo::{BezPath, Cap, Join, Point, Rect, Stroke};
use vello_cpu::peniko::{BlendMode, Compose, Fill, Gradient, Mix};
use vello_hybrid::Scene;

use crate::scene::{
    BlendModeIR, ColorIR, FillRuleIR, PaintIR, PathIR, PathVerbIR, SceneIR, SceneNodeIR,
    StrokeCapIR, StrokeJoinIR,
};

type Color = AlphaColor<Srgb>;

fn to_color(color: &ColorIR, opacity: f32) -> Color {
    Color::new([color.r, color.g, color.b, color.a * opacity])
}

fn to_bez(path: &PathIR) -> BezPath {
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

fn to_blend(blend: BlendModeIR) -> BlendMode {
    let mix = match blend {
        BlendModeIR::SrcOver => Mix::Normal,
        BlendModeIR::Multiply => Mix::Multiply,
        BlendModeIR::Screen => Mix::Screen,
        BlendModeIR::Darken => Mix::Darken,
        BlendModeIR::Lighten => Mix::Lighten,
    };
    BlendMode::new(mix, Compose::SrcOver)
}

fn gradient_stops(stops: &[crate::scene::GradientStopIR], opacity: f32) -> Vec<(f32, Color)> {
    stops
        .iter()
        .map(|stop| (stop.offset, to_color(&stop.color, opacity)))
        .collect()
}

fn set_paint(scene: &mut Scene, paint: &PaintIR, opacity: f32) {
    match paint {
        PaintIR::Solid { color } => scene.set_paint(to_color(color, opacity)),
        PaintIR::LinearGradient { from, to, stops } => {
            let gradient =
                Gradient::new_linear(Point::new(from[0], from[1]), Point::new(to[0], to[1]))
                    .with_stops(gradient_stops(stops, opacity).as_slice());
            scene.set_paint(gradient);
        }
        PaintIR::RadialGradient {
            center,
            radius,
            stops,
        } => {
            let gradient = Gradient::new_radial(Point::new(center[0], center[1]), *radius as f32)
                .with_stops(gradient_stops(stops, opacity).as_slice());
            scene.set_paint(gradient);
        }
        PaintIR::SweepGradient {
            center,
            start_angle_deg,
            end_angle_deg,
            stops,
        } => {
            let gradient = Gradient::new_sweep(
                Point::new(center[0], center[1]),
                start_angle_deg.to_radians() as f32,
                end_angle_deg.to_radians() as f32,
            )
            .with_stops(gradient_stops(stops, opacity).as_slice());
            scene.set_paint(gradient);
        }
    }
}

fn unsupported_features(nodes: &[SceneNodeIR]) -> Vec<String> {
    fn walk(nodes: &[SceneNodeIR], out: &mut Vec<String>) {
        for node in nodes {
            match node {
                SceneNodeIR::Text { .. } => {
                    let feature = "render.text.paragraph".to_string();
                    if !out.contains(&feature) {
                        out.push(feature);
                    }
                }
                SceneNodeIR::Group { children, .. } => walk(children, out),
                _ => {}
            }
        }
    }
    let mut out = Vec::new();
    walk(nodes, &mut out);
    out
}

fn encode_nodes(scene: &mut Scene, nodes: &[SceneNodeIR]) {
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
                    scene.push_layer(None, Some(to_blend(*blend)), Some(1.0), None, None);
                }
                scene.set_fill_rule(match fill_rule {
                    FillRuleIR::NonZero => Fill::NonZero,
                    FillRuleIR::EvenOdd => Fill::EvenOdd,
                });
                set_paint(scene, paint, *opacity);
                scene.fill_path(&to_bez(path));
                if layered {
                    scene.pop_layer();
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
                    scene.push_layer(None, Some(to_blend(*blend)), Some(1.0), None, None);
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
                scene.set_stroke(
                    Stroke::new(*stroke_width)
                        .with_caps(cap)
                        .with_join(join)
                        .with_miter_limit(*miter_limit),
                );
                set_paint(scene, paint, *opacity);
                scene.stroke_path(&to_bez(path));
                if layered {
                    scene.pop_layer();
                }
            }
            SceneNodeIR::Group {
                opacity,
                blend,
                clip,
                children,
                ..
            } => {
                let clip_path = clip.as_ref().map(to_bez);
                let needs_layer =
                    clip_path.is_some() || *opacity != 1.0 || *blend != BlendModeIR::SrcOver;
                if needs_layer {
                    scene.push_layer(
                        clip_path.as_ref(),
                        Some(to_blend(*blend)),
                        Some(*opacity),
                        None,
                        None,
                    );
                }
                encode_nodes(scene, children);
                if needs_layer {
                    scene.pop_layer();
                }
            }
            SceneNodeIR::Text { .. } => {
                unreachable!("text nodes are rejected before hybrid encoding");
            }
        }
    }
}

/// Encodes a complete bounded SceneIR into a Vello Hybrid sparse-strip scene.
pub fn encode_hybrid_scene(scene_ir: &SceneIR) -> Result<Scene, Vec<String>> {
    let unsupported = unsupported_features(&scene_ir.nodes);
    if !unsupported.is_empty() {
        return Err(unsupported);
    }
    let width =
        u16::try_from(scene_ir.width).map_err(|_| vec!["render.target.dimension".to_string()])?;
    let height =
        u16::try_from(scene_ir.height).map_err(|_| vec!["render.target.dimension".to_string()])?;
    let mut scene = Scene::new(width, height);
    if scene_ir.background.a > 0.0 {
        scene.set_paint(to_color(&scene_ir.background, 1.0));
        scene.fill_rect(&Rect::new(
            0.0,
            0.0,
            f64::from(scene_ir.width),
            f64::from(scene_ir.height),
        ));
    }
    encode_nodes(&mut scene, &scene_ir.nodes);
    Ok(scene)
}
