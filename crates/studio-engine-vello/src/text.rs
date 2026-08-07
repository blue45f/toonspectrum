//! Parley text lane PoC (matrix E07, V11.1 Phase 1 "Parley text와 Kurbo path").
//!
//! Pipeline: parley (fontique font registration + harfrust shaping + ICU4X
//! line breaking) → positioned glyph runs → skrifa outline extraction →
//! canonical PathIR verbs. The output is renderer-neutral: the same glyph
//! paths draw through vello_cpu and CanvasKit, which is exactly the
//! cross-renderer guarantee the text island needs before Parley can graduate
//! from PoC to the production lane (CanvasKit Paragraph stays the baseline).

use parley::{
    Alignment, AlignmentOptions, FontContext, Layout, LayoutContext,
    PositionedLayoutItem, StyleProperty,
};
use skrifa::instance::{LocationRef, NormalizedCoord, Size};
use skrifa::outline::{DrawSettings, OutlinePen};
use skrifa::{FontRef, GlyphId, MetadataProvider};

use crate::render::RenderError;

/// Shaped glyph with its outline as PathIR verbs in absolute scene space
/// (y-down, baseline-applied).
pub struct ShapedGlyph {
    pub glyph_id: u32,
    pub x: f32,
    pub y: f32,
    pub verbs: Vec<serde_json::Value>,
}

pub struct ShapedText {
    pub width: f32,
    pub height: f32,
    pub line_count: usize,
    pub glyphs: Vec<ShapedGlyph>,
}

struct PathIrPen {
    verbs: Vec<serde_json::Value>,
    offset_x: f64,
    offset_y: f64,
}

impl PathIrPen {
    fn map(&self, x: f32, y: f32) -> (f64, f64) {
        // skrifa outlines are y-up around the baseline; scene space is y-down.
        (self.offset_x + x as f64, self.offset_y - y as f64)
    }
}

impl OutlinePen for PathIrPen {
    fn move_to(&mut self, x: f32, y: f32) {
        let (px, py) = self.map(x, y);
        self.verbs.push(serde_json::json!({"v":"M","x":px,"y":py}));
    }
    fn line_to(&mut self, x: f32, y: f32) {
        let (px, py) = self.map(x, y);
        self.verbs.push(serde_json::json!({"v":"L","x":px,"y":py}));
    }
    fn quad_to(&mut self, cx: f32, cy: f32, x: f32, y: f32) {
        let (pcx, pcy) = self.map(cx, cy);
        let (px, py) = self.map(x, y);
        self.verbs
            .push(serde_json::json!({"v":"Q","cx":pcx,"cy":pcy,"x":px,"y":py}));
    }
    fn curve_to(&mut self, c1x: f32, c1y: f32, c2x: f32, c2y: f32, x: f32, y: f32) {
        let (p1x, p1y) = self.map(c1x, c1y);
        let (p2x, p2y) = self.map(c2x, c2y);
        let (px, py) = self.map(x, y);
        self.verbs.push(serde_json::json!({
            "v":"C","c1x":p1x,"c1y":p1y,"c2x":p2x,"c2y":p2y,"x":px,"y":py
        }));
    }
    fn close(&mut self) {
        self.verbs.push(serde_json::json!({"v":"Z"}));
    }
}

/// Shapes `text` with the given font bytes at `font_size` px, breaking lines
/// at `max_width` px, and extracts every glyph outline as PathIR.
pub fn shape_text(
    text: &str,
    font_bytes: &[u8],
    font_size: f32,
    max_width: f32,
) -> Result<ShapedText, RenderError> {
    if text.is_empty() {
        return Err(RenderError::InvalidScene("empty text".into()));
    }
    if !(font_size.is_finite() && font_size > 0.0) {
        return Err(RenderError::InvalidScene(format!(
            "font_size must be finite and positive, got {font_size}"
        )));
    }

    let mut font_cx = FontContext::new();
    let families = font_cx
        .collection
        .register_fonts(font_bytes.to_vec().into(), None);
    let family_name = families
        .first()
        .map(|(id, _)| font_cx.collection.family_name(*id).unwrap_or_default().to_string())
        .ok_or_else(|| {
            RenderError::InvalidScene("font bytes contained no registrable font".into())
        })?;

    let mut layout_cx: LayoutContext<[u8; 4]> = LayoutContext::new();
    let mut builder = layout_cx.ranged_builder(&mut font_cx, text, 1.0, true);
    builder.push_default(StyleProperty::FontFamily(parley::FontFamily::Source(
        std::borrow::Cow::Borrowed(family_name.as_str()),
    )));
    builder.push_default(StyleProperty::FontSize(font_size));
    let mut layout: Layout<[u8; 4]> = builder.build(text);
    layout.break_all_lines(Some(max_width));
    layout.align(Alignment::Start, AlignmentOptions::default());

    let mut glyphs = Vec::new();
    let mut line_count = 0usize;
    for line in layout.lines() {
        line_count += 1;
        for item in line.items() {
            let PositionedLayoutItem::GlyphRun(glyph_run) = item else {
                continue;
            };
            let run = glyph_run.run();
            let font = run.font();
            let font_ref = FontRef::from_index(font.data.as_ref(), font.index)
                .map_err(|error| RenderError::InvalidScene(format!("font parse: {error}")))?;
            let outlines = font_ref.outline_glyphs();
            let coords: Vec<NormalizedCoord> = run
                .normalized_coords()
                .iter()
                .map(|bits| NormalizedCoord::from_bits(*bits))
                .collect();
            for glyph in glyph_run.positioned_glyphs() {
                let mut pen = PathIrPen {
                    verbs: Vec::new(),
                    offset_x: glyph.x as f64,
                    offset_y: glyph.y as f64,
                };
                if let Some(outline) = outlines.get(GlyphId::new(glyph.id)) {
                    let settings = DrawSettings::unhinted(
                        Size::new(run.font_size()),
                        LocationRef::new(&coords),
                    );
                    outline
                        .draw(settings, &mut pen)
                        .map_err(|error| {
                            RenderError::InvalidScene(format!("glyph draw: {error}"))
                        })?;
                }
                glyphs.push(ShapedGlyph {
                    glyph_id: glyph.id,
                    x: glyph.x,
                    y: glyph.y,
                    verbs: pen.verbs,
                });
            }
        }
    }

    Ok(ShapedText {
        width: layout.width(),
        height: layout.height(),
        line_count,
        glyphs,
    })
}

pub fn shaped_text_to_json(shaped: &ShapedText) -> String {
    let glyphs: Vec<serde_json::Value> = shaped
        .glyphs
        .iter()
        .map(|glyph| {
            serde_json::json!({
                "id": glyph.glyph_id,
                "x": glyph.x,
                "y": glyph.y,
                "path": { "verbs": glyph.verbs },
            })
        })
        .collect();
    serde_json::json!({
        "width": shaped.width,
        "height": shaped.height,
        "lineCount": shaped.line_count,
        "glyphs": glyphs,
    })
    .to_string()
}
