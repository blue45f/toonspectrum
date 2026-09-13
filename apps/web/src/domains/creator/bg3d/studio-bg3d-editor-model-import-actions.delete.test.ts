import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dModelImportActions, type StudioBg3dModelImportActionsContext } from "./studio-bg3d-editor-model-import-actions";

const runtime = vi.hoisted(() => ({
  deleteModel: vi.fn(), list: vi.fn(), preflight: vi.fn(), run: vi.fn(), commit: vi.fn(),
}));
vi.mock("./studio-bg3d-model-library-loader", () => ({
  deleteStoredBg3dModelV12: runtime.deleteModel,
  listBg3dModelLibraryEntriesV12: runtime.list,
  createStudioBg3dModelAttachment: vi.fn(), getStoredBg3dModelV12: vi.fn(),
  importVerifiedBg3dModelsAtomicallyV12: vi.fn(),
}));
vi.mock("./studio-bg3d-scene-removal", () => ({ preflightAndDeleteStudioBg3dPersistedModel: runtime.preflight }));
vi.mock("./studio-bg3d-modal-operation-coordinator", () => ({
  StudioBg3dStaleModalOperationError: class extends Error {},
  studioBg3dModalOperationCoordinator: { runSceneMutation: runtime.run, commitIfCurrent: runtime.commit },
}));

type Lease = { readonly signal: AbortSignal; readonly throwIfRevoked: () => void };
type Rows = { id: string }[];

function harness() {
  let rows: Rows = [{ id: "model-a" }, { id: "model-b" }];
  // Only deletion dependencies are exercised; upload-only context fields are deliberately absent.
  const context = {
    attachmentByStorageModelIdRef: { current: new Map() },
    storageModelIdByAttachmentIdRef: { current: new Map() },
    modelRootCacheRef: { current: new Map() },
    physicsRuntimeSourceRef: { current: {} },
    modalAssetSessionRef: { current: {} },
    captureInFlightRef: { current: false },
    modelImportAbortRef: { current: null as AbortController | null },
    sceneRestoreAbortRef: { current: null as AbortController | null },
    placementSessionRef: { current: { phase: "idle" } },
    destructiveMutationGuardRef: { current: { begin: vi.fn(() => ({} as object | null)), finish: vi.fn() } },
    isRestoringScene: false,
    invalidateModelThumbnailCaptures: vi.fn<() => Promise<void> | null>(() => null),
    isModalAssetSessionCurrent: vi.fn(() => true),
    cancelCustomModelPlacement: vi.fn(), commitSceneEntityRemoval: vi.fn(),
    setDeletingModelId: vi.fn(), setError: vi.fn(), setModelLibraryStatus: vi.fn(),
    setModelLibrary: vi.fn((update: Rows | ((current: Rows) => Rows)) => { rows = typeof update === "function" ? update(rows) : update; }),
    setSelectedIds: vi.fn(), setGenericModelSourceFormats: vi.fn(), setGenericModelClassifications: vi.fn(), setRefTick: vi.fn(),
  };
  return {
    context, rows: () => rows,
    actions: () => createStudioBg3dModelImportActions(context as unknown as StudioBg3dModelImportActionsContext),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  runtime.deleteModel.mockResolvedValue(undefined);
  runtime.list.mockResolvedValue([{ id: "model-b" }]);
  runtime.preflight.mockImplementation(async (input: { storageModelId: string; deletePersistedModel: (id: string) => Promise<void> }) => {
    await input.deletePersistedModel(input.storageModelId);
    return { ok: true, removedEntityIds: new Set(["placed-a"]) };
  });
  runtime.run.mockImplementation(async (_session: unknown, work: (lease: Lease) => Promise<unknown>, commit: (value: unknown) => void) => {
    const value = await work({ signal: new AbortController().signal, throwIfRevoked: () => undefined });
    commit(value);
    return { status: "committed" };
  });
  runtime.commit.mockImplementation((_session: unknown, commit: () => void) => { commit(); return true; });
});

describe("3D model deletion feedback and convergence", () => {
  it("explains why scene restoration blocks deletion without touching storage", async () => {
    const h = harness(); h.context.isRestoringScene = true;
    await h.actions().handleDeleteModelFromLibrary("model-a");
    expect(runtime.deleteModel).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenCalledWith(expect.stringContaining("복원"));
  });
  it("explains an active renderer instead of silently ignoring the click", async () => {
    const h = harness(); h.context.captureInFlightRef.current = true;
    await h.actions().handleDeleteModelFromLibrary("model-a");
    expect(runtime.deleteModel).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenCalledWith(expect.stringContaining("렌더링"));
  });
  it("does not delete while model import owns the operation", async () => {
    const h = harness(); h.context.modelImportAbortRef.current = new AbortController();
    await h.actions().handleDeleteModelFromLibrary("model-a");
    expect(runtime.deleteModel).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenCalledWith(expect.stringContaining("가져오는 중"));
  });
  it("handles thumbnail cancellation failures without an unhandled rejection", async () => {
    const h = harness(); h.context.invalidateModelThumbnailCaptures.mockRejectedValueOnce(new Error("capture failed"));
    await h.actions().handleDeleteModelFromLibrary("model-a");
    expect(runtime.deleteModel).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenCalledWith(expect.stringContaining("미리보기"));
  });
  it("keeps the destructive-mutation guard and reports contention", async () => {
    const h = harness(); h.context.destructiveMutationGuardRef.current.begin.mockReturnValueOnce(null);
    await h.actions().handleDeleteModelFromLibrary("model-a");
    expect(runtime.deleteModel).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenCalledWith(expect.stringContaining("다른 변경 작업"));
  });
  it("keeps a committed deletion visible even when the follow-up list read fails", async () => {
    const h = harness(); runtime.list.mockRejectedValueOnce(new Error("list unavailable"));
    await h.actions().handleDeleteModelFromLibrary("model-a");
    expect(runtime.deleteModel).toHaveBeenCalledOnce();
    expect(h.rows()).toEqual([{ id: "model-b" }]);
    expect(h.context.commitSceneEntityRemoval).toHaveBeenCalledOnce();
    expect(h.context.setModelLibraryStatus).toHaveBeenLastCalledWith("degraded");
    expect(h.context.setError).toHaveBeenLastCalledWith(expect.stringContaining("원본 삭제는 완료"));
    expect(h.context.setDeletingModelId).toHaveBeenLastCalledWith(null);
  });
  it("does not remove the row or source when child-transform preflight rejects", async () => {
    const h = harness(); runtime.preflight.mockResolvedValueOnce({ ok: false });
    await h.actions().handleDeleteModelFromLibrary("model-a");
    expect(runtime.deleteModel).not.toHaveBeenCalled();
    expect(h.rows()).toHaveLength(2);
    expect(h.context.commitSceneEntityRemoval).not.toHaveBeenCalled();
  });
  it("retains the row on persistence failure and releases the guard for retry", async () => {
    const h = harness(); runtime.deleteModel.mockRejectedValueOnce(new Error("locked"));
    await h.actions().handleDeleteModelFromLibrary("model-a");
    expect(h.rows()).toHaveLength(2);
    expect(h.context.destructiveMutationGuardRef.current.finish).toHaveBeenCalledOnce();
    expect(h.context.setError).toHaveBeenLastCalledWith(expect.stringContaining("원본을 유지"));
  });
});
