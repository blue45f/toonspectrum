import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BG3D_MODEL_LEGACY_EXTERNAL_STATUS_MESSAGE,
  BG3D_MODEL_LIBRARY_DB_VERSION,
  BG3D_MODEL_MIN_GLB_BYTES,
  BG3D_MODEL_STORAGE_VERSION,
  BG3D_MODEL_VALIDATION_VERSION,
  Bg3dModelLibraryError,
  admitStoredBg3dModelForRendering,
  canonicalizeBg3dModelHash,
  createStudioBg3dModelAttachment,
  createUploadedBg3dModelRecord,
  detectBg3dModelFormat,
  getDeletableModelIds,
  getStoredBg3dModel,
  getStoredBg3dModelByHash,
  importVerifiedBg3dModelsAtomically,
  isVerifiedBg3dModelRecord,
  listStoredBg3dModels,
  normalizeBg3dModelRights,
  prepareVerifiedBg3dModelRecord,
  revalidateStoredBg3dModelForRendering,
  SAMPLE_BG3D_MODEL_ENTRIES,
  SAMPLE_BG3D_MODELS,
  saveUploadedBg3dModel,
  withDefaultBg3dModelEntry,
  type Bg3dLegacyStoredRecord,
  type Bg3dModelStoredRecord,
  type Bg3dVerifiedStoredRecord,
} from "./bg3d-model-library";
import { STUDIO_BG3D_GLB_MAX_BYTES, STUDIO_BG3D_GLB_MIME_TYPE } from "./studio-bg3d-glb-validation";
import {
  createDefaultStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

const JSON_CHUNK = 0x4e4f534a;

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function validGlb(extras?: Record<string, unknown>): Uint8Array {
  const encodedJson = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{}],
    ...(extras ? { extras } : {}),
  }));
  const json = new Uint8Array(Math.ceil(encodedJson.byteLength / 4) * 4);
  json.fill(0x20);
  json.set(encodedJson);
  const bytes = new Uint8Array(12 + 8 + json.byteLength);
  writeUint32(bytes, 0, 0x46546c67);
  writeUint32(bytes, 4, 2);
  writeUint32(bytes, 8, bytes.byteLength);
  writeUint32(bytes, 12, json.byteLength);
  writeUint32(bytes, 16, JSON_CHUNK);
  bytes.set(json, 20);
  return bytes;
}

function glbFile(name = "Commercial Set.glb", bytes = validGlb(), type: string = STUDIO_BG3D_GLB_MIME_TYPE): File {
  return new File([Uint8Array.from(bytes).buffer], name, { type });
}

async function sha256(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

type StoreName = "models" | "thumbnails";

interface FakeIndexedDbState {
  readonly records: Map<string, unknown>;
  readonly thumbnails: Map<string, unknown>;
  readonly transactionModes: IDBTransactionMode[];
  readonly requestedVersions: number[];
  readonly createdIndexes: string[];
  readonly deletedKeys: string[];
}

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: ((this: IDBRequest<T>, event: Event) => unknown) | null = null;
  onerror: ((this: IDBRequest<T>, event: Event) => unknown) | null = null;

  succeed(result: T): void {
    this.result = result;
    this.onsuccess?.call(this as unknown as IDBRequest<T>, new Event("success"));
  }

  fail(): void {
    this.onerror?.call(this as unknown as IDBRequest<T>, new Event("error"));
  }
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onerror: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onabort: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  private pending = 0;
  private completionQueued = false;
  private completed = false;

  constructor(
    private readonly state: FakeIndexedDbState,
    readonly mode: IDBTransactionMode,
  ) {
    this.queueCompletion();
  }

  objectStore(name: string): IDBObjectStore {
    return new FakeObjectStore(this.state, this, name as StoreName) as unknown as IDBObjectStore;
  }

  request<T>(operation: () => T): IDBRequest<T> {
    const request = new FakeRequest<T>();
    this.pending += 1;
    queueMicrotask(() => {
      try {
        request.succeed(operation());
      } catch {
        request.fail();
        this.onerror?.call(this as unknown as IDBTransaction, new Event("error"));
      } finally {
        this.pending -= 1;
        this.queueCompletion();
      }
    });
    return request as unknown as IDBRequest<T>;
  }

  private queueCompletion(): void {
    if (this.completionQueued || this.completed) return;
    this.completionQueued = true;
    queueMicrotask(() => {
      this.completionQueued = false;
      if (this.pending > 0 || this.completed) return;
      this.completed = true;
      this.oncomplete?.call(this as unknown as IDBTransaction, new Event("complete"));
    });
  }
}

class FakeObjectStore {
  private readonly indexes = new Set<string>();

  constructor(
    private readonly state: FakeIndexedDbState,
    private readonly transaction: FakeTransaction,
    private readonly name: StoreName,
  ) {
    if (name === "models" && state.createdIndexes.includes("contentHash")) this.indexes.add("contentHash");
  }

  get indexNames(): DOMStringList {
    return { contains: (value: string) => this.indexes.has(value) } as DOMStringList;
  }

  createIndex(name: string): IDBIndex {
    this.indexes.add(name);
    if (!this.state.createdIndexes.includes(name)) this.state.createdIndexes.push(name);
    return this.index(name);
  }

  index(name: string): IDBIndex {
    if (name !== "contentHash") throw new Error("missing fake index");
    return {
      get: (hash: IDBValidKey) =>
        this.transaction.request(() =>
          [...this.state.records.values()].find(
            (value) =>
              typeof value === "object" &&
              value !== null &&
              "contentHash" in value &&
              value.contentHash === hash,
          ),
        ),
    } as IDBIndex;
  }

  getAll(): IDBRequest<unknown[]> {
    return this.transaction.request(() => [...this.store().values()]);
  }

  get(key: IDBValidKey): IDBRequest<unknown> {
    return this.transaction.request(() => this.store().get(String(key)));
  }

  put(value: unknown): IDBRequest<IDBValidKey> {
    return this.transaction.request<IDBValidKey>(() => {
      if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") {
        throw new Error("invalid fake record");
      }
      this.store().set(value.id, value);
      return value.id;
    });
  }

  add(value: unknown): IDBRequest<IDBValidKey> {
    return this.transaction.request<IDBValidKey>(() => {
      if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") {
        throw new Error("invalid fake record");
      }
      if (this.store().has(value.id)) throw new Error("duplicate fake primary key");
      if (
        "contentHash" in value
        && [...this.store().values()].some((candidate) =>
          typeof candidate === "object"
          && candidate !== null
          && "contentHash" in candidate
          && candidate.contentHash === value.contentHash
        )
      ) {
        throw new Error("duplicate fake content hash");
      }
      this.store().set(value.id, value);
      return value.id;
    });
  }

  delete(key: IDBValidKey): IDBRequest<undefined> {
    return this.transaction.request(() => {
      this.store().delete(String(key));
      this.state.deletedKeys.push(String(key));
      return undefined;
    });
  }

  private store(): Map<string, unknown> {
    return this.name === "models" ? this.state.records : this.state.thumbnails;
  }
}

class FakeDatabase {
  readonly objectStoreNames: DOMStringList;

  constructor(private readonly state: FakeIndexedDbState) {
    this.objectStoreNames = {
      contains: (name: string) => name === "models" || name === "thumbnails",
    } as unknown as DOMStringList;
  }

  createObjectStore(name: string): IDBObjectStore {
    return new FakeObjectStore(this.state, new FakeTransaction(this.state, "versionchange"), name as StoreName) as unknown as IDBObjectStore;
  }

  transaction(_stores: string | string[], mode: IDBTransactionMode = "readonly"): IDBTransaction {
    this.state.transactionModes.push(mode);
    return new FakeTransaction(this.state, mode) as unknown as IDBTransaction;
  }

  close(): void {
    // In-memory test database intentionally persists between open() calls.
  }
}

function installFakeIndexedDb(seed: readonly Bg3dModelStoredRecord[] = []): FakeIndexedDbState {
  const state: FakeIndexedDbState = {
    records: new Map(seed.map((record) => [record.id, record] as const)),
    thumbnails: new Map(),
    transactionModes: [],
    requestedVersions: [],
    createdIndexes: [],
    deletedKeys: [],
  };
  const database = new FakeDatabase(state);
  let upgraded = false;
  const factory = {
    open: (_name: string, version: number) => {
      state.requestedVersions.push(version);
      const request = new FakeRequest<IDBDatabase>() as FakeRequest<IDBDatabase> & {
        transaction: IDBTransaction | null;
        onupgradeneeded: ((this: IDBOpenDBRequest, event: IDBVersionChangeEvent) => unknown) | null;
      };
      request.transaction = database.transaction(["models", "thumbnails"], "versionchange");
      request.onupgradeneeded = null;
      queueMicrotask(() => {
        request.result = database as unknown as IDBDatabase;
        if (!upgraded) {
          upgraded = true;
          request.onupgradeneeded?.call(
            request as unknown as IDBOpenDBRequest,
            new Event("upgradeneeded") as IDBVersionChangeEvent,
          );
        }
        request.succeed(database as unknown as IDBDatabase);
      });
      return request as unknown as IDBOpenDBRequest;
    },
  } as IDBFactory;
  vi.stubGlobal("indexedDB", factory);
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bg3d-model-library format and metadata policy", () => {
  it("keeps broad legacy format detection but accepts only GLB on compatibility construction", () => {
    expect(detectBg3dModelFormat("house.GLB")).toBe("glb");
    expect(detectBg3dModelFormat("scene.gltf")).toBe("gltf");
    expect(detectBg3dModelFormat(" prop.OBJ ")).toBe("obj");
    expect(detectBg3dModelFormat("house.glb.exe")).toBeNull();
    expect(detectBg3dModelFormat("model.fbx")).toBeNull();

    expect(createUploadedBg3dModelRecord(glbFile(), "legacy-id", 42)).toMatchObject({
      id: "legacy-id",
      storageVersion: 1,
      name: "Commercial Set",
      format: "glb",
      createdAt: 42,
    });
    expect(() => createUploadedBg3dModelRecord(new File(["obj"], "set.obj"))).toThrowError(
      expect.objectContaining({ code: "unsupported-format" }),
    );
  });

  it("ships no unaudited bundled 3D assets", () => {
    expect(SAMPLE_BG3D_MODELS).toEqual([]);
    expect(SAMPLE_BG3D_MODEL_ENTRIES).toEqual([]);
  });

  it("canonicalizes exact SHA-256 identities and rejects near matches", () => {
    const hex = "a".repeat(64);
    expect(canonicalizeBg3dModelHash(hex.toUpperCase())).toBe(`sha256:${hex}`);
    expect(canonicalizeBg3dModelHash(`sha256:${hex}`)).toBe(`sha256:${hex}`);
    expect(canonicalizeBg3dModelHash(`${hex}0`)).toBeNull();
    expect(canonicalizeBg3dModelHash("sha256:not-a-digest")).toBeNull();
  });

  it("normalizes rights conservatively: unknown can never become commercially cleared", () => {
    expect(normalizeBg3dModelRights()).toEqual({
      status: "unknown",
      commercialUse: false,
      attributionRequired: false,
    });
    expect(normalizeBg3dModelRights({ status: "unknown", commercialUse: true })).toMatchObject({
      status: "unknown",
      commercialUse: false,
    });
    expect(
      normalizeBg3dModelRights({
        status: "licensed",
        commercialUse: true,
        attributionRequired: true,
        attribution: "  Studio Artist  ",
        licenseName: "Commercial license",
      }),
    ).toEqual({
      status: "licensed",
      commercialUse: true,
      attributionRequired: true,
      attribution: "Studio Artist",
      licenseName: "Commercial license",
    });
    expect(
      normalizeBg3dModelRights({
        status: "licensed",
        commercialUse: true,
        attributionRequired: false,
        licenseName: "https://example.invalid/license",
      }),
    ).toEqual({ status: "unknown", commercialUse: false, attributionRequired: false });
    const credentialLikeText = ["api_key", ["s", "k"].join(""), "test-credential"].join(" ");
    expect(
      normalizeBg3dModelRights({
        status: "owned",
        commercialUse: true,
        attributionRequired: true,
        attribution: credentialLikeText,
      }),
    ).toEqual({ status: "unknown", commercialUse: false, attributionRequired: false });
  });
});

describe("verified GLB preparation", () => {
  it("persists canonical validation metadata and only validator-owned bytes", async () => {
    const source = validGlb();
    const sharedBuffer = Uint8Array.from(source).buffer;
    const record = await prepareVerifiedBg3dModelRecord(
      {
        name: "  City Block.GLB ",
        size: source.byteLength,
        type: "application/octet-stream",
        arrayBuffer: async () => sharedBuffer,
      },
      {
        idFactory: () => "private-storage-id",
        now: 123,
        profile: "mobile",
      },
    );

    new Uint8Array(sharedBuffer).fill(0);
    const storedBytes = new Uint8Array(await record.blob.arrayBuffer());
    expect(storedBytes).toEqual(source);
    expect(record).toMatchObject({
      id: "private-storage-id",
      storageVersion: BG3D_MODEL_STORAGE_VERSION,
      validationVersion: BG3D_MODEL_VALIDATION_VERSION,
      name: "City Block",
      format: "glb",
      byteSize: source.byteLength,
      mime: STUDIO_BG3D_GLB_MIME_TYPE,
      validatorProfile: "mobile",
      validatedAt: 123,
      thumbnail: null,
      rights: { status: "unknown", commercialUse: false, attributionRequired: false },
    });
    expect(record.contentHash).toBe(await sha256(source));
    expect(record.validatorMetrics.byteSize).toBe(source.byteLength);
    expect(record.blob.type).toBe(STUDIO_BG3D_GLB_MIME_TYPE);
    expect(record.blob).not.toBe(sharedBuffer);
    expect(isVerifiedBg3dModelRecord(record)).toBe(true);
    expect(Object.keys(record).join(" ")).not.toMatch(/url|credential|token|secret/iu);
  });

  it("preserves explicit commercial rights without retaining caller object references", async () => {
    const rights = {
      status: "owned" as const,
      commercialUse: true,
      attributionRequired: false,
      licenseName: "In-house asset",
    };
    const record = await prepareVerifiedBg3dModelRecord(
      { file: glbFile(), rights },
      { idFactory: () => "verified-rights", now: 7 },
    );
    rights.licenseName = "changed after validation";

    expect(record.rights).toEqual({
      status: "owned",
      commercialUse: true,
      attributionRequired: false,
      licenseName: "In-house asset",
    });
    expect(record.rights).not.toBe(rights);
  });

  it("rejects hostile extensions, MIME, magic, and manifest hash without touching storage", async () => {
    await expect(prepareVerifiedBg3dModelRecord(null as never)).rejects.toMatchObject({ code: "invalid-file" });
    await expect(prepareVerifiedBg3dModelRecord(glbFile("scene.gltf"))).rejects.toMatchObject({
      code: "unsupported-format",
    });
    await expect(prepareVerifiedBg3dModelRecord(glbFile("scene.glb.exe"))).rejects.toMatchObject({
      code: "unsupported-format",
    });
    await expect(prepareVerifiedBg3dModelRecord(glbFile("scene.glb", validGlb(), "text/html"))).rejects.toMatchObject({
      code: "invalid-mime",
    });

    const invalidMagic = validGlb();
    invalidMagic[0] = 0;
    await expect(prepareVerifiedBg3dModelRecord(glbFile("scene.glb", invalidMagic))).rejects.toMatchObject({
      code: "validation-failed",
      validationCode: "invalid-magic",
    });
    await expect(
      prepareVerifiedBg3dModelRecord({ file: glbFile(), expectedSha256: `sha256:${"0".repeat(64)}` }),
    ).rejects.toMatchObject({ code: "hash-mismatch" });
  });

  it("enforces the 100MiB pre-read guard", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    await expect(
      prepareVerifiedBg3dModelRecord({
        name: "oversized.glb",
        type: STUDIO_BG3D_GLB_MIME_TYPE,
        size: STUDIO_BG3D_GLB_MAX_BYTES + 1,
        arrayBuffer,
      }),
    ).rejects.toMatchObject({ code: "file-too-large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects explicit storage IDs with invalid length, characters, reserved names, or credential patterns", async () => {
    const credentialLikeId = [["s", "k"].join(""), "abcdefgh"].join("-");
    const invalidIds = ["../storage", "x".repeat(81), "Constructor", credentialLikeId];
    for (const id of invalidIds) {
      await expect(
        prepareVerifiedBg3dModelRecord(glbFile(), {
          idFactory: () => id,
          now: 1,
        }),
      ).rejects.toMatchObject({ code: "invalid-file" });
    }
  });
});

describe("renderer admission revalidation", () => {
  it("returns the actual fresh validation success and its validator-owned bytes", async () => {
    const bytes = validGlb();
    const record = await prepareVerifiedBg3dModelRecord(glbFile("Admission.glb", bytes), {
      idFactory: () => "admission-record",
      now: 8,
    });

    const admitted = await revalidateStoredBg3dModelForRendering(record, { profile: "mobile" });
    expect(admitted).toMatchObject({
      ok: true,
      code: "valid",
      profile: "mobile",
      verifiedSha256: record.contentHash,
      metrics: record.validatorMetrics,
    });
    expect(admitted.verifiedBytes).toEqual(bytes);
    expect(admitted.verifiedBytes).not.toBe(bytes);
    expect("blob" in admitted).toBe(false);
  });

  it("rejects stored bytes whose hash no longer matches the V2 record", async () => {
    const record = await prepareVerifiedBg3dModelRecord(glbFile(), {
      idFactory: () => "tampered-record",
      now: 9,
    });
    const tamperedBytes = new Uint8Array(await record.blob.arrayBuffer());
    tamperedBytes[tamperedBytes.length - 1] ^= 1;
    const tamperedRecord: Bg3dVerifiedStoredRecord = {
      ...record,
      blob: new Blob([tamperedBytes.buffer], { type: STUDIO_BG3D_GLB_MIME_TYPE }),
    };
    expect(isVerifiedBg3dModelRecord(tamperedRecord)).toBe(true);

    await expect(revalidateStoredBg3dModelForRendering(tamperedRecord)).rejects.toMatchObject({
      code: "stored-metadata-mismatch",
      validationCode: "hash-mismatch",
    });
  });

  it("rejects a structurally valid V2 record when persisted validator metrics differ", async () => {
    const record = await prepareVerifiedBg3dModelRecord(glbFile(), {
      idFactory: () => "metric-mismatch",
      now: 10,
    });
    const mismatchedRecord: Bg3dVerifiedStoredRecord = {
      ...record,
      validatorMetrics: {
        ...record.validatorMetrics,
        nodes: record.validatorMetrics.nodes + 1,
      },
    };
    expect(isVerifiedBg3dModelRecord(mismatchedRecord)).toBe(true);
    await expect(revalidateStoredBg3dModelForRendering(mismatchedRecord)).rejects.toMatchObject({
      code: "stored-metadata-mismatch",
    });
  });

  it("resolves storage privately and admits only a validation success object", async () => {
    const record = await prepareVerifiedBg3dModelRecord(glbFile(), {
      idFactory: () => "stored-admission",
      now: 11,
    });
    installFakeIndexedDb([record]);

    const admitted = await admitStoredBg3dModelForRendering(record.id, { profile: "desktop" });
    expect(admitted.ok).toBe(true);
    expect(admitted.verifiedSha256).toBe(record.contentHash);
    expect("id" in admitted).toBe(false);
    expect("blob" in admitted).toBe(false);
  });
});

describe("V2 IndexedDB behavior", () => {
  it("upgrades to DB V2 with a content-hash index without deleting legacy records", async () => {
    const legacy: Bg3dLegacyStoredRecord = {
      id: "legacy-obj",
      name: "Old OBJ",
      format: "obj",
      blob: new Blob(["obj"]),
      thumbnail: null,
      createdAt: 1,
      updatedAt: 2,
    };
    const state = installFakeIndexedDb([legacy]);

    expect(await listStoredBg3dModels()).toEqual([legacy]);
    expect(state.requestedVersions).toEqual([BG3D_MODEL_LIBRARY_DB_VERSION]);
    expect(state.createdIndexes).toContain("contentHash");
    expect(state.deletedKeys).toEqual([]);
    expect(state.records.get("legacy-obj")).toBe(legacy);

    const [entry] = withDefaultBg3dModelEntry([legacy]);
    expect(entry).toMatchObject({
      id: "legacy-obj",
      status: "legacy-reimport-required",
      canUse: false,
      contentHash: null,
      commercialUse: false,
      statusMessage: BG3D_MODEL_LEGACY_EXTERNAL_STATUS_MESSAGE,
    });
    expect(await getStoredBg3dModel("legacy-obj")).toBeNull();
    expect(state.records.has("legacy-obj")).toBe(true);
  });

  it("validates a whole batch before its one write transaction and leaves no partial imports", async () => {
    const state = installFakeIndexedDb();
    const invalid = validGlb();
    invalid[0] = 0;

    await expect(
      importVerifiedBg3dModelsAtomically([glbFile("valid.glb"), glbFile("invalid.glb", invalid)], {
        idFactory: () => "batch-id",
        now: 5,
      }),
    ).rejects.toMatchObject({ code: "validation-failed" });
    expect(state.transactionModes).not.toContain("readwrite");
    expect(state.records.size).toBe(0);
  });

  it("honors a late abort immediately before opening the write transaction", async () => {
    const state = installFakeIndexedDb();
    const controller = new AbortController();

    await expect(importVerifiedBg3dModelsAtomically([glbFile("cancelled.glb")], {
      signal: controller.signal,
      idFactory: () => {
        controller.abort();
        return "cancelled-storage";
      },
    })).rejects.toMatchObject({ code: "aborted" });

    expect(state.transactionModes).not.toContain("readwrite");
    expect(state.records.size).toBe(0);
  });

  it("lazily promotes a legacy GLB only after full validation and keeps unknown rights commercial-safe", async () => {
    const bytes = validGlb();
    const legacy: Bg3dLegacyStoredRecord = {
      id: "legacy-glb",
      name: "Legacy Block",
      format: "glb",
      blob: new Blob([Uint8Array.from(bytes).buffer], { type: STUDIO_BG3D_GLB_MIME_TYPE }),
      thumbnail: null,
      createdAt: 3,
      updatedAt: 4,
    };
    const state = installFakeIndexedDb([legacy]);

    const promoted = await getStoredBg3dModel("legacy-glb");
    expect(promoted).toMatchObject({
      id: "legacy-glb",
      storageVersion: BG3D_MODEL_STORAGE_VERSION,
      contentHash: await sha256(bytes),
      rights: { status: "unknown", commercialUse: false, attributionRequired: false },
    });
    expect(isVerifiedBg3dModelRecord(state.records.get("legacy-glb"))).toBe(true);
    expect(state.deletedKeys).toEqual([]);
  });

  it("deduplicates same-byte imports by canonical hash and supports exact hash lookup", async () => {
    const state = installFakeIndexedDb();
    let id = 0;
    const bytes = validGlb();
    const records = await importVerifiedBg3dModelsAtomically(
      [glbFile("first.glb", bytes), glbFile("second.glb", bytes)],
      {
        idFactory: () => `storage-${++id}`,
        now: 11,
        maximumCumulativeBytes: bytes.byteLength,
      },
    );

    expect(records).toHaveLength(1);
    expect(state.records.size).toBe(1);
    expect(state.transactionModes.filter((mode) => mode === "readwrite")).toHaveLength(1);
    const canonicalHash = await sha256(bytes);
    expect((await getStoredBg3dModelByHash(canonicalHash))?.id).toBe("storage-1");
    expect(await getStoredBg3dModelByHash(canonicalHash.slice(0, -1) + "0")).toBeNull();
    expect(await getStoredBg3dModelByHash("not-a-hash")).toBeNull();

    const existingState = installFakeIndexedDb([records[0]!]);
    const duplicateOfExisting = await importVerifiedBg3dModelsAtomically(
      [glbFile("existing-again.glb", bytes)],
      {
        maximumCumulativeBytes: bytes.byteLength,
        idFactory: () => "must-not-be-written",
      },
    );
    expect(duplicateOfExisting).toEqual([records[0]]);
    expect(existingState.transactionModes).not.toContain("readwrite");
  });

  it("does not charge unrelated existing library bytes against the current batch budget", async () => {
    const existingBytes = validGlb({ extras: { project: "unrelated" } });
    const incomingBytes = validGlb({ extras: { project: "current" } });
    const existing = await prepareVerifiedBg3dModelRecord(
      glbFile("unrelated.glb", existingBytes),
      { idFactory: () => "unrelated-storage", now: 1 },
    );
    const state = installFakeIndexedDb([existing]);

    const imported = await importVerifiedBg3dModelsAtomically(
      [glbFile("current.glb", incomingBytes)],
      {
        idFactory: () => "current-storage",
        now: 2,
        cumulativeUsedBytes: 0,
        maximumCumulativeBytes: incomingBytes.byteLength,
      },
    );

    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ id: "current-storage", byteSize: incomingBytes.byteLength });
    expect(state.records.has("unrelated-storage")).toBe(true);
    expect(state.records.has("current-storage")).toBe(true);
  });

  it("counts a referenced existing hash once in the current batch cumulative budget", async () => {
    const existingBytes = validGlb({ extras: { asset: "existing-and-referenced" } });
    const incomingBytes = validGlb({ extras: { asset: "new-and-referenced" } });
    const existing = await prepareVerifiedBg3dModelRecord(
      glbFile("existing.glb", existingBytes),
      { idFactory: () => "existing-storage", now: 1 },
    );
    const maximum = existingBytes.byteLength + incomingBytes.byteLength;
    const state = installFakeIndexedDb([existing]);

    await expect(importVerifiedBg3dModelsAtomically(
      [glbFile("existing-again.glb", existingBytes), glbFile("new.glb", incomingBytes)],
      {
        idFactory: () => "not-committed",
        maximumCumulativeBytes: maximum - 1,
      },
    )).rejects.toMatchObject({
      code: "validation-failed",
      validationCode: "cumulative-byte-budget-exceeded",
    });
    expect(state.transactionModes).not.toContain("readwrite");

    const retryState = installFakeIndexedDb([existing]);
    let id = 0;
    const imported = await importVerifiedBg3dModelsAtomically(
      [
        glbFile("existing-first.glb", existingBytes),
        glbFile("existing-duplicate.glb", existingBytes),
        glbFile("new.glb", incomingBytes),
      ],
      {
        idFactory: () => `batch-storage-${++id}`,
        maximumCumulativeBytes: maximum,
      },
    );

    expect(imported).toHaveLength(2);
    expect(imported[0]?.id).toBe("existing-storage");
    expect(imported[1]?.contentHash).toBe(await sha256(incomingBytes));
    expect(retryState.records.size).toBe(2);
  });

  it("fails closed when a duplicate hash changes rights or different hashes reuse a storage id", async () => {
    const bytes = validGlb();
    const owned = await prepareVerifiedBg3dModelRecord({
      file: glbFile("owned.glb", bytes),
      rights: { status: "owned", commercialUse: true, attributionRequired: false },
    }, { idFactory: () => "owned-record", now: 1 });
    const state = installFakeIndexedDb([owned]);

    await expect(importVerifiedBg3dModelsAtomically([{
      file: glbFile("unknown.glb", bytes),
      rights: { status: "unknown", commercialUse: false, attributionRequired: false },
    }])).rejects.toMatchObject({ code: "rights-conflict" });
    expect(state.transactionModes).not.toContain("readwrite");
    expect(state.records.get("owned-record")).toBe(owned);

    installFakeIndexedDb();
    const secondBytes = validGlb({ extras: { variant: 2 } });
    await expect(importVerifiedBg3dModelsAtomically(
      [glbFile("first-id.glb", bytes), glbFile("second-id.glb", secondBytes)],
      { idFactory: () => "same-storage-id", now: 2 },
    )).rejects.toMatchObject({ code: "storage-id-conflict" });
  });

  it("saveUploadedBg3dModel fails closed for non-GLB before an IndexedDB write", async () => {
    const state = installFakeIndexedDb();
    await expect(saveUploadedBg3dModel(new File(["obj"], "prop.obj"))).rejects.toBeInstanceOf(
      Bg3dModelLibraryError,
    );
    expect(state.transactionModes).not.toContain("readwrite");
  });
});

describe("scene attachment isolation and library presentation", () => {
  it("creates scene-local metadata without leaking or reusing the private storage id", async () => {
    const record = await prepareVerifiedBg3dModelRecord(
      { file: glbFile(), rights: { status: "owned", commercialUse: true, attributionRequired: false } },
      { idFactory: () => "private-storage-key", now: 99 },
    );
    const attachment = createStudioBg3dModelAttachment(record, { attachmentId: "scene-attachment-1" });

    expect(attachment).toEqual({
      id: "scene-attachment-1",
      name: "Commercial Set.glb",
      mime: STUDIO_BG3D_GLB_MIME_TYPE,
      byteSize: record.byteSize,
      hash: record.contentHash,
      rights: record.rights,
      source: "local-library",
    });
    expect(JSON.stringify(attachment)).not.toContain("private-storage-key");
    expect(
      serializeStudioBg3dSceneDocument({
        ...createDefaultStudioBg3dSceneDocument(),
        attachments: [attachment],
      }),
    ).not.toBeNull();
    expect(() => createStudioBg3dModelAttachment(record, { attachmentId: record.id })).toThrowError(
      expect.objectContaining({ code: "invalid-attachment" }),
    );
    expect(() => createStudioBg3dModelAttachment(record, { attachmentId: "../unsafe" })).toThrowError(
      expect.objectContaining({ code: "invalid-attachment" }),
    );
    expect(() => createStudioBg3dModelAttachment(record, { attachmentId: "Constructor" })).toThrowError(
      expect.objectContaining({ code: "invalid-attachment" }),
    );
  });

  it("shows verified and legacy entries distinctly, newest first, and only deletes local rows", async () => {
    const verified = await prepareVerifiedBg3dModelRecord(glbFile("Verified.glb"), {
      idFactory: () => "verified",
      now: 20,
    });
    const legacy: Bg3dLegacyStoredRecord = {
      id: "legacy",
      name: "Legacy",
      format: "gltf",
      blob: new Blob(["gltf"]),
      thumbnail: null,
      createdAt: 1,
      updatedAt: 10,
    };
    const entries = withDefaultBg3dModelEntry([legacy, verified]);

    expect(entries.map((entry) => entry.id)).toEqual(["verified", "legacy"]);
    expect(entries[0]).toMatchObject({ status: "verified", canUse: true, contentHash: verified.contentHash });
    expect(entries[1]).toMatchObject({ status: "legacy-reimport-required", canUse: false, contentHash: null });
    expect(
      getDeletableModelIds([
        ...entries,
        {
          ...entries[0],
          id: "sample",
          source: "sample",
        },
      ]),
    ).toEqual(["verified", "legacy"]);
  });

  it("rejects structurally forged V2 records", async () => {
    const verified = await prepareVerifiedBg3dModelRecord(glbFile(), {
      idFactory: () => "verified",
      now: 1,
    });
    const forged = {
      ...verified,
      byteSize: verified.byteSize + 1,
    } satisfies Bg3dVerifiedStoredRecord;
    expect(isVerifiedBg3dModelRecord(forged)).toBe(false);

    const belowMinimum = BG3D_MODEL_MIN_GLB_BYTES - 1;
    const undersized = {
      ...verified,
      blob: new Blob([new Uint8Array(belowMinimum).buffer], { type: STUDIO_BG3D_GLB_MIME_TYPE }),
      byteSize: belowMinimum,
      validatorMetrics: { ...verified.validatorMetrics, byteSize: belowMinimum },
    } satisfies Bg3dVerifiedStoredRecord;
    expect(isVerifiedBg3dModelRecord(undersized)).toBe(false);
  });
});
