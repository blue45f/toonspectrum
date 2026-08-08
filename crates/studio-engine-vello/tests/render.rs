//! Native regression tests for the SceneIR -> vello_cpu pipeline. The same
//! scenes are exercised from Node against the wasm build; these tests pin the
//! Rust-side semantics (determinism, blend math, capability rejection).

use studio_engine_vello::{parse_scene, render_scene, RenderError};

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

/// Full-turn sweep: 0° -> red, 0.25 turn -> green. Samples sit half a pixel
/// off the exact axes (pixel centers), so assertions use generous margins.
const SWEEP_FULL_TURN_PAINT: &str = r#"{"kind":"sweep-gradient","center":[16,16],"startAngleDeg":0,"endAngleDeg":360,"stops":[{"offset":0,"color":{"r":1,"g":0,"b":0,"a":1}},{"offset":0.25,"color":{"r":0,"g":1,"b":0,"a":1}},{"offset":0.5,"color":{"r":0,"g":0,"b":1,"a":1}},{"offset":1,"color":{"r":1,"g":0,"b":0,"a":1}}]}"#;

fn full_canvas_fill(paint: &str) -> String {
    format!(
        r#"{{"id":"sweep","kind":"fill-path","path":{{"verbs":[{{"v":"M","x":0,"y":0}},{{"v":"L","x":32,"y":0}},{{"v":"L","x":32,"y":32}},{{"v":"L","x":0,"y":32}},{{"v":"Z"}}]}},"paint":{paint},"opacity":1,"blend":"src-over","fillRule":"nonzero"}}"#
    )
}

#[test]
fn sweep_gradient_hits_stop_colors_at_0_and_90_degrees() {
    let scene =
        parse_scene(&scene_json(&full_canvas_fill(SWEEP_FULL_TURN_PAINT), WHITE_BG)).unwrap();
    let pixels = render_scene(&scene).unwrap();
    // Angle 0° is the +X ray from the center: pixel (28, 16) sits at ~2.3°,
    // still firmly inside the red..green ramp's red end.
    let east = pixel(&pixels, 32, 28, 16);
    assert!(east[0] >= 235, "east r={}", east[0]);
    assert!(east[1] <= 25, "east g={}", east[1]);
    assert!(east[2] <= 10, "east b={}", east[2]);
    // Angle 90° is straight down in y-down space (clockwise convention):
    // pixel (16, 28) sits at ~87.7°, right at the green stop (offset 0.25).
    let south = pixel(&pixels, 32, 16, 28);
    assert!(south[1] >= 235, "south g={}", south[1]);
    assert!(south[0] <= 25, "south r={}", south[0]);
    assert!(south[2] <= 10, "south b={}", south[2]);
    assert_eq!(east[3], 255);
    assert_eq!(south[3], 255);
}

#[test]
fn sweep_gradient_rendering_is_bit_deterministic() {
    let scene =
        parse_scene(&scene_json(&full_canvas_fill(SWEEP_FULL_TURN_PAINT), WHITE_BG)).unwrap();
    let first = render_scene(&scene).unwrap();
    let second = render_scene(&scene).unwrap();
    assert_eq!(first, second);
}

#[test]
fn degenerate_sweep_window_is_rejected_not_collapsed() {
    // vello_cpu would silently collapse end <= start to the first stop; the
    // renderer must reject it explicitly instead (canonical zod schema parity).
    let paint = r#"{"kind":"sweep-gradient","center":[16,16],"startAngleDeg":180,"endAngleDeg":180,"stops":[{"offset":0,"color":{"r":1,"g":0,"b":0,"a":1}},{"offset":1,"color":{"r":0,"g":0,"b":1,"a":1}}]}"#;
    let scene = parse_scene(&scene_json(&full_canvas_fill(paint), WHITE_BG)).unwrap();
    match render_scene(&scene) {
        Err(RenderError::InvalidScene(message)) => {
            assert!(
                message.contains("endAngleDeg > startAngleDeg"),
                "unexpected message: {message}"
            );
        }
        other => panic!("expected InvalidScene, got {other:?}"),
    }
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
