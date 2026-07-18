import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canonicalizeStudioAssetContentHash,
  createAssetRecord,
  ensureStudioAssetContentHash,
  hashStudioAssetDataUrl,
  listAssets,
  normalizeAssetName,
  saveAsset,
  type StudioAsset,
} from "./studio-asset-library";

interface FakeAssetDbState {
  records: Map<string, unknown>;
  requestedVersions: number[];
  transactionModes: IDBTransactionMode[];
  writeCount: number;
  failWrites: boolean;
}

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: ((this: IDBRequest<T>, event: Event) => unknown) | null = null;
  onerror: ((this: IDBRequest<T>, event: Event) => unknown) | null = null;

  succeed(result: T) {
    this.result = result;
    this.onsuccess?.call(this as unknown as IDBRequest<T>, new Event("success"));
  }

  fail(message = "fake indexedDB failure") {
    this.error = new DOMException(message, "UnknownError");
    this.onerror?.call(this as unknown as IDBRequest<T>, new Event("error"));
  }
}

class FakeAssetTransaction {
  error: DOMException | null = null;
  oncomplete: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onerror: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onabort: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  private pending = 0;
  private completed = false;
  private completionGeneration = 0;

  constructor(
    private readonly state: FakeAssetDbState,
    readonly mode: IDBTransactionMode
  ) {}

  objectStore(): IDBObjectStore {
    return new FakeAssetStore(this.state, this) as unknown as IDBObjectStore;
  }

  schedule<T>(operation: () => T, write = false): IDBRequest<T> {
    const request = new FakeRequest<T>();
    this.pending += 1;
    this.completionGeneration += 1;
    queueMicrotask(() => {
      if (write && this.state.failWrites) {
        request.fail("write failed");
        this.abortWithError(request.error ?? undefined);
        return;
      }
      try {
        request.succeed(operation());
      } catch (error) {
        request.fail(error instanceof Error ? error.message : undefined);
        this.abortWithError(request.error ?? undefined);
        return;
      }
      this.pending -= 1;
      this.scheduleCompletionCheck();
    });
    return request as unknown as IDBRequest<T>;
  }

  private scheduleCompletionCheck() {
    const generation = this.completionGeneration;
    queueMicrotask(() => {
      if (this.completed || this.pending > 0 || generation !== this.completionGeneration) return;
      this.completed = true;
      this.oncomplete?.call(this as unknown as IDBTransaction, new Event("complete"));
    });
  }

  private abortWithError(error?: DOMException) {
    if (this.completed) return;
    this.completed = true;
    this.error = error ?? new DOMException("transaction aborted", "AbortError");
    this.onabort?.call(this as unknown as IDBTransaction, new Event("abort"));
  }
}

class FakeAssetStore {
  constructor(
    private readonly state: FakeAssetDbState,
    private readonly transaction: FakeAssetTransaction
  ) {}

  getAll(): IDBRequest<unknown[]> {
    return this.transaction.schedule(() => Array.from(this.state.records.values()));
  }

  get(id: string): IDBRequest<unknown> {
    return this.transaction.schedule(() => this.state.records.get(id));
  }

  put(value: StudioAsset): IDBRequest<IDBValidKey> {
    return this.transaction.schedule<IDBValidKey>(() => {
      this.state.records.set(value.id, { ...value });
      this.state.writeCount += 1;
      return value.id;
    }, true);
  }

  delete(id: string): IDBRequest<undefined> {
    return this.transaction.schedule(() => {
      this.state.records.delete(id);
      this.state.writeCount += 1;
      return undefined;
    }, true);
  }
}

class FakeAssetDatabase {
  readonly objectStoreNames = {
    contains: (name: string) => name === "assets",
  } as unknown as DOMStringList;

  constructor(private readonly state: FakeAssetDbState) {}

  createObjectStore(): IDBObjectStore {
    return new FakeAssetStore(
      this.state,
      new FakeAssetTransaction(this.state, "versionchange")
    ) as unknown as IDBObjectStore;
  }

  transaction(_store: string, mode: IDBTransactionMode = "readonly"): IDBTransaction {
    this.state.transactionModes.push(mode);
    return new FakeAssetTransaction(this.state, mode) as unknown as IDBTransaction;
  }

  close() {
    // This in-memory database intentionally persists between open calls.
  }
}

function installFakeIndexedDb(
  seed: readonly StudioAsset[] = [],
  options: { failWrites?: boolean } = {}
): FakeAssetDbState {
  const state: FakeAssetDbState = {
    records: new Map(seed.map((asset) => [asset.id, { ...asset }])),
    requestedVersions: [],
    transactionModes: [],
    writeCount: 0,
    failWrites: options.failWrites ?? false,
  };
  const database = new FakeAssetDatabase(state);
  const factory = {
    open: (_name: string, version: number) => {
      state.requestedVersions.push(version);
      const request = new FakeRequest<IDBDatabase>() as FakeRequest<IDBDatabase> & {
        onupgradeneeded: ((this: IDBOpenDBRequest, event: IDBVersionChangeEvent) => unknown) | null;
      };
      request.onupgradeneeded = null;
      queueMicrotask(() => {
        request.result = database as unknown as IDBDatabase;
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
});

describe("studio-asset-library pure helpers", () => {
  describe("normalizeAssetName", () => {
    it("should strip common image extensions case-insensitively", () => {
      expect(normalizeAssetName("my-cat.png")).toBe("my-cat");
      expect(normalizeAssetName("sunset.JPEG")).toBe("sunset");
      expect(normalizeAssetName("animation.gif")).toBe("animation");
      expect(normalizeAssetName("vector.svg")).toBe("vector");
      expect(normalizeAssetName("photo.webp")).toBe("photo");
      expect(normalizeAssetName("image.avif")).toBe("image");
    });

    it("should handle names without extensions", () => {
      expect(normalizeAssetName("my-cool-asset")).toBe("my-cool-asset");
    });

    it("should fallback to '내 에셋' if name becomes empty after stripping", () => {
      expect(normalizeAssetName(".png")).toBe("내 에셋");
      expect(normalizeAssetName("   ")).toBe("내 에셋");
    });
  });

  describe("createAssetRecord", () => {
    it("should round dimensions and enforce a minimum of 1", () => {
      const record = createAssetRecord({
        name: "test.png",
        dataUrl: "data:image/png;base64,abc",
        width: 100.4,
        height: 200.6,
      });

      expect(record.name).toBe("test");
      expect(record.dataUrl).toBe("data:image/png;base64,abc");
      expect(record.width).toBe(100);
      expect(record.height).toBe(201);
      expect(record.id).toBeDefined();
      expect(record.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it("should enforce a minimum dimension of 1", () => {
      const record = createAssetRecord({
        name: "test.png",
        dataUrl: "data:image/png;base64,abc",
        width: -5,
        height: 0.1,
      });

      expect(record.width).toBe(1);
      expect(record.height).toBe(1);
    });

    it("should carry kind='ai' for generative-AI outputs (label/badge) and omit it otherwise", () => {
      const ai = createAssetRecord({
        name: "magic.webp",
        dataUrl: "data:image/webp;base64,abc",
        width: 1024,
        height: 1024,
        kind: "ai",
      });
      expect(ai.kind).toBe("ai");

      const upload = createAssetRecord({
        name: "upload.png",
        dataUrl: "data:image/png;base64,abc",
        width: 64,
        height: 64,
      });
      expect(upload.kind).toBeUndefined();
    });

    it("should allow overriding id and now", () => {
      const mockId = "custom-id";
      const mockNow = 1234567890;
      const record = createAssetRecord(
        {
          name: "test.png",
          dataUrl: "data:image/png;base64,abc",
          width: 100,
          height: 100,
        },
        mockId,
        mockNow
      );

      expect(record.id).toBe(mockId);
      expect(record.createdAt).toBe(mockNow);
    });
  });
});

describe("studio asset durable content identity", () => {
  const helloHash = `sha256:${"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"}` as const;

  it("canonicalizes only exact SHA-256 identities", () => {
    const uppercaseHex = "A".repeat(64);
    expect(canonicalizeStudioAssetContentHash(` SHA256:${uppercaseHex} `)).toBe(
      `sha256:${"a".repeat(64)}`
    );
    expect(canonicalizeStudioAssetContentHash(uppercaseHex)).toBeNull();
    expect(canonicalizeStudioAssetContentHash(`sha256:${"a".repeat(63)}`)).toBeNull();
    expect(canonicalizeStudioAssetContentHash("sha256:not-a-digest")).toBeNull();
  });

  it("hashes decoded bytes so equivalent base64 and percent payloads share identity", async () => {
    await expect(hashStudioAssetDataUrl("data:text/plain,hello")).resolves.toBe(helloHash);
    await expect(hashStudioAssetDataUrl("data:application/octet-stream;base64,aGVsbG8=")).resolves.toBe(
      helloHash
    );
    await expect(hashStudioAssetDataUrl("data:application/octet-stream;base64,aGVs%62G8=")).resolves.toBe(
      helloHash
    );

    const rawByteHash = await hashStudioAssetDataUrl("data:application/octet-stream,%FF");
    await expect(hashStudioAssetDataUrl("data:application/octet-stream;base64,/w==")).resolves.toBe(
      rawByteHash
    );
  });

  it("rejects malformed and non-data URLs without producing an identity", async () => {
    await expect(hashStudioAssetDataUrl("https://example.test/image.png")).rejects.toThrow(
      "데이터 URL"
    );
    await expect(hashStudioAssetDataUrl("data:image/png;base64,%%%")).rejects.toThrow("Base64");
    await expect(hashStudioAssetDataUrl("data:text/plain,bad%2")).rejects.toThrow("퍼센트");
  });

  it("reuses and canonicalizes an existing hash without mutating the source record", async () => {
    const source = createAssetRecord(
      {
        name: "legacy.png",
        dataUrl: "not-needed-when-hash-exists",
        width: 10,
        height: 10,
        contentHash: `SHA256:${"A".repeat(64)}`,
      },
      "asset-existing",
      1
    );
    const ensured = await ensureStudioAssetContentHash(source);

    expect(ensured.contentHash).toBe(`sha256:${"a".repeat(64)}`);
    expect(source.contentHash).toBe(`sha256:${"a".repeat(64)}`);
    expect(ensured).toBe(source);
  });

  it("requires a computed content hash for every new save while keeping DB v1", async () => {
    const state = installFakeIndexedDb();
    const saved = await saveAsset({
      name: "hello.png",
      dataUrl: "data:text/plain;base64,aGVsbG8=",
      width: 32,
      height: 16,
    });

    expect(saved.contentHash).toBe(helloHash);
    expect(state.records.get(saved.id)).toMatchObject({ contentHash: helloHash });
    expect(state.requestedVersions).toEqual([1]);
    expect(state.transactionModes).toEqual(["readwrite"]);
  });

  it("backfills valid legacy rows without allowing an unhashable row to break the list", async () => {
    const legacyValid = createAssetRecord(
      {
        name: "valid.png",
        dataUrl: "data:text/plain,hello",
        width: 20,
        height: 20,
      },
      "valid",
      20
    );
    const legacyCorrupt = createAssetRecord(
      {
        name: "corrupt.png",
        dataUrl: "not-a-data-url",
        width: 20,
        height: 20,
      },
      "corrupt",
      10
    );
    const state = installFakeIndexedDb([legacyCorrupt, legacyValid]);

    const listed = await listAssets();

    expect(listed.map(({ id }) => id)).toEqual(["valid", "corrupt"]);
    expect(listed[0].contentHash).toBe(helloHash);
    expect(listed[1].contentHash).toBeUndefined();
    expect(state.records.get("valid")).toMatchObject({ contentHash: helloHash });
    expect(state.records.get("corrupt")).not.toHaveProperty("contentHash");
    expect(state.transactionModes).toEqual(["readonly", "readwrite"]);
    expect(state.writeCount).toBe(1);

    await listAssets();
    expect(state.transactionModes).toEqual(["readonly", "readwrite", "readonly"]);
    expect(state.writeCount).toBe(1);
  });

  it("returns backfilled hashes even when opportunistic persistence fails", async () => {
    const legacy = createAssetRecord(
      {
        name: "legacy.png",
        dataUrl: "data:text/plain,hello",
        width: 20,
        height: 20,
      },
      "legacy",
      1
    );
    const state = installFakeIndexedDb([legacy], { failWrites: true });

    await expect(listAssets()).resolves.toMatchObject([{ id: "legacy", contentHash: helloHash }]);
    expect(state.records.get("legacy")).not.toHaveProperty("contentHash");
  });
});
