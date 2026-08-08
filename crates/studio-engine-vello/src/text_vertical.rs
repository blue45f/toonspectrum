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
//! - CJK punctuation with a vertical presentation form (U+FE10–U+FE19 /
//!   U+FE30–U+FE44) is substituted when the supplied font covers the form;
//!   otherwise the original character is kept and a warning is emitted.
//! - Columns wrap when `max_height_px` is exceeded and progress right→left,
//!   matching CJK vertical composition. `\n` forces a column break.
//! - tate-chu-yoko (horizontal-in-vertical digit groups) is a v2 item: short
//!   digit runs are rotated like other Latin runs and flagged in `warnings`.
//!
//! No silent loss: characters the supplied font cannot map are still shaped
//! (parley .notdef / fallback lane) and reported through `warnings`.

use std::collections::BTreeSet;

use skrifa::raw::TableProvider;
use skrifa::{FontRef, MetadataProvider};
use wasm_bindgen::prelude::*;

use crate::render::RenderError;
use crate::text::shape_text;

/// Effectively unbounded line width for the per-segment horizontal shaping
/// passes — every segment must stay a single parley line.
const UNBOUNDED_WIDTH: f32 = 1_000_000.0;

/// Digit-run length that would qualify for tate-chu-yoko in a v2 lane.
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
    pub verbs: Vec<serde_json::Value>,
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

/// Vertical presentation form for CJK/fullwidth punctuation (U+FE10–U+FE19
/// Vertical Forms, U+FE30–U+FE44 CJK Compatibility Forms). Only characters
/// classified upright by `is_upright` are consulted; dashes/ellipsis stay in
/// the rotated lane (their 90° rotation is already the vertical rendering).
fn vertical_form(c: char) -> Option<char> {
    Some(match c {
        '，' => '\u{FE10}',
        '、' => '\u{FE11}',
        '。' => '\u{FE12}',
        '：' => '\u{FE13}',
        '；' => '\u{FE14}',
        '！' => '\u{FE15}',
        '？' => '\u{FE16}',
        '〖' => '\u{FE17}',
        '〗' => '\u{FE18}',
        '（' => '\u{FE35}',
        '）' => '\u{FE36}',
        '｛' => '\u{FE37}',
        '｝' => '\u{FE38}',
        '〔' => '\u{FE39}',
        '〕' => '\u{FE3A}',
        '【' => '\u{FE3B}',
        '】' => '\u{FE3C}',
        '《' => '\u{FE3D}',
        '》' => '\u{FE3E}',
        '〈' => '\u{FE3F}',
        '〉' => '\u{FE40}',
        '「' => '\u{FE41}',
        '」' => '\u{FE42}',
        '『' => '\u{FE43}',
        '』' => '\u{FE44}',
        _ => return None,
    })
}

enum Segment {
    /// Explicit `\n` column break.
    ColumnBreak,
    /// One upright CJK cell.
    Upright(char),
    /// Contiguous rotating run (word plus its trailing whitespace, so column
    /// wrap can break between words but never inside one).
    Rotated(String),
}

fn segment_text(text: &str) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut run = String::new();
    for c in text.chars() {
        if c == '\n' {
            if !run.is_empty() {
                segments.push(Segment::Rotated(std::mem::take(&mut run)));
            }
            segments.push(Segment::ColumnBreak);
        } else if is_upright(c) {
            if !run.is_empty() {
                segments.push(Segment::Rotated(std::mem::take(&mut run)));
            }
            segments.push(Segment::Upright(c));
        } else {
            // Close `word␣` groups: a non-space after trailing whitespace
            // starts the next wrappable unit.
            if !run.is_empty()
                && run.ends_with(|prev: char| prev.is_whitespace())
                && !c.is_whitespace()
            {
                segments.push(Segment::Rotated(std::mem::take(&mut run)));
            }
            run.push(c);
        }
    }
    if !run.is_empty() {
        segments.push(Segment::Rotated(run));
    }
    segments
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
                let x = verb.get(*key_x).and_then(|value| value.as_f64()).unwrap_or(0.0);
                let y = verb.get(*key_y).and_then(|value| value.as_f64()).unwrap_or(0.0);
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
            let units = f32::from(vhea.ascender().to_i16())
                - f32::from(vhea.descender().to_i16())
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
        local_x: f32,
        y: f32,
        local_verbs: Vec<serde_json::Value>,
    }
    let mut placed: Vec<Placed> = Vec::new();
    let mut column = 0usize;
    let mut cursor_y = 0f32;
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
                // Vertical punctuation substitution, coverage-gated.
                let shape_char = match vertical_form(original) {
                    Some(form) if charmap.map(form).is_some() => form,
                    Some(form) => {
                        warnings.push(format!(
                            "vertical form U+{:04X} for '{original}' (U+{:04X}) is not in the \
                             supplied font — keeping the original character",
                            u32::from(form),
                            u32::from(original)
                        ));
                        original
                    }
                    None => original,
                };
                warn_uncovered(&mut warnings, shape_char);
                let advance = cell_advance(shape_char);
                if cursor_y > 0.0 && cursor_y + advance > max_height_px {
                    column += 1;
                    cursor_y = 0.0;
                }
                ensure_column(&mut column_heights, column);
                let mini = shape_text(
                    shape_char.to_string().as_str(),
                    font_bytes,
                    font_size,
                    UNBOUNDED_WIDTH,
                )?;
                // Center the cell horizontally inside the column.
                let dx = (column_advance - mini.width) / 2.0;
                let dy = cursor_y;
                for glyph in &mini.glyphs {
                    let local_verbs = map_verbs(&glyph.verbs, &|x, y| {
                        (x + f64::from(dx), y + f64::from(dy))
                    });
                    placed.push(Placed {
                        glyph_id: glyph.glyph_id,
                        column,
                        rotated: false,
                        local_x: dx + glyph.x,
                        y: dy + glyph.y,
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
                let trimmed = run.trim();
                if !trimmed.is_empty()
                    && trimmed.len() <= TATE_CHU_YOKO_MAX_DIGITS
                    && trimmed.chars().all(|c| c.is_ascii_digit())
                {
                    warnings.push(format!(
                        "tate-chu-yoko is not implemented (v2) — digit run '{trimmed}' is \
                         rotated 90° like other Latin runs"
                    ));
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
    let column_left =
        |index: usize| -> f32 { (column_count - 1 - index) as f32 * column_advance };
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

    Ok(VerticalShapedText {
        width: column_count as f32 * column_advance,
        height,
        column_count,
        column_advance,
        metrics_source,
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
