//! Native regression tests for the SceneIR -> vello_cpu pipeline. The same
//! scenes are exercised from Node against the wasm build; these tests pin the
//! Rust-side semantics (determinism, blend math, capability rejection).

use vello_adapter_v11::{parse_scene, render_scene, RenderError};

fn scene_json(nodes: &str, background: &str) -> String {
    format!(
        r#"{{"version":11,"width":32,"height":32,"background":{background},"nodes":[{nodes}]}}"#
    )
}

fn pixel(pixels: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
    let index = ((y * width + x) * 4) as usize;
    [
        pixels[index],
        pixels[index + 1],
        pixels[index + 2],
        pixels[index + 3],
    ]
}

const WHITE_BG: &str = r#"{"r":1,"g":1,"b":1,"a":1}"#;

const CENTER_SQUARE_PATH: &str = r#"{"verbs":[{"v":"M","x":8,"y":8},{"v":"L","x":24,"y":8},{"v":"L","x":24,"y":24},{"v":"L","x":8,"y":24},{"v":"Z"}]}"#;

fn fill_node(paint: &str, opacity: f32, blend: &str) -> String {
    format!(
        r#"{{"id":"n1","kind":"fill-path","path":{CENTER_SQUARE_PATH},"paint":{paint},"opacity":{opacity},"blend":"{blend}","fillRule":"nonzero"}}"#
    )
}

#[test]
fn background_only_scene_is_uniform() {
    let scene = parse_scene(&scene_json("", r#"{"r":0.5,"g":0.25,"b":0,"a":1}"#)).unwrap();
    let pixels = render_scene(&scene).unwrap();
    assert_eq!(pixels.len(), 32 * 32 * 4);
    let corner = pixel(&pixels, 32, 0, 0);
    let center = pixel(&pixels, 32, 16, 16);
    assert_eq!(corner, center);
    assert_eq!(corner[3], 255);
    // 0.5 sRGB component stored as u8: 127 or 128 depending on rounding.
    assert!((corner[0] as i32 - 128).abs() <= 1, "r={}", corner[0]);
}

#[test]
fn solid_fill_covers_center_and_leaves_background() {
    let node = fill_node(r#"{"kind":"solid","color":{"r":1,"g":0,"b":0,"a":1}}"#, 1.0, "src-over");
    let scene = parse_scene(&scene_json(&node, WHITE_BG)).unwrap();
    let pixels = render_scene(&scene).unwrap();
    assert_eq!(pixel(&pixels, 32, 16, 16), [255, 0, 0, 255]);
    assert_eq!(pixel(&pixels, 32, 2, 2), [255, 255, 255, 255]);
}

#[test]
fn rendering_is_bit_deterministic() {
    let node = fill_node(
        r#"{"kind":"linear-gradient","from":[8,8],"to":[24,24],"stops":[{"offset":0,"color":{"r":1,"g":0,"b":0,"a":1}},{"offset":1,"color":{"r":0,"g":0,"b":1,"a":1}}]}"#,
        0.8,
        "src-over",
    );
    let scene = parse_scene(&scene_json(&node, WHITE_BG)).unwrap();
    let first = render_scene(&scene).unwrap();
    let second = render_scene(&scene).unwrap();
    assert_eq!(first, second);
}

#[test]
fn multiply_blend_darkens_white_background() {
    let node = fill_node(
        r#"{"kind":"solid","color":{"r":0.5,"g":0.5,"b":0.5,"a":1}}"#,
        1.0,
        "multiply",
    );
    let scene = parse_scene(&scene_json(&node, WHITE_BG)).unwrap();
    let pixels = render_scene(&scene).unwrap();
    let center = pixel(&pixels, 32, 16, 16);
    // multiply(white, 0.5-gray) == 0.5-gray
    assert!((center[0] as i32 - 128).abs() <= 1, "r={}", center[0]);
    assert_eq!(center[0], center[1]);
    assert_eq!(center[1], center[2]);
    // Outside the square the white background is untouched.
    assert_eq!(pixel(&pixels, 32, 2, 2), [255, 255, 255, 255]);
}

#[test]
fn group_opacity_halves_coverage() {
    let child = fill_node(r#"{"kind":"solid","color":{"r":0,"g":0,"b":0,"a":1}}"#, 1.0, "src-over");
    let group = format!(
        r#"{{"id":"g","kind":"group","opacity":0.5,"blend":"src-over","children":[{child}]}}"#
    );
    let scene = parse_scene(&scene_json(&group, WHITE_BG)).unwrap();
    let pixels = render_scene(&scene).unwrap();
    let center = pixel(&pixels, 32, 16, 16);
    assert!((center[0] as i32 - 128).abs() <= 1, "r={}", center[0]);
}

#[test]
fn stroke_round_cap_paints_on_path() {
    let node = r#"{"id":"s","kind":"stroke-path","path":{"verbs":[{"v":"M","x":4,"y":16},{"v":"L","x":28,"y":16}]},"paint":{"kind":"solid","color":{"r":0,"g":0,"b":1,"a":1}},"opacity":1,"blend":"src-over","strokeWidth":6,"cap":"round","join":"round","miterLimit":4}"#;
    let scene = parse_scene(&scene_json(node, WHITE_BG)).unwrap();
    let pixels = render_scene(&scene).unwrap();
    assert_eq!(pixel(&pixels, 32, 16, 16), [0, 0, 255, 255]);
    assert_eq!(pixel(&pixels, 32, 16, 2), [255, 255, 255, 255]);
}

#[test]
fn text_scene_is_rejected_not_skipped() {
    let node = r#"{"id":"t","kind":"text","opacity":1,"blend":"src-over","x":4,"y":20,"text":"안녕","fontSizePx":12,"color":{"r":0,"g":0,"b":0,"a":1},"fontFamily":"sans-serif"}"#;
    let scene = parse_scene(&scene_json(node, WHITE_BG)).unwrap();
    match render_scene(&scene) {
        Err(RenderError::UnsupportedFeatures(features)) => {
            assert_eq!(features, vec!["render.text.paragraph".to_string()]);
        }
        other => panic!("expected UnsupportedFeatures, got {other:?}"),
    }
}

#[test]
fn invalid_version_is_rejected() {
    let json = r#"{"version":10,"width":8,"height":8,"background":{"r":1,"g":1,"b":1,"a":1},"nodes":[]}"#;
    let scene = parse_scene(json).unwrap();
    assert!(matches!(
        render_scene(&scene),
        Err(RenderError::InvalidScene(_))
    ));
}
