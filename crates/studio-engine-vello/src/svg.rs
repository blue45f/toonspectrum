//! Strict SVG -> Vello/Vello CPU lowering for the V12 native SVG lane.
//!
//! `vello_svg` intentionally prioritizes broad interactive coverage over SVG
//! conformance. Its default error handler paints red boxes for unsupported
//! paints, and complex clips can fall back to a bounding rectangle. ToonStudio
//! cannot treat either approximation as successful import. This module first
//! audits the source XML, then audits the normalized `usvg` tree, and only then
//! lowers the accepted subset to both renderers.

use std::collections::{BTreeSet, HashMap};
use std::fmt;

use roxmltree::Document;
use vello_cpu::kurbo::Affine;
use vello_cpu::peniko::{BlendMode, Brush, Compose, Fill, Mix};
use vello_cpu::{Level, Pixmap, RenderContext, RenderSettings, Resources};
use vello_svg::usvg;

const MAX_SVG_BYTES: usize = 2 * 1024 * 1024;
const MAX_ELEMENTS: usize = 100_000;
const MAX_DEPTH: usize = 128;
const MAX_TARGET_EDGE: u32 = u16::MAX as u32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SvgNativeErrorCode {
    InvalidXml,
    Unsupported,
    ResourceLimit,
    InvalidSize,
    ParseFailed,
    RenderFailed,
}

impl SvgNativeErrorCode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::InvalidXml => "svg-native-invalid-xml",
            Self::Unsupported => "svg-native-unsupported",
            Self::ResourceLimit => "svg-native-resource-limit",
            Self::InvalidSize => "svg-native-invalid-size",
            Self::ParseFailed => "svg-native-parse-failed",
            Self::RenderFailed => "svg-native-render-failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvgNativeError {
    pub code: SvgNativeErrorCode,
    pub reason: String,
    pub issues: Vec<String>,
}

impl SvgNativeError {
    fn new(code: SvgNativeErrorCode, reason: impl Into<String>) -> Self {
        Self {
            code,
            reason: reason.into(),
            issues: Vec::new(),
        }
    }

    fn unsupported(mut issues: Vec<String>) -> Self {
        issues.sort();
        issues.dedup();
        Self {
            code: SvgNativeErrorCode::Unsupported,
            reason: format!("SVG needs unsupported semantics: {}", issues.join(", ")),
            issues,
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::json!({
            "code": self.code.as_str(),
            "reason": self.reason,
            "issues": self.issues,
        })
        .to_string()
    }
}

impl fmt::Display for SvgNativeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_json())
    }
}

impl std::error::Error for SvgNativeError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvgAudit {
    pub element_count: usize,
    pub max_depth: usize,
    pub local_reference_count: usize,
}

pub struct ParsedSvg {
    tree: usvg::Tree,
    pub audit: SvgAudit,
    pub intrinsic_width: f32,
    pub intrinsic_height: f32,
}

fn source_position(document: &Document<'_>, node: roxmltree::Node<'_, '_>) -> String {
    let position = document.text_pos_at(node.range().start);
    format!("{}:{}", position.row, position.col)
}

fn is_geometry_element(name: &str) -> bool {
    matches!(
        name,
        "path" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon"
    )
}

fn is_allowed_element(name: &str) -> bool {
    matches!(
        name,
        "svg"
            | "g"
            | "defs"
            | "path"
            | "rect"
            | "circle"
            | "ellipse"
            | "line"
            | "polyline"
            | "polygon"
            | "linearGradient"
            | "radialGradient"
            | "stop"
            | "clipPath"
            | "title"
            | "desc"
            | "metadata"
    )
}

fn local_url_target(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    let body = trimmed.strip_prefix("url(#")?.strip_suffix(')')?;
    if body.is_empty()
        || body.chars().any(char::is_whitespace)
        || body.contains(['(', ')', '#', '\'', '"'])
    {
        None
    } else {
        Some(body)
    }
}

fn style_has_unsupported_semantics(style: &str) -> bool {
    let lower = style.to_ascii_lowercase();
    [
        "filter:",
        "mask:",
        "marker-start:",
        "marker-mid:",
        "marker-end:",
        "clip-rule:evenodd",
        "vector-effect:",
        "shape-rendering:",
        "var(",
        "javascript:",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
        || lower.contains("url(")
}

/// Audits raw SVG before `usvg` can normalize, expand, or discard syntax.
/// The accepted subset is deliberately narrower than usvg's parser surface.
pub fn audit_svg_source(svg: &str) -> Result<SvgAudit, SvgNativeError> {
    if svg.len() > MAX_SVG_BYTES {
        return Err(SvgNativeError::new(
            SvgNativeErrorCode::ResourceLimit,
            format!("SVG is {} bytes; limit is {MAX_SVG_BYTES}", svg.len()),
        ));
    }
    if svg.to_ascii_lowercase().contains("<!doctype") {
        return Err(SvgNativeError::unsupported(vec![
            "doctype/external-entity-surface".to_string(),
        ]));
    }

    let document = Document::parse(svg)
        .map_err(|error| SvgNativeError::new(SvgNativeErrorCode::InvalidXml, error.to_string()))?;
    let root = document.root_element();
    if root.tag_name().name() != "svg" {
        return Err(SvgNativeError::new(
            SvgNativeErrorCode::InvalidXml,
            format!(
                "root element must be <svg>, got <{}>",
                root.tag_name().name()
            ),
        ));
    }

    let mut ids = HashMap::<String, String>::new();
    let mut duplicate_ids = BTreeSet::new();
    let mut element_count = 0_usize;
    let mut max_depth = 0_usize;
    for node in document.descendants().filter(roxmltree::Node::is_element) {
        element_count += 1;
        if element_count > MAX_ELEMENTS {
            return Err(SvgNativeError::new(
                SvgNativeErrorCode::ResourceLimit,
                format!("SVG has more than {MAX_ELEMENTS} elements"),
            ));
        }
        let depth = node.ancestors().filter(roxmltree::Node::is_element).count();
        max_depth = max_depth.max(depth);
        if depth > MAX_DEPTH {
            return Err(SvgNativeError::new(
                SvgNativeErrorCode::ResourceLimit,
                format!("SVG nesting depth {depth} exceeds {MAX_DEPTH}"),
            ));
        }
        if let Some(id) = node.attribute("id") {
            if ids
                .insert(id.to_string(), node.tag_name().name().to_string())
                .is_some()
            {
                duplicate_ids.insert(id.to_string());
            }
        }
    }

    let mut issues = Vec::new();
    for id in duplicate_ids {
        issues.push(format!("duplicate-id:#{id}"));
    }
    let mut local_reference_count = 0_usize;
    for node in document.descendants().filter(roxmltree::Node::is_element) {
        let name = node.tag_name().name();
        let position = source_position(&document, node);
        if !is_allowed_element(name) {
            issues.push(format!("element:{name}@{position}"));
        }
        if name == "svg" && node != root {
            issues.push(format!("element:nested-svg@{position}"));
        }
        if name == "clipPath" {
            if node
                .attribute("clipPathUnits")
                .is_some_and(|value| value != "userSpaceOnUse")
            {
                issues.push(format!("clipPathUnits:objectBoundingBox@{position}"));
            }
            let children = node
                .children()
                .filter(roxmltree::Node::is_element)
                .filter(|child| !matches!(child.tag_name().name(), "title" | "desc" | "metadata"))
                .collect::<Vec<_>>();
            if children.len() != 1 || !is_geometry_element(children[0].tag_name().name()) {
                issues.push(format!("clipPath:requires-one-direct-geometry@{position}"));
            }
        }

        for attribute in node.attributes() {
            let attribute_name = attribute.name();
            let value = attribute.value();
            let lower_name = attribute_name.to_ascii_lowercase();
            let lower_value = value.to_ascii_lowercase();
            if lower_name.starts_with("on") {
                issues.push(format!("event-attribute:{attribute_name}@{position}"));
                continue;
            }
            if matches!(
                lower_name.as_str(),
                "href"
                    | "filter"
                    | "mask"
                    | "marker-start"
                    | "marker-mid"
                    | "marker-end"
                    | "vector-effect"
                    | "class"
                    | "requiredfeatures"
                    | "requiredextensions"
                    | "systemlanguage"
            ) {
                issues.push(format!("attribute:{attribute_name}@{position}"));
                continue;
            }
            if lower_name == "clip-rule" && lower_value.trim() == "evenodd" {
                issues.push(format!("clip-rule:evenodd@{position}"));
            }
            if lower_name == "shape-rendering"
                && !matches!(lower_value.trim(), "auto" | "geometricprecision")
            {
                issues.push(format!("shape-rendering:{value}@{position}"));
            }
            if lower_name == "style" && style_has_unsupported_semantics(value) {
                issues.push(format!("style:unbounded-or-unsupported@{position}"));
            }
            if lower_value.contains("javascript:") {
                issues.push(format!("javascript-url:{attribute_name}@{position}"));
            }
            if lower_value.contains("url(") {
                match local_url_target(value) {
                    Some(target) if ids.contains_key(target) => {
                        local_reference_count += 1;
                        if lower_name == "clip-path"
                            && ids.get(target).map(String::as_str) != Some("clipPath")
                        {
                            issues.push(format!(
                                "clip-path:reference-is-not-clipPath:#{target}@{position}"
                            ));
                        }
                    }
                    Some(target) => {
                        issues.push(format!("local-reference:missing:#{target}@{position}"))
                    }
                    None => issues.push(format!(
                        "url:non-local-or-complex:{attribute_name}@{position}"
                    )),
                }
            }
        }
    }

    if !issues.is_empty() {
        return Err(SvgNativeError::unsupported(issues));
    }
    Ok(SvgAudit {
        element_count,
        max_depth,
        local_reference_count,
    })
}

fn audit_group(group: &usvg::Group, issues: &mut Vec<String>) {
    if group.mask().is_some() {
        issues.push(format!("normalized-mask:{}", group.id()));
    }
    if !group.filters().is_empty() {
        issues.push(format!("normalized-filter:{}", group.id()));
    }
    if let Some(clip) = group.clip_path() {
        if clip.clip_path().is_some()
            || clip.root().children().len() != 1
            || !matches!(clip.root().children().first(), Some(usvg::Node::Path(_)))
        {
            issues.push(format!("normalized-complex-clip:{}", clip.id()));
        }
    }
    for node in group.children() {
        match node {
            usvg::Node::Group(child) => audit_group(child, issues),
            usvg::Node::Path(path) => {
                for paint in [
                    path.fill().map(usvg::Fill::paint),
                    path.stroke().map(usvg::Stroke::paint),
                ]
                .into_iter()
                .flatten()
                {
                    if matches!(paint, usvg::Paint::Pattern(_)) {
                        issues.push(format!("normalized-pattern:{}", path.id()));
                    }
                }
            }
            usvg::Node::Image(image) => {
                issues.push(format!("normalized-image:{}", image.id()));
            }
            usvg::Node::Text(text) => {
                issues.push(format!("normalized-text:{}", text.id()));
            }
        }
    }
}

pub fn parse_svg(svg: &str) -> Result<ParsedSvg, SvgNativeError> {
    let audit = audit_svg_source(svg)?;
    let options = usvg::Options::default();
    let tree = usvg::Tree::from_str(svg, &options)
        .map_err(|error| SvgNativeError::new(SvgNativeErrorCode::ParseFailed, error.to_string()))?;
    let mut issues = Vec::new();
    audit_group(tree.root(), &mut issues);
    if !tree.patterns().is_empty() {
        issues.push("normalized-pattern-registry".to_string());
    }
    if !tree.masks().is_empty() {
        issues.push("normalized-mask-registry".to_string());
    }
    if !tree.filters().is_empty() {
        issues.push("normalized-filter-registry".to_string());
    }
    if tree.has_text_nodes() {
        issues.push("normalized-text-registry".to_string());
    }
    if !issues.is_empty() {
        return Err(SvgNativeError::unsupported(issues));
    }
    let size = tree.size();
    let intrinsic_width = size.width();
    let intrinsic_height = size.height();
    if !(intrinsic_width.is_finite()
        && intrinsic_height.is_finite()
        && intrinsic_width > 0.0
        && intrinsic_height > 0.0)
    {
        return Err(SvgNativeError::new(
            SvgNativeErrorCode::InvalidSize,
            format!("invalid intrinsic SVG size: {intrinsic_width}x{intrinsic_height}"),
        ));
    }
    Ok(ParsedSvg {
        tree,
        audit,
        intrinsic_width,
        intrinsic_height,
    })
}

fn validate_target(width: u32, height: u32) -> Result<(), SvgNativeError> {
    if width == 0 || height == 0 || width > MAX_TARGET_EDGE || height > MAX_TARGET_EDGE {
        return Err(SvgNativeError::new(
            SvgNativeErrorCode::InvalidSize,
            format!("target size out of range: {width}x{height}"),
        ));
    }
    Ok(())
}

fn target_scale(parsed: &ParsedSvg, width: u32, height: u32) -> Affine {
    Affine::scale_non_uniform(
        f64::from(width) / f64::from(parsed.intrinsic_width),
        f64::from(height) / f64::from(parsed.intrinsic_height),
    )
}

/// Lowers strict SVG to a native Vello scene. The error callback is intentionally
/// empty: any callback means the audits missed a semantic and therefore fails.
pub fn svg_to_vello_scene(
    svg: &str,
    width: u32,
    height: u32,
) -> Result<vello_svg::vello::Scene, SvgNativeError> {
    validate_target(width, height)?;
    let parsed = parse_svg(svg)?;
    let mut unscaled = vello_svg::vello::Scene::new();
    let mut rejected_nodes = Vec::new();
    vello_svg::append_tree_with(&mut unscaled, &parsed.tree, &mut |_, node| {
        rejected_nodes.push(format!("vello-svg-callback:{}", node.id()));
    });
    if !rejected_nodes.is_empty() {
        return Err(SvgNativeError::unsupported(rejected_nodes));
    }
    let mut scene = vello_svg::vello::Scene::new();
    scene.append(&unscaled, Some(target_scale(&parsed, width, height)));
    Ok(scene)
}

fn to_blend(blend: usvg::BlendMode) -> BlendMode {
    let mix = match blend {
        usvg::BlendMode::Normal => Mix::Normal,
        usvg::BlendMode::Multiply => Mix::Multiply,
        usvg::BlendMode::Screen => Mix::Screen,
        usvg::BlendMode::Overlay => Mix::Overlay,
        usvg::BlendMode::Darken => Mix::Darken,
        usvg::BlendMode::Lighten => Mix::Lighten,
        usvg::BlendMode::ColorDodge => Mix::ColorDodge,
        usvg::BlendMode::ColorBurn => Mix::ColorBurn,
        usvg::BlendMode::HardLight => Mix::HardLight,
        usvg::BlendMode::SoftLight => Mix::SoftLight,
        usvg::BlendMode::Difference => Mix::Difference,
        usvg::BlendMode::Exclusion => Mix::Exclusion,
        usvg::BlendMode::Hue => Mix::Hue,
        usvg::BlendMode::Saturation => Mix::Saturation,
        usvg::BlendMode::Color => Mix::Color,
        usvg::BlendMode::Luminosity => Mix::Luminosity,
    };
    BlendMode::new(mix, Compose::SrcOver)
}

fn set_cpu_paint(
    context: &mut RenderContext,
    paint: &usvg::Paint,
    opacity: usvg::Opacity,
) -> Result<(), SvgNativeError> {
    let Some((brush, brush_transform)) = vello_svg::util::to_brush(paint, opacity) else {
        return Err(SvgNativeError::unsupported(vec![
            "vello-cpu:unsupported-paint".to_string(),
        ]));
    };
    context.set_paint_transform(brush_transform);
    match brush {
        Brush::Solid(color) => context.set_paint(color),
        Brush::Gradient(gradient) => context.set_paint(gradient),
        Brush::Image(_) => {
            return Err(SvgNativeError::unsupported(vec![
                "vello-cpu:image-paint".to_string()
            ]));
        }
    }
    Ok(())
}

fn render_cpu_group(
    context: &mut RenderContext,
    group: &usvg::Group,
    scale: Affine,
) -> Result<(), SvgNativeError> {
    for node in group.children() {
        let transform = scale * vello_svg::util::to_affine(&node.abs_transform());
        match node {
            usvg::Node::Group(child) => {
                context.set_transform(transform);
                let clip =
                    child
                        .clip_path()
                        .and_then(|clip| match clip.root().children().first() {
                            Some(usvg::Node::Path(path)) => {
                                Some(vello_svg::util::to_bez_path(path))
                            }
                            _ => None,
                        });
                context.push_layer(
                    clip.as_ref(),
                    Some(to_blend(child.blend_mode())),
                    Some(child.opacity().get()),
                    None,
                    None,
                );
                render_cpu_group(context, child, scale)?;
                context.pop_layer();
            }
            usvg::Node::Path(path) => {
                if !path.is_visible() {
                    continue;
                }
                let bez = vello_svg::util::to_bez_path(path);
                let draw_fill = |context: &mut RenderContext| -> Result<(), SvgNativeError> {
                    if let Some(fill) = path.fill() {
                        context.set_transform(transform);
                        context.set_fill_rule(match fill.rule() {
                            usvg::FillRule::NonZero => Fill::NonZero,
                            usvg::FillRule::EvenOdd => Fill::EvenOdd,
                        });
                        set_cpu_paint(context, fill.paint(), fill.opacity())?;
                        context.fill_path(&bez);
                    }
                    Ok(())
                };
                let draw_stroke = |context: &mut RenderContext| -> Result<(), SvgNativeError> {
                    if let Some(stroke) = path.stroke() {
                        context.set_transform(transform);
                        context.set_stroke(vello_svg::util::to_stroke(stroke));
                        set_cpu_paint(context, stroke.paint(), stroke.opacity())?;
                        context.stroke_path(&bez);
                    }
                    Ok(())
                };
                match path.paint_order() {
                    usvg::PaintOrder::FillAndStroke => {
                        draw_fill(context)?;
                        draw_stroke(context)?;
                    }
                    usvg::PaintOrder::StrokeAndFill => {
                        draw_stroke(context)?;
                        draw_fill(context)?;
                    }
                }
            }
            usvg::Node::Image(_) | usvg::Node::Text(_) => {
                return Err(SvgNativeError::unsupported(vec![
                    "vello-cpu:non-path-node-after-audit".to_string(),
                ]));
            }
        }
    }
    Ok(())
}

fn unpremultiply(premul: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(premul.len());
    for pixel in premul.chunks_exact(4) {
        let alpha = u32::from(pixel[3]);
        if alpha == 0 {
            out.extend_from_slice(&[0, 0, 0, 0]);
        } else {
            let unmul = |component: u8| -> u8 {
                ((u32::from(component) * 255 + alpha / 2) / alpha).min(255) as u8
            };
            out.extend_from_slice(&[
                unmul(pixel[0]),
                unmul(pixel[1]),
                unmul(pixel[2]),
                alpha as u8,
            ]);
        }
    }
    out
}

/// Renders the same strict usvg tree through Vello CPU sparse strips. This is
/// a separate frontend, not a claim that vello_cpu consumes Vello GPU encoding.
pub fn render_svg_cpu(svg: &str, width: u32, height: u32) -> Result<Vec<u8>, SvgNativeError> {
    validate_target(width, height)?;
    let parsed = parse_svg(svg)?;
    let settings = RenderSettings {
        level: Level::baseline(),
        num_threads: 0,
    };
    let mut context = RenderContext::new_with(width as u16, height as u16, settings);
    render_cpu_group(
        &mut context,
        parsed.tree.root(),
        target_scale(&parsed, width, height),
    )?;
    context.flush();
    let mut pixmap = Pixmap::new(width as u16, height as u16);
    let mut resources = Resources::new();
    context.render(&mut pixmap, &mut resources);
    Ok(unpremultiply(pixmap.data_as_u8_slice()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_url_parser_is_strict() {
        assert_eq!(local_url_target("url(#gradient)"), Some("gradient"));
        assert_eq!(local_url_target("url(https://example.test/x)"), None);
        assert_eq!(local_url_target("url(#x) red"), None);
    }

    #[test]
    fn source_audit_is_deterministic() {
        let svg = r#"<svg width="10" height="10"><rect width="10" height="10"/></svg>"#;
        assert_eq!(audit_svg_source(svg), audit_svg_source(svg));
    }
}
