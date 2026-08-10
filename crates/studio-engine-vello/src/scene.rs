//! Serde mirror of the ToonStudio V11 SceneIR (canonical schema:
//! `packages/studio-project-model/src/ir/scene.ts`).
//!
//! Field names and enum spellings must match the TypeScript zod schemas
//! byte-for-byte; the cross-language contract is enforced by the corpus round
//! trip in `tests/` and the cross-renderer diff harness on the JS side.

use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct ColorIR {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum BlendModeIR {
    #[serde(rename = "src-over")]
    SrcOver,
    #[serde(rename = "multiply")]
    Multiply,
    #[serde(rename = "screen")]
    Screen,
    #[serde(rename = "darken")]
    Darken,
    #[serde(rename = "lighten")]
    Lighten,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct GradientStopIR {
    pub offset: f32,
    pub color: ColorIR,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind")]
pub enum PaintIR {
    #[serde(rename = "solid")]
    Solid { color: ColorIR },
    #[serde(rename = "linear-gradient")]
    LinearGradient {
        from: [f64; 2],
        to: [f64; 2],
        stops: Vec<GradientStopIR>,
    },
    #[serde(rename = "radial-gradient")]
    RadialGradient {
        center: [f64; 2],
        radius: f64,
        stops: Vec<GradientStopIR>,
    },
    /// Angles are degrees from the +X axis, clockwise in y-down scene space
    /// (peniko/Skia shared convention). The canonical zod schema guarantees
    /// `end_angle_deg > start_angle_deg`; `render_scene` re-checks it because
    /// vello_cpu would otherwise silently collapse the paint to its first stop.
    #[serde(rename = "sweep-gradient", rename_all = "camelCase")]
    SweepGradient {
        center: [f64; 2],
        start_angle_deg: f64,
        end_angle_deg: f64,
        stops: Vec<GradientStopIR>,
    },
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(tag = "v")]
pub enum PathVerbIR {
    M { x: f64, y: f64 },
    L { x: f64, y: f64 },
    Q { cx: f64, cy: f64, x: f64, y: f64 },
    C { c1x: f64, c1y: f64, c2x: f64, c2y: f64, x: f64, y: f64 },
    Z,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PathIR {
    pub verbs: Vec<PathVerbIR>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum FillRuleIR {
    #[serde(rename = "nonzero")]
    NonZero,
    #[serde(rename = "evenodd")]
    EvenOdd,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum StrokeCapIR {
    #[serde(rename = "butt")]
    Butt,
    #[serde(rename = "round")]
    Round,
    #[serde(rename = "square")]
    Square,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum StrokeJoinIR {
    #[serde(rename = "miter")]
    Miter,
    #[serde(rename = "round")]
    Round,
    #[serde(rename = "bevel")]
    Bevel,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind")]
pub enum SceneNodeIR {
    #[serde(rename = "fill-path", rename_all = "camelCase")]
    FillPath {
        id: String,
        path: PathIR,
        paint: PaintIR,
        opacity: f32,
        blend: BlendModeIR,
        fill_rule: FillRuleIR,
    },
    #[serde(rename = "stroke-path", rename_all = "camelCase")]
    StrokePath {
        id: String,
        path: PathIR,
        paint: PaintIR,
        opacity: f32,
        blend: BlendModeIR,
        stroke_width: f64,
        cap: StrokeCapIR,
        join: StrokeJoinIR,
        miter_limit: f64,
    },
    #[serde(rename = "text", rename_all = "camelCase")]
    Text {
        id: String,
        opacity: f32,
        blend: BlendModeIR,
        x: f64,
        y: f64,
        text: String,
        font_size_px: f64,
        color: ColorIR,
        font_family: String,
    },
    #[serde(rename = "group")]
    Group {
        id: String,
        opacity: f32,
        blend: BlendModeIR,
        #[serde(default)]
        clip: Option<PathIR>,
        children: Vec<SceneNodeIR>,
    },
}

#[derive(Debug, Clone, Deserialize)]
pub struct SceneIR {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub background: ColorIR,
    pub nodes: Vec<SceneNodeIR>,
}
