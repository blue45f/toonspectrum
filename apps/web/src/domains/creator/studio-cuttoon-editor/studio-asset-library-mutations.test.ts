import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioAssetLibraryMutations,
  type StudioAssetLibraryMutationsContext,
} from "./studio-asset-library-mutations";

import type { StudioAsset } from "../studio-asset-library";

const storage = vi.hoisted(() => ({
  listAssets: vi.fn(),
  deleteAsset: vi.fn(),
  renameAsset: vi.fn(),
}));
vi.mock("../studio-asset-library", () => ({
  ...storage,
  normalizeAssetName: (name: string) => name.trim(),
}));
vi.mock("../studio-legacy-editor-runtime-helpers", () => ({
  loadStudioCanvasImageFile: vi.fn(),
}));

const asset: StudioAsset = {
  id: "asset-a", name: "내 배경", dataUrl: "data:image/png;base64,AA==",
  width: 100, height: 100, createdAt: 1,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(initialAssets: StudioAsset[] = [asset]) {
  const context: StudioAssetLibraryMutationsContext = {
    assetHydrationGenerationRef: { current: 0 },
    assetMemoryModeRef: { current: false },
    assetMutationGenerationRef: { current: 0 },
    assetMutationTailRef: { current: Promise.resolve() },
    assetsRef: { current: [...initialAssets] },
    editorMountedRef: { current: true },
    removeAssetFavorite: vi.fn(),
    replaceStudioAssets: vi.fn((next: StudioAsset[]) => { context.assetsRef.current = next; }),
    setAssetStorageState: vi.fn(),
    setAssetsLoaded: vi.fn(),
    setAssetsLoading: vi.fn(),
    setError: vi.fn(),
  };
  return { context, actions: createStudioAssetLibraryMutations(context) };
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.deleteAsset.mockResolvedValue(undefined);
  storage.renameAsset.mockResolvedValue(undefined);
  storage.listAssets.mockResolvedValue([asset]);
});

describe("asset library mutation convergence", () => {
  it("does not resurrect an asset from a read started during persistent deletion", async () => {
    const deleting = deferred<void>();
    const listing = deferred<StudioAsset[]>();
    storage.deleteAsset.mockReturnValueOnce(deleting.promise);
    storage.listAssets.mockReturnValueOnce(listing.promise);
    const { context, actions } = harness();
    const mutation = actions.deleteStudioAssetMutation(asset.id);
    await vi.waitFor(() => expect(storage.deleteAsset).toHaveBeenCalledOnce());
    const hydration = actions.loadAssetsList();
    await vi.waitFor(() => expect(storage.listAssets).toHaveBeenCalledOnce());
    deleting.resolve();
    await mutation;
    listing.resolve([asset]);
    await hydration;
    expect(context.assetsRef.current).toEqual([]);
    expect(context.setAssetsLoading).toHaveBeenLastCalledWith(false);
  });

  it("does not restore an old name from a read started during renaming", async () => {
    const renaming = deferred<void>();
    const listing = deferred<StudioAsset[]>();
    storage.renameAsset.mockReturnValueOnce(renaming.promise);
    storage.listAssets.mockReturnValueOnce(listing.promise);
    const { context, actions } = harness();
    const mutation = actions.renameStudioAssetMutation(asset.id, "새 배경");
    await vi.waitFor(() => expect(storage.renameAsset).toHaveBeenCalledOnce());
    const hydration = actions.loadAssetsList();
    await vi.waitFor(() => expect(storage.listAssets).toHaveBeenCalledOnce());
    renaming.resolve();
    await mutation;
    listing.resolve([asset]);
    await hydration;
    expect(context.assetsRef.current[0]?.name).toBe("새 배경");
  });

  it("keeps a persistent row and its favorite when deletion fails", async () => {
    storage.deleteAsset.mockRejectedValueOnce(new Error("storage locked"));
    const { context, actions } = harness();
    await actions.onDeleteAsset(asset.id);
    expect(context.assetsRef.current).toEqual([asset]);
    expect(context.assetMemoryModeRef.current).toBe(false);
    expect(context.removeAssetFavorite).not.toHaveBeenCalled();
    expect(context.setError).toHaveBeenCalledWith(expect.stringContaining("보관함에 유지"));
    expect(context.setAssetsLoading).toHaveBeenLastCalledWith(false);
  });

  it("allows retry after a failed persistent deletion", async () => {
    storage.deleteAsset.mockRejectedValueOnce(new Error("busy"));
    const { context, actions } = harness();
    await actions.onDeleteAsset(asset.id);
    await actions.onDeleteAsset(asset.id);
    expect(storage.deleteAsset).toHaveBeenCalledTimes(2);
    expect(context.assetsRef.current).toEqual([]);
    expect(context.removeAssetFavorite).toHaveBeenCalledOnce();
  });

  it("still deletes explicitly memory-only assets without opening persistent storage", async () => {
    const { context, actions } = harness();
    context.assetMemoryModeRef.current = true;
    await actions.onDeleteAsset(asset.id);
    expect(storage.deleteAsset).not.toHaveBeenCalled();
    expect(context.assetsRef.current).toEqual([]);
    expect(context.removeAssetFavorite).toHaveBeenCalledOnce();
  });

  it("does not update an unmounted editor when a deletion settles", async () => {
    const deleting = deferred<void>();
    storage.deleteAsset.mockReturnValueOnce(deleting.promise);
    const { context, actions } = harness();
    const mutation = actions.deleteStudioAssetMutation(asset.id);
    await vi.waitFor(() => expect(storage.deleteAsset).toHaveBeenCalledOnce());
    context.editorMountedRef.current = false;
    deleting.resolve();
    await mutation;
    expect(context.replaceStudioAssets).not.toHaveBeenCalled();
  });
});
