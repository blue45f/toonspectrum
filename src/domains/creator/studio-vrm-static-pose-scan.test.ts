import { afterEach, describe, expect, it, vi } from "vitest";

import {
  disposeStudioStaticPoseLandmarker,
  initStudioStaticPoseLandmarker,
  scanStudioVrmStaticPose,
  STUDIO_STATIC_POSE_SCAN_MAX_FILE_BYTES,
  STUDIO_STATIC_POSE_SCAN_MAX_PIXELS,
} from "./studio-vrm-static-pose-scan";

import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";

function poseResult(): PoseLandmarkerResult {
  const point = (x: number, y: number, z: number) => ({ x, y, z, visibility: 1 });
  const landmarks = Array.from({ length: 33 }, () => point(0, 0, 0));
  landmarks[11] = point(-0.3, 1.4, 0);
  landmarks[12] = point(0.3, 1.4, 0);
  landmarks[13] = point(-0.7, 1.1, 0.1);
  landmarks[14] = point(0.7, 1.1, 0.1);
  landmarks[15] = point(-0.9, 0.8, 0.2);
  landmarks[16] = point(0.9, 0.8, 0.2);
  landmarks[23] = point(-0.2, 0.7, 0);
  landmarks[24] = point(0.2, 0.7, 0);
  landmarks[25] = point(-0.25, 0.1, 0.05);
  landmarks[26] = point(0.25, 0.1, 0.05);
  landmarks[27] = point(-0.25, -0.5, 0.1);
  landmarks[28] = point(0.25, -0.5, 0.1);
  landmarks[31] = point(-0.25, -0.6, 0.35);
  landmarks[32] = point(0.25, -0.6, 0.35);
  return {
    landmarks: [],
    worldLandmarks: [landmarks],
    close: vi.fn(),
  } satisfies PoseLandmarkerResult;
}

function dependencies(result: PoseLandmarkerResult = poseResult(), width = 800, height = 1200) {
  const close = vi.fn();
  return {
    close,
    values: {
      decode: vi.fn().mockResolvedValue({ width, height, close }),
      initLandmarker: vi.fn().mockResolvedValue({ detect: vi.fn().mockReturnValue(result) }),
    },
  };
}

class OversizedPoseImageBlob extends Blob {
  override get size(): number {
    return STUDIO_STATIC_POSE_SCAN_MAX_FILE_BYTES + 1;
  }
}

afterEach(() => {
  disposeStudioStaticPoseLandmarker();
});

describe("static VRM pose scan", () => {
  it("scans a bounded image locally and returns authored VRM bones", async () => {
    const deps = dependencies();
    const result = await scanStudioVrmStaticPose(
      new Blob([new Uint8Array([1])], { type: "image/png" }),
      { mirror: true },
      deps.values
    );

    expect(Object.keys(result.bones).length).toBeGreaterThan(0);
    expect(result).toMatchObject({ image: { width: 800, height: 1200 }, mirrored: true });
    expect(deps.close).toHaveBeenCalledOnce();
    expect(deps.values.initLandmarker.mock.results[0]?.value).toBeDefined();
  });

  it("rejects unsupported and oversized files before decoding", async () => {
    const deps = dependencies();
    await expect(scanStudioVrmStaticPose(
      new Blob(["html"], { type: "text/html" }),
      {},
      deps.values
    )).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE" });
    await expect(scanStudioVrmStaticPose(
      new OversizedPoseImageBlob([], { type: "image/png" }),
      {},
      deps.values
    )).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(deps.values.decode).not.toHaveBeenCalled();
  });

  it("closes decoded pixels when dimensions are unsafe or no pose is found", async () => {
    const huge = dependencies(poseResult(), 6_000, Math.floor(STUDIO_STATIC_POSE_SCAN_MAX_PIXELS / 6_000) + 1);
    await expect(scanStudioVrmStaticPose(
      new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
      {},
      huge.values
    )).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    expect(huge.close).toHaveBeenCalledOnce();

    const empty = dependencies({
      landmarks: [],
      worldLandmarks: [],
      close: vi.fn(),
    } satisfies PoseLandmarkerResult);
    await expect(scanStudioVrmStaticPose(
      new Blob([new Uint8Array([1])], { type: "image/webp" }),
      {},
      empty.values
    )).rejects.toMatchObject({ code: "NO_POSE" });
    expect(empty.close).toHaveBeenCalledOnce();
  });

  it("honors cancellation before inference and still releases the decoded image", async () => {
    const deps = dependencies();
    const controller = new AbortController();
    deps.values.decode.mockImplementation(async () => {
      controller.abort();
      return { width: 800, height: 1200, close: deps.close };
    });

    await expect(scanStudioVrmStaticPose(
      new Blob([new Uint8Array([1])], { type: "image/png" }),
      { signal: controller.signal },
      deps.values
    )).rejects.toMatchObject({ code: "ABORTED" });
    expect(deps.close).toHaveBeenCalledOnce();
    expect(deps.values.initLandmarker).not.toHaveBeenCalled();
  });

  it("settles promptly on decode cancellation and closes a late decoded bitmap", async () => {
    let resolveDecode!: (image: { width: number; height: number; close(): void }) => void;
    const lateClose = vi.fn();
    const deps = dependencies();
    deps.values.decode.mockReturnValue(new Promise((resolve) => {
      resolveDecode = resolve;
    }));
    const controller = new AbortController();
    const scan = scanStudioVrmStaticPose(
      new Blob([new Uint8Array([1])], { type: "image/png" }),
      { signal: controller.signal },
      deps.values
    );
    await vi.waitFor(() => expect(deps.values.decode).toHaveBeenCalledOnce());

    controller.abort();
    await expect(scan).rejects.toMatchObject({ code: "ABORTED" });
    resolveDecode({ width: 800, height: 1200, close: lateClose });
    await vi.waitFor(() => expect(lateClose).toHaveBeenCalledOnce());
    expect(deps.values.initLandmarker).not.toHaveBeenCalled();
  });

  it("cancels a queued scan without blocking the scan behind it", async () => {
    let resolveFirstLandmarker!: (landmarker: { detect: () => PoseLandmarkerResult }) => void;
    const first = dependencies();
    first.values.initLandmarker.mockReturnValue(new Promise((resolve) => {
      resolveFirstLandmarker = resolve;
    }));
    const firstScan = scanStudioVrmStaticPose(
      new Blob([new Uint8Array([1])], { type: "image/png" }),
      {},
      first.values
    );
    await vi.waitFor(() => expect(first.values.initLandmarker).toHaveBeenCalledOnce());

    const queued = dependencies();
    const controller = new AbortController();
    const queuedScan = scanStudioVrmStaticPose(
      new Blob([new Uint8Array([2])], { type: "image/jpeg" }),
      { signal: controller.signal },
      queued.values
    );
    await vi.waitFor(() => expect(queued.values.decode).toHaveBeenCalledOnce());
    controller.abort();
    await expect(queuedScan).rejects.toMatchObject({ code: "ABORTED" });
    expect(queued.values.initLandmarker).not.toHaveBeenCalled();
    expect(queued.close).toHaveBeenCalledOnce();

    const firstResult = poseResult();
    resolveFirstLandmarker({ detect: () => firstResult });
    await expect(firstScan).resolves.toMatchObject({ image: { width: 800, height: 1200 } });

    const after = dependencies();
    await expect(scanStudioVrmStaticPose(
      new Blob([new Uint8Array([3])], { type: "image/webp" }),
      {},
      after.values
    )).resolves.toMatchObject({ mirrored: false });
  });

  it("releases pixels, results, and the scan turn when inference fails", async () => {
    const failed = dependencies();
    const detect = vi.fn(() => {
      throw new Error("inference failed");
    });
    failed.values.initLandmarker.mockResolvedValue({ detect });
    await expect(scanStudioVrmStaticPose(
      new Blob([new Uint8Array([1])], { type: "image/png" }),
      {},
      failed.values
    )).rejects.toThrow("inference failed");
    expect(failed.close).toHaveBeenCalledOnce();

    const recovered = dependencies();
    await expect(scanStudioVrmStaticPose(
      new Blob([new Uint8Array([2])], { type: "image/png" }),
      {},
      recovered.values
    )).resolves.toBeDefined();
  });

  it("closes a landmarker that resolves after disposal instead of resurrecting the cache", async () => {
    let resolveFactory!: (landmarker: { detect: () => PoseLandmarkerResult; close(): void }) => void;
    const closeStale = vi.fn();
    const factory = vi.fn(() => new Promise<{
      detect: () => PoseLandmarkerResult;
      close(): void;
    }>((resolve) => {
      resolveFactory = resolve;
    }));
    const pending = initStudioStaticPoseLandmarker(factory);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    disposeStudioStaticPoseLandmarker();
    resolveFactory({ detect: poseResult, close: closeStale });

    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
    expect(closeStale).toHaveBeenCalledOnce();

    const closeFresh = vi.fn();
    const fresh = await initStudioStaticPoseLandmarker(async () => ({
      detect: poseResult,
      close: closeFresh,
    }));
    expect(fresh).toBeDefined();
    disposeStudioStaticPoseLandmarker();
    expect(closeFresh).toHaveBeenCalledOnce();
  });
});
