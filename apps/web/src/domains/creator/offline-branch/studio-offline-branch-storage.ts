import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import {
  browserStudioOpfsDigest,
  createStudioOpfsAssetStore,
  type StudioOpfsAssetStore,
  type StudioOpfsContentHash,
} from "../studio-opfs-asset-store";
import {
  selectStudioOpfsFileSystem,
  type StudioOpfsFileSystemSelection,
} from "../studio-opfs-filesystem";

import {
  STUDIO_OFFLINE_BRANCH_LIMITS,
  isStudioOfflineBranchContentHash,
  type StudioOfflineBranchSnapshot,
} from "./studio-offline-branch-contract";

const DATABASE_NAMESPACE = "studio-automerge-offline-branch-v1";
const DATABASE_RECORD_VERSION = 1 as const;
const DOCUMENT_MIME = "application/vnd.toonstudio.automerge+binary";

interface StoredStudioOfflineBranchDocument {
  readonly version: typeof DATABASE_RECORD_VERSION;
  readonly scope: string;
  readonly workId: string;
  readonly bytes: number;
  readonly sha256: StudioOpfsContentHash;
  readonly documentBase64: string;
  readonly heads: readonly string[];
  readonly updatedAt: number;
}
export interface StudioOfflineBranchStorageStatus {
  readonly durability: "durable" | "memory-only";
  readonly message: string;
}

export interface StudioOfflineBranchStorage {
  readonly status: StudioOfflineBranchStorageStatus;
  loadDocument(scope: string, workId: string): Promise<Uint8Array | null>;
  saveDocument(
    scope: string,
    workId: string,
    bytes: Uint8Array,
    snapshot: StudioOfflineBranchSnapshot,
  ): Promise<void>;
  putPayload(bytes: Uint8Array): Promise<{
    readonly hash: StudioOpfsContentHash;
    readonly bytes: number;
  }>;
  getPayload(hash: string): Promise<Uint8Array | null>;
  setPayloadRefs(scope: string, workId: string, hashes: readonly string[]): Promise<void>;
  deleteDocument(scope: string, workId: string): Promise<void>;
}

function documentKey(scope: string, workId: string): string {
  return JSON.stringify([scope, workId]);
}

function ownerKey(scope: string, workId: string): string {
  return `offline-branch:${scope}:${workId}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(buffer),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function sha256(bytes: Uint8Array): Promise<StudioOpfsContentHash> {
  const digest = browserStudioOpfsDigest();
  if (!digest) throw new Error("SHA-256 is unavailable for offline branch storage");
  return `sha256:${toHex(await digest(bytes))}`;
}

function parseStoredDocument(
  value: string,
  expected: { scope: string; workId: string },
): StoredStudioOfflineBranchDocument {  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (cause) {
    throw new Error("stored offline branch metadata is not JSON", { cause });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("stored offline branch metadata is invalid");
  }
  const record = parsed as Partial<StoredStudioOfflineBranchDocument>;
  if (
    record.version !== DATABASE_RECORD_VERSION
    || record.scope !== expected.scope
    || record.workId !== expected.workId
    || !Number.isSafeInteger(record.bytes)
    || (record.bytes ?? 0) <= 0
    || (record.bytes ?? 0) > STUDIO_OFFLINE_BRANCH_LIMITS.maxDocumentBytes
    || !isStudioOfflineBranchContentHash(record.sha256)
    || typeof record.documentBase64 !== "string"
    || !Array.isArray(record.heads)
    || !record.heads.every((head) => typeof head === "string" && /^[0-9a-f]{64}$/u.test(head))
    || !Number.isSafeInteger(record.updatedAt)
    || (record.updatedAt ?? -1) < 0
  ) throw new Error("stored offline branch metadata violates its contract");
  return record as StoredStudioOfflineBranchDocument;
}

function createAssetStore(
  selection: StudioOpfsFileSystemSelection,
): StudioOpfsAssetStore {
  const lockManager = (globalThis.navigator as Navigator & {
    locks?: { request<T>(name: string, callback: () => Promise<T>): Promise<T> };
  } | undefined)?.locks;
  return createStudioOpfsAssetStore({
    fs: selection.fs,    compressionScope: globalThis,
    estimator: globalThis.navigator?.storage,
    mutationRunExclusive: lockManager
      ? (task) => lockManager.request("toonstudio-offline-branch-opfs", task)
      : null,
  });
}

export async function createProductStudioOfflineBranchStorage(): Promise<StudioOfflineBranchStorage> {
  const [database, selection] = await Promise.all([
    acquireStudioLocalDatabase(),
    selectStudioOpfsFileSystem(globalThis, {
      rootName: "toonspectrum-studio-offline-branch",
    }),
  ]);
  const assets = createAssetStore(selection);
  const status: StudioOfflineBranchStorageStatus = selection.durability === "durable"
    ? {
        durability: "durable",
        message: "오프라인 변경과 드로잉 payload를 OPFS와 SQLite에 보호합니다.",
      }
    : {
        durability: "memory-only",
        message: selection.reason,
      };

  return {
    status,
    async loadDocument(scope, workId) {
      const raw = await database.kvGet(DATABASE_NAMESPACE, documentKey(scope, workId));
      if (raw === null) return null;
      const stored = parseStoredDocument(raw, { scope, workId });
      const bytes = base64ToBytes(stored.documentBase64);
      if (bytes.byteLength !== stored.bytes || await sha256(bytes) !== stored.sha256) {
        throw new Error("stored offline branch document failed integrity verification");
      }
      return bytes;
    },    async saveDocument(scope, workId, bytes, snapshot) {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0
        || bytes.byteLength > STUDIO_OFFLINE_BRANCH_LIMITS.maxDocumentBytes) {
        throw new Error("offline branch document byte budget is invalid");
      }
      const stored: StoredStudioOfflineBranchDocument = {
        version: DATABASE_RECORD_VERSION,
        scope,
        workId,
        bytes: bytes.byteLength,
        sha256: await sha256(bytes),
        documentBase64: bytesToBase64(bytes),
        heads: [...snapshot.heads],
        updatedAt: snapshot.branch.updatedAt,
      };
      await database.kvSet(
        DATABASE_NAMESPACE,
        documentKey(scope, workId),
        JSON.stringify(stored),
      );
    },
    async putPayload(bytes) {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0
        || bytes.byteLength > STUDIO_OFFLINE_BRANCH_LIMITS.maxPayloadBytes) {
        throw new Error("offline branch payload byte budget is invalid");
      }
      const result = await assets.put(bytes, { mime: DOCUMENT_MIME });
      return { hash: result.ref.hash, bytes: result.ref.bytes };
    },
    getPayload(hash) {
      return assets.get(hash, { verify: true });
    },
    async setPayloadRefs(scope, workId, hashes) {
      await assets.setOwnerRefs(ownerKey(scope, workId), hashes);
    },
    async deleteDocument(scope, workId) {
      await database.kvDelete(DATABASE_NAMESPACE, documentKey(scope, workId));
      await assets.setOwnerRefs(ownerKey(scope, workId), []);
    },
  };
}
export function createMemoryStudioOfflineBranchStorage(): StudioOfflineBranchStorage {
  const documents = new Map<string, Uint8Array>();
  const payloads = new Map<string, Uint8Array>();
  const refs = new Map<string, Set<string>>();
  return {
    status: {
      durability: "memory-only",
      message: "테스트 메모리 저장소를 사용합니다.",
    },
    async loadDocument(scope, workId) {
      const value = documents.get(documentKey(scope, workId));
      return value ? Uint8Array.from(value) : null;
    },
    async saveDocument(scope, workId, bytes) {
      documents.set(documentKey(scope, workId), Uint8Array.from(bytes));
    },
    async putPayload(bytes) {
      const hash = await sha256(bytes);
      payloads.set(hash, Uint8Array.from(bytes));
      return { hash, bytes: bytes.byteLength };
    },
    async getPayload(hash) {
      const value = payloads.get(hash);
      return value ? Uint8Array.from(value) : null;
    },
    async setPayloadRefs(scope, workId, hashes) {
      refs.set(ownerKey(scope, workId), new Set(hashes));
    },
    async deleteDocument(scope, workId) {
      documents.delete(documentKey(scope, workId));
      refs.delete(ownerKey(scope, workId));
    },
  };
}
