import { createStudioAssetFavoriteId, type StudioAssetFavoriteId } from "../studio-asset-favorites";
import { loadStudioCanvasImageFile } from "../studio-legacy-editor-runtime-helpers";

import type { StudioAsset, StudioAssetWithContentHash } from "../studio-asset-library";
import type {
  ChangeEvent,
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

/** SQLite/OPFS authority and the explicitly disclosed current-tab fallback. */
export type StudioAssetStorageState =
  | "idle"
  | "loading"
  | "sqlite-opfs"
  | "memory"
  | "unavailable";

export interface StudioAssetLibraryMutationsContext {
  readonly assetHydrationGenerationRef: MutableRefObject<number>;
  readonly assetMemoryModeRef: MutableRefObject<boolean>;
  readonly assetMutationGenerationRef: MutableRefObject<number>;
  readonly assetMutationTailRef: MutableRefObject<Promise<void>>;
  readonly assetsRef: MutableRefObject<StudioAsset[]>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly removeAssetFavorite: (id: StudioAssetFavoriteId) => void;
  readonly replaceStudioAssets: (next: StudioAsset[]) => void;
  readonly setAssetStorageState: Dispatch<SetStateAction<StudioAssetStorageState>>;
  readonly setAssetsLoaded: Dispatch<SetStateAction<boolean>>;
  readonly setAssetsLoading: Dispatch<SetStateAction<boolean>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
}

export interface StudioAssetLibraryMutations {
  readonly loadAssetsList: () => Promise<void>;
  readonly createValidatedMemoryAsset: (
    input: import("../studio-asset-library").StudioAssetSaveInput,
  ) => Promise<StudioAssetWithContentHash>;
  readonly canKeepAssetMutationInMemory: (cause: unknown) => Promise<boolean>;
  readonly enqueueAssetMutation: <T>(work: () => Promise<T>) => Promise<T>;
  readonly saveStudioAssetMutation: (
    input: import("../studio-asset-library").StudioAssetSaveInput,
  ) => Promise<StudioAssetWithContentHash>;
  readonly deleteStudioAssetMutation: (id: string) => Promise<void>;
  readonly renameStudioAssetMutation: (id: string, name: string) => Promise<void>;
  readonly onUploadAsset: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  readonly onDeleteAsset: (id: string) => Promise<void>;
}

/** Bind mutation serialization and hydration fencing to the editor's stable refs. */
export function createStudioAssetLibraryMutations(
  context: StudioAssetLibraryMutationsContext,
): StudioAssetLibraryMutations {
  const {
    assetHydrationGenerationRef,
    assetMemoryModeRef,
    assetMutationGenerationRef,
    assetMutationTailRef,
    assetsRef,
    editorMountedRef,
    removeAssetFavorite,
    replaceStudioAssets,
    setAssetStorageState,
    setAssetsLoaded,
    setAssetsLoading,
    setError,
  } = context;

  const loadAssetsList = async () => {
    const generation = ++assetHydrationGenerationRef.current;
    if (assetMemoryModeRef.current) {
      setAssetsLoaded(true);
      setAssetsLoading(false);
      setAssetStorageState("memory");
      return;
    }
    setAssetsLoading(true);
    setAssetStorageState("loading");
    try {
      const { listAssets } = await import("../studio-asset-library");
      const list = await listAssets();
      if (!editorMountedRef.current || generation !== assetHydrationGenerationRef.current) return;
      replaceStudioAssets(list);
      setAssetStorageState("sqlite-opfs");
    } catch (err) {
      console.error("Failed to load custom assets:", err);
      if (!editorMountedRef.current || generation !== assetHydrationGenerationRef.current) return;
      const repositoryModule = await import("../studio-asset-library-sqlite-opfs-repository"
      ).catch(() => null);
      if (!editorMountedRef.current || generation !== assetHydrationGenerationRef.current) return;
      const failClosed = repositoryModule
        && err instanceof repositoryModule.StudioAssetLibraryRepositoryError
        && err.code === "corrupt";
      if (failClosed) {
        setAssetStorageState("unavailable");
        setError(`${err.message} 손상된 manifest나 누락된 blob을 일부만 불러오지 않았습니다.`);
      } else {
        assetMemoryModeRef.current = true;
        setAssetStorageState("memory");
        setError(`SQLite/OPFS 에셋 보관함을 열지 못해 현재 탭 메모리만 사용합니다. 새로고침하면 변경이 사라집니다: ${
          err instanceof Error ? err.message : String(err)
        }`);
      }
    } finally {
      if (editorMountedRef.current && generation === assetHydrationGenerationRef.current) {
        setAssetsLoaded(true);
        setAssetsLoading(false);
      }
    }
  };

  async function createValidatedMemoryAsset(
    input: import("../studio-asset-library").StudioAssetSaveInput,
  ): Promise<StudioAssetWithContentHash> {
    const assetLibrary = await import("../studio-asset-library");
    const actualHash = await assetLibrary.hashStudioAssetDataUrl(input.dataUrl);
    const expectedHash = assetLibrary.canonicalizeStudioAssetContentHash(input.contentHash);
    if (input.contentHash !== undefined && expectedHash !== actualHash) {
      throw new Error("제공된 contentHash가 실제 에셋 바이트 SHA-256과 일치하지 않습니다.");
    }
    return {
      ...assetLibrary.createAssetRecord({ ...input, contentHash: actualHash }),
      contentHash: actualHash,
    };
  }

  async function canKeepAssetMutationInMemory(cause: unknown): Promise<boolean> {
    const repositoryModule = await import("../studio-asset-library-sqlite-opfs-repository"
    ).catch(() => null);
    return repositoryModule === null
      || repositoryModule.isStudioAssetLibraryMemoryFallbackError(cause);
  }

  function enqueueAssetMutation<T>(work: () => Promise<T>): Promise<T> {
    const result = assetMutationTailRef.current.then(work, work);
    assetMutationTailRef.current = result.then(() => undefined, () => undefined);
    return result;
  }

  function saveStudioAssetMutation(
    input: import("../studio-asset-library").StudioAssetSaveInput,
  ): Promise<StudioAssetWithContentHash> {
    return enqueueAssetMutation(async () => {
      const generation = ++assetMutationGenerationRef.current;
      assetHydrationGenerationRef.current += 1;
      if (assetMemoryModeRef.current) {
        const saved = await createValidatedMemoryAsset(input);
        if (editorMountedRef.current && generation === assetMutationGenerationRef.current) {
          assetHydrationGenerationRef.current += 1;
          replaceStudioAssets([
            saved,
            ...assetsRef.current.filter(({ id }) => id !== saved.id),
          ]);
          setAssetsLoaded(true);
          setAssetsLoading(false);
          setAssetStorageState("memory");
        }
        return saved;
      }
      try {
        const { saveAsset } = await import("../studio-asset-library");
        const saved = await saveAsset(input);
        if (editorMountedRef.current && generation === assetMutationGenerationRef.current) {
          assetHydrationGenerationRef.current += 1;
          replaceStudioAssets([
            saved,
            ...assetsRef.current.filter(({ id }) => id !== saved.id),
          ]);
          setAssetsLoaded(true);
          setAssetsLoading(false);
          setAssetStorageState("sqlite-opfs");
        }
        return saved;
      } catch (cause) {
        if (!await canKeepAssetMutationInMemory(cause)) throw cause;
        const saved = await createValidatedMemoryAsset(input);
        assetMemoryModeRef.current = true;
        if (editorMountedRef.current && generation === assetMutationGenerationRef.current) {
          assetHydrationGenerationRef.current += 1;
          replaceStudioAssets([
            saved,
            ...assetsRef.current.filter(({ id }) => id !== saved.id),
          ]);
          setAssetsLoaded(true);
          setAssetsLoading(false);
          setAssetStorageState("memory");
          setError(`SQLite/OPFS 저장에 실패해 에셋을 현재 탭 메모리에만 유지합니다. 새로고침하면 사라집니다: ${
            cause instanceof Error ? cause.message : String(cause)
          }`);
        }
        return saved;
      }
    });
  }

  function deleteStudioAssetMutation(id: string): Promise<void> {
    return enqueueAssetMutation(async () => {
      const generation = ++assetMutationGenerationRef.current;
      assetHydrationGenerationRef.current += 1;
      if (!assetMemoryModeRef.current) {
        try {
          const { deleteAsset } = await import("../studio-asset-library");
          await deleteAsset(id);
          if (editorMountedRef.current && generation === assetMutationGenerationRef.current) {
            setAssetStorageState("sqlite-opfs");
          }
        } catch (cause) {
          // A failed persistent delete is not a successful memory-only delete. Retain both the
          // row and storage authority, so retry remains possible and reload cannot resurrect it.
          throw new Error(`에셋 원본을 삭제하지 못해 보관함에 유지했습니다. 다시 시도해 주세요: ${
            cause instanceof Error ? cause.message : String(cause)
          }`, { cause });
        }
      }
      if (editorMountedRef.current && generation === assetMutationGenerationRef.current) {
        // Also fence reads STARTED DURING the await, not only reads already pending at entry.
        assetHydrationGenerationRef.current += 1;
        replaceStudioAssets(assetsRef.current.filter((asset) => asset.id !== id));
        setAssetsLoaded(true);
        setAssetsLoading(false);
      }
    });
  }

  function renameStudioAssetMutation(id: string, name: string): Promise<void> {
    return enqueueAssetMutation(async () => {
      const generation = ++assetMutationGenerationRef.current;
      assetHydrationGenerationRef.current += 1;
      const assetLibrary = await import("../studio-asset-library");
      const normalizedName = assetLibrary.normalizeAssetName(name);
      if (!assetMemoryModeRef.current) {
        try {
          await assetLibrary.renameAsset(id, normalizedName);
          if (editorMountedRef.current && generation === assetMutationGenerationRef.current) {
            setAssetStorageState("sqlite-opfs");
          }
        } catch (cause) {
          if (!await canKeepAssetMutationInMemory(cause)) throw cause;
          if (!editorMountedRef.current || generation !== assetMutationGenerationRef.current) return;
          assetMemoryModeRef.current = true;
          setAssetStorageState("memory");
          setError(`SQLite/OPFS 이름 변경에 실패해 현재 탭 메모리에서만 반영합니다. 새로고침하면 사라집니다: ${
            cause instanceof Error ? cause.message : String(cause)
          }`);
        }
      }
      if (editorMountedRef.current && generation === assetMutationGenerationRef.current) {
        assetHydrationGenerationRef.current += 1;
        replaceStudioAssets(assetsRef.current.map((asset) =>
          asset.id === id ? { ...asset, name: normalizedName } : asset));
        setAssetsLoaded(true);
        setAssetsLoading(false);
      }
    });
  }

  async function onUploadAsset(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { src, width, height } = await loadStudioCanvasImageFile(file);
      await saveStudioAssetMutation({ name: file.name, dataUrl: src, width, height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "에셋 업로드 실패");
    } finally {
      e.target.value = "";
    }
  }

  async function onDeleteAsset(id: string) {
    try {
      await deleteStudioAssetMutation(id);
      removeAssetFavorite(createStudioAssetFavoriteId("local", id));
    } catch (err) {
      if (!editorMountedRef.current) return;
      setAssetsLoading(false);
      setError(err instanceof Error ? err.message : "에셋 삭제 실패");
    }
  }

  return {
    loadAssetsList,
    createValidatedMemoryAsset,
    canKeepAssetMutationInMemory,
    enqueueAssetMutation,
    saveStudioAssetMutation,
    deleteStudioAssetMutation,
    renameStudioAssetMutation,
    onUploadAsset,
    onDeleteAsset,
  };
}
