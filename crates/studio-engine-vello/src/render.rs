//! SceneIR -> RGBA8 rendering on top of vello_cpu (matrix E04: deterministic
//! CPU baseline for cross-renderer diff, golden images and GPU-loss recovery).

use std::fmt;

use vello_cpu::color::{AlphaColor, Srgb};
use vello_cpu::kurbo::{BezPath, Cap, Join, Point, Stroke};
use vello_cpu::peniko::{BlendMode, Compose, Gradient, Mix};
use vello_cpu::{Level, Pixmap, RenderContext, RenderSettings, Resources};

use crate::scene::{
    BlendModeIR, ColorIR, FillRuleIR, PaintIR, PathIR, PathVerbIR, SceneIR, SceneNodeIR,
    StrokeCapIR, StrokeJoinIR,
};

#[derive(Debug)]
pub enum RenderError {
    /// The scene requires features this provider does not implement.
    /// Callers must route the island to a capable provider instead.
    UnsupportedFeatures(Vec<String>),
    InvalidScene(String),
}

impl fmt::Display for RenderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RenderError::UnsupportedFeatures(features) => write!(
                f,
                "vello-cpu provider cannot render required scene features: {}",
                features.join(", ")
            ),
            RenderError::InvalidScene(message) => write!(f, "invalid scene: {message}"),
        }
    }
}

impl std::error::Error for RenderError {}

type Color = AlphaColor<Srgb>;

fn to_color(color: &ColorIR) -> Color {
    Color::new([color.r, color.g, color.b, color.a])
}

fn to_color_with_opacity(color: &ColorIR, opacity: f32) -> Color {
    Color::new([color.r, color.g, color.b, color.a * opacity])
}

fn to_bez_path(path: &PathIR) -> BezPath {
    let mut bez = BezPath::new();
    for verb in &path.verbs {
        match *verb {
            PathVerbIR::M { x, y } => bez.move_to(Point::new(x, y)),
            PathVerbIR::L { x, y } => bez.line_to(Point::new(x, y)),
            PathVerbIR::Q { cx, cy, x, y } => {
                bez.quad_to(Point::new(cx, cy), Point::new(x, y));
            }
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

fn gradient_stops(
    stops: &[crate::scene::GradientStopIR],
    opacity: f32,
) -> Vec<(f32, Color)> {
    stops
        .iter()
        .map(|stop| (stop.offset, to_color_with_opacity(&stop.color, opacity)))
        .collect()
}

/// Applies paint + fill/stroke for one path node. Solid paints fold node
/// opacity into the paint alpha; gradients fold it into the stop alphas — both
/// stay single-draw so coverage semantics match the Skia adapter.
fn set_paint(ctx: &mut RenderContext, paint: &PaintIR, opacity: f32) {
    match paint {
        PaintIR::Solid { color } => ctx.set_paint(to_color_with_opacity(color, opacity)),
        PaintIR::LinearGradient { from, to, stops } => {
            let gradient =
                Gradient::new_linear(Point::new(from[0], from[1]), Point::new(to[0], to[1]))
                    .with_stops(gradient_stops(stops, opacity).as_slice());
            ctx.set_paint(gradient);
        }
        PaintIR::RadialGradient {
            center,
            radius,
            stops,
        } => {
            let gradient =
                Gradient::new_radial(Point::new(center[0], center[1]), *radius as f32)
                    .with_stops(gradient_stops(stops, opacity).as_slice());
            ctx.set_paint(gradient);
        }
        PaintIR::SweepGradient {
            center,
            start_angle_deg,
            end_angle_deg,
            stops,
        } => {
            // IR degrees -> peniko radians; the +X-axis / clockwise-in-y-down
            // convention matches 1:1, so only the unit changes.
            let gradient = Gradient::new_sweep(
                Point::new(center[0], center[1]),
                start_angle_deg.to_radians() as f32,
                end_angle_deg.to_radians() as f32,
            )
            .with_stops(gradient_stops(stops, opacity).as_slice());
            ctx.set_paint(gradient);
        }
    }
}

/// Rejects paints vello_cpu would degrade silently instead of erroring:
/// a sweep window with `end <= start` collapses to the first stop color inside
/// peniko's degenerate handling. The canonical zod schema already forbids it;
/// this guard keeps direct crate consumers on the same honest contract.
fn collect_invalid_paints(nodes: &[SceneNodeIR], problems: &mut Vec<String>) {
    fn check(id: &str, paint: &PaintIR, problems: &mut Vec<String>) {
        if let PaintIR::SweepGradient {
            start_angle_deg,
            end_angle_deg,
            ..
        } = paint
        {
            if !(end_angle_deg > start_angle_deg) {
                problems.push(format!(
                    "node {id}: sweep-gradient requires endAngleDeg > startAngleDeg (got {start_angle_deg}..{end_angle_deg})"
                ));
            }
        }
    }
    for node in nodes {
        match node {
            SceneNodeIR::FillPath { id, paint, .. }
            | SceneNodeIR::StrokePath { id, paint, .. } => check(id, paint, problems),
            SceneNodeIR::Group { children, .. } => collect_invalid_paints(children, problems),
            SceneNodeIR::Text { .. } => {}
        }
    }
}

fn collect_unsupported(nodes: &[SceneNodeIR], unsupported: &mut Vec<String>) {
    for node in nodes {
        match node {
            SceneNodeIR::Text { .. } => {
                let feature = "render.text.paragraph".to_string();
                if !unsupported.contains(&feature) {
                    unsupported.push(feature);
                }
            }
            SceneNodeIR::Group { children, .. } => collect_unsupported(children, unsupported),
            _ => {}
        }
    }
}

fn render_nodes(ctx: &mut RenderContext, nodes: &[SceneNodeIR]) {
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
                let bez = to_bez_path(path);
                ctx.set_fill_rule(match fill_rule {
                    FillRuleIR::NonZero => vello_cpu::peniko::Fill::NonZero,
                    FillRuleIR::EvenOdd => vello_cpu::peniko::Fill::EvenOdd,
                });
                let layered = *blend != BlendModeIR::SrcOver;
                if layered {
                    ctx.push_layer(None, Some(to_blend(*blend)), None, None, None);
                }
                set_paint(ctx, paint, *opacity);
                ctx.fill_path(&bez);
                if layered {
                    ctx.pop_layer();
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
                let bez = to_bez_path(path);
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
                ctx.set_stroke(stroke);
                let layered = *blend != BlendModeIR::SrcOver;
                if layered {
                    ctx.push_layer(None, Some(to_blend(*blend)), None, None, None);
                }
                set_paint(ctx, paint, *opacity);
                ctx.stroke_path(&bez);
                if layered {
                    ctx.pop_layer();
                }
            }
            SceneNodeIR::Group {
                opacity,
                blend,
                clip,
                children,
                ..
            } => {
                let clip_bez = clip.as_ref().map(to_bez_path);
                ctx.push_layer(
                    clip_bez.as_ref(),
                    Some(to_blend(*blend)),
                    Some(*opacity),
                    None,
                    None,
                );
                render_nodes(ctx, children);
                ctx.pop_layer();
            }
            SceneNodeIR::Text { .. } => {
                // Unreachable: render_scene rejects text scenes up front.
                unreachable!("text nodes are rejected before rendering");
            }
        }
    }
}

/// Renders a SceneIR to straight (unpremultiplied) RGBA8 bytes, row-major.
pub fn render_scene(scene: &SceneIR) -> Result<Vec<u8>, RenderError> {
    if scene.version != 11 {
        return Err(RenderError::InvalidScene(format!(
            "unsupported scene version: {}",
            scene.version
        )));
    }
    if scene.width == 0 || scene.height == 0 || scene.width > u16::MAX as u32 || scene.height > u16::MAX as u32 {
        return Err(RenderError::InvalidScene(format!(
            "scene size out of range: {}x{}",
            scene.width, scene.height
        )));
    }
    let mut unsupported = Vec::new();
    collect_unsupported(&scene.nodes, &mut unsupported);
    if !unsupported.is_empty() {
        return Err(RenderError::UnsupportedFeatures(unsupported));
    }
    let mut invalid_paints = Vec::new();
    collect_invalid_paints(&scene.nodes, &mut invalid_paints);
    if !invalid_paints.is_empty() {
        return Err(RenderError::InvalidScene(invalid_paints.join("; ")));
    }

    let width = scene.width as u16;
    let height = scene.height as u16;
    // Single-threaded baseline SIMD level keeps output bit-stable across hosts
    // (lane-count differences must not change golden images).
    let settings = RenderSettings {
        level: Level::baseline(),
        num_threads: 0,
    };
    let mut ctx = RenderContext::new_with(width, height, settings);

    // Background as an explicit full-canvas fill keeps compositing math in one
    // code path (no special clear semantics to diverge from other adapters).
    let full = vello_cpu::kurbo::Rect::new(0.0, 0.0, scene.width as f64, scene.height as f64);
    ctx.set_paint(to_color(&scene.background));
    ctx.fill_rect(&full);

    render_nodes(&mut ctx, &scene.nodes);

    ctx.flush();
    let mut pixmap = Pixmap::new(width, height);
    let mut resources = Resources::new();
    ctx.render(&mut pixmap, &mut resources);

    Ok(unpremultiply(pixmap.data_as_u8_slice()))
}

fn unpremultiply(premul: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(premul.len());
    for pixel in premul.chunks_exact(4) {
        let a = pixel[3] as u32;
        if a == 0 {
            out.extend_from_slice(&[0, 0, 0, 0]);
        } else {
            let unmul = |c: u8| -> u8 { ((c as u32 * 255 + a / 2) / a).min(255) as u8 };
            out.extend_from_slice(&[unmul(pixel[0]), unmul(pixel[1]), unmul(pixel[2]), a as u8]);
        }
    }
    out
}

pub fn parse_scene(json: &str) -> Result<SceneIR, RenderError> {
    serde_json::from_str(json).map_err(|error| RenderError::InvalidScene(error.to_string()))
}
