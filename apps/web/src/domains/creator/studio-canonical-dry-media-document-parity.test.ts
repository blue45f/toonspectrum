// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  compareStudioDryMediaDocumentPixels,
  measureStudioDryMediaDocumentParity,
} from "./studio-canonical-dry-media-document-parity";

import type { StudioEngineWebGpuPresentationConfiguration } from "./render/studio-engine-webgpu-presentation-surface";
import type { DrawEl } from "./studio-element-model";

const boundary = vi.hoisted(() => ({
  paper: { model: "contact-tooth-v2", surface: { kind: "cold-press", seed: 41 } },
  plan: vi.fn(), coverage: vi.fn(), render: vi.fn(), legacy: vi.fn(),
  bounded: vi.fn(),
}));
vi.mock("./studio-dynamic-brush-render-plan", () => ({ planStudioDynamicBrushRender: boundary.plan }));
vi.mock("./studio-dynamic-brush-coverage-renderer", () => ({
  planStudioDynamicBrushCoverageAndLegacyMarks: boundary.coverage,
  renderStudioDynamicBrushCoverage: boundary.render,
  renderStudioDynamicBrushLegacyMarks: boundary.legacy,
}));
vi.mock("./brush/studio-stroke-paint-model", () => ({
  isStudioBoundedFlowPaintModelCompatible: boundary.bounded,
}));

const pixels = (data = [124, 92, 252, 128, 0, 0, 0, 0]) => ({
  width: 2, height: 1, data: new Uint8ClampedArray(data),
});

describe("ordinary/GPU exact RGBA comparison", () => {
  it("admits identical nonempty straight-alpha bytes, not just equal frame hashes", () => {
    expect(compareStudioDryMediaDocumentPixels(pixels(), pixels())).toEqual({
      status: "matched", width: 2, height: 1, comparedPixels: 2,
      mismatchedPixels: 0, maxChannelDelta: 0,
      colorSpace: "srgb", alphaEncoding: "straight-rgba8", channelTolerance: 0,
    });
  });

  it.each([0, 1, 2, 3])("rejects even a one-byte difference in channel %s", (channel) => {
    const changed = pixels();
    changed.data[channel] += 1;
    expect(compareStudioDryMediaDocumentPixels(pixels(), changed)).toMatchObject({
      status: "mismatch", mismatchedPixels: 1, maxChannelDelta: 1, channelTolerance: 0,
    });
  });

  it("counts changed pixels once and preserves the largest channel difference", () => {
    expect(compareStudioDryMediaDocumentPixels(pixels(), pixels([0, 0, 0, 0, 1, 2, 3, 255])))
      .toMatchObject({ status: "mismatch", mismatchedPixels: 2, maxChannelDelta: 255 });
  });

  it("does not flatten translucent colors against white", () => {
    expect(compareStudioDryMediaDocumentPixels(pixels([0, 0, 0, 128, 0, 0, 0, 0]),
      pixels([127, 127, 127, 255, 0, 0, 0, 0]))).toMatchObject({ status: "mismatch" });
  });

  it.each([
    { ...pixels(), width: 1 },
    { ...pixels(), height: 0 },
    { ...pixels(), data: new Uint8ClampedArray(7) },
  ])("rejects malformed or mismatched backing dimensions", (invalid) => {
    expect(compareStudioDryMediaDocumentPixels(pixels(), invalid))
      .toEqual({ status: "unavailable", reason: "invalid-pixels" });
  });
});

describe("ordinary reference compositor boundary", () => {
  const element = { id: "paper-pencil", type: "draw", brush: "dry-media",
    stroke: "#7c5cfc", paperModel: "contact-tooth-v2", opacity: 1 } as DrawEl;
  const configuration = {
    physicalWidth: 2, physicalHeight: 1,
    documentToSurface: { m11: -2.5, m12: 0, m21: 0, m22: 2.5, dx: 1970, dy: -45 },
  } as StudioEngineWebGpuPresentationConfiguration;

  beforeEach(() => {
    boundary.plan.mockReturnValue({ status: "ready", plan: {
      dabVariations: [], dynamics: {}, materialIdentity: {}, seed: 9, markBudget: 10,
      renderBudget: { stampGrid: null }, usesCausalDepositPlan: true, paper: boundary.paper,
    } });
    boundary.coverage.mockReturnValue({ coveragePlan: { ok: true, marks: ["ordinary-mark"] }, legacyMarks: ["legacy-mark"] });
    boundary.render.mockReturnValue({ status: "rendered" });
    boundary.bounded.mockReturnValue(true);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

  function measure(throwReadback = false) {
    const snapshot = document.createElement("canvas");
    snapshot.width = 2;
    snapshot.height = 1;
    const setTransform = vi.fn();
    const references: HTMLCanvasElement[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((function (
      this: HTMLCanvasElement,
    ) {
      if (this !== snapshot) references.push(this);
      return { setTransform, getImageData() {
        if (throwReadback) throw new Error("readback failed");
        return pixels();
      } };
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext);
    const result = measureStudioDryMediaDocumentParity({
      element, layoutKey: "paper:41:flip:dpr2", snapshot, configuration,
      paperSurface: { kind: "cold-press", seed: 41 },
    });
    return { result, setTransform, reference: references[0] ?? null, snapshot };
  }

  it("passes paper and bounded-flow marks unchanged through the shared ordinary renderer", () => {
    const { result, setTransform, reference, snapshot } = measure();
    expect(result).toMatchObject({ status: "matched", element, layoutKey: "paper:41:flip:dpr2" });
    expect(boundary.plan).toHaveBeenCalledWith(element, "dry-media", false, { kind: "cold-press", seed: 41 });
    expect(boundary.coverage).toHaveBeenCalledWith(expect.objectContaining({ paper: boundary.paper }));
    expect(boundary.render).toHaveBeenCalledWith(expect.anything(), ["ordinary-mark"], { activeDraft: false, opacity: 1 });
    expect(boundary.legacy).not.toHaveBeenCalled();
    expect(setTransform).toHaveBeenCalledWith(-2.5, 0, 0, 2.5, 1970, -45);
    expect(reference?.width).toBe(0);
    expect(reference?.height).toBe(0);
    expect(snapshot.width).toBe(2);
  });

  it("uses the existing legacy compositor for legacy paint semantics", () => {
    boundary.bounded.mockReturnValue(false);
    expect(measure().result.status).toBe("matched");
    expect(boundary.legacy).toHaveBeenCalledWith(expect.anything(), ["legacy-mark"], 1);
    expect(boundary.render).not.toHaveBeenCalled();
  });

  it("does not authorize a failed ordinary compositor", () => {
    boundary.render.mockReturnValue({ status: "partial" });
    expect(measure().result).toEqual({ status: "unavailable", reason: "reference-render-failed" });
  });

  it("releases the temporary reference after readback failure", () => {
    const { result, reference } = measure(true);
    expect(result).toEqual({ status: "unavailable", reason: "readback-unavailable" });
    expect(reference?.width).toBe(0);
  });
});
