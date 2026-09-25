// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dismissStudioRejectedStroke,
  getStudioRejectedStrokeRecords,
  hasUnpersistedStudioPendingStrokeCheckpoints,
  recordStudioRejectedStroke,
  resetStudioRejectedStrokeRecovery,
  restoreStudioRejectedStroke,
  getStudioRejectedStrokeStorageError,
  retryStudioRejectedStrokeStorage,
} from "./studio-rejected-stroke-recovery";
import {
  createStudioRejectedStrokeRecoveryRepository,
  studioRejectedStrokeRecoveryScopeKey,
} from "./live/studio-rejected-stroke-recovery-persistence";
import {
  restoreStudioRejectedStrokeIntoDocument,
  studioRejectedLiveSurfaceMessage,
  useStudioRejectedStrokeRecoveryHost,
} from "./studio-rejected-stroke-recovery-host";

import type { DrawEl } from "./studio-element-model";
import type { StudioRejectedStrokeRecord } from "./studio-rejected-stroke-recovery";
import type { StudioRejectedStrokeRecoveryRepository } from "./live/studio-rejected-stroke-recovery-persistence";

const stroke = {
  id: "rejected-1",
  type: "draw",
  kind: "freehand",
  mode: "pen",
  points: [0, 0, 10, 10, 20, 18],
  pressures: [0.5, 0.5, 0.5],
  stroke: "#111827",
  strokeWidth: 6,
} as DrawEl;

function record(pageId: string): StudioRejectedStrokeRecord {
  return Object.freeze({
    id: stroke.id,
    pageId,
    stroke: Object.freeze(structuredClone(stroke)),
    provider: "WebGPU 라이브 잉크",
    reason: "device-lost",
    at: 1,
  });
}

afterEach(() => {
  cleanup();
  resetStudioRejectedStrokeRecovery();
});

describe("restoreStudioRejectedStrokeIntoDocument", () => {
  it("re-queues the geometry under a fresh id through the ordinary deferred commit", () => {
    const queued: DrawEl[] = [];
    const outcome = restoreStudioRejectedStrokeIntoDocument(
      record("page-1"),
      "page-1",
      (finished) => { queued.push(finished); return true; },
      () => "fresh-id",
    );
    expect(outcome).toEqual({ status: "restored", recordId: "rejected-1", restoredStrokeId: "fresh-id" });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ id: "fresh-id", points: [0, 0, 10, 10, 20, 18] });
    // The document receives its own mutable copy, never the frozen snapshot.
    expect(Object.isFrozen(queued[0]!.points)).toBe(false);
  });

  it("refuses a record from another page and queues nothing", () => {
    const queue = vi.fn();
    expect(restoreStudioRejectedStrokeIntoDocument(record("page-2"), "page-1", queue)).toMatchObject({
      status: "refused",
      recordId: "rejected-1",
    });
    expect(queue).not.toHaveBeenCalled();
  });

  it("페이지 ID가 같아도 프로젝트 scope가 다르면 복구하지 않는다", () => {
    const queue = vi.fn();
    expect(restoreStudioRejectedStrokeIntoDocument(
      { ...record("page-1"), scopeKey: "project-a", restoredStrokeId: "recovered-1" },
      "page-1", queue, () => "unused", { scopeKey: "project-b" },
    )).toMatchObject({ status: "refused" });
    expect(queue).not.toHaveBeenCalled();
  });

  it("복구 ID가 이미 현재 문서나 커밋 대기에 있으면 같은 획을 다시 넣지 않는다", () => {
    const queue = vi.fn();
    const recovered = { ...record("page-1"), scopeKey: "project", restoredStrokeId: "recovered-1" };
    expect(restoreStudioRejectedStrokeIntoDocument(
      recovered, "page-1", queue, () => "unused",
      { scopeKey: "project", hasRestoredStroke: (pageId, id) => pageId === "page-1" && id === "recovered-1" },
    )).toEqual({ status: "restored", recordId: stroke.id, restoredStrokeId: "recovered-1" });
    expect(queue).not.toHaveBeenCalled();
  });
});

describe("실패 획 복구 호스트의 영속 세대 경계", () => {
  const scope = { ownerId: "artist", documentKey: "draft", projectId: "project", documentId: "document" };

  function repository() {
    const data = new Map<string, string>();
    return createStudioRejectedStrokeRecoveryRepository({
      get: async (key) => data.get(key) ?? null,
      set: async (key, value) => { data.set(key, value); },
      delete: async (key) => { data.delete(key); },
    });
  }

  it("재마운트와 메모리 초기화 뒤 저장된 획을 같은 복구 ID로 제공한다", async () => {
    const store = repository();
    const acquireRepository = async () => store;
    const queue = vi.fn((finished: DrawEl) => finished.type === "draw");
    const mount = () => renderHook(() => useStudioRejectedStrokeRecoveryHost({
      activePageId: "page-1", queueDeferredStrokeCommit: queue,
      recoveryScope: scope, getDocumentGeneration: () => 17, acquireRepository,
    }));
    const first = mount();
    act(() => { first.result.current.salvageRejectedStroke(stroke, "WebGPU", "device-lost"); });
    await waitFor(() => expect(getStudioRejectedStrokeRecords()[0]?.durability).toBe("saved"));
    const savedRecord = getStudioRejectedStrokeRecords()[0];
    expect(savedRecord?.sourceGeneration).toBe(17);
    act(() => { expect(restoreStudioRejectedStroke(stroke.id).status).toBe("restored"); });
    expect(queue.mock.calls[0]?.[0]).toMatchObject({ id: savedRecord?.restoredStrokeId });
    first.unmount();
    resetStudioRejectedStrokeRecovery();
    const second = mount();
    await waitFor(() => expect(getStudioRejectedStrokeRecords()).toHaveLength(1));
    expect(getStudioRejectedStrokeRecords()[0]?.restoredStrokeId).toBe(savedRecord?.restoredStrokeId);
    second.unmount();
  });

  it("완성 대기 획은 실제 새로고침 뒤에도 같은 센서 원본과 복구 ID로 남는다", async () => {
    const store = repository();
    const mount = () => renderHook(() => useStudioRejectedStrokeRecoveryHost({
      activePageId: "page-1", queueDeferredStrokeCommit: () => true,
      recoveryScope: scope, acquireRepository: async () => store,
    }));
    const first = mount();
    act(() => { first.result.current.checkpointPendingStroke(stroke, "page-1", 17); });
    expect(getStudioRejectedStrokeRecords()).toHaveLength(0);
    expect(hasUnpersistedStudioPendingStrokeCheckpoints()).toBe(true);
    await waitFor(() => expect(hasUnpersistedStudioPendingStrokeCheckpoints()).toBe(false));
    const saved = await store.load(studioRejectedStrokeRecoveryScopeKey(scope));
    expect(saved[0]).toMatchObject({ admissionCheckpoint: true, sourceGeneration: 17, stroke });
    // 수락 직후라도 autosave 확인 전에는 기기 원본을 지우지 않는다.
    act(() => { first.result.current.releasePendingStrokeCheckpoint(stroke.id, true); });
    expect(await store.load(studioRejectedStrokeRecoveryScopeKey(scope))).toHaveLength(1);
    first.unmount();
    resetStudioRejectedStrokeRecovery();
    const second = mount();
    await waitFor(() => expect(getStudioRejectedStrokeRecords()).toHaveLength(1));
    expect(getStudioRejectedStrokeRecords()[0]?.restoredStrokeId).toBe(saved[0]?.restoredStrokeId);
    expect(getStudioRejectedStrokeRecords()[0]?.stroke).toEqual(stroke);
    second.unmount();
  });

  it("수락 후 provider 실패도 보관 원본을 노출하며 이미 문서에 있는 원래 id는 복구 중복을 막는다", async () => {
    const store = repository();
    const queue = vi.fn(() => true);
    const view = renderHook(() => useStudioRejectedStrokeRecoveryHost({
      activePageId: "page-1", queueDeferredStrokeCommit: queue,
      recoveryScope: scope, acquireRepository: async () => store,
      hasRestoredStroke: (_pageId, id) => id === stroke.id,
    }));
    act(() => { view.result.current.checkpointPendingStroke(stroke, "page-1", 17); });
    await waitFor(() => expect(hasUnpersistedStudioPendingStrokeCheckpoints()).toBe(false));
    act(() => { view.result.current.releasePendingStrokeCheckpoint(stroke.id, true); });
    expect(getStudioRejectedStrokeRecords()).toHaveLength(0);
    act(() => { expect(view.result.current.salvageRejectedStroke(stroke, "WebGPU", "device-lost").action).toBe("salvage"); });
    expect(getStudioRejectedStrokeRecords()).toHaveLength(1);
    act(() => { expect(restoreStudioRejectedStroke(stroke.id).status).toBe("restored"); });
    expect(queue).not.toHaveBeenCalled();
    view.unmount();
  });

  it("준비 대기 입력의 늦은 실패도 캡처한 문서·페이지·세대에 저장한다", async () => {
    const store = repository();
    const mounted = renderHook(({ documentId, generation }) => useStudioRejectedStrokeRecoveryHost({
      activePageId: documentId === "document" ? "page-1" : "page-2",
      queueDeferredStrokeCommit: () => true,
      recoveryScope: { ...scope, documentId }, getDocumentGeneration: () => generation,
      acquireRepository: async () => store,
    }), { initialProps: { documentId: "document", generation: 17 } });
    const originalSalvage = mounted.result.current.salvageRejectedStroke;
    mounted.rerender({ documentId: "other-document", generation: 99 });
    act(() => { originalSalvage(stroke, "Hokusai", "provider-failed", "page-1", 17); });
    await waitFor(async () => {
      expect(await store.load(studioRejectedStrokeRecoveryScopeKey(scope))).toEqual([
        expect.objectContaining({ id: stroke.id, pageId: "page-1", sourceGeneration: 17 }),
      ]);
    });
    expect(getStudioRejectedStrokeRecords()).toHaveLength(0);
    mounted.unmount();
  });

  it("문서 전환 뒤 늦게 도착한 이전 읽기가 현재 목록을 오염시키지 않는다", async () => {
    const oldScope = studioRejectedStrokeRecoveryScopeKey(scope);
    let finishRead: (records: readonly StudioRejectedStrokeRecord[]) => void = () => undefined;
    const delayed = new Promise<readonly StudioRejectedStrokeRecord[]>((resolve) => { finishRead = resolve; });
    const store = repository();
    const acquireRepository = async (): Promise<StudioRejectedStrokeRecoveryRepository> => ({
      ...store, load: async (key) => key === oldScope ? delayed : [],
    });
    const view = renderHook(({ documentId }) => useStudioRejectedStrokeRecoveryHost({
      activePageId: "page-1", queueDeferredStrokeCommit: () => true,
      recoveryScope: { ...scope, documentId }, acquireRepository,
    }), { initialProps: { documentId: "document" } });
    view.rerender({ documentId: "other-document" });
    await act(async () => {
      finishRead([{ ...record("page-1"), scopeKey: oldScope, sourceGeneration: 1, restoredStrokeId: "recover-old", durability: "saved" }]);
      await delayed;
    });
    expect(getStudioRejectedStrokeRecords()).toEqual([]);
  });

  it("읽기 실패를 표시하고 명시적인 재시도로 원본을 다시 읽는다", async () => {
    const scopeKey = studioRejectedStrokeRecoveryScopeKey(scope);
    const store = repository();
    await store.save({ ...record("page-1"), scopeKey, sourceGeneration: 2, restoredStrokeId: "recover-read" });
    const acquireRepository = vi.fn().mockRejectedValueOnce(new Error("worker unavailable")).mockResolvedValue(store);
    renderHook(() => useStudioRejectedStrokeRecoveryHost({
      activePageId: "page-1", queueDeferredStrokeCommit: () => true, recoveryScope: scope, acquireRepository,
    }));
    await waitFor(() => expect(getStudioRejectedStrokeStorageError()).toContain("읽지 못했습니다"));
    act(() => { retryStudioRejectedStrokeStorage(); });
    await waitFor(() => expect(getStudioRejectedStrokeRecords()).toHaveLength(1));
    expect(getStudioRejectedStrokeStorageError()).toBeNull();
  });
});

describe("useStudioRejectedStrokeRecoveryHost", () => {
  it("registers the restorer for the mount, follows the latest page, and unregisters on unmount", () => {
    const queue = vi.fn(() => true);
    const view = renderHook(
      (input: { activePageId: string }) =>
        useStudioRejectedStrokeRecoveryHost({
          activePageId: input.activePageId,
          queueDeferredStrokeCommit: queue,
        }),
      { initialProps: { activePageId: "page-1" } },
    );

    // Salvage uses the active page by default and an explicit page when given.
    expect(view.result.current.salvageRejectedStroke(stroke, "WebGPU 라이브 잉크", "timeout")).toEqual({
      action: "salvage",
      strokeId: "rejected-1",
    });
    expect(getStudioRejectedStrokeRecords()[0]).toMatchObject({ pageId: "page-1" });
    dismissStudioRejectedStroke("rejected-1");
    recordStudioRejectedStroke({ stroke, pageId: "page-2", provider: "습식 매체", reason: "x" });

    // Page 2 record while page 1 is active → refused; after switching pages → restored.
    expect(restoreStudioRejectedStroke("rejected-1")).toMatchObject({ status: "refused" });
    view.rerender({ activePageId: "page-2" });
    expect(restoreStudioRejectedStroke("rejected-1")).toMatchObject({ status: "restored" });
    expect(queue).toHaveBeenCalledTimes(1);
    expect(getStudioRejectedStrokeRecords()).toHaveLength(0);

    recordStudioRejectedStroke({ stroke, pageId: "page-2", provider: "습식 매체", reason: "x" });
    view.unmount();
    expect(restoreStudioRejectedStroke("rejected-1")).toEqual({
      status: "unavailable",
      recordId: "rejected-1",
    });
  });

  it("keeps the exact recovery record when another page still owns the commit queue", () => {
    const queue = vi.fn(() => false);
    renderHook(() => useStudioRejectedStrokeRecoveryHost({
      activePageId: "page-1", queueDeferredStrokeCommit: queue,
    }));
    recordStudioRejectedStroke({ stroke, pageId: "page-1", provider: "페이지 동기화", reason: "busy" });
    expect(restoreStudioRejectedStroke(stroke.id)).toMatchObject({ status: "refused" });
    expect(getStudioRejectedStrokeRecords()[0]?.stroke.points).toEqual(stroke.points);
    queue.mockReturnValue(true);
    expect(restoreStudioRejectedStroke(stroke.id)).toMatchObject({ status: "restored" });
    expect(getStudioRejectedStrokeRecords()).toHaveLength(0);
  });
});

describe("studioRejectedLiveSurfaceMessage", () => {
  it("tells the user whether the finished mark survived", () => {
    expect(studioRejectedLiveSurfaceMessage("WebGPU 라이브 잉크", "사유: timeout", true)).toContain(
      "'획 복구'로 되살릴 수 있습니다",
    );
    expect(studioRejectedLiveSurfaceMessage("WebGPU 라이브 잉크", "사유: timeout", false)).toContain(
      "현재 획을 취소했습니다",
    );
  });
});
