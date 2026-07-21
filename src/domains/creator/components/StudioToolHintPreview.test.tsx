import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STUDIO_TOOL_HINT_PREVIEW_KINDS } from "../studio-tool-hint-preview-kind";

import {
  StudioToolHintPreview,
} from "./StudioToolHintPreview";

const PREVIEW_KINDS = STUDIO_TOOL_HINT_PREVIEW_KINDS;

function visualSignature(
  kind: (typeof PREVIEW_KINDS)[number],
  variant?: string
): string {
  return renderToStaticMarkup(
    <StudioToolHintPreview kind={kind} variant={variant} reducedMotion />
  )
    .replace(/\sdata-(?:studio-tool-hint-preview|preview-kind|preview-variant|preview-operation)="[^"]*"/gu, "")
    .replace(/studio-tool-preview-[^"#)]+/gu, "studio-tool-preview-id");
}

function animatedVisualSignature(
  kind: (typeof PREVIEW_KINDS)[number],
  variant?: string
): string {
  return renderToStaticMarkup(
    <StudioToolHintPreview kind={kind} variant={variant} reducedMotion={false} />
  )
    .replace(/\sdata-(?:studio-tool-hint-preview|preview-kind|preview-variant|preview-operation)="[^"]*"/gu, "")
    .replace(/studio-tool-preview-[^"#)]+/gu, "studio-tool-preview-id");
}

describe("StudioToolHintPreview", () => {
  it.each(PREVIEW_KINDS)("renders the %s micro-demo with stable integration hooks", (kind) => {
    const html = renderToStaticMarkup(
      <StudioToolHintPreview kind={kind} reducedMotion />
    );

    expect(html).toContain(`data-studio-tool-hint-preview="${kind}"`);
    expect(html).toContain(`data-preview-kind="${kind}"`);
    expect(html).toContain('data-motion="reduced"');
    expect(html).toContain('viewBox="0 0 216 104"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<animate");
  });

  it.each(PREVIEW_KINDS)("animates the %s demonstration when motion is allowed", (kind) => {
    const html = renderToStaticMarkup(
      <StudioToolHintPreview kind={kind} reducedMotion={false} />
    );

    expect(html).toContain('data-motion="animated"');
    expect(html).toContain("<animate");
  });

  it("keeps every default preview kind visually distinct", () => {
    const signatures = PREVIEW_KINDS.map((kind) => visualSignature(kind));

    expect(new Set(signatures).size).toBe(PREVIEW_KINDS.length);
  });

  it("gives formerly over-shared actions different visual signatures", () => {
    const actionKinds = [
      "pan",
      "transform",
      "crop",
      "comment",
      "perspective",
      "smudge",
      "liquify",
      "reference",
      "rotate-view",
      "frame-capture",
      "frame-playback",
      "frame-duplicate",
      "frame-delete",
    ] as const;
    const signatures = actionKinds.map((kind) => visualSignature(kind));

    expect(new Set(signatures).size).toBe(actionKinds.length);
  });

  it("keeps direct shape drawing visually distinct from smart-shape correction", () => {
    expect(visualSignature("shape")).not.toBe(visualSignature("smart-shape"));
  });

  it("gives every color action its own reduced-motion and animated demonstration", () => {
    const variants = [
      "brush-shape",
      "bubble-fill",
      "recent-swatch",
      "palette-family",
      "palette-swatch",
    ] as const;
    const reducedSignatures = variants.map((variant) =>
      visualSignature("color-palette", variant)
    );
    const animatedSignatures = variants.map((variant) =>
      animatedVisualSignature("color-palette", variant)
    );

    expect(new Set(reducedSignatures).size).toBe(variants.length);
    expect(new Set(animatedSignatures).size).toBe(variants.length);

    for (const variant of variants) {
      const html = renderToStaticMarkup(
        <StudioToolHintPreview kind="color-palette" variant={variant} reducedMotion />
      );
      expect(html).toContain(`data-preview-operation="${variant}"`);
    }
  });

  it.each([
    ["layer-visibility", ["layer-batch-show", "layer-batch-hide"]],
    ["layer-lock", ["layer-batch-lock", "layer-batch-unlock"]],
    ["layer-merge", ["layer-batch-merge-selected", "layer-batch-flatten-visible"]],
    ["camera-zoom", ["bg3d:camera:zoom-in", "bg3d:camera:zoom-out", "bg3d:camera:focus-selection"]],
    ["frame-reorder", ["frame-reorder-previous", "frame-reorder-next"]],
    ["onion-skin", ["frame-onion-skin", "frame-onion-prev-count", "frame-onion-next-count", "frame-onion-opacity", "frame-onion-tint"]],
    ["stabilizer", ["stabilizer-standard", "stabilizer-adaptive", "stabilizer-precision", "post-correction"]],
    ["pressure", ["pressure-soft", "pressure-linear", "pressure-firm"]],
    ["symmetry", ["symmetry-none", "symmetry-vertical", "symmetry-horizontal", "symmetry-radial", "symmetry-kaleidoscope"]],
    ["shape", ["shape-picker-line", "shape-picker-rect", "shape-picker-ellipse", "shape-picker-star", "shape-picker-arrow", "shape-picker-triangle", "shape-picker-polygon"]],
    ["selection-boundary", ["select-all", "clear", "invert", "remove-last-subpath", "expand", "contract"]],
    ["selection-history", ["undo", "redo"]],
    ["selection-marquee-transform", ["rotate-custom", "rotate-cw-90", "rotate-ccw-90", "rotate-180", "flip-x", "flip-y", "translate-left", "translate-right", "translate-up", "translate-down", "scale-up", "scale-down"]],
    ["selection-content-transform", ["apply-scale-rotate", "rotate-cw-90", "flip-x", "flip-y", "delete", "content-aware-fill"]],
    ["selection-adjust", ["brightness", "hue"]],
    ["panel-layout", ["add", "split-diagonal", "diagonalize", "straighten"]],
    ["zoom-view", ["zoom-out", "zoom-in", "actual-size", "fit-width", "reset"]],
    ["fullscreen", ["maximize-window", "restore-window", "fullscreen", "exit-fullscreen", "canvas-only"]],
    ["workspace-focus", ["focus", "restore"]],
    ["brush-favorite", ["add", "remove"]],
    ["shape-fill", ["enable", "disable"]],
    ["draw-settings", ["expand", "collapse"]],
    ["flip-view", ["flip", "restore"]],
    ["smart-shape", ["enable", "disable"]],
  ] as const)("specializes the %s family by stable action identity", (kind, variants) => {
    const signatures = variants.map((variant) => visualSignature(kind, variant));
    expect(new Set(signatures).size).toBe(variants.length);
  });

  it.each([
    ["brush-favorite", ["add", "remove"]],
    ["shape-fill", ["enable", "disable"]],
    ["draw-settings", ["expand", "collapse"]],
    ["flip-view", ["flip", "restore"]],
    ["smart-shape", ["enable", "disable"]],
    ["fullscreen", ["fullscreen", "exit-fullscreen"]],
    ["workspace-focus", ["focus", "restore"]],
  ] as const)("animates opposite %s actions with different directions", (kind, variants) => {
    const signatures = variants.map((variant) => animatedVisualSignature(kind, variant));
    expect(new Set(signatures).size).toBe(variants.length);
  });

  it("reverses the canvas frame direction for zoom-out", () => {
    const zoomIn = animatedVisualSignature("zoom-view", "zoom-in");
    const zoomOut = animatedVisualSignature("zoom-view", "zoom-out");

    expect(zoomIn).toContain('attributeName="width" dur="2.8s" values="82;112;112;82"');
    expect(zoomOut).toContain('attributeName="width" dur="2.8s" values="112;82;82;112"');
  });

  it.each([
    ["shape-picker-rect", "M58 30 158 76"],
    ["shape-picker-ellipse", "M58 26 158 80"],
    ["shape-picker-star", "M74 20 142 79"],
    ["shape-picker-arrow", "M54 29 163 77"],
    ["shape-picker-triangle", "M54 21 162 79"],
    ["shape-picker-polygon", "M64 20 162 84"],
  ] as const)("demonstrates %s as the editor's bounding-box drag gesture", (variant, path) => {
    const html = animatedVisualSignature("shape", variant);

    expect(html).toContain(`path="${path}"`);
    expect(html).toContain('values=".04 .04;1 1;1 1;.04 .04"');
  });

  it("keeps arrow drawing unfilled because the editor disables arrow fill", () => {
    const html = renderToStaticMarkup(
      <StudioToolHintPreview kind="shape" variant="shape-picker-arrow" reducedMotion />
    );

    expect(html).toMatch(/data-preview-operation="shape-arrow"[^>]*fill="none"/u);
  });

  it("keeps selection scale and scale-rotate animation centered on the selection", () => {
    const marqueeScale = animatedVisualSignature("selection-marquee-transform", "scale-up");
    const contentTransform = animatedVisualSignature("selection-content-transform", "apply-scale-rotate");

    expect(marqueeScale).toContain('transform="translate(108 53)"');
    expect(marqueeScale).toContain('transform="translate(-108 -53)"');
    expect(contentTransform).toContain('values="1;1.18;1.18;1"');
    expect(contentTransform).toContain('values="0;12;12;0"');
    expect(contentTransform).toContain('transform="translate(-108 -53)"');
  });

  it("keeps high-value toolbelt workflows visually distinct", () => {
    const workflowKinds = [
      "panel-layout",
      "character-3d",
      "background-library",
      "style-library",
      "storyboard-grid",
      "review-workflow",
      "team-collaboration",
      "continuity-check",
      "vertical-preview",
      "workspace-focus",
    ] as const;
    const signatures = workflowKinds.map((kind) => visualSignature(kind));

    expect(new Set(signatures).size).toBe(workflowKinds.length);
  });

  it("shows object snapping at a grid intersection", () => {
    const html = renderToStaticMarkup(
      <StudioToolHintPreview kind="object-snap" reducedMotion />
    );

    expect(html).toContain('data-preview-kind="object-snap"');
    expect(html).toContain('data-preview-operation="object-snap"');
    expect(html).toContain('data-motion="reduced"');
  });

  it("keeps the edit workflow distinct from file, insert, draw, and history flows", () => {
    const workflowKinds = [
      "edit-workflow",
      "file-workflow",
      "insert-content",
      "draw-workflow",
      "history",
    ] as const;
    const signatures = workflowKinds.map((kind) => visualSignature(kind));

    expect(new Set(signatures).size).toBe(workflowKinds.length);
  });

  it("specializes slash-namespaced action variants", () => {
    const html = renderToStaticMarkup(
      <StudioToolHintPreview
        kind="layer-lock"
        variant="plugin/layer/unlock-layer"
        reducedMotion
      />
    );

    expect(html).toContain('data-preview-operation="unlock"');
    expect(html).toContain("M-7-2v-7a7 7 0 0 1 12-5v7");
  });

  it("renders filter engines as distinct controls instead of one generic wipe", () => {
    const variants = [
      "filter-curves",
      "filter-gradient-map",
      "filter-channel-mixer",
      "filter-invert",
    ] as const;
    const signatures = variants.map((variant) => visualSignature("filter", variant));

    expect(new Set(signatures).size).toBe(variants.length);
  });

  it("normalizes and exposes the preview variant without leaking it as an SVG prop", () => {
    const html = renderToStaticMarkup(
      <StudioToolHintPreview
        kind="camera-zoom"
        variant="VRM:Camera:Zoom_Out"
        reducedMotion
      />
    );

    expect(html).toContain('data-preview-variant="vrm:camera:zoom-out"');
    expect(html).not.toContain(' variant="');
  });

  it("is decorative by default and can become a named image", () => {
    const decorative = renderToStaticMarkup(
      <StudioToolHintPreview kind="ink" reducedMotion />
    );
    const named = renderToStaticMarkup(
      <StudioToolHintPreview
        kind="ink"
        reducedMotion
        aria-label="브러시 획 미리보기"
      />
    );

    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('role="img"');
    expect(named).toContain('aria-label="브러시 획 미리보기"');
    expect(named).toContain('role="img"');
    expect(named).not.toContain("aria-hidden");
  });

  it("creates collision-free clip and ledger identifiers for sibling previews", () => {
    const html = renderToStaticMarkup(
      <div>
        <StudioToolHintPreview kind="text" reducedMotion />
        <StudioToolHintPreview kind="filter" reducedMotion />
      </div>
    );

    const identifiers = [...html.matchAll(/id="([^"]+(?:ledger|clip))"/g)].map(
      (match) => match[1]
    );

    expect(identifiers.length).toBe(4);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    for (const identifier of identifiers) {
      expect(html).toContain(`url(#${identifier})`);
    }
  });

  it("creates collision-free checker patterns for sibling opacity previews", () => {
    const html = renderToStaticMarkup(
      <div>
        <StudioToolHintPreview kind="opacity" reducedMotion />
        <StudioToolHintPreview kind="opacity" reducedMotion />
      </div>
    );

    const identifiers = [...html.matchAll(/id="([^"]+-opacity-checker)"/g)].map(
      (match) => match[1]
    );

    expect(identifiers).toHaveLength(2);
    expect(new Set(identifiers).size).toBe(2);
    for (const identifier of identifiers) {
      expect(html).toContain(`url(#${identifier})`);
    }
  });
});
