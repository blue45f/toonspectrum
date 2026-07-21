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
  ] as const)("specializes the %s family by stable action identity", (kind, variants) => {
    const signatures = variants.map((variant) => visualSignature(kind, variant));
    expect(new Set(signatures).size).toBe(variants.length);
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
