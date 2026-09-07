import { describe, expect, it } from "vitest";

import { normalizeStudioBrushDynamicsSettings } from "../brush/studio-brush-dynamics-normalize";

import {
  classifyStudioCanonicalDryMediaElement,
  resolveStudioCanonicalDryMediaSelectedElement,
  resolveStudioCanonicalDryMediaViewportAuthority,
  studioCanonicalDryMediaOwnsDocumentElement,
} from "./studio-canonical-dry-media-authority";

import type { DrawEl } from "../studio-element-model";
import type {
  StudioCanonicalVNextDryMediaCanvasAuthority,
  StudioCanonicalVNextDryMediaCanvasAuthorizedAuthority,
} from "../StudioCanonicalVNextDryMediaCanvas";

const element = {
  id: "dry-media-authority",
  type: "draw",
  points: [0, 0, 10, 10],
  stroke: "#111827",
  strokeWidth: 8,
  brush: "dry-media",
} as DrawEl;

function authorized(): StudioCanonicalVNextDryMediaCanvasAuthorizedAuthority {
  return {
    kind: "studio-canonical-vnext-dry-media-canvas-authority",
    version: 1,
    status: "authorized",
    element,
    layoutKey: "layout:1",
    canonicalPlanHash: "hash",
    dynamicPlanDigest: "sha256:dynamic",
    sourceDabCount: 2,
    texturedDabCount: 10,
    laneCount: 5,
    parityReceipt: {} as never,
  };
}

describe("canonical dry-media viewport authority", () => {
  it("keeps Konva hidden for an exact authorized WebGPU frame", () => {
    expect(resolveStudioCanonicalDryMediaViewportAuthority(
      authorized(),
      element,
      "layout:1",
    )).toMatchObject({
      canvasVisible: true,
      hiddenElementId: element.id,
      authorized: { status: "authorized" },
      unavailable: null,
    });
  });

  it("keeps Konva hidden when unavailable retains the exact last-good WebGPU frame", () => {
    const lastPresented = authorized();
    const unavailable: StudioCanonicalVNextDryMediaCanvasAuthority = {
      kind: "studio-canonical-vnext-dry-media-canvas-authority",
      version: 1,
      status: "unavailable",
      element,
      layoutKey: "layout:1",
      reason: "device-lost",
      retainsLastGoodFrame: true,
      lastPresented,
      retryPolicy: "explicit-next-selection-only",
    };
    const resolved = resolveStudioCanonicalDryMediaViewportAuthority(
      unavailable,
      element,
      "layout:1",
    );

    expect(resolved).toMatchObject({
      canvasVisible: true,
      hiddenElementId: element.id,
      authorized: null,
      unavailable: { reason: "device-lost" },
    });
    expect(studioCanonicalDryMediaOwnsDocumentElement(
      element.id,
      resolved.hiddenElementId,
    )).toBe(true);
  });

  it("does not hide Konva for preflight unavailability without a receipted frame", () => {
    const unavailable: StudioCanonicalVNextDryMediaCanvasAuthority = {
      kind: "studio-canonical-vnext-dry-media-canvas-authority",
      version: 1,
      status: "unavailable",
      element,
      layoutKey: "layout:1",
      reason: "webgpu-unavailable",
      retainsLastGoodFrame: false,
      lastPresented: null,
      retryPolicy: "explicit-next-selection-only",
    };

    expect(resolveStudioCanonicalDryMediaViewportAuthority(
      unavailable,
      element,
      "layout:1",
    )).toMatchObject({
      canvasVisible: false,
      hiddenElementId: null,
      authorized: null,
      unavailable: { reason: "webgpu-unavailable" },
    });
    expect(studioCanonicalDryMediaOwnsDocumentElement(element.id, null)).toBe(false);
  });

  it("refuses a retained last-good frame whose own layout differs from the current layout", () => {
    // The envelope is stamped with the *current* layout at publish time; only the snapshot's own
    // layoutKey reveals that the bitmap was receipted at a different surface size/scale/DPR.
    const staleFrame = { ...authorized(), layoutKey: "layout:1" };
    const unavailable: StudioCanonicalVNextDryMediaCanvasAuthority = {
      kind: "studio-canonical-vnext-dry-media-canvas-authority",
      version: 1,
      status: "unavailable",
      element,
      layoutKey: "layout:2",
      reason: "presentation:runtime-rejected",
      retainsLastGoodFrame: true,
      lastPresented: staleFrame,
      retryPolicy: "explicit-next-selection-only",
    };

    const resolved = resolveStudioCanonicalDryMediaViewportAuthority(
      unavailable,
      element,
      "layout:2",
    );
    expect(resolved).toMatchObject({
      canvasVisible: false,
      hiddenElementId: null,
      authorized: null,
      unavailable: { reason: "presentation:runtime-rejected" },
    });
    expect(studioCanonicalDryMediaOwnsDocumentElement(element.id, resolved.hiddenElementId))
      .toBe(false);

    // Same envelope, but the frame really was receipted in this layout → ownership stays.
    expect(resolveStudioCanonicalDryMediaViewportAuthority(
      { ...unavailable, lastPresented: { ...staleFrame, layoutKey: "layout:2" } },
      element,
      "layout:2",
    ).hiddenElementId).toBe(element.id);
  });

  it("rejects stale layout and DrawEl identities before changing document ownership", () => {
    const authority = authorized();
    const replacedElement = { ...element };

    expect(resolveStudioCanonicalDryMediaViewportAuthority(
      authority,
      element,
      "layout:2",
    ).hiddenElementId).toBeNull();
    expect(resolveStudioCanonicalDryMediaViewportAuthority(
      authority,
      replacedElement,
      "layout:1",
    ).hiddenElementId).toBeNull();
  });
});


describe("canonical dry-media renderer selection", () => {
  const dry = { ...element, kind: "freehand", brushCatalogId: "pastel-paper-soft" } as DrawEl;

  it.each([
    ["rectangle", { kind: "rect" }],
    ["ordinary freehand pen", { brush: "pen" }],
    ["eraser", { mode: "eraser" }],
    ["discrete motif", { brushCatalogId: "canvas-weave" }],
    ["roller", { brushCatalogId: "paint-roller" }],
    ["unknown material", { brushCatalogId: "unknown" }],
    ["symmetry", { symmetry: { type: "vertical", centerX: 0, centerY: 0 } }],
    ["multiply", { blendMode: "multiply" }],
    ["nonidentity bounded flow", { paintModel: "bounded-flow-v2", opacity: 0.5 }],
  ] as const)("keeps %s on the ordinary document renderer", (_name, overrides) => {
    const authored = { ...dry, ...overrides } as DrawEl;
    expect(resolveStudioCanonicalDryMediaSelectedElement(authored, authored.id)).toBeNull();
  });

  it.each([
    ["tip layer", { tipLayers: [{ tip: { shape: "hard" } }] }, "unsupported-multi-tip"],
    ["dual tip", { dualBrush: { enabled: true, tip: { shape: "hard" } } }, "unsupported-multi-tip"],
    ["color dynamics", { colorDynamics: { hueJitter: 0.2 } }, "unsupported-color-dynamics"],
    ["external grain", { grain: { source: { kind: "r8-texture-v1", asset: { assetId: "paper.test", encodedSha256: `sha256:${"a".repeat(64)}`, decodedSha256: `sha256:${"b".repeat(64)}`, byteLength: 2048, mediaType: "image/png", width: 32, height: 32, channel: "luminance", encoding: "r8-unorm" } } } }, "unsupported-grain-source"],
  ])("retains the authored %s renderer without mounting the specialist", (_name, settings, reason) => {
    const authored = { ...dry, brushDynamics: normalizeStudioBrushDynamicsSettings(settings) };
    expect(classifyStudioCanonicalDryMediaElement(authored)).toMatchObject({ status: "ineligible", reason });
    expect(resolveStudioCanonicalDryMediaSelectedElement(authored, authored.id)).toBeNull();
  });

  it("only promotes the exact selected topmost eligible freehand and clears its old authority on deselection", () => {
    expect(resolveStudioCanonicalDryMediaSelectedElement(dry, dry.id)).toBe(dry);
    expect(resolveStudioCanonicalDryMediaSelectedElement({ ...dry, kind: undefined }, dry.id))
      .toMatchObject({ id: dry.id });
    expect(resolveStudioCanonicalDryMediaSelectedElement(dry, "lower-element")).toBeNull();
    expect(resolveStudioCanonicalDryMediaSelectedElement(dry, null)).toBeNull();
    expect(resolveStudioCanonicalDryMediaSelectedElement(null, dry.id)).toBeNull();
    const oldFrame = { ...authorized(), element: dry };
    expect(resolveStudioCanonicalDryMediaViewportAuthority(oldFrame, dry, "layout:1").canvasVisible)
      .toBe(true);
    for (const candidate of [
      resolveStudioCanonicalDryMediaSelectedElement(dry, null),
      resolveStudioCanonicalDryMediaSelectedElement({ ...dry, kind: "rect" }, dry.id),
    ]) {
      expect(resolveStudioCanonicalDryMediaViewportAuthority(oldFrame, candidate, "layout:1"))
        .toMatchObject({ active: null, canvasVisible: false, hiddenElementId: null });
    }
  });
});
