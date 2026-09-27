/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyCharacterRecipe } from "../../character-shaper/character-shaper-recipe";
import { createCharacterDocumentV2, projectCharacterRecipeV1 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3, serializeCharacterDocumentV3 } from "../document/character-document-v3";
import { CharacterDocumentV3Repository } from "../document/character-document-v3-repository";
import { useCharacterAuthoringAuthority } from "./use-character-authoring-authority";

import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type { CharacterDocumentV3SaveReceipt } from "../document/character-document-v3-repository";
import type { StudioAsyncKeyValueStore } from "../../studio-local-database";

function document(documentId = "character:persistence-a", revision = 1): CharacterDocumentV3 {
  const recipe = createEmptyCharacterRecipe();
  return migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId,
    revision,
    model: {
      assetId: "hero", assetVersion: "1", contentSha256: null, mode: "canonical",
      topologyFamily: "toon-standard", topologyRevision: "topology:v1",
      rigRevision: "rig:v1", morphRevision: "morph:v1", rendererRevision: "renderer:v1",
    },
    compatibility: {
      grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "manifest:v1",
    },
    recipe: projectCharacterRecipeV1(recipe),
    colors: recipe.colors,
    now: "2026-09-27T00:00:00.000Z",
  }));
}

function fixture() {
  const rows = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => { rows.set(key, value); },
    delete: async (key) => { rows.delete(key); },
  };
  const repository = new CharacterDocumentV3Repository({ storeFactory: async () => store });
  return { rows, repository };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("대기 작업이 초기화되지 않았습니다."); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("캐릭터 저작 문서 저장 수명주기", () => {
  it("취소된 자동저장 타이머를 저장 완료로 간주하지 않는다", async () => {
    const f = fixture();
    const source = document();
    const hook = renderHook(({ autosave }) => useCharacterAuthoringAuthority(source, "fp:a", {
      repository: f.repository, autosave,
    }), { initialProps: { autosave: true } });
    await flush();
    expect(hook.result.current.hydrated).toBe(true);
    hook.rerender({ autosave: false });
    hook.rerender({ autosave: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(f.rows.has(source.documentId)).toBe(true);
    expect(hook.result.current.persistenceStatus).toBe("saved");
  });

  it("같은 revision을 가진 다른 캐릭터도 각각 자동저장한다", async () => {
    const f = fixture();
    const first = document();
    const second = document("character:persistence-b");
    const hook = renderHook(({ source }) => useCharacterAuthoringAuthority(source, "fp:a", {
      repository: f.repository,
    }), { initialProps: { source: first } });
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(f.rows.has(first.documentId)).toBe(true);
    hook.rerender({ source: second });
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(f.rows.has(second.documentId)).toBe(true);
  });

  it("복원 전 저장 요청으로 기존 데이터를 덮어쓰지 않는다", async () => {
    const f = fixture();
    const load = deferred<CharacterDocumentV3 | null>();
    vi.spyOn(f.repository, "load").mockReturnValueOnce(load.promise);
    const save = vi.spyOn(f.repository, "save");
    const hook = renderHook(() => useCharacterAuthoringAuthority(document(), "fp:a", {
      repository: f.repository, autosave: false,
    }));
    let requested: Promise<boolean> = Promise.resolve(true);
    act(() => { requested = hook.result.current.saveNow(); });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { load.resolve(null); await requested; });
    expect(await requested).toBe(false);
  });

  it("이전 캐릭터의 늦은 저장 완료가 새 캐릭터의 복원 상태를 바꾸지 않는다", async () => {
    const f = fixture();
    const first = document();
    const second = document("character:persistence-b");
    const hook = renderHook(({ source }) => useCharacterAuthoringAuthority(source, "fp:a", {
      repository: f.repository, autosave: false,
    }), { initialProps: { source: first } });
    await flush();
    const save = deferred<CharacterDocumentV3SaveReceipt>();
    const load = deferred<CharacterDocumentV3 | null>();
    vi.spyOn(f.repository, "save").mockReturnValueOnce(save.promise);
    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => { pending = hook.result.current.saveNow(); });
    vi.spyOn(f.repository, "load").mockReturnValueOnce(load.promise);
    hook.rerender({ source: second });
    await act(async () => {
      save.resolve({ status: "saved", documentId: first.documentId, revision: 2, byteLength: 100 });
      await pending;
    });
    expect(hook.result.current.hydrated).toBe(false);
    expect(hook.result.current.persistenceStatus).toBe("loading");
    expect(await pending).toBe(false);
    await act(async () => { load.resolve(null); });
  });

  it("복원 실패 후 기본 문서를 자동저장해 원본을 잃지 않는다", async () => {
    const f = fixture();
    vi.spyOn(f.repository, "load").mockRejectedValueOnce(new Error("저장소 복원 실패"));
    const save = vi.spyOn(f.repository, "save");
    const hook = renderHook(() => useCharacterAuthoringAuthority(document(), "fp:a", {
      repository: f.repository,
    }));
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(hook.result.current.persistenceStatus).toBe("error");
    expect(save).not.toHaveBeenCalled();
  });

  it("과거 백업 복원은 새 revision으로 확정하고 실행 취소할 수 있다", async () => {
    const f = fixture();
    const source = document("character:persistence-a", 10);
    const hook = renderHook(() => useCharacterAuthoringAuthority(source, "fp:a", {
      repository: f.repository, autosave: false,
    }));
    await flush();
    act(() => {
      const current = hook.result.current.snapshot.document;
      hook.result.current.dispatch({
        commandId: "test/iris", label: "눈 색 변경", source: "user",
        expectedDocumentId: current.documentId, expectedRevision: current.revision,
        operations: [{ kind: "set-color", target: "iris", color: "#3366ff" }],
      });
    });
    await act(async () => { await hook.result.current.saveNow(); });
    const beforeRevision = hook.result.current.snapshot.document.revision;
    let restored = false;
    await act(async () => {
      restored = await hook.result.current.importJson(serializeCharacterDocumentV3(document()));
    });
    expect(restored).toBe(true);
    expect(hook.result.current.snapshot.document.revision).toBeGreaterThan(beforeRevision);
    expect(hook.result.current.snapshot.document.look.colors.iris).toBeNull();
    act(() => { hook.result.current.undo(); });
    expect(hook.result.current.snapshot.document.look.colors.iris).toBe("#3366ff");
  });

  it("미리보기 동안 보류한 호환 상태는 취소 후 다시 동기화한다", async () => {
    const f = fixture();
    const source = document();
    const hook = renderHook(({ fingerprint }) => useCharacterAuthoringAuthority(fingerprint === "fp:b"
      ? { ...source, look: { ...source.look, colors: { ...source.look.colors, skin: "#123456" } } }
      : source, fingerprint, {
      repository: f.repository, autosave: false,
    }), { initialProps: { fingerprint: "fp:a" } });
    await flush();
    act(() => {
      const current = hook.result.current.snapshot.document;
      hook.result.current.beginPreview({
        commandId: "test/preview", label: "눈 색 미리보기", source: "user",
        expectedDocumentId: current.documentId, expectedRevision: current.revision,
        operations: [{ kind: "set-color", target: "iris", color: "#3366ff" }],
      });
    });
    hook.rerender({ fingerprint: "fp:b" });
    act(() => { hook.result.current.cancelPreview(); });
    await flush();
    expect(hook.result.current.snapshot.document.sourceReceipts).toContainEqual(
      expect.objectContaining({ kind: "compatibility-projection", sourceFingerprint: "fp:b" }),
    );
    expect(hook.result.current.snapshot.document.look.colors.skin).toBe("#123456");
  });

  it("복원한 색과 포즈를 오래된 projection으로 덮어쓰지 않고 실제 변경 필드만 받는다", async () => {
    const f = fixture();
    const source = document();
    const stored = { ...source, revision: 9,
      look: { ...source.look, colors: { ...source.look.colors, iris: "#3366ff" } },
      pose: { ...source.pose, bones: { head: [0, 0.2, 0, Math.sqrt(0.96)] as const } },
    };
    await f.repository.save(stored);
    const hook = renderHook(({ projection, fingerprint }) => useCharacterAuthoringAuthority(projection, fingerprint, {
      repository: f.repository, autosave: false,
    }), { initialProps: { projection: source, fingerprint: "fp:a" } });
    await flush();
    expect(hook.result.current.snapshot.document.look.colors.iris).toBe("#3366ff");
    expect(hook.result.current.snapshot.document.pose.bones).toEqual(stored.pose.bones);
    expect(hook.result.current.snapshot.canUndo).toBe(false);
    hook.rerender({ projection: { ...source, look: { ...source.look, colors: { ...source.look.colors, skin: "#123456" } } }, fingerprint: "fp:b" });
    await flush();
    expect(hook.result.current.snapshot.document.look.colors).toMatchObject({ iris: "#3366ff", skin: "#123456" });
    expect(hook.result.current.snapshot.document.pose.bones).toEqual(stored.pose.bones);
    act(() => { hook.result.current.undo(); });
    expect(hook.result.current.snapshot.document.look.colors.skin).toBeNull();
    expect(hook.result.current.snapshot.document.look.colors.iris).toBe("#3366ff");
  });

  it("런타임 복원의 중간 projection은 저장하거나 undo에 넣지 않는다", async () => {
    const f = fixture();
    const source = document();
    const hook = renderHook(({ projection, fingerprint }) => useCharacterAuthoringAuthority(projection, fingerprint, {
      repository: f.repository, autosave: false,
    }), { initialProps: { projection: source, fingerprint: "fp:a" } });
    await flush();
    const before = hook.result.current.snapshot.document;
    act(() => { hook.result.current.setRuntimeSyncPending("host", true); });
    hook.rerender({ projection: { ...source, look: { ...source.look, colors: { ...source.look.colors, skin: "#123456" } } }, fingerprint: "fp:b" });
    await flush();
    expect(hook.result.current.snapshot.document).toBe(before);
    act(() => { hook.result.current.setRuntimeSyncPending("host", false); });
    hook.rerender({ projection: { ...source, look: { ...source.look, colors: { ...source.look.colors, skin: "#123456" } } }, fingerprint: "fp:b" });
    expect(hook.result.current.snapshot.document).toBe(before);
    expect(hook.result.current.snapshot.canUndo).toBe(false);
  });
});
