//! Parley text lane contracts: shaping, line breaking, outline extraction,
//! determinism, and the full Parley→PathIR→vello_cpu render integration.

use studio_engine_vello::{
    parse_scene, render_scene, shape_text, shape_text_vertical, shaped_text_to_json,
    shaped_text_vertical_to_json, VerticalMetricsSource,
};

fn roboto() -> Vec<u8> {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/corpus/text/fonts/Roboto-Regular.ttf"
    );
    std::fs::read(path).expect("test font present in tests/corpus/text/fonts")
}

#[test]
fn shapes_latin_text_with_outlines() {
    let shaped = shape_text("Hello Parley PoC", &roboto(), 32.0, 800.0).unwrap();
    assert_eq!(shaped.line_count, 1);
    assert!(shaped.width > 100.0);
    // Every non-space glyph must carry a non-empty outline.
    let outlined = shaped
        .glyphs
        .iter()
        .filter(|glyph| !glyph.verbs.is_empty())
        .count();
    assert!(outlined >= 10, "outlined glyphs: {outlined}");
}

#[test]
fn breaks_lines_at_max_width() {
    let narrow = shape_text("Hello Parley PoC line breaking", &roboto(), 32.0, 120.0).unwrap();
    assert!(narrow.line_count >= 3, "lines: {}", narrow.line_count);
    let wide = shape_text("Hello Parley PoC line breaking", &roboto(), 32.0, 4000.0).unwrap();
    assert_eq!(wide.line_count, 1);
}

#[test]
fn shaping_is_deterministic() {
    let a = shaped_text_to_json(&shape_text("determinism", &roboto(), 24.0, 500.0).unwrap());
    let b = shaped_text_to_json(&shape_text("determinism", &roboto(), 24.0, 500.0).unwrap());
    assert_eq!(a, b);
}

#[test]
fn glyph_paths_render_through_vello_cpu() {
    // Parley glyph outlines become ordinary fill-path nodes: the text island
    // renders through the same deterministic lane as every other vector.
    let shaped = shape_text("Ink", &roboto(), 48.0, 400.0).unwrap();
    let nodes: Vec<String> = shaped
        .glyphs
        .iter()
        .filter(|glyph| !glyph.verbs.is_empty())
        .enumerate()
        .map(|(index, glyph)| {
            format!(
                r#"{{"id":"g{index}","kind":"fill-path","path":{{"verbs":{}}},"paint":{{"kind":"solid","color":{{"r":0,"g":0,"b":0,"a":1}}}},"opacity":1,"blend":"src-over","fillRule":"nonzero"}}"#,
                serde_json::to_string(&glyph.verbs).unwrap()
            )
        })
        .collect();
    let scene_json = format!(
        r#"{{"version":11,"width":128,"height":72,"background":{{"r":1,"g":1,"b":1,"a":1}},"nodes":[{}]}}"#,
        nodes.join(",")
    );
    let scene = parse_scene(&scene_json).unwrap();
    let pixels = render_scene(&scene).unwrap();
    let inked = pixels
        .chunks_exact(4)
        .filter(|px| px[0] < 200 && px[3] == 255)
        .count();
    assert!(inked > 150, "expected visible glyph coverage, got {inked} dark pixels");
}

#[test]
fn missing_glyphs_do_not_crash_korean_needs_cjk_font() {
    // Roboto has no Hangul coverage: shaping must survive and report glyphs
    // (possibly .notdef/empty outlines) instead of erroring. The CJK lane is
    // gated on adding a Korean font asset (documented in the text-layout
    // capability survey).
    let shaped = shape_text("말풍선", &roboto(), 24.0, 500.0).unwrap();
    assert!(!shaped.glyphs.is_empty());
}

#[test]
fn rejects_empty_text_and_bad_size() {
    assert!(shape_text("", &roboto(), 24.0, 500.0).is_err());
    assert!(shape_text("x", &roboto(), 0.0, 500.0).is_err());
    assert!(shape_text("x", &[1, 2, 3], 24.0, 500.0).is_err());
}

// ---------------------------------------------------------------------------
// Vertical writing lane (세로쓰기) — manual vertical composition over Parley.
// ---------------------------------------------------------------------------

#[test]
fn vertical_latin_run_rotates_clockwise_and_stacks_downward() {
    // Roboto has no vhea/vmtx, so column width is exactly 1em = font_size.
    let font_size = 32.0f32;
    let shaped = shape_text_vertical("AB", &roboto(), font_size, 4000.0).unwrap();
    assert_eq!(shaped.column_count, 1);
    assert_eq!(shaped.metrics_source, VerticalMetricsSource::Fallback1Em);
    assert_eq!(shaped.width, font_size);
    assert_eq!(shaped.glyphs.len(), 2);
    assert!(shaped.glyphs.iter().all(|glyph| glyph.rotated));
    let (a, b) = (&shaped.glyphs[0], &shaped.glyphs[1]);
    // The run advances vertically: 'B' sits below 'A' by exactly the
    // horizontal advance of 'A' (the 90° rotation maps x-advance to y).
    assert!(b.y > a.y, "B({}) must stack below A({})", b.y, a.y);
    let horizontal = shape_text("AB", &roboto(), font_size, 4000.0).unwrap();
    let advance_a = horizontal.glyphs[1].x - horizontal.glyphs[0].x;
    assert!(
        (b.y - a.y - advance_a).abs() < 1e-3,
        "vertical stacking delta {} must equal horizontal advance {}",
        b.y - a.y,
        advance_a
    );
    // Total used height equals the run's horizontal advance width.
    assert!((shaped.height - horizontal.width).abs() < 1e-3);
    // Rotation is baked into the verbs: every glyph outline point must stay
    // inside the column band (column thickness = line height, centered on
    // the 1em column, so allow the (lineHeight - 1em) / 2 overhang).
    let overhang = (horizontal.height - font_size) / 2.0 + 1e-3;
    for glyph in &shaped.glyphs {
        for verb in &glyph.verbs {
            if let Some(x) = verb.get("x").and_then(|value| value.as_f64()) {
                assert!(
                    x >= f64::from(-overhang) && x <= f64::from(font_size + overhang),
                    "rotated outline x {x} escaped the column band"
                );
            }
        }
    }
}

#[test]
fn vertical_columns_wrap_and_progress_right_to_left() {
    // Three words; max_height fits one word per column, so the layout must
    // produce three columns whose x positions decrease (right→left).
    let shaped = shape_text_vertical("aaa bbb ccc", &roboto(), 32.0, 60.0).unwrap();
    assert_eq!(shaped.column_count, 3);
    assert_eq!(shaped.columns.len(), 3);
    assert!(shaped.columns[0].x > shaped.columns[1].x);
    assert!(shaped.columns[1].x > shaped.columns[2].x);
    assert_eq!(shaped.columns[0].x, 2.0 * shaped.column_advance);
    assert_eq!(shaped.columns[2].x, 0.0);
    // Every column actually received glyphs and each restarts at its top.
    for column in &shaped.columns {
        let first_y = shaped
            .glyphs
            .iter()
            .filter(|glyph| glyph.column == column.index)
            .map(|glyph| glyph.y)
            .fold(f32::INFINITY, f32::min);
        assert!(
            first_y < 8.0,
            "column {} must restart near its top, first glyph y = {first_y}",
            column.index
        );
        assert!(column.height > 0.0);
    }
}

#[test]
fn vertical_newline_forces_column_break() {
    let shaped = shape_text_vertical("ab\ncd", &roboto(), 24.0, 4000.0).unwrap();
    assert_eq!(shaped.column_count, 2);
    let first: Vec<_> = shaped.glyphs.iter().filter(|g| g.column == 0).collect();
    let second: Vec<_> = shaped.glyphs.iter().filter(|g| g.column == 1).collect();
    assert_eq!(first.len(), 2);
    assert_eq!(second.len(), 2);
    // Column 0 (the first written column) is the rightmost.
    assert!(shaped.columns[0].x > shaped.columns[1].x);
    assert!(first.iter().all(|g| g.x > second.iter().map(|s| s.x).fold(f32::MIN, f32::max)));
}

#[test]
fn vertical_upright_cells_advance_by_1em_fallback_with_warning() {
    // Hiragana cells with a vmtx-less font: the cell advance contract is
    // exactly 1em (font_size) per upright character, reported in warnings.
    let font_size = 30.0f32;
    let shaped = shape_text_vertical("あい", &roboto(), font_size, 4000.0).unwrap();
    assert_eq!(shaped.metrics_source, VerticalMetricsSource::Fallback1Em);
    assert!(shaped
        .warnings
        .iter()
        .any(|warning| warning.contains("vhea/vmtx") && warning.contains("1em")));
    assert_eq!(shaped.column_count, 1);
    assert!((shaped.height - 2.0 * font_size).abs() < 1e-3);
    assert!(shaped.glyphs.iter().all(|glyph| !glyph.rotated));
    // Each cell's glyphs are offset by exactly one cell advance.
    let cell0_y = shaped.glyphs.first().map(|glyph| glyph.y).unwrap();
    let cell1_y = shaped.glyphs.last().map(|glyph| glyph.y).unwrap();
    assert!(
        (cell1_y - cell0_y - font_size).abs() < 1e-3,
        "upright cell advance must be 1em: {} vs {}",
        cell1_y - cell0_y,
        font_size
    );
}

#[test]
fn vertical_shaping_is_deterministic() {
    let a = shaped_text_vertical_to_json(
        &shape_text_vertical("세로 vertical 123\n다음", &roboto(), 24.0, 90.0).unwrap(),
    );
    let b = shaped_text_vertical_to_json(
        &shape_text_vertical("세로 vertical 123\n다음", &roboto(), 24.0, 90.0).unwrap(),
    );
    assert_eq!(a, b);
}

#[test]
fn vertical_rejects_empty_text_and_bad_inputs() {
    assert!(shape_text_vertical("", &roboto(), 24.0, 500.0).is_err());
    assert!(shape_text_vertical("x", &roboto(), 0.0, 500.0).is_err());
    assert!(shape_text_vertical("x", &roboto(), 24.0, 0.0).is_err());
    assert!(shape_text_vertical("x", &roboto(), 24.0, f32::NAN).is_err());
    assert!(shape_text_vertical("x", &[1, 2, 3], 24.0, 500.0).is_err());
}

#[test]
fn vertical_hangul_without_cjk_font_warns_instead_of_silent_loss() {
    // Roboto has no Hangul coverage: shaping must survive (notdef/fallback
    // lane) and every uncovered character must surface in warnings — the
    // silent-loss ban is the contract, pixels are not (CJK font asset is
    // license-gated, tests/corpus/text stays Roboto-only).
    let shaped = shape_text_vertical("말풍선", &roboto(), 24.0, 4000.0).unwrap();
    assert!(!shaped.glyphs.is_empty());
    for (c, code) in [('말', "U+B9D0"), ('풍', "U+D48D"), ('선', "U+C120")] {
        assert!(
            shaped
                .warnings
                .iter()
                .any(|warning| warning.contains(code) && warning.contains("not covered")),
            "expected a coverage warning for {c} ({code}), got {:?}",
            shaped.warnings
        );
    }
    // Upright cells still advance deterministically (1em fallback).
    assert!((shaped.height - 3.0 * 24.0).abs() < 1e-3);
}

#[test]
fn vertical_punctuation_without_vertical_form_glyph_warns_and_keeps_original() {
    // Roboto carries neither U+FE41/FE42 vertical corner brackets nor the
    // originals — the mapping must degrade loudly, never silently.
    let shaped = shape_text_vertical("「あ」", &roboto(), 24.0, 4000.0).unwrap();
    assert!(!shaped.glyphs.is_empty());
    assert!(shaped
        .warnings
        .iter()
        .any(|warning| warning.contains("U+FE41") && warning.contains("keeping the original")));
    assert!(shaped
        .warnings
        .iter()
        .any(|warning| warning.contains("U+FE42")));
}

#[test]
fn vertical_short_digit_runs_flag_tate_chu_yoko_as_v2() {
    let shaped = shape_text_vertical("2026", &roboto(), 24.0, 4000.0).unwrap();
    assert!(shaped
        .warnings
        .iter()
        .any(|warning| warning.contains("tate-chu-yoko") && warning.contains("2026")));
    // The digits still rotate and render as a normal Latin run (no drop).
    assert_eq!(shaped.glyphs.len(), 4);
    assert!(shaped.glyphs.iter().all(|glyph| glyph.rotated));
}

#[test]
fn vertical_glyph_paths_render_through_vello_cpu() {
    // Vertical composition stays renderer-neutral: the rotated/stacked PathIR
    // fills draw through the same deterministic vello_cpu lane.
    let shaped = shape_text_vertical("Ink", &roboto(), 48.0, 400.0).unwrap();
    let nodes: Vec<String> = shaped
        .glyphs
        .iter()
        .filter(|glyph| !glyph.verbs.is_empty())
        .enumerate()
        .map(|(index, glyph)| {
            format!(
                r#"{{"id":"g{index}","kind":"fill-path","path":{{"verbs":{}}},"paint":{{"kind":"solid","color":{{"r":0,"g":0,"b":0,"a":1}}}},"opacity":1,"blend":"src-over","fillRule":"nonzero"}}"#,
                serde_json::to_string(&glyph.verbs).unwrap()
            )
        })
        .collect();
    let scene_json = format!(
        r#"{{"version":11,"width":72,"height":128,"background":{{"r":1,"g":1,"b":1,"a":1}},"nodes":[{}]}}"#,
        nodes.join(",")
    );
    let scene = parse_scene(&scene_json).unwrap();
    let pixels = render_scene(&scene).unwrap();
    let inked = pixels
        .chunks_exact(4)
        .filter(|px| px[0] < 200 && px[3] == 255)
        .count();
    assert!(inked > 150, "expected visible vertical glyph coverage, got {inked} dark pixels");
}
