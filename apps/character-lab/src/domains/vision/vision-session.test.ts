import { describe, expect, it } from "vitest";

import { failVisible } from "../../contracts";

import { toEmbedding } from "./similarity";
import { toContractVisionStatus, resolveHandSide } from "./vision-ports";
import { createVisionSession } from "./vision-session";

import type { HandDetectorPort, LoadedModel, PoseDetectorPort, VisionLoaders, VisionModelKey, VisionModelStatus } from "./vision-ports";
import type { EmbedderPort } from "../../contracts";

function loaded<Port>(key: VisionModelKey, port: Port, disposed: string[]): LoadedModel<Port> {
  return { key, port, observedSha256: "ab".repeat(32), pinned: key === "imageEmbedder", bytes: 3, license: "Apache-2.0", delegate: "CPU", dispose: () => disposed.push(key) };
}

function loadersOf(calls: string[], disposed: string[], failPose = false): VisionLoaders {
  const embedder: EmbedderPort = { embed: async () => toEmbedding([1, 0]) };
  const pose: PoseDetectorPort = { detect: async () => null };
  const hand: HandDetectorPort = { detect: async () => [] };
  return {
    imageEmbedder: async () => {
      calls.push("imageEmbedder");
      return loaded("imageEmbedder", embedder, disposed);
    },
    poseLandmarker: async () => {
      calls.push("poseLandmarker");
      if (failPose) throw failVisible("vision-model-timeout", "시간 초과", undefined, 1);
      return loaded("poseLandmarker", pose, disposed);
    },
    handLandmarker: async () => {
      calls.push("handLandmarker");
      return loaded("handLandmarker", hand, disposed);
    },
  };
}

describe("vision/vision-session", () => {
  it("ensure는 loading→ready 상태를 보고하고 같은 모델은 한 번만 로드한다", async () => {
    const calls: string[] = [];
    const disposed: string[] = [];
    const events: Array<[VisionModelKey, VisionModelStatus["phase"]]> = [];
    const session = createVisionSession({ loaders: loadersOf(calls, disposed), onStatus: (key, status) => events.push([key, status.phase]), now: () => 1 });
    const [a, b] = await Promise.all([session.ensure("imageEmbedder"), session.ensure("imageEmbedder")]);
    expect(a).toBe(b);
    await session.ensure("imageEmbedder");
    expect(calls).toEqual(["imageEmbedder"]);
    expect(events).toEqual([
      ["imageEmbedder", "loading"],
      ["imageEmbedder", "ready"],
    ]);
    const status = session.status("imageEmbedder");
    expect(status.phase === "ready" && status.pinned).toBe(true);
    expect(session.status("poseLandmarker").phase).toBe("idle");
    session.dispose();
    expect(disposed).toEqual(["imageEmbedder"]);
    expect(session.status("imageEmbedder").phase).toBe("idle");
  });

  it("실패는 failed로 남고 자동 재시도하지 않으며 retry만 다시 시도한다", async () => {
    const calls: string[] = [];
    const session = createVisionSession({ loaders: loadersOf(calls, [], true), now: () => 1 });
    await expect(session.ensure("poseLandmarker")).rejects.toMatchObject({ code: "vision-model-timeout" });
    await expect(session.ensure("poseLandmarker")).rejects.toMatchObject({ code: "vision-model-timeout" });
    expect(calls).toEqual(["poseLandmarker"]);
    const failed = session.status("poseLandmarker");
    expect(failed.phase === "failed" && failed.failure.reasonKo).toBe("시간 초과");
    await session.retry("poseLandmarker");
    expect(calls).toEqual(["poseLandmarker", "poseLandmarker"]);
    expect(session.status("poseLandmarker").phase).toBe("failed");
  });

  it("LabFailure가 아닌 예외는 vision-model-load-failed로 감싼다", async () => {
    const loaders = loadersOf([], []);
    const session = createVisionSession({ loaders: { ...loaders, handLandmarker: async () => Promise.reject(new Error("wasm")) }, now: () => 5 });
    await expect(session.ensure("handLandmarker")).rejects.toMatchObject({ code: "vision-model-load-failed", at: 5 });
    const statuses = session.statuses();
    expect(statuses.handLandmarker.phase).toBe("failed");
    expect(toContractVisionStatus(statuses.handLandmarker)).toBeNull();
  });

  it("구독자는 상태 변화마다 호출된다", async () => {
    const session = createVisionSession({ loaders: loadersOf([], []) });
    let ticks = 0;
    const unsubscribe = session.subscribe(() => {
      ticks += 1;
    });
    await session.ensure("handLandmarker");
    expect(ticks).toBe(2);
    unsubscribe();
    session.dispose();
    expect(ticks).toBe(2);
  });

  it("계약 VisionStatus 변환과 손 방향 해석", () => {
    expect(toContractVisionStatus({ phase: "idle" })).toEqual({ phase: "idle" });
    expect(toContractVisionStatus({ phase: "loading", model: "poseLandmarker" })).toEqual({ phase: "loading", model: "poseLandmarker" });
    expect(toContractVisionStatus({ phase: "ready", model: "imageEmbedder", observedSha256: "x", pinned: true, delegate: "CPU" })).toEqual({ phase: "ready", model: "imageEmbedder", observedSha256: "x" });
    const failure = failVisible("c", "r", undefined, 1);
    expect(toContractVisionStatus({ phase: "failed", model: "poseLandmarker", failure })).toEqual({ phase: "failed", failure });
    expect(resolveHandSide("Left", { selfie: true })).toBe("left");
    expect(resolveHandSide("Left", { selfie: false })).toBe("right");
    expect(resolveHandSide("Unknown", { selfie: false })).toBeNull();
  });
});
