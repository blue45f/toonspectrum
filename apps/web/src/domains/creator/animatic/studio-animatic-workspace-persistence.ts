import { acquireProductStudioAssetCasStore } from "../studio-asset-library-sqlite-opfs-repository";
import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import {
  ANIMATIC_WORKSPACE_LIMITS,
  studioAnimaticWorkspaceAssetRefs,
  validateStudioAnimaticWorkspace,
  type StudioAnimaticWorkspaceDocument,
} from "./studio-animatic-workspace";

import type { StudioLocalDatabase } from "../studio-local-database";
import type { StudioOpfsAssetRef, StudioOpfsAssetStore } from "../studio-opfs-asset-store";
import type { StudioCrc32ExecutionMode } from "../studio-crc32-worker-client";
import type { StudioPackageArchiveEntry } from "../studio-package-archive";

const NAMESPACE = "studio-animatic-workspace-v12";
const MANIFEST_NAME = "storyboard.json";

export interface StudioAnimaticWorkspaceRepository {
  load(workScope: string): Promise<StudioAnimaticWorkspaceDocument | null>;
  save(workspace: StudioAnimaticWorkspaceDocument, retained?: readonly StudioAnimaticWorkspaceDocument[]): Promise<void>;
  putAsset(bytes: Uint8Array, mime: string): Promise<StudioOpfsAssetRef>;
  getAsset(ref: StudioOpfsAssetRef): Promise<Uint8Array>;
  exportArchive(workspace: StudioAnimaticWorkspaceDocument): Promise<Blob>;
  importArchive(bytes: Uint8Array, workScope: string): Promise<StudioAnimaticWorkspaceDocument>;
}

export function createStudioAnimaticWorkspaceRepository(options: {
  acquireDatabase?: () => Promise<StudioLocalDatabase>;
  acquireAssets?: () => Promise<StudioOpfsAssetStore>;
  /** Tests may explicitly choose the headless CRC adapter; browser exports use a Worker. */
  crc32ExecutionMode?: StudioCrc32ExecutionMode;
} = {}): StudioAnimaticWorkspaceRepository {
  const database = options.acquireDatabase ?? acquireStudioLocalDatabase;
  const assets = options.acquireAssets ?? acquireProductStudioAssetCasStore;
  const owner = (scope: string) => `${NAMESPACE}:${scope}`;
  async function getAsset(ref: StudioOpfsAssetRef): Promise<Uint8Array> {
    const bytes = await (await assets()).get(ref.hash, { verify: true });
    if (!bytes || bytes.byteLength !== ref.bytes) throw new Error("스토리보드 미디어가 없거나 손상되었습니다. 원본 파일을 다시 연결하세요.");
    return bytes;
  }
  async function putAsset(bytes: Uint8Array, mime: string): Promise<StudioOpfsAssetRef> {
    if (bytes.byteLength === 0 || bytes.byteLength > ANIMATIC_WORKSPACE_LIMITS.assetBytes) throw new Error("지원하는 미디어 파일 크기를 넘었습니다.");
    const stored = await (await assets()).put(bytes, { mime });
    await getAsset(stored.ref);
    return stored.ref;
  }
  return {
    async load(workScope) {
      const raw = await (await database()).kvGet(NAMESPACE, workScope);
      if (raw === null) return null;
      const workspace = validateStudioAnimaticWorkspace(JSON.parse(raw));
      if (workspace.workScope !== workScope) throw new Error("다른 작품의 스토리보드 작업입니다.");
      return workspace;
    },
    async save(input, retained = []) {
      const workspace = validateStudioAnimaticWorkspace(input);
      const save = async () => {
        const store = await assets();
        const scopeOwner = owner(workspace.workScope);
        const hashes = [...new Set([workspace, ...retained.filter((item) => item.workScope === workspace.workScope)]
          .flatMap((item) => studioAnimaticWorkspaceAssetRefs(item).map((ref) => ref.hash)))];
        for (const ref of studioAnimaticWorkspaceAssetRefs(workspace)) await getAsset(ref);
        const previous = await store.ownerRefs(scopeOwner);
        // Protect both sides before the SQL commit, including all still-undoable media.
        await store.setOwnerRefs(scopeOwner, [...new Set([...previous, ...hashes])]);
        await (await database()).kvSet(NAMESPACE, workspace.workScope, JSON.stringify(workspace));
        await store.setOwnerRefs(scopeOwner, hashes);
      };
      if (typeof navigator !== "undefined" && navigator.locks) {
        await navigator.locks.request(owner(workspace.workScope), save);
      } else {
        await save();
      }
    },
    putAsset,
    getAsset,
    async exportArchive(input) {
      const workspace = validateStudioAnimaticWorkspace(input);
      const { buildStudioPackageArchiveBlob } = await import("../studio-package-archive");
      const entries: StudioPackageArchiveEntry[] = [{ path: MANIFEST_NAME, data: new TextEncoder().encode(JSON.stringify(workspace)) }];
      for (const ref of studioAnimaticWorkspaceAssetRefs(workspace)) entries.push({ path: `media/${ref.hash.slice(7)}.bin`, data: await getAsset(ref) });
      return buildStudioPackageArchiveBlob(entries, {
        crc32ExecutionMode: options.crc32ExecutionMode ?? "worker",
        limits: { maxArchiveBytes: ANIMATIC_WORKSPACE_LIMITS.archiveBytes,
          maxTotalBytes: ANIMATIC_WORKSPACE_LIMITS.assetBytes + ANIMATIC_WORKSPACE_LIMITS.metadataBytes },
      });
    },
    async importArchive(bytes, workScope) {
      const { readStudioZipArchive } = await import("../studio-zip-reader");
      const archive = await readStudioZipArchive(bytes, { limits: {
        maxArchiveBytes: ANIMATIC_WORKSPACE_LIMITS.archiveBytes, maxEntries: ANIMATIC_WORKSPACE_LIMITS.assetCount + 1,
        maxTotalUncompressedBytes: ANIMATIC_WORKSPACE_LIMITS.assetBytes + ANIMATIC_WORKSPACE_LIMITS.metadataBytes,
      } });
      const manifestEntry = archive.getEntry(MANIFEST_NAME);
      if (!manifestEntry) throw new Error("storyboard.json이 없는 ZIP 파일입니다.");
      if (manifestEntry.uncompressedBytes > ANIMATIC_WORKSPACE_LIMITS.metadataBytes) throw new Error("스토리보드 메타데이터가 너무 큽니다.");
      const manifest = await archive.readEntry(manifestEntry);
      const workspace = validateStudioAnimaticWorkspace(JSON.parse(new TextDecoder().decode(manifest)));
      if (workspace.workScope !== workScope) throw new Error("다른 작품의 스토리보드는 이 작업에 가져올 수 없습니다.");
      const refs = studioAnimaticWorkspaceAssetRefs(workspace);
      const expected = new Map(refs.map((ref) => [`media/${ref.hash.slice(7)}.bin`, ref]));
      for (const entry of archive.entries) {
        if (entry.path !== MANIFEST_NAME && !expected.has(entry.path)) throw new Error("작업에서 참조하지 않는 ZIP 파일이 포함되어 있습니다.");
      }
      for (const [path, ref] of expected) {
        const entry = archive.getEntry(path);
        if (!entry || entry.uncompressedBytes !== ref.bytes) throw new Error("ZIP 파일에서 참조한 미디어를 찾지 못했거나 크기가 다릅니다.");
        const data = await archive.readEntry(entry);
        const stored = await putAsset(data, ref.mime);
        if (stored.hash !== ref.hash) throw new Error("ZIP 미디어의 내용 해시가 일치하지 않습니다.");
      }
      return workspace;
    },
  };
}
