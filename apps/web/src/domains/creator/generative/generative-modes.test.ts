import { describe, expect, it } from "vitest";

import {
  GENERATIVE_MODES,
  INFERENCE_STATE_LABELS,
  generativeMode,
  generativeModeReadiness,
  inferenceStateLabel,
  inferenceStepIndex,
  isAspectOption,
  isVideoFrameOption,
} from "./generative-modes";

import type { InferenceStatus } from "./media-inference-client";

describe("generative modes", () => {
  it("covers every inference kind with an input, output and a real manual alternative", () => {
    expect(GENERATIVE_MODES.map((mode) => mode.kind)).toEqual(["image-to-video", "image-to-3d", "render-to-2d"]);
    for (const mode of GENERATIVE_MODES) {
      expect(mode.alternative.href.startsWith("/studio/")).toBe(true);
      expect(mode.input.ko && mode.output.ko && mode.defaultPrompt.ko).toBeTruthy();
    }
    expect(generativeMode("image-to-3d").output.ko).toContain("리깅·PBR 텍스처 미포함");
  });

  it("maps job states onto received → queued → generating → done without faking completion", () => {
    expect(inferenceStepIndex("submitting")).toBe(0);
    expect(inferenceStepIndex("submission-unknown")).toBe(0);
    expect(inferenceStepIndex("queued")).toBe(1);
    expect(inferenceStepIndex("running")).toBe(2);
    expect(inferenceStepIndex("cancel-requested")).toBe(2);
    expect(inferenceStepIndex("succeeded")).toBe(3);
    expect(inferenceStepIndex("failed")).toBeNull();
    expect(inferenceStepIndex("cancelled")).toBeNull();
  });

  it("labels every server state and falls back to the raw state", () => {
    for (const state of ["submitting", "queued", "running", "submission-unknown", "cancel-requested", "succeeded", "failed", "cancelled"]) {
      expect(INFERENCE_STATE_LABELS[state]?.en).toBeTruthy();
    }
    expect(inferenceStateLabel("mystery")).toEqual({ ko: "mystery", en: "mystery" });
  });

  it("derives readiness per mode from the server status", () => {
    const status: InferenceStatus = {
      configured: true,
      capabilities: [
        { kind: "image-to-video", ready: true, missing: [] },
        { kind: "image-to-3d", ready: false, missing: ["hunyuan3d"] },
      ],
    };
    expect(generativeModeReadiness(null, false, "image-to-video")).toEqual({ state: "checking" });
    expect(generativeModeReadiness(null, true, "image-to-video")).toEqual({ state: "offline" });
    expect(generativeModeReadiness(status, false, "image-to-video")).toEqual({ state: "ready" });
    expect(generativeModeReadiness(status, false, "image-to-3d")).toEqual({ state: "missing", missing: ["hunyuan3d"] });
    expect(generativeModeReadiness(status, false, "render-to-2d")).toEqual({ state: "missing", missing: [] });
    expect(generativeModeReadiness({ ...status, configured: false }, false, "image-to-video").state).toBe("missing");
  });

  it("guards select values instead of casting them", () => {
    expect(isVideoFrameOption(81)).toBe(true);
    expect(isVideoFrameOption(80)).toBe(false);
    expect(isAspectOption("portrait")).toBe(true);
    expect(isAspectOption("wide")).toBe(false);
  });
});
