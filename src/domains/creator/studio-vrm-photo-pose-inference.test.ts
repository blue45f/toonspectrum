import { describe, expect, it, vi } from "vitest";

import {
  inferStudioVrmPhotoPoseFromImage,
  waitForStudioVrmPhotoPosePhase,
} from "./studio-vrm-photo-pose-inference";

import type { StudioVrmPhotoPosePreprocessedImage } from "./studio-vrm-photo-pose-worker-protocol";

function landmarks(): Array<{ x: number; y: number; z: number; visibility: number; presence: number }> {
  return Array.from({ length: 33 }, (_, index) => ({
    x: index / 100,
    y: index / 100,
    z: -index / 100,
    visibility: 0.9,
    presence: 0.9,
  }));
}

function preprocessed(generationId = 3): StudioVrmPhotoPosePreprocessedImage {
  return {
    generationId,
    bitmap: { width: 32, height: 16, close: vi.fn() } as unknown as ImageBitmap,
    source: {
      mimeType: "image/png",
      width: 32,
      height: 16,
      pixelCount: 512,
      exifOrientation: 1,
      byteSize: 24,
    },
    output: {
      outputWidth: 32,
      outputHeight: 16,
      scale: 1,
      appliedExifOrientation: 1,
      rotation: 0,
      mirrorHorizontal: false,
    },
  };
}

describe("studio VRM photo-pose main-thread inference boundary", () => {
  it("stops waiting for model initialization when the scan-level signal is cancelled", async () => {
    let settleLate!: (value: string) => void;
    const latePhase = new Promise<string>((resolve) => {
      settleLate = resolve;
    });
    const controller = new AbortController();
    const result = waitForStudioVrmPhotoPosePhase(latePhase, controller.signal);

    controller.abort();
    await expect(result).rejects.toMatchObject({ code: "aborted" });
    settleLate("late model");
    await Promise.resolve();

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(waitForStudioVrmPhotoPosePhase(Promise.resolve("unused"), preAborted.signal))
      .rejects.toMatchObject({ code: "aborted" });
  });

  it("returns copied numeric pose data without mutating state and closes the transferred bitmap", () => {
    const image = preprocessed();
    const rawLandmarks = landmarks();
    const detector = { detect: vi.fn(() => ({ landmarks: [rawLandmarks], worldLandmarks: [landmarks()] })) };
    const result = inferStudioVrmPhotoPoseFromImage(image, detector, { expectedGenerationId: 3 });

    expect(detector.detect).toHaveBeenCalledWith(image.bitmap);
    expect(result.inference.generationId).toBe(3);
    expect(result.inference.normalizedLandmarks).not.toBe(rawLandmarks);
    expect(result.source).toBe(image.source);
    expect(image.bitmap.close).toHaveBeenCalledOnce();
  });

  it("does not invoke MediaPipe for stale or pre-aborted generations and still closes the bitmap", () => {
    const stale = preprocessed(4);
    const detector = { detect: vi.fn() };
    expect(() => inferStudioVrmPhotoPoseFromImage(stale, detector, { expectedGenerationId: 5 }))
      .toThrowError(expect.objectContaining({ code: "stale-generation" }));
    expect(detector.detect).not.toHaveBeenCalled();
    expect(stale.bitmap.close).toHaveBeenCalledOnce();

    const aborted = preprocessed(6);
    const controller = new AbortController();
    controller.abort();
    expect(() => inferStudioVrmPhotoPoseFromImage(aborted, detector, {
      expectedGenerationId: 6,
      signal: controller.signal,
    })).toThrowError(expect.objectContaining({ code: "aborted" }));
    expect(aborted.bitmap.close).toHaveBeenCalledOnce();
  });

  it("rejects a generation superseded during inference and maps detector exceptions", () => {
    const superseded = preprocessed(7);
    let checks = 0;
    const detector = { detect: vi.fn(() => ({ landmarks: [landmarks()], worldLandmarks: [landmarks()] })) };
    expect(() => inferStudioVrmPhotoPoseFromImage(superseded, detector, {
      expectedGenerationId: 7,
      isGenerationCurrent: () => ++checks === 1,
    })).toThrowError(expect.objectContaining({ code: "stale-generation" }));
    expect(superseded.bitmap.close).toHaveBeenCalledOnce();

    const failed = preprocessed(8);
    expect(() => inferStudioVrmPhotoPoseFromImage(
      failed,
      { detect: () => { throw new Error("wasm failure"); } },
      { expectedGenerationId: 8 },
    )).toThrowError(expect.objectContaining({ code: "inference-failed" }));
    expect(failed.bitmap.close).toHaveBeenCalledOnce();
  });
});
