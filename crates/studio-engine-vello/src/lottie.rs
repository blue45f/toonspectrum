//! Velato Lottie -> vello `Scene` lowering (ADR-0011 Velato lane, V12 게이트).
//!
//! Parses a Lottie (bodymovin) JSON document with velato 0.11 and lowers the
//! requested frame into a vello 0.9 `Scene`, which then reuses the existing
//! GPU render path (`gpu_web::render_encoded_scene_gpu` in wasm, the raw
//! harness in `tests/lottie_parity.rs` natively).
//!
//! Error contract ("조용한 손실 금지"): every failure is an explicit JSON
//! string `{"code":"...","reason":"..."}` — parse failures, unsupported
//! Lottie constructs and out-of-range frames all reject loudly so the TS
//! wrapper can surface a typed error instead of a silent blank frame.
//!
//! Panic quarantine: velato 0.11's importer (`Composition::from_slice`)
//! contains `todo!()`/`unimplemented!()` sites that would abort the wasm on
//! - a layer transform with a missing or split rotation (`ks.r`),
//! - a shape transform (`tr`) with split position or split rotation,
//! - non-precomposition assets (embedded images/sounds),
//! - `Add`(16)/`HardMix`(17) blend modes.
//! [`validate_supported`] walks the parsed schema first and converts each of
//! those into an explicit `lottie-unsupported` error before the importer can
//! reach its panic paths (importer internals verified against the velato
//! 0.11.0 sources, `src/import/converters.rs`).
//!
//! Module resolution note: like `gpu_scene.rs`, this file is compiled inside
//! the library behind the `lottie` feature *and* included via `#[path]` by the
//! native harness `tests/lottie_parity.rs` (dev-dependencies provide velato +
//! vello there), so it must only reference external crates.

use velato::schema::animation::animation::Animation;
use velato::schema::assets::AnyAsset;
use velato::schema::constants::blend_mode::BlendMode;
use velato::schema::helpers::transform::{AnyTransformR, Transform};
use velato::schema::layers::AnyLayer;
use velato::schema::shapes::AnyShape;
use velato::Composition;
use vello::kurbo::Affine;
use vello::Scene;

/// Largest render target edge, mirroring the SceneIR gate in `gpu_web.rs`.
const MAX_TARGET_EDGE: u32 = u16::MAX as u32;

/// Serializes an explicit error as `{"code":..., "reason":...}` JSON.
pub fn error_json(code: &str, reason: &str) -> String {
    serde_json::json!({ "code": code, "reason": reason }).to_string()
}

fn unsupported(reason: &str) -> String {
    error_json("lottie-unsupported", reason)
}

fn layer_transform_issue(transform: &Transform, context: &str) -> Option<String> {
    match &transform.rotation {
        Some(AnyTransformR::Rotation(_)) => None,
        Some(AnyTransformR::SplitRotation { .. }) => Some(format!(
            "{context}: split rotation (r.x/r.y/r.z) is unsupported by velato 0.11"
        )),
        None => Some(format!(
            "{context}: layer transform requires a scalar rotation 'ks.r' \
             (velato 0.11 cannot lower a missing rotation)"
        )),
    }
}

fn blend_issue(blend: Option<&BlendMode>, context: &str) -> Option<String> {
    match blend {
        Some(BlendMode::Add) => Some(format!(
            "{context}: blend mode Add (bm:16) is unsupported by velato 0.11"
        )),
        Some(BlendMode::HardMix) => Some(format!(
            "{context}: blend mode HardMix (bm:17) is unsupported by velato 0.11"
        )),
        _ => None,
    }
}

fn walk_shapes(shapes: &[AnyShape], context: &str, issues: &mut Vec<String>) {
    for shape in shapes {
        match shape {
            AnyShape::Group(group) => {
                if let Some(issue) =
                    blend_issue(group.graphic_element.blend_mode.as_ref(), context)
                {
                    issues.push(issue);
                }
                walk_shapes(&group.shapes, context, issues);
            }
            AnyShape::Transform(transform_shape) => {
                use velato::schema::helpers::transform::AnyTransformP;
                if matches!(
                    transform_shape.transform.position,
                    AnyTransformP::SplitPosition(_)
                ) {
                    issues.push(format!(
                        "{context}: shape transform split position is unsupported by velato 0.11"
                    ));
                }
                if matches!(
                    transform_shape.transform.rotation,
                    Some(AnyTransformR::SplitRotation { .. })
                ) {
                    issues.push(format!(
                        "{context}: shape transform split rotation is unsupported by velato 0.11"
                    ));
                }
            }
            AnyShape::Fill(fill) => {
                if let Some(issue) =
                    blend_issue(fill.shape_style.graphic_element.blend_mode.as_ref(), context)
                {
                    issues.push(issue);
                }
            }
            AnyShape::Stroke(stroke) => {
                if let Some(issue) =
                    blend_issue(stroke.shape_style.graphic_element.blend_mode.as_ref(), context)
                {
                    issues.push(issue);
                }
            }
            _ => {}
        }
    }
}

fn walk_layers(layers: &[AnyLayer], scope: &str, issues: &mut Vec<String>) {
    for (index, layer) in layers.iter().enumerate() {
        let context = format!("{scope} layer #{index}");
        let visual = match layer {
            AnyLayer::Precomposition(precomp) => &precomp.visual_layer,
            AnyLayer::Solid(solid) => &solid.visual_layer,
            AnyLayer::Shape(shape) => &shape.visual_layer,
            AnyLayer::Null(null) => &null.visual_layer,
            AnyLayer::Image(image) => &image.visual_layer,
        };
        if let Some(issue) = layer_transform_issue(&visual.transform, &context) {
            issues.push(issue);
        }
        if let Some(issue) = blend_issue(visual.blend_mode.as_ref(), &context) {
            issues.push(issue);
        }
        if let AnyLayer::Shape(shape_layer) = layer {
            walk_shapes(&shape_layer.shapes, &context, issues);
        }
    }
}

fn validate_supported(animation: &Animation) -> Result<(), String> {
    let mut issues = Vec::new();
    if let Some(assets) = &animation.assets {
        for asset in assets {
            if let AnyAsset::Image(_) = asset {
                issues.push(
                    "embedded image assets are unsupported by velato 0.11".to_string(),
                );
            }
        }
        for asset in assets {
            if let AnyAsset::Precomposition(precomp) = asset {
                walk_layers(
                    &precomp.composition.layers,
                    &format!("asset '{}'", precomp.asset.id),
                    &mut issues,
                );
            }
        }
    }
    walk_layers(&animation.composition.layers, "root", &mut issues);
    if issues.is_empty() {
        Ok(())
    } else {
        Err(unsupported(&issues.join("; ")))
    }
}

/// Parses + validates a Lottie JSON document into a velato runtime
/// composition. Parse failures and importer-panic constructs both surface as
/// explicit JSON errors (`lottie-parse-failed` / `lottie-unsupported`).
pub fn parse_composition(lottie_json: &str) -> Result<Composition, String> {
    let animation: Animation = serde_json::from_str(lottie_json)
        .map_err(|error| error_json("lottie-parse-failed", &error.to_string()))?;
    validate_supported(&animation)?;
    // Re-lower through velato's importer. The schema pass above guarantees the
    // importer's todo!/unimplemented! sites are unreachable for this input.
    Composition::from_slice(lottie_json.as_bytes())
        .map_err(|error| error_json("lottie-parse-failed", &error.to_string()))
}

/// Lowers one animation frame into a vello `Scene`, scaled from the
/// composition's intrinsic size to `width`x`height`. Out-of-range or
/// non-finite frames and degenerate sizes are explicit errors — no clamping,
/// no silent blank frames.
pub fn compose_frame_scene(
    composition: &Composition,
    frame: f64,
    width: u32,
    height: u32,
) -> Result<Scene, String> {
    if !frame.is_finite() {
        return Err(error_json(
            "lottie-frame-out-of-range",
            &format!("frame {frame} is not a finite number"),
        ));
    }
    if frame < composition.frames.start || frame > composition.frames.end {
        return Err(error_json(
            "lottie-frame-out-of-range",
            &format!(
                "frame {frame} outside composition range {}..{}",
                composition.frames.start, composition.frames.end
            ),
        ));
    }
    if width == 0 || height == 0 || width > MAX_TARGET_EDGE || height > MAX_TARGET_EDGE {
        return Err(error_json(
            "lottie-invalid-size",
            &format!("target size out of range: {width}x{height}"),
        ));
    }
    if composition.width == 0 || composition.height == 0 {
        return Err(error_json(
            "lottie-invalid-size",
            &format!(
                "composition declares a degenerate size: {}x{}",
                composition.width, composition.height
            ),
        ));
    }
    let transform = Affine::scale_non_uniform(
        f64::from(width) / composition.width as f64,
        f64::from(height) / composition.height as f64,
    );
    let mut renderer = velato::Renderer::new();
    Ok(renderer.render_to_vello_scene(composition, frame, transform, 1.0))
}
