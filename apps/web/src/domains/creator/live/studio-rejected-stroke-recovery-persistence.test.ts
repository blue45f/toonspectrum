import { describe, expect, it, vi } from "vitest";

import {
  createStudioRejectedStrokeRecoveryRepository,
  acquireStudioRejectedStrokeRecoveryRepository,
  parseStudioRejectedStrokeRecovery,
  studioRejectedStrokeRecoveryScopeKey,
} from "./studio-rejected-stroke-recovery-persistence";
import { createStudioAutosaveSqliteStore } from "../studio-autosave-sqlite-store";
import { openStudioLocalDatabase } from "../studio-local-database";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import type { StudioRejectedStrokeRecord } from "../studio-rejected-stroke-recovery";

const scopeKey = studioRejectedStrokeRecoveryScopeKey({ ownerId: "artist", documentKey: "draft", projectId: "project", documentId: "document" });

function record(id = "stroke-1", scope = scopeKey): StudioRejectedStrokeRecord {
  return {
    id, scopeKey: scope, pageId: "page", sourceGeneration: 7, restoredStrokeId: `restored-${id}`,
    provider: "WebGPU", reason: "device-lost", at: 1,
    stroke: {
      id, type: "draw", kind: "freehand", mode: "pen", points: [0, 0, 10, 12],
      pressures: [0.2, 0.9], tiltXs: [5, 15], stroke: "#123456", strokeWidth: 9,
      brush: "pencil", sampleTimeOffsets: [0, 13],
    },
  };
}

function storage() {
  const values = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => { values.set(key, value); }),
    delete: vi.fn(async (key) => { values.delete(key); }),
  };
  return { store, values };
}

describe("실패 획 SQLite KV 영속 계약", () => {
  it("새 저장소 인스턴스에서 8개가 넘는 원본과 필압·기울기를 정확히 다시 읽는다", async () => {
    const { store } = storage();
    const first = createStudioRejectedStrokeRecoveryRepository(store);
    for (let index = 0; index < 12; index += 1) await first.save(record(`stroke-${index}`));
    const reopened = createStudioRejectedStrokeRecoveryRepository(store);
    const restored = await reopened.load(scopeKey);
    expect(restored).toHaveLength(12);
    expect(restored.find((candidate) => candidate.id === "stroke-0")?.stroke).toEqual(record("stroke-0").stroke);
    expect(restored[0]?.durability).toBe("saved");
    expect(Object.isFrozen(restored[0]?.stroke.points)).toBe(true);
    expect(restored[0]?.sourceGeneration).toBe(7);
  });

  it("서로 다른 계정·프로젝트·문서의 같은 페이지 및 획 ID를 격리한다", async () => {
    const { store } = storage();
    const repository = createStudioRejectedStrokeRecoveryRepository(store);
    const scopes = [
      { ownerId: "artist", documentKey: "draft", projectId: "project", documentId: "document" },
      { ownerId: "other", documentKey: "draft", projectId: "project", documentId: "document" },
      { ownerId: "artist", documentKey: "draft", projectId: "other-project", documentId: "document" },
      { ownerId: "artist", documentKey: "draft", projectId: "project", documentId: "other-document" },
    ].map(studioRejectedStrokeRecoveryScopeKey);
    expect(new Set(scopes).size).toBe(4);
    await Promise.all(scopes.map((scope) => repository.save(record("same-id", scope))));
    await repository.delete(record("same-id", scopes[0]));
    expect(await repository.load(scopeKey)).toEqual([]);
    for (const scope of scopes.slice(1)) expect(await repository.load(scope)).toHaveLength(1);
  });

  it("서로 다른 저장소 인스턴스의 동시 추가가 최신 원본을 다시 읽고 병합한다", async () => {
    const { store } = storage();
    const left = createStudioRejectedStrokeRecoveryRepository(store);
    const right = createStudioRejectedStrokeRecoveryRepository(store);
    await Promise.all([left.save(record("left")), right.save(record("right"))]);
    expect((await left.load(scopeKey)).map((candidate) => candidate.id).sort()).toEqual(["left", "right"]);
    await Promise.all([left.delete(record("left")), right.save(record("third"))]);
    expect((await right.load(scopeKey)).map((candidate) => candidate.id).sort()).toEqual(["right", "third"]);
  });

  it("문서 자동저장이 확인되기 전에는 복구를 눌러도 원본을 지우지 않는다", async () => {
    const { store } = storage();
    let durable = false;
    const isRestoredStrokeDurable = vi.fn(async () => durable);
    const repository = createStudioRejectedStrokeRecoveryRepository(store, { isRestoredStrokeDurable });
    await repository.save(record());
    await repository.confirmRestored(record());
    expect(await repository.load(scopeKey)).toHaveLength(1);
    durable = true;
    await repository.confirmRestored(record());
    expect(await repository.load(scopeKey)).toEqual([]);
  });

  it("재시작 때 이미 자동저장된 복구 획의 원본만 정리한다", async () => {
    const { store } = storage();
    const writer = createStudioRejectedStrokeRecoveryRepository(store);
    await writer.save(record("saved"));
    await writer.save(record("not-saved"));
    const reopened = createStudioRejectedStrokeRecoveryRepository(store, {
      isRestoredStrokeDurable: async (candidate) => candidate.restoredStrokeId === "restored-saved",
    });
    expect((await reopened.load(scopeKey)).map((candidate) => candidate.id)).toEqual(["not-saved"]);
    expect((await writer.load(scopeKey)).map((candidate) => candidate.id)).toEqual(["not-saved"]);
  });

  it("손상된 기존 데이터 위에 빈 목록이나 새 획으로 덮어쓰지 않는다", async () => {
    const { store, values } = storage();
    values.set(scopeKey, '{"version":99,"records":[]}');
    const repository = createStudioRejectedStrokeRecoveryRepository(store);
    await expect(repository.load(scopeKey)).rejects.toThrow();
    await expect(repository.save(record())).rejects.toThrow();
    await expect(repository.delete(record())).rejects.toThrow();
    expect(values.get(scopeKey)).toBe('{"version":99,"records":[]}');
    expect(store.set).not.toHaveBeenCalled();
  });

  it("잘못된 scope·복구 ID·좌표·중복 원본은 조용히 버리지 않고 읽기 오류로 알린다", () => {
    const envelope = (records: unknown[], scope = scopeKey) => JSON.stringify({ version: 1, scopeKey: scope, records });
    expect(() => parseStudioRejectedStrokeRecovery(envelope([record()], "other"), scopeKey)).toThrow();
    expect(() => parseStudioRejectedStrokeRecovery(envelope([{ ...record(), restoredStrokeId: "stroke-1" }]), scopeKey)).toThrow();
    expect(() => parseStudioRejectedStrokeRecovery(envelope([{ ...record(), stroke: { ...record().stroke, points: [0, null] } }]), scopeKey)).toThrow();
    expect(() => parseStudioRejectedStrokeRecovery(envelope([record(), record()]), scopeKey)).toThrow();
  });

  it("저장 공간 오류 뒤 같은 원본의 재시도를 허용한다", async () => {
    const { store } = storage();
    vi.mocked(store.set).mockRejectedValueOnce(new Error("quota"));
    const repository = createStudioRejectedStrokeRecoveryRepository(store);
    await expect(repository.save(record())).rejects.toThrow("quota");
    await repository.save(record());
    expect(await repository.load(scopeKey)).toHaveLength(1);
  });

  it.each([false, true])("실제 SQLite에서 정확한 문서·페이지의 자동저장 뒤 정리한다 (준비 입력=%s)", async (admissionCheckpoint) => {
    const database = await openStudioLocalDatabase({ vfs: "memory" });
    try {
      const scope = { ownerId: "artist", documentKey: "draft", projectId: "project", documentId: "document" };
      const repository = await acquireStudioRejectedStrokeRecoveryRepository(scope, { acquireDatabase: async () => database });
      const autosave = createStudioAutosaveSqliteStore(database);
      const original = admissionCheckpoint ? { ...record(), admissionCheckpoint: true as const } : record();
      await repository.save(original);
      const payload = (pageId: string) => ({
        version: 2 as const, savedAt: "2026-09-26T05:00:00.000Z", currentPageId: pageId,
        pagesList: [{ id: pageId, canvasH: 2_000, elements: [{ ...original.stroke, id: admissionCheckpoint ? original.id : original.restoredStrokeId }] }],
      });
      await autosave.write("other-document", payload("page"));
      await repository.confirmRestored(original);
      expect(await repository.load(scopeKey)).toHaveLength(1);
      await autosave.write("draft", payload("other-page"));
      await repository.confirmRestored(original);
      expect(await repository.load(scopeKey)).toHaveLength(1);
      await autosave.write("draft", {
        ...payload("page"),
        pagesList: [{ id: "page", canvasH: 2_000 }, ...payload("other-page").pagesList],
      });
      await repository.confirmRestored(original);
      expect(await repository.load(scopeKey)).toHaveLength(1);
      await autosave.write("draft", payload("page"));
      await repository.confirmRestored(original);
      expect(await repository.load(scopeKey)).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
