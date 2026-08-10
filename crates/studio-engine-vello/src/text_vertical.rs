//! Vertical writing (縦書き / 세로쓰기) extension of the Parley text lane —
//! ToonStudio V12 gate matrix Text row, webtoon CJK vertical dialogue and
//! sound-effect workload.
//!
//! Parley 0.11 has no native vertical writing mode, so this module does the
//! industry-standard manual vertical composition on top of the horizontal
//! shaping lane (`crate::text::shape_text`):
//!
//! - Upright CJK characters are shaped one cell at a time and stacked top to
//!   bottom. The cell advance comes from real font vertical metrics
//!   (`vhea`/`vmtx`) when the font carries them; otherwise a deterministic
//!   1em (`font_size`) fallback is used and reported through `warnings`.
//! - Contiguous Latin/digit/other-rotating runs are shaped horizontally as
//!   one run and rotated 90° clockwise, with the rotation baked into the
//!   PathIR coordinates (renderer-neutral — no transform node needed).
//! - Upright characters are shaped through HarfRust with
//!   `Direction::TopToBottom` and OpenType `vert`/`vrt2` enabled. The selected
//!   glyph id is outlined through Skrifa. This module never hand-codes Unicode
//!   presentation-form substitutions. Fonts without an alternate use an
//!   explicit geometric rotate/offset/center fallback with a warning.
//! - Columns wrap when `max_height_px` is exceeded and progress right→left,
//!   matching CJK vertical composition. `\n` forces a column break.
//! - Tate-chu-yoko (縦中横, horizontal-in-vertical) composes one-to-four ASCII
//!   digits horizontally inside one vertical cell. Their outlines are scaled
//!   uniformly to the cell's measured ink bounds and never rotated.
//!
//! No silent loss: characters the supplied font cannot map are still shaped
//! (parley .notdef / fallback lane) and reported through `warnings`.

use std::collections::BTreeSet;

use harfrust::{Direction, Feature, Language, ShapeOptions, ShaperData, UnicodeBuffer};
use skrifa::raw::TableProvider;
use skrifa::{FontRef, MetadataProvider, Tag};
use wasm_bindgen::prelude::*;

use crate::render::RenderError;
use crate::text::{outline_glyph, shape_text, ShapedGlyph, ShapedText};

/// Effectively unbounded line width for the per-segment horizontal shaping
/// passes — every segment must stay a single parley line.
const UNBOUNDED_WIDTH: f32 = 1_000_000.0;

/// Maximum ASCII digit-run length composed as one tate-chu-yoko cell.
const TATE_CHU_YOKO_MAX_DIGITS: usize = 4;

/// One glyph placed in vertical composition. Coordinates are absolute scene
/// space (y-down); rotation for sideways runs is already baked into both the
/// origin and the PathIR verbs.
pub struct VerticalGlyph {
    pub glyph_id: u32,
    pub x: f32,
    pub y: f32,
    pub column: usize,
    pub rotated: bool,
    pub tate_chu_yoko: bool,
    /// True only when `vert`/`vrt2` changed the shaped glyph id relative to
    /// the same character shaped with the default horizontal feature set.
    pub vertical_alternate: bool,
    /// Explicit geometric fallback used when a punctuation alternate was not
    /// supplied by the font. Expected Latin rotation is not a fallback.
    pub vertical_fallback: Option<VerticalFallback>,
    pub verbs: Vec<serde_json::Value>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VerticalFallback {
    Rotate,
    Offset,
    UprightCenter,
}

impl VerticalFallback {
    fn as_str(self) -> &'static str {
        match self {
            Self::Rotate => "rotate",
            Self::Offset => "offset",
            Self::UprightCenter => "upright-center",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VerticalFeatureStrategy {
    OpenTypeVertVrt2,
    Mixed,
    GeometricFallback,
    NotApplicable,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VerticalFeatureApplication {
    Applied,
    AvailableNoSubstitution,
    AbsentInFont,
}

impl VerticalFeatureApplication {
    fn as_str(self) -> &'static str {
        match self {
            Self::Applied => "applied",
            Self::AvailableNoSubstitution => "available-no-substitution",
            Self::AbsentInFont => "absent-in-font",
        }
    }
}

/// Shapes a single upright source character with a real top-to-bottom
/// HarfRust buffer. The function returns selected glyph ids only; Skrifa owns
/// outline extraction so all renderer paths continue to consume canonical
/// PathIR. `vert` and `vrt2` are explicit as well as direction-implied, making
/// the intended feature set reviewable and deterministic.
fn shape_top_to_bottom_glyph_ids(
    text: &str,
    font_bytes: &[u8],
    font_size: f32,
) -> Result<Vec<u32>, RenderError> {
    let font_ref = harfrust::FontRef::from_index(font_bytes, 0)
        .map_err(|error| RenderError::InvalidScene(format!("harfrust font parse: {error}")))?;
    let shaper_data = ShaperData::new(&font_ref);
    let shaper = shaper_data.shaper(&font_ref).build();
    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);
    buffer.guess_segment_properties();
    buffer.set_direction(Direction::TopToBottom);
    if let Some(language) = Language::new("ja") {
        buffer.set_language(language);
    }
    let features = [
        Feature::new(harfrust::Tag::new(b"vert"), 1, ..),
        Feature::new(harfrust::Tag::new(b"vrt2"), 1, ..),
    ];
    let glyphs = shaper.shape(
        buffer,
        ShapeOptions::new()
            .features(&features)
            .point_size(Some(font_size))
            .scale(Some((font_size * 64.0).round() as i32)),
    );
    Ok(glyphs
        .glyph_infos()
        .iter()
        .map(|info| info.glyph_id)
        .collect())
}

fn shaped_text_for_glyph_ids(
    glyph_ids: &[u32],
    font_bytes: &[u8],
    font_size: f32,
) -> Result<ShapedText, RenderError> {
    let mut glyphs = Vec::with_capacity(glyph_ids.len());
    for &glyph_id in glyph_ids {
        glyphs.push(ShapedGlyph {
            glyph_id,
            x: 0.0,
            y: 0.0,
            verbs: outline_glyph(font_bytes, glyph_id, font_size, 0.0, 0.0)?,
        });
    }
    Ok(ShapedText {
        width: font_size,
        height: font_size,
        full_width: font_size,
        line_count: 1,
        glyphs,
    })
}

impl VerticalFeatureStrategy {
    fn as_str(self) -> &'static str {
        match self {
            Self::OpenTypeVertVrt2 => "opentype-vert-vrt2",
            Self::Mixed => "mixed",
            Self::GeometricFallback => "geometric-fallback",
            Self::NotApplicable => "not-applicable",
        }
    }
}

pub struct VerticalFeatureEvidence {
    pub font_has_vert: bool,
    pub font_has_vrt2: bool,
    pub application: VerticalFeatureApplication,
    pub applied_glyphs: usize,
    pub geometric_fallback_glyphs: usize,
    pub strategy: VerticalFeatureStrategy,
}

fn vertical_feature_presence(font_ref: &FontRef<'_>) -> (bool, bool) {
    let Ok(gsub) = font_ref.gsub() else {
        return (false, false);
    };
    let Ok(features) = gsub.feature_list() else {
        return (false, false);
    };
    let mut has_vert = false;
    let mut has_vrt2 = false;
    for record in features.feature_records() {
        match record.feature_tag() {
            tag if tag == Tag::new(b"vert") => has_vert = true,
            tag if tag == Tag::new(b"vrt2") => has_vrt2 = true,
            _ => {}
        }
    }
    (has_vert, has_vrt2)
}

/// One vertical column (line). `index` 0 is the rightmost column; `x` is the
/// final left edge, `height` the used vertical extent.
pub struct VerticalColumn {
    pub index: usize,
    pub x: f32,
    pub height: f32,
}

/// Where the per-cell vertical advance came from.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VerticalMetricsSource {
    /// Real `vhea`/`vmtx` tables in the supplied font.
    Vmtx,
    /// Font has no vertical metrics — deterministic 1em (`font_size`)
    /// advance per upright cell (also surfaced in `warnings`).
    Fallback1Em,
}

impl VerticalMetricsSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Vmtx => "vmtx",
            Self::Fallback1Em => "fallback-1em",
        }
    }
}

pub struct VerticalShapedText {
    pub width: f32,
    pub height: f32,
    pub column_count: usize,
    pub column_advance: f32,
    pub metrics_source: VerticalMetricsSource,
    pub vertical_features: VerticalFeatureEvidence,
    pub glyphs: Vec<VerticalGlyph>,
    pub columns: Vec<VerticalColumn>,
    pub warnings: Vec<String>,
}

/// Ordered warning sink with deduplication — repeated characters warn once.
struct Warnings {
    ordered: Vec<String>,
    seen: BTreeSet<String>,
}

impl Warnings {
    fn new() -> Self {
        Self {
            ordered: Vec::new(),
            seen: BTreeSet::new(),
        }
    }

    fn push(&mut self, warning: String) {
        if self.seen.insert(warning.clone()) {
            self.ordered.push(warning);
        }
    }
}

/// Characters composed upright (one cell per character) in vertical writing:
/// CJK ideographs, kana, hangul, CJK punctuation and fullwidth forms.
/// Everything else (Latin, digits, ASCII punctuation, …) rotates 90° CW as
/// contiguous runs, which matches UAX #50's default `vo=R` classification.
fn is_upright(c: char) -> bool {
    matches!(
        u32::from(c),
        0x1100..=0x11FF        // Hangul Jamo
        | 0x2E80..=0x2FDF      // CJK Radicals Supplement, Kangxi Radicals
        | 0x3000..=0x303F      // CJK Symbols and Punctuation
        | 0x3040..=0x30FF      // Hiragana, Katakana
        | 0x3130..=0x318F      // Hangul Compatibility Jamo
        | 0x31F0..=0x31FF      // Katakana Phonetic Extensions
        | 0x3200..=0x32FF      // Enclosed CJK Letters and Months
        | 0x3400..=0x4DBF      // CJK Unified Ideographs Extension A
        | 0x4E00..=0x9FFF      // CJK Unified Ideographs
        | 0xA960..=0xA97F      // Hangul Jamo Extended-A
        | 0xAC00..=0xD7A3      // Hangul Syllables
        | 0xD7B0..=0xD7FF      // Hangul Jamo Extended-B
        | 0xF900..=0xFAFF      // CJK Compatibility Ideographs
        | 0xFE10..=0xFE19      // Vertical Forms
        | 0xFE30..=0xFE4F      // CJK Compatibility Forms
        | 0xFF00..=0xFF60      // Fullwidth Forms
        | 0xFFE0..=0xFFE6      // Fullwidth Signs
        | 0x20000..=0x2FA1F    // CJK Unified Ideographs Extension B..F + Compat Supplement
    )
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum VerticalPunctuationRole {
    None,
    Opening,
    Closing,
    Stop,
    Small,
    Centered,
    Stroke,
}

/// Bounded Unicode/JIS punctuation roles used only for geometry and warning
/// policy. Glyph substitution itself is always delegated to OpenType GSUB.
fn punctuation_role(c: char) -> VerticalPunctuationRole {
    match c {
        '、' | '。' | '，' | '．' | '｡' | '､' => VerticalPunctuationRole::Stop,
        'ぁ' | 'ぃ' | 'ぅ' | 'ぇ' | 'ぉ' | 'っ' | 'ゃ' | 'ゅ' | 'ょ' | 'ゎ' | 'ゕ' | 'ゖ'
        | 'ァ' | 'ィ' | 'ゥ' | 'ェ' | 'ォ' | 'ッ' | 'ャ' | 'ュ' | 'ョ' | 'ヮ' | 'ヵ' | 'ヶ' => {
            VerticalPunctuationRole::Small
        }
        '(' | '[' | '{' | '（' | '［' | '｛' | '｟' | '〈' | '《' | '「' | '『' | '【' | '〔'
        | '〖' | '〘' | '〚' | '“' | '‘' | '〝' => VerticalPunctuationRole::Opening,
        ')' | ']' | '}' | '）' | '］' | '｝' | '｠' | '〉' | '》' | '」' | '』' | '】' | '〕'
        | '〗' | '〙' | '〛' | '”' | '’' | '〞' => VerticalPunctuationRole::Closing,
        '！' | '？' | '：' | '；' | '・' | '･' | '!' | '?' | ':' | ';' => {
            VerticalPunctuationRole::Centered
        }
        'ー' | '〜' | '～' | '‐' | '‑' | '‒' | '–' | '—' | '―' | '─' | '－' | '-' | '_' | '＿'
        | '￣' | '…' | '‥' | '∥' | '＝' | '=' => VerticalPunctuationRole::Stroke,
        _ => VerticalPunctuationRole::None,
    }
}

fn fallback_for_role(role: VerticalPunctuationRole) -> Option<VerticalFallback> {
    match role {
        VerticalPunctuationRole::Opening
        | VerticalPunctuationRole::Closing
        | VerticalPunctuationRole::Stroke => Some(VerticalFallback::Rotate),
        VerticalPunctuationRole::Stop | VerticalPunctuationRole::Small => {
            Some(VerticalFallback::Offset)
        }
        VerticalPunctuationRole::Centered => Some(VerticalFallback::UprightCenter),
        VerticalPunctuationRole::None => None,
    }
}

enum Segment {
    /// Explicit `\n` column break.
    ColumnBreak,
    /// One upright CJK cell.
    Upright(char),
    /// One-to-four ASCII digits composed horizontally inside one vertical
    /// cell (縦中横). Trailing whitespace remains a separate rotating run so
    /// the original inter-word advance is preserved.
    TateChuYoko(String),
    /// Contiguous rotating run (word plus its trailing whitespace, so column
    /// wrap can break between words but never inside one).
    Rotated(String),
}

fn push_rotated_or_tate_chu_yoko(segments: &mut Vec<Segment>, run: String) {
    let trimmed = run.trim();
    let is_tate_chu_yoko = !trimmed.is_empty()
        && trimmed.chars().count() <= TATE_CHU_YOKO_MAX_DIGITS
        && trimmed.chars().all(|c| c.is_ascii_digit());
    if !is_tate_chu_yoko {
        segments.push(Segment::Rotated(run));
        return;
    }

    let start = run.find(trimmed).unwrap_or(0);
    let end = start + trimmed.len();
    if start > 0 {
        segments.push(Segment::Rotated(run[..start].to_owned()));
    }
    segments.push(Segment::TateChuYoko(trimmed.to_owned()));
    if end < run.len() {
        segments.push(Segment::Rotated(run[end..].to_owned()));
    }
}

fn segment_text(text: &str) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut run = String::new();
    for c in text.chars() {
        if c == '\n' {
            if !run.is_empty() {
                push_rotated_or_tate_chu_yoko(&mut segments, std::mem::take(&mut run));
            }
            segments.push(Segment::ColumnBreak);
        } else if is_upright(c) {
            if !run.is_empty() {
                push_rotated_or_tate_chu_yoko(&mut segments, std::mem::take(&mut run));
            }
            segments.push(Segment::Upright(c));
        } else if matches!(
            punctuation_role(c),
            VerticalPunctuationRole::Opening
                | VerticalPunctuationRole::Closing
                | VerticalPunctuationRole::Centered
        ) {
            // Opposite punctuation roles (notably `)(` / `][`) must remain
            // independently placeable instead of becoming one rotated word.
            if !run.is_empty() {
                push_rotated_or_tate_chu_yoko(&mut segments, std::mem::take(&mut run));
            }
            segments.push(Segment::Rotated(c.to_string()));
        } else {
            // Close `word␣` groups: a non-space after trailing whitespace
            // starts the next wrappable unit.
            if !run.is_empty()
                && run.ends_with(|prev: char| prev.is_whitespace())
                && !c.is_whitespace()
            {
                push_rotated_or_tate_chu_yoko(&mut segments, std::mem::take(&mut run));
            }
            run.push(c);
        }
    }
    if !run.is_empty() {
        push_rotated_or_tate_chu_yoko(&mut segments, run);
    }
    segments
}

fn verb_bounds<'a>(
    verbs: impl Iterator<Item = &'a serde_json::Value>,
) -> Option<(f64, f64, f64, f64)> {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut saw_point = false;
    for verb in verbs {
        let kind = verb.get("v").and_then(|value| value.as_str()).unwrap_or("");
        let pairs: &[(&str, &str)] = match kind {
            "M" | "L" => &[("x", "y")],
            "Q" => &[("cx", "cy"), ("x", "y")],
            "C" => &[("c1x", "c1y"), ("c2x", "c2y"), ("x", "y")],
            _ => &[],
        };
        for (key_x, key_y) in pairs {
            let Some(x) = verb.get(*key_x).and_then(|value| value.as_f64()) else {
                continue;
            };
            let Some(y) = verb.get(*key_y).and_then(|value| value.as_f64()) else {
                continue;
            };
            if x.is_finite() && y.is_finite() {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
                saw_point = true;
            }
        }
    }
    saw_point.then_some((min_x, min_y, max_x, max_y))
}

/// Rebuilds PathIR verbs through an affine point map, preserving verb kinds.
fn map_verbs(
    verbs: &[serde_json::Value],
    point_map: &dyn Fn(f64, f64) -> (f64, f64),
) -> Vec<serde_json::Value> {
    verbs
        .iter()
        .map(|verb| {
            let kind = verb.get("v").and_then(|value| value.as_str()).unwrap_or("");
            let pairs: &[(&str, &str)] = match kind {
                "M" | "L" => &[("x", "y")],
                "Q" => &[("cx", "cy"), ("x", "y")],
                "C" => &[("c1x", "c1y"), ("c2x", "c2y"), ("x", "y")],
                _ => &[],
            };
            let mut mapped = serde_json::Map::new();
            mapped.insert("v".into(), serde_json::json!(kind));
            for (key_x, key_y) in pairs {
                let x = verb
                    .get(*key_x)
                    .and_then(|value| value.as_f64())
                    .unwrap_or(0.0);
                let y = verb
                    .get(*key_y)
                    .and_then(|value| value.as_f64())
                    .unwrap_or(0.0);
                let (nx, ny) = point_map(x, y);
                mapped.insert((*key_x).into(), serde_json::json!(nx));
                mapped.insert((*key_y).into(), serde_json::json!(ny));
            }
            serde_json::Value::Object(mapped)
        })
        .collect()
}

/// Shapes `text` into vertical (top-to-bottom, right-to-left column) glyph
/// PathIR at `font_size` px, wrapping columns at `max_height_px`.
pub fn shape_text_vertical(
    text: &str,
    font_bytes: &[u8],
    font_size: f32,
    max_height_px: f32,
) -> Result<VerticalShapedText, RenderError> {
    if text.is_empty() {
        return Err(RenderError::InvalidScene("empty text".into()));
    }
    if !(font_size.is_finite() && font_size > 0.0) {
        return Err(RenderError::InvalidScene(format!(
            "font_size must be finite and positive, got {font_size}"
        )));
    }
    if !(max_height_px.is_finite() && max_height_px > 0.0) {
        return Err(RenderError::InvalidScene(format!(
            "max_height_px must be finite and positive, got {max_height_px}"
        )));
    }

    let font_ref = FontRef::from_index(font_bytes, 0)
        .map_err(|error| RenderError::InvalidScene(format!("font parse: {error}")))?;
    let (font_has_vert, font_has_vrt2) = vertical_feature_presence(&font_ref);
    let upem = font_ref
        .head()
        .map_err(|error| RenderError::InvalidScene(format!("font head: {error}")))?
        .units_per_em();
    if upem == 0 {
        return Err(RenderError::InvalidScene("font unitsPerEm is 0".into()));
    }
    let scale = font_size / f32::from(upem);
    let charmap = font_ref.charmap();

    let mut warnings = Warnings::new();

    // Vertical metrics: measured vhea/vmtx when present, 1em fallback else.
    let vertical_tables = match (font_ref.vhea(), font_ref.vmtx()) {
        (Ok(vhea), Ok(vmtx)) => Some((vhea, vmtx)),
        _ => None,
    };
    let metrics_source = if vertical_tables.is_some() {
        VerticalMetricsSource::Vmtx
    } else {
        warnings.push(
            "font has no vhea/vmtx vertical metrics — upright cell advance falls back to \
             1em (font_size, upem-based)"
                .into(),
        );
        VerticalMetricsSource::Fallback1Em
    };
    let column_advance = match &vertical_tables {
        Some((vhea, _)) => {
            let units = f32::from(vhea.ascender().to_i16()) - f32::from(vhea.descender().to_i16())
                + f32::from(vhea.line_gap().to_i16());
            if units > 0.0 {
                units * scale
            } else {
                font_size
            }
        }
        None => font_size,
    };
    let cell_advance = |c: char| -> f32 {
        match (&vertical_tables, charmap.map(c)) {
            (Some((_, vmtx)), Some(glyph_id)) => vmtx
                .advance(glyph_id)
                .map(|units| f32::from(units) * scale)
                .unwrap_or(font_size),
            _ => font_size,
        }
    };
    let warn_uncovered = |warnings: &mut Warnings, c: char| {
        if !c.is_whitespace() && charmap.map(c).is_none() {
            warnings.push(format!(
                "'{c}' (U+{:04X}) is not covered by the supplied font — shaped through the \
                 .notdef/fallback lane, not dropped",
                u32::from(c)
            ));
        }
    };

    // Column-local placement; the right-to-left column x flip is baked after
    // the total column count is known.
    struct Placed {
        glyph_id: u32,
        column: usize,
        rotated: bool,
        tate_chu_yoko: bool,
        vertical_alternate: bool,
        vertical_fallback: Option<VerticalFallback>,
        local_x: f32,
        y: f32,
        local_verbs: Vec<serde_json::Value>,
    }
    let mut placed: Vec<Placed> = Vec::new();
    let mut column = 0usize;
    let mut cursor_y = 0f32;
    let mut applied_vertical_alternate_glyphs = 0usize;
    let mut geometric_fallback_glyphs = 0usize;
    let mut column_heights: Vec<f32> = vec![0.0];
    fn ensure_column(column_heights: &mut Vec<f32>, column: usize) {
        while column_heights.len() <= column {
            column_heights.push(0.0);
        }
    }

    for segment in segment_text(text) {
        match segment {
            Segment::ColumnBreak => {
                column += 1;
                cursor_y = 0.0;
                ensure_column(&mut column_heights, column);
            }
            Segment::Upright(original) => {
                warn_uncovered(&mut warnings, original);
                let advance = cell_advance(original);
                if cursor_y > 0.0 && cursor_y + advance > max_height_px {
                    column += 1;
                    cursor_y = 0.0;
                }
                ensure_column(&mut column_heights, column);
                let source = original.to_string();
                let base_mini =
                    shape_text(source.as_str(), font_bytes, font_size, UNBOUNDED_WIDTH)?;
                let featured_ids =
                    shape_top_to_bottom_glyph_ids(source.as_str(), font_bytes, font_size)?;
                let featured_mini =
                    shaped_text_for_glyph_ids(&featured_ids, font_bytes, font_size)?;
                if base_mini.glyphs.len() != featured_mini.glyphs.len() {
                    warnings.push(format!(
                        "OpenType vert/vrt2 changed the glyph count for '{original}' \
                         (U+{:04X}) from {} to {} — ignoring the unsafe alternate to preserve \
                         source coverage",
                        u32::from(original),
                        base_mini.glyphs.len(),
                        featured_mini.glyphs.len()
                    ));
                }
                let vertical_alternate = base_mini.glyphs.len() == featured_mini.glyphs.len()
                    && base_mini
                        .glyphs
                        .iter()
                        .zip(&featured_mini.glyphs)
                        .any(|(base, vertical)| base.glyph_id != vertical.glyph_id);
                let role = punctuation_role(original);
                let vertical_fallback = (!vertical_alternate)
                    .then(|| fallback_for_role(role))
                    .flatten();
                if let Some(fallback) = vertical_fallback {
                    warnings.push(format!(
                        "OpenType vert/vrt2 produced no glyph alternate for '{original}' \
                         (U+{:04X}) — using explicit {} geometric fallback",
                        u32::from(original),
                        fallback.as_str()
                    ));
                }
                let mini = if vertical_alternate {
                    &featured_mini
                } else {
                    &base_mini
                };
                let bounds = verb_bounds(mini.glyphs.iter().flat_map(|glyph| glyph.verbs.iter()))
                    .unwrap_or((
                        0.0,
                        0.0,
                        f64::from(mini.width.max(1.0)),
                        f64::from(mini.height.max(1.0)),
                    ));
                let ink_width = (bounds.2 - bounds.0).max(f64::EPSILON);
                let ink_height = (bounds.3 - bounds.1).max(f64::EPSILON);
                for glyph in &mini.glyphs {
                    let (local_x, glyph_y, local_verbs, rotated) = match vertical_fallback {
                        Some(VerticalFallback::Rotate) => {
                            let fitted_scale = (f64::from(column_advance) / ink_height)
                                .min(f64::from(advance) / ink_width)
                                .min(1.0);
                            let center_x = f64::from(column_advance) / 2.0;
                            let center_y = f64::from(cursor_y + advance / 2.0);
                            let source_center_x = (bounds.0 + bounds.2) / 2.0;
                            let source_center_y = (bounds.1 + bounds.3) / 2.0;
                            let rotate = |x: f64, y: f64| {
                                (
                                    center_x - (y - source_center_y) * fitted_scale,
                                    center_y + (x - source_center_x) * fitted_scale,
                                )
                            };
                            let (origin_x, origin_y) =
                                rotate(f64::from(glyph.x), f64::from(glyph.y));
                            (
                                origin_x as f32,
                                origin_y as f32,
                                map_verbs(&glyph.verbs, &rotate),
                                true,
                            )
                        }
                        fallback => {
                            let fitted_scale = (f64::from(column_advance) / ink_width)
                                .min(f64::from(advance) / ink_height)
                                .min(1.0);
                            let scaled_width = ink_width * fitted_scale;
                            let scaled_height = ink_height * fitted_scale;
                            let (target_left, target_top) = match (fallback, role) {
                                (Some(VerticalFallback::Offset), VerticalPunctuationRole::Stop) => {
                                    (
                                        f64::from(column_advance)
                                            - scaled_width
                                            - f64::from(column_advance) * 0.05,
                                        f64::from(cursor_y) + f64::from(advance) * 0.05,
                                    )
                                }
                                (
                                    Some(VerticalFallback::Offset),
                                    VerticalPunctuationRole::Small,
                                ) => (
                                    f64::from(column_advance)
                                        - scaled_width
                                        - f64::from(column_advance) * 0.1,
                                    f64::from(cursor_y) + f64::from(advance) * 0.1,
                                ),
                                _ => (
                                    (f64::from(column_advance) - scaled_width) / 2.0,
                                    f64::from(cursor_y)
                                        + (f64::from(advance) - scaled_height) / 2.0,
                                ),
                            };
                            let place = |x: f64, y: f64| {
                                (
                                    (x - bounds.0) * fitted_scale + target_left,
                                    (y - bounds.1) * fitted_scale + target_top,
                                )
                            };
                            let (origin_x, origin_y) =
                                place(f64::from(glyph.x), f64::from(glyph.y));
                            (
                                origin_x as f32,
                                origin_y as f32,
                                map_verbs(&glyph.verbs, &place),
                                false,
                            )
                        }
                    };
                    if vertical_alternate {
                        applied_vertical_alternate_glyphs += 1;
                    }
                    if vertical_fallback.is_some() {
                        geometric_fallback_glyphs += 1;
                    }
                    placed.push(Placed {
                        glyph_id: glyph.glyph_id,
                        column,
                        rotated,
                        tate_chu_yoko: false,
                        vertical_alternate,
                        vertical_fallback,
                        local_x,
                        y: glyph_y,
                        local_verbs,
                    });
                }
                cursor_y += advance;
                column_heights[column] = column_heights[column].max(cursor_y);
            }
            Segment::TateChuYoko(run) => {
                for c in run.chars() {
                    warn_uncovered(&mut warnings, c);
                }
                let mini = shape_text(run.as_str(), font_bytes, font_size, UNBOUNDED_WIDTH)?;
                // A tate-chu-yoko run consumes exactly one vertical digit
                // cell. Real vmtx is honored when available; otherwise this
                // is the same deterministic 1em fallback as upright cells.
                let advance = run
                    .chars()
                    .next()
                    .map(|c| cell_advance(c))
                    .unwrap_or(font_size);
                if cursor_y > 0.0 && cursor_y + advance > max_height_px {
                    column += 1;
                    cursor_y = 0.0;
                }
                ensure_column(&mut column_heights, column);

                let bounds = verb_bounds(mini.glyphs.iter().flat_map(|glyph| glyph.verbs.iter()))
                    .unwrap_or((
                        0.0,
                        0.0,
                        f64::from(mini.width.max(1.0)),
                        f64::from(mini.height.max(1.0)),
                    ));
                let ink_width = (bounds.2 - bounds.0).max(f64::EPSILON);
                let ink_height = (bounds.3 - bounds.1).max(f64::EPSILON);
                let fitted_scale = (f64::from(column_advance) / ink_width)
                    .min(f64::from(advance) / ink_height)
                    .min(1.0);
                let dx = (f64::from(column_advance) - ink_width * fitted_scale) / 2.0
                    - bounds.0 * fitted_scale;
                let dy = f64::from(cursor_y)
                    + (f64::from(advance) - ink_height * fitted_scale) / 2.0
                    - bounds.1 * fitted_scale;
                for glyph in &mini.glyphs {
                    let local_verbs = map_verbs(&glyph.verbs, &|x, y| {
                        (x * fitted_scale + dx, y * fitted_scale + dy)
                    });
                    placed.push(Placed {
                        glyph_id: glyph.glyph_id,
                        column,
                        rotated: false,
                        tate_chu_yoko: true,
                        vertical_alternate: false,
                        vertical_fallback: None,
                        local_x: (f64::from(glyph.x) * fitted_scale + dx) as f32,
                        y: (f64::from(glyph.y) * fitted_scale + dy) as f32,
                        local_verbs,
                    });
                }
                cursor_y += advance;
                column_heights[column] = column_heights[column].max(cursor_y);
            }
            Segment::Rotated(run) => {
                for c in run.chars() {
                    warn_uncovered(&mut warnings, c);
                }
                let mini = shape_text(run.as_str(), font_bytes, font_size, UNBOUNDED_WIDTH)?;
                let advance = mini.full_width;
                if cursor_y > 0.0 && cursor_y + advance > max_height_px {
                    column += 1;
                    cursor_y = 0.0;
                }
                ensure_column(&mut column_heights, column);
                // 90° clockwise in y-down space: (x, y) → (-y, x), then the
                // rotated line box (thickness = mini.height) is centered in
                // the column and pushed down to the cursor.
                let rotated_x0 = column_advance / 2.0 + mini.height / 2.0;
                let dy = cursor_y;
                for glyph in &mini.glyphs {
                    let local_verbs = map_verbs(&glyph.verbs, &|x, y| {
                        (f64::from(rotated_x0) - y, f64::from(dy) + x)
                    });
                    placed.push(Placed {
                        glyph_id: glyph.glyph_id,
                        column,
                        rotated: true,
                        tate_chu_yoko: false,
                        vertical_alternate: false,
                        vertical_fallback: None,
                        local_x: rotated_x0 - glyph.y,
                        y: dy + glyph.x,
                        local_verbs,
                    });
                }
                cursor_y += advance;
                column_heights[column] = column_heights[column].max(cursor_y);
            }
        }
    }

    // Bake the right-to-left column progression: column 0 is rightmost.
    let column_count = column_heights.len();
    let column_left = |index: usize| -> f32 { (column_count - 1 - index) as f32 * column_advance };
    let glyphs = placed
        .into_iter()
        .map(|glyph| {
            let left = column_left(glyph.column);
            VerticalGlyph {
                glyph_id: glyph.glyph_id,
                x: left + glyph.local_x,
                y: glyph.y,
                column: glyph.column,
                rotated: glyph.rotated,
                tate_chu_yoko: glyph.tate_chu_yoko,
                vertical_alternate: glyph.vertical_alternate,
                vertical_fallback: glyph.vertical_fallback,
                verbs: map_verbs(&glyph.local_verbs, &|x, y| (x + f64::from(left), y)),
            }
        })
        .collect();
    let columns = column_heights
        .iter()
        .enumerate()
        .map(|(index, height)| VerticalColumn {
            index,
            x: column_left(index),
            height: *height,
        })
        .collect();
    let height = column_heights.iter().copied().fold(0f32, f32::max);
    let vertical_feature_strategy = match (
        applied_vertical_alternate_glyphs > 0,
        geometric_fallback_glyphs > 0,
    ) {
        (true, true) => VerticalFeatureStrategy::Mixed,
        (true, false) => VerticalFeatureStrategy::OpenTypeVertVrt2,
        (false, true) => VerticalFeatureStrategy::GeometricFallback,
        (false, false) => VerticalFeatureStrategy::NotApplicable,
    };
    let vertical_feature_application = if applied_vertical_alternate_glyphs > 0 {
        VerticalFeatureApplication::Applied
    } else if font_has_vert || font_has_vrt2 {
        VerticalFeatureApplication::AvailableNoSubstitution
    } else {
        VerticalFeatureApplication::AbsentInFont
    };

    Ok(VerticalShapedText {
        width: column_count as f32 * column_advance,
        height,
        column_count,
        column_advance,
        metrics_source,
        vertical_features: VerticalFeatureEvidence {
            font_has_vert,
            font_has_vrt2,
            application: vertical_feature_application,
            applied_glyphs: applied_vertical_alternate_glyphs,
            geometric_fallback_glyphs,
            strategy: vertical_feature_strategy,
        },
        glyphs,
        columns,
        warnings: warnings.ordered,
    })
}

pub fn shaped_text_vertical_to_json(shaped: &VerticalShapedText) -> String {
    let glyphs: Vec<serde_json::Value> = shaped
        .glyphs
        .iter()
        .map(|glyph| {
            serde_json::json!({
                "id": glyph.glyph_id,
                "x": glyph.x,
                "y": glyph.y,
                "column": glyph.column,
                "rotated": glyph.rotated,
                "tateChuYoko": glyph.tate_chu_yoko,
                "verticalAlternate": glyph.vertical_alternate,
                "verticalFallback": glyph.vertical_fallback.map(VerticalFallback::as_str),
                "path": { "verbs": glyph.verbs },
            })
        })
        .collect();
    let columns: Vec<serde_json::Value> = shaped
        .columns
        .iter()
        .map(|column| {
            serde_json::json!({
                "index": column.index,
                "x": column.x,
                "height": column.height,
            })
        })
        .collect();
    serde_json::json!({
        "width": shaped.width,
        "height": shaped.height,
        "columnCount": shaped.column_count,
        "columnAdvance": shaped.column_advance,
        "verticalMetricsSource": shaped.metrics_source.as_str(),
        "verticalFeatures": {
            "requested": ["vert", "vrt2"],
            "fontHasVert": shaped.vertical_features.font_has_vert,
            "fontHasVrt2": shaped.vertical_features.font_has_vrt2,
            "application": shaped.vertical_features.application.as_str(),
            "appliedGlyphs": shaped.vertical_features.applied_glyphs,
            "geometricFallbackGlyphs": shaped.vertical_features.geometric_fallback_glyphs,
            "strategy": shaped.vertical_features.strategy.as_str(),
        },
        "glyphs": glyphs,
        "columns": columns,
        "warnings": shaped.warnings,
    })
    .to_string()
}

/// Shapes text into vertical-writing positioned glyph PathIR JSON (manual
/// vertical composition over the Parley lane — V12 Text row, 세로쓰기 확장).
#[wasm_bindgen]
pub fn shape_text_vertical_json(
    text: &str,
    font_bytes: &[u8],
    font_size: f32,
    max_height_px: f32,
) -> Result<String, JsError> {
    let shaped = shape_text_vertical(text, font_bytes, font_size, max_height_px)
        .map_err(|error| JsError::new(&error.to_string()))?;
    Ok(shaped_text_vertical_to_json(&shaped))
}
