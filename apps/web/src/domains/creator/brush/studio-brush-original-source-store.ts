import { sha256HexPortable } from "@/shared/lib/sha256-portable";
import {
  createStudioBrushOriginalSource, decodeStudioBrushOriginalSource,
  requireStudioBrushOriginalSource, StudioBrushOriginalSourceError,
  type StudioBrushOriginalSource,
} from "./studio-brush-original-source";
import type { StudioOpfsAssetStore } from "../studio-opfs-asset-store";

export type BrushOriginalStore = Pick<StudioOpfsAssetStore, "put" | "get" | "setOwnerRefs">;
async function withStore<T>(run: (store: BrushOriginalStore) => Promise<T>, injected?: BrushOriginalStore): Promise<T> {
  if (injected) return run(injected);
  const { acquireProductStudioAssetCasStore, STUDIO_ASSET_LIBRARY_LOCK_NAME } =
    await import("../studio-asset-library-sqlite-opfs-repository");
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error("원본 보존에 필요한 OPFS 저장 잠금을 사용할 수 없습니다. 원본 없이 저장하지 않았습니다.");
  }
  return navigator.locks.request(STUDIO_ASSET_LIBRARY_LOCK_NAME, async () =>
    run(await acquireProductStudioAssetCasStore()));
}
function verifyBytes(bytes: Uint8Array | null, source: StudioBrushOriginalSource): Uint8Array {
  if (!bytes || bytes.byteLength !== source.byteLength || sha256HexPortable(bytes) !== source.sha256) {
    throw new StudioBrushOriginalSourceError();
  }
  return bytes;
}

/** Commit bytes and verify before SQLite publishes a reference. Failure leaves the row unchanged. */
export async function storeStudioBrushOriginal(raw: unknown, injected?: BrushOriginalStore): Promise<StudioBrushOriginalSource> {
  const source = requireStudioBrushOriginalSource(raw);
  return withStore(async (store) => {
    const hash = `sha256:${source.sha256}`;
    if (source.encoding === "base64") {
      const result = await store.put(decodeStudioBrushOriginalSource(source), { mime: "application/octet-stream" });
      if (result.ref.hash !== hash || result.ref.bytes !== source.byteLength) throw new StudioBrushOriginalSourceError();
    }
    // Immutable content owner: deletion/Undo/duplicates must not collect another brush's original.
    // Conservative retention is deliberate; this slice does not garbage-collect these owners.
    await store.setOwnerRefs(`brush-original:${source.sha256}`, [hash]);
    verifyBytes(await store.get(hash, { verify: true }), source);
    return requireStudioBrushOriginalSource({ version: 1, encoding: "opfs-cas", format: source.format,
      fileName: source.fileName, byteLength: source.byteLength, sha256: source.sha256 });
  }, injected);
}

export async function hydrateStudioBrushOriginal(raw: unknown, injected?: BrushOriginalStore): Promise<StudioBrushOriginalSource> {
  const source = requireStudioBrushOriginalSource(raw);
  if (source.encoding === "base64") return source;
  return withStore(async (store) => {
    // Owner mutation reloads the shared CAS index after another tab may have written it.
    await store.setOwnerRefs(`brush-original:${source.sha256}`, [`sha256:${source.sha256}`]);
    const bytes = verifyBytes(await store.get(`sha256:${source.sha256}`, { verify: true }), source);
    return createStudioBrushOriginalSource(bytes, source.fileName, source.format);
  }, injected);
}

/** Original-free settings keep the existing synchronous JSON shape and need no CAS access. */
export async function prepareStudioBrushSourceExport<T extends { originalSource?: StudioBrushOriginalSource }>(
  brush: T, injected?: BrushOriginalStore,
): Promise<T> {
  if (!Object.hasOwn(brush, "originalSource")) return brush;
  return { ...brush, originalSource: await hydrateStudioBrushOriginal(brush.originalSource, injected) };
}
