import { describe, expect, it } from "vitest";

import {
  decideStudioLiveInkBackend,
  resolveStudioLiveInkBackendPreference,
  type StudioLiveInkBackendDecisionInput,
} from "./studio-live-ink-backend";

import type { StudioGpuLiveStrokePreparation } from "./studio-webgpu-live-stroke-plan";

function eligible(
  overrides: Partial<StudioLiveInkBackendDecisionInput> = {}
): StudioLiveInkBackendDecisionInput {
  return {
    preference: "auto",
    resolvedBackend: "webgpu",
    direct: true,
    postCorrectionActive: false,
    mode: "pen",
    fill: undefined,
    opacity: 1,
    symmetryType: "none",
    ...overrides,
  };
}

function prepared(
  overrides: Partial<StudioGpuLiveStrokePreparation> = {}
): StudioGpuLiveStrokePreparation {
  return {
    composite: "normal",
    opacity: 1,
    symmetry: "identity",
    geometry: "source",
    destination: "transparent-overlay",
    ...overrides,
  };
}

describe("studio live-ink backend policy", () => {
  it("uses capability-driven WebGPU selection when configuration is absent", () => {
    expect(resolveStudioLiveInkBackendPreference(undefined)).toBe("auto");
    expect(resolveStudioLiveInkBackendPreference(null)).toBe("auto");
    expect(resolveStudioLiveInkBackendPreference("")).toBe("auto");
    expect(resolveStudioLiveInkBackendPreference("auto")).toBe("auto");
    expect(decideStudioLiveInkBackend(eligible())).toEqual({
      backend: "webgpu",
      reason: "webgpu-ready",
    });
  });

  it("preserves explicit renderer rollout controls and fails closed on typos", () => {
    expect(resolveStudioLiveInkBackendPreference("webgpu")).toBe("webgpu");
    expect(resolveStudioLiveInkBackendPreference("canvas2d")).toBe("canvas2d");
    expect(resolveStudioLiveInkBackendPreference("web-gpu")).toBe("canvas2d");
    expect(decideStudioLiveInkBackend(eligible({ preference: "canvas2d" }))).toEqual({
      backend: "canvas2d",
      reason: "canvas2d-forced",
    });
  });

  it("falls back without hiding ink while the adapter is unavailable or initialization failed", () => {
    expect(decideStudioLiveInkBackend(eligible({ resolvedBackend: null }))).toEqual({
      backend: "canvas2d",
      reason: "backend-unavailable",
    });
    expect(decideStudioLiveInkBackend(eligible({ resolvedBackend: "canvas2d" }))).toEqual({
      backend: "canvas2d",
      reason: "backend-unavailable",
    });
  });

  it.each([
    ["unsupported draft", { direct: false }, "unsupported-draft"],
    ["post correction", { postCorrectionActive: true }, "post-correction"],
    ["eraser", { mode: "eraser" }, "eraser"],
    ["fill", { fill: "#fff" }, "fill"],
    ["translucency", { opacity: 0.7 }, "opacity"],
    ["invalid opacity", { opacity: Number.NaN }, "opacity"],
    ["symmetry", { symmetryType: "vertical" }, "symmetry"],
  ] as const)("keeps %s on the authoritative Canvas2D path", (_label, overrides, reason) => {
    expect(decideStudioLiveInkBackend(eligible(overrides))).toEqual({
      backend: "canvas2d",
      reason,
    });
  });

  it("treats both auto and explicit WebGPU as capability-gated rather than forced visibility", () => {
    expect(decideStudioLiveInkBackend(eligible({ preference: "auto" })).backend).toBe("webgpu");
    expect(decideStudioLiveInkBackend(eligible({ preference: "webgpu" })).backend).toBe("webgpu");
    expect(decideStudioLiveInkBackend(eligible({
      preference: "webgpu",
      resolvedBackend: "canvas2d",
    }))).toEqual({ backend: "canvas2d", reason: "backend-unavailable" });
  });

  it.each([
    [
      "destination-out erasing",
      {
        direct: false,
        mode: "eraser",
        preparedStroke: prepared({ composite: "erase", destination: "retained-layer" }),
      },
    ],
    [
      "premultiplied partial opacity",
      { direct: false, opacity: 0.35, preparedStroke: prepared({ opacity: 0.35 }) },
    ],
    [
      "deterministically expanded symmetry",
      {
        direct: false,
        symmetryType: "kaleidoscope",
        preparedStroke: prepared({ symmetry: "expanded" }),
      },
    ],
    [
      "final post-corrected geometry",
      {
        direct: false,
        postCorrectionActive: true,
        preparedStroke: prepared({ geometry: "post-corrected" }),
      },
    ],
  ] as const)("selects WebGPU for %s only after exact stroke preparation", (_label, overrides) => {
    expect(decideStudioLiveInkBackend(eligible(overrides))).toEqual({
      backend: "webgpu",
      reason: "webgpu-ready",
    });
  });

  it.each([
    [
      "eraser composite",
      { mode: "eraser", preparedStroke: prepared() },
      "eraser",
    ],
    [
      "opacity",
      { opacity: 0.4, preparedStroke: prepared({ opacity: 0.5 }) },
      "opacity",
    ],
    [
      "symmetry expansion",
      { symmetryType: "vertical", preparedStroke: prepared() },
      "symmetry",
    ],
    [
      "corrected geometry",
      { postCorrectionActive: true, preparedStroke: prepared() },
      "post-correction",
    ],
  ] as const)("fails safe when prepared %s does not match the requested draft", (
    _label,
    overrides,
    reason
  ) => {
    expect(decideStudioLiveInkBackend(eligible(overrides))).toEqual({
      backend: "canvas2d",
      reason,
    });
  });

  it("rejects malformed preparation metadata instead of trusting a partial capability claim", () => {
    expect(decideStudioLiveInkBackend(eligible({
      preparedStroke: {
        ...prepared(),
        geometry: "predicted",
      } as unknown as StudioGpuLiveStrokePreparation,
    }))).toEqual({ backend: "canvas2d", reason: "invalid-preparation" });
  });

  it("keeps an eraser off a transparent overlay that cannot punch through committed pixels", () => {
    expect(decideStudioLiveInkBackend(eligible({
      direct: false,
      mode: "eraser",
      preparedStroke: prepared({ composite: "erase" }),
    }))).toEqual({ backend: "canvas2d", reason: "eraser" });
  });
});
