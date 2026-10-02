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

  describe("dispose는 진행 중인 모델 로드를 무효화한다", () => {
    interface Deferred<T> {
      readonly promise: Promise<T>;
      resolve(value: T): void;
      reject(error: unknown): void;
    }
    function deferred<T>(): Deferred<T> {
      let resolve: (value: T) => void = () => undefined;
      let reject: (error: unknown) => void = () => undefined;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }
    const pose: PoseDetectorPort = { detect: async () => null };
    /** 호출 순서대로 deferred를 하나씩 소비하는 포즈 로더 */
    function poseLoaders(queue: Array<Deferred<LoadedModel<PoseDetectorPort>>>, calls: string[]): VisionLoaders {
      const base = loadersOf([], []);
      return {
        ...base,
        poseLandmarker: () => {
          calls.push("poseLandmarker");
          const next = queue.shift();
          if (!next) throw new Error("테스트 큐 소진");
          return next.promise;
        },
      };
    }

    it("로드 중 dispose하면 늦게 끝난 모델은 해제되고 ready 상태·loaded 보관이 일어나지 않는다", async () => {
      const disposed: string[] = [];
      const calls: string[] = [];
      const first = deferred<LoadedModel<PoseDetectorPort>>();
      const events: Array<[VisionModelKey, VisionModelStatus["phase"]]> = [];
      const session = createVisionSession({ loaders: poseLoaders([first], calls), onStatus: (key, status) => events.push([key, status.phase]), now: () => 1 });
      const inFlight = session.ensure("poseLandmarker");
      const settled = inFlight.then(
        () => "resolved",
        (error: unknown) => error,
      );
      session.dispose();
      first.resolve(loaded("poseLandmarker", pose, disposed));
      // 폐기된 세션의 대기자는 해제 사유 LabFailure로 끝난다(해제된 모델을 받아 쓰지 않는다)
      expect(await settled).toMatchObject({ code: "vision-session-disposed" });
      expect(disposed).toEqual(["poseLandmarker"]);
      expect(session.status("poseLandmarker").phase).toBe("idle");
      expect(events.filter(([key]) => key === "poseLandmarker").map(([, phase]) => phase)).toEqual(["loading", "idle"]);
    });

    it("폐기 후 늦게 실패해도 failed를 보고하지 않는다", async () => {
      const first = deferred<LoadedModel<PoseDetectorPort>>();
      const events: VisionModelStatus["phase"][] = [];
      const session = createVisionSession({ loaders: poseLoaders([first], []), onStatus: (key, status) => key === "poseLandmarker" && events.push(status.phase), now: () => 1 });
      const settled = session.ensure("poseLandmarker").then(
        () => "resolved",
        (error: unknown) => error,
      );
      session.dispose();
      first.reject(new Error("wasm"));
      expect(await settled).toMatchObject({ code: "vision-session-disposed" });
      expect(events).toEqual(["loading", "idle"]);
      expect(session.status("poseLandmarker").phase).toBe("idle");
    });

    it("dispose 뒤 새로 시작한 로드를 이전(폐기된) 로드의 완료가 덮어쓰지 않고 세션은 재사용된다", async () => {
      const disposed: string[] = [];
      const calls: string[] = [];
      const stale = deferred<LoadedModel<PoseDetectorPort>>();
      const fresh = deferred<LoadedModel<PoseDetectorPort>>();
      const session = createVisionSession({ loaders: poseLoaders([stale, fresh], calls), now: () => 1 });
      const staleResult = session.ensure("poseLandmarker").then(
        () => "resolved",
        (error: unknown) => error,
      );
      session.dispose();
      const freshPromise = session.ensure("poseLandmarker");
      expect(calls).toEqual(["poseLandmarker", "poseLandmarker"]);
      expect(session.status("poseLandmarker").phase).toBe("loading");
      stale.resolve(loaded("poseLandmarker", pose, disposed));
      expect(await staleResult).toMatchObject({ code: "vision-session-disposed" });
      // 폐기된 로드의 완료가 새 로드의 상태(loading)와 pending 항목을 건드리지 않는다
      expect(session.status("poseLandmarker").phase).toBe("loading");
      expect(session.ensure("poseLandmarker")).toBe(freshPromise);
      expect(calls).toEqual(["poseLandmarker", "poseLandmarker"]);
      const freshModel = loaded("poseLandmarker", pose, disposed);
      fresh.resolve(freshModel);
      expect(await freshPromise).toBe(freshModel);
      expect(session.status("poseLandmarker").phase).toBe("ready");
      // 폐기된 쪽 모델 하나만 해제됐고, 새 모델은 살아 있다
      expect(disposed).toEqual(["poseLandmarker"]);
      session.dispose();
      expect(disposed).toEqual(["poseLandmarker", "poseLandmarker"]);
    });
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
