import { describe, expect, it } from "vitest";

import { failVisible } from "../../contracts";
import { createMockEngine } from "../../testing/mock-engine";
import { applyPlanFixture, minimalHumanoidModelFixture } from "../../testing/recipe-fixtures";

import { createThumbnailScheduler } from "./thumbnail-scheduler";

import type { ThumbnailSchedulerDeps } from "./thumbnail-scheduler";
import type { CharacterEngine, CharacterSource, PresetId, ThumbnailEntry, ThumbnailRequest } from "../../contracts";

function harness(engine: CharacterEngine | null, options: { keyVersion?: () => string; sourceFor?: ThumbnailSchedulerDeps["sourceFor"] } = {}) {
  const entries = new Map<PresetId, ThumbnailEntry>();
  const updates: Array<{ presetId: PresetId; entry: ThumbnailEntry }> = [];
  const scheduler = createThumbnailScheduler({
    engine: () => engine,
    planForPreset: () => applyPlanFixture(),
    cacheKeyFor: (presetId) => `${presetId}#${options.keyVersion?.() ?? "v1"}`,
    currentEntry: (presetId) => entries.get(presetId),
    onUpdate: (presetId, entry) => {
      entries.set(presetId, entry);
      updates.push({ presetId, entry });
    },
    ...(options.sourceFor ? { sourceFor: options.sourceFor } : {}),
  });
  return { scheduler, entries, updates };
}

describe("app/shell/thumbnail-scheduler", () => {
  it("동시 1개만 실행하고 가시 카드를 먼저 처리한다", async () => {
    const engine = createMockEngine({ holdThumbnails: true });
    const { scheduler, updates } = harness(engine);
    scheduler.request("hair/soft-bob");
    scheduler.request("hair/hime-cut");
    scheduler.request("eyes/almond", { visible: true });
    expect(scheduler.isRunning()).toBe(true);
    expect(scheduler.pending()).toBe(2);
    await Promise.resolve();
    expect(engine.pendingThumbnails()).toBe(1);
    engine.releaseThumbnail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 두 번째로 실행된 것은 가시 카드(eyes/almond)
    expect(engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => (call.args[0] as { presetId: string }).presetId)).toEqual([
      "hair/soft-bob",
      "eyes/almond",
    ]);
    engine.releaseThumbnail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    engine.releaseThumbnail();
    await scheduler.idle();
    const ready = updates.filter((update) => update.entry.status === "ready").map((update) => update.presetId);
    expect(ready).toEqual(["hair/soft-bob", "eyes/almond", "hair/hime-cut"]);
    expect(updates[0]?.entry.status).toBe("pending");
  });

  it("실패는 ThumbnailEntry.failed(reasonKo)로 노출하고 큐를 계속 진행한다", async () => {
    const engine = createMockEngine({
      failThumbnail: (req) => (req.presetId === "hair/hime-cut" ? failVisible("thumb-fail", "썸네일 렌더 실패(모의)", undefined, 0) : null),
    });
    const { scheduler, entries } = harness(engine);
    scheduler.request("hair/hime-cut");
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    expect(entries.get("hair/hime-cut")).toMatchObject({ status: "failed", reasonKo: "썸네일 렌더 실패(모의)" });
    expect(entries.get("hair/soft-bob")?.status).toBe("ready");
    expect(entries.get("hair/soft-bob")?.raster?.width).toBe(128);
  });

  it("같은 cacheKey로 ready이면 건너뛰고, 키가 바뀌면 다시 만든다", async () => {
    let version = "a";
    const engine = createMockEngine();
    const { scheduler } = harness(engine, { keyVersion: () => version });
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    expect(engine.calls.filter((call) => call.method === "renderThumbnail")).toHaveLength(1);
    version = "b";
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    expect(engine.calls.filter((call) => call.method === "renderThumbnail")).toHaveLength(2);
  });

  it("엔진이 없으면 failed 사유를 기록한다", async () => {
    const { scheduler, entries } = harness(null);
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    expect(entries.get("hair/soft-bob")).toMatchObject({ status: "failed", reasonKo: expect.stringContaining("엔진이 준비되지") });
  });

  it("대기 중 중복 요청은 하나로 합치고 cancel/clear로 뺀다", async () => {
    const engine = createMockEngine({ holdThumbnails: true });
    const { scheduler } = harness(engine);
    scheduler.request("hair/soft-bob");
    scheduler.request("hair/hime-cut");
    scheduler.request("hair/hime-cut", { visible: true });
    expect(scheduler.pending()).toBe(1);
    scheduler.cancel("hair/hime-cut");
    expect(scheduler.pending()).toBe(0);
    scheduler.request("eyes/almond");
    scheduler.clear();
    expect(scheduler.pending()).toBe(0);
    engine.releaseThumbnail();
    await scheduler.idle();
  });
  describe("지오메트리 프리셋 임시 소스(thumbnailSources)", () => {
    const hairSource: CharacterSource = { kind: "procedural", model: minimalHumanoidModelFixture() };
    const requestsOf = (engine: ReturnType<typeof createMockEngine>): ThumbnailRequest[] =>
      engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => call.args[0] as ThumbnailRequest);

    it("엔진이 thumbnailSources를 지원하면 sourceFor 결과를 요청에 싣고, null은 싣지 않는다", async () => {
      const engine = createMockEngine({ thumbnailSources: true });
      const asked: PresetId[] = [];
      const { scheduler, entries } = harness(engine, {
        sourceFor: (presetId) => {
          asked.push(presetId);
          return presetId.startsWith("hair/") ? hairSource : null;
        },
      });
      scheduler.request("hair/soft-bob");
      scheduler.request("eyes/almond");
      await scheduler.idle();
      const [hair, eyes] = requestsOf(engine);
      expect(hair?.source).toBe(hairSource);
      expect(eyes && "source" in eyes).toBe(false);
      expect(asked).toEqual(["hair/soft-bob", "eyes/almond"]);
      expect(entries.get("hair/soft-bob")?.status).toBe("ready");
    });

    it("엔진이 지원을 선언하지 않으면 sourceFor를 부르지 않는다(현재 소스로 그린다)", async () => {
      for (const engine of [createMockEngine(), createMockEngine({ thumbnailSources: false })]) {
        let calls = 0;
        const { scheduler } = harness(engine, {
          sourceFor: () => {
            calls += 1;
            return hairSource;
          },
        });
        scheduler.request("hair/soft-bob");
        await scheduler.idle();
        expect(calls).toBe(0);
        expect(requestsOf(engine).every((request) => !("source" in request))).toBe(true);
      }
    });

    it("sourceFor가 비동기이거나 던져도 해당 카드만 failed(reasonKo)가 되고 큐는 계속된다", async () => {
      const engine = createMockEngine({ thumbnailSources: true });
      const { scheduler, entries } = harness(engine, {
        sourceFor: async (presetId) => {
          if (presetId === "hair/hime-cut") throw failVisible("thumb-source-failed", "임시 소스를 만들지 못했습니다.", undefined, 0);
          return hairSource;
        },
      });
      scheduler.request("hair/hime-cut");
      scheduler.request("hair/soft-bob");
      await scheduler.idle();
      expect(entries.get("hair/hime-cut")).toMatchObject({ status: "failed", reasonKo: "임시 소스를 만들지 못했습니다." });
      expect(entries.get("hair/soft-bob")?.status).toBe("ready");
      expect(requestsOf(engine)).toHaveLength(1);
    });
  });
});
