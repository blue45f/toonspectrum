//! Parley text lane contracts: shaping, line breaking, outline extraction,
//! determinism, and the full Parley→PathIR→vello_cpu render integration.

use studio_engine_vello::{parse_scene, render_scene, shape_text, shaped_text_to_json};

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
