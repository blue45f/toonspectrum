import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  STUDIO_PUBLISH_HANDOFF_TTL_MS,
  StudioPublishHandoffError,
  createStudioPublishHandoffRepository,
  studioPublishHandoffHref,
} from "./studio-publish-handoff";

import type { StudioLocalDatabase } from "./studio-local-database";
import type {
  StudioOpfsAssetEntry,
  StudioOpfsAssetStore,
  StudioOpfsContentHash,
} from "./studio-opfs-asset-store";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function memoryDatabase(): StudioLocalDatabase {
  const values = new Map<string, string>();
  const key = (namespace: string, item: string) => `${namespace}\u0000${item}`;
  return {
    async kvGet(namespace: string, item: string) {
      return values.get(key(namespace, item)) ?? null;
    },
    async kvSet(namespace: string, item: string, value: string) {
      values.set(key(namespace, item), value);
    },
    async kvDelete(namespace: string, item: string) {
      values.delete(key(namespace, item));
    },
  } as unknown as StudioLocalDatabase;
}

interface MemoryAssets extends StudioOpfsAssetStore {
  corrupt(hash: string): void;
  ownerSnapshot(owner: string): readonly string[];
}

function memoryAssets(): MemoryAssets {
  const values = new Map<StudioOpfsContentHash, { bytes: Uint8Array; entry: StudioOpfsAssetEntry }>();
  const owners = new Map<string, Set<StudioOpfsContentHash>>();
  const toHash = (bytes: Uint8Array): StudioOpfsContentHash =>
    `sha256:${createHash("sha256").update(bytes).digest("hex")}` as StudioOpfsContentHash;
  const store: MemoryAssets = {
    kind: "memory",
    async put(bytes, options = {}) {
      const hash = toHash(bytes);
      const previous = values.get(hash);
      const entry: StudioOpfsAssetEntry = previous?.entry ?? {
        hash,
        path: `blobs/${hash.slice(7)}.bin`,
        bytes: bytes.byteLength,
        storedBytes: bytes.byteLength,
        codec: "identity",
        mime: options.mime ?? "application/octet-stream",
        createdAt: 1,
        lastAccessAt: 1,
      };
      values.set(hash, { bytes: Uint8Array.from(bytes), entry });
      return { ref: { hash, bytes: entry.bytes, mime: entry.mime }, entry, deduped: Boolean(previous) };
    },
    async get(hash) {
      const value = values.get(hash as StudioOpfsContentHash);
      return value ? Uint8Array.from(value.bytes) : null;
    },
    async has(hash) {
      return values.has(hash as StudioOpfsContentHash);
    },
    async stat(hash) {
      return values.get(hash as StudioOpfsContentHash)?.entry ?? null;
    },
    async delete(hash) {
      return values.delete(hash as StudioOpfsContentHash);
    },
    async list() {
      return [...values.values()].map(({ entry }) => entry);
    },
    async setOwnerRefs(owner, hashes) {
      const normalized = hashes.filter((hash): hash is StudioOpfsContentHash =>
        /^sha256:[0-9a-f]{64}$/u.test(hash));
      owners.set(owner, new Set(normalized));
      return normalized;
    },
    async ownerRefs(owner) {
      return [...(owners.get(owner) ?? [])];
    },
    async owners() {
      return [...owners.keys()];
    },
    async sweep() {
      return { removed: [], retainedInGrace: [], referenced: 0, freedBytes: 0 };
    },
    async rebuildIndex() {
      return [...values.values()].map(({ entry }) => entry);
    },
    async estimateQuota() {
      return {
        usage: 0,
        quota: null,
        available: null,
        usedRatio: null,
        level: "unknown" as const,
        message: null,
      };
    },
    async totalStoredBytes() {
      return [...values.values()].reduce((sum, value) => sum + value.entry.storedBytes, 0);
    },
    corrupt(hash) {
      const value = values.get(hash as StudioOpfsContentHash);
      if (value) value.bytes[0] = 0;
    },
    ownerSnapshot(owner) {
      return [...(owners.get(owner) ?? [])];
    },
  };
  return store;
}

function page(name = "page.png", width = 8, height = 6) {
  return { bytes: png(width, height), mime: "image/png", width, height, name };
}

describe("studio publish handoff repository", () => {
  it("SQLite manifest와 CAS 원고를 왕복하고 삭제할 때 owner 참조를 해제한다", async () => {
    const database = memoryDatabase();
    const assets = memoryAssets();
    const repository = createStudioPublishHandoffRepository({
      acquireDatabase: async () => database,
      acquireAssets: async () => assets,
      now: () => 1_000,
      createId: () => "handoff-roundtrip",
      runExclusive: null,
    });

    const saved = await repository.save({
      title: "성운의 왕관",
      sourceWorkId: "work-1",
      pages: [page("cover.png"), page("page-2.png", 4, 9)],
    });
    expect(saved.pages).toHaveLength(2);
    expect(assets.ownerSnapshot("studio-publish-handoff-v1:handoff-roundtrip")).toHaveLength(2);

    const loaded = await repository.load(saved.id);
    expect(loaded?.record).toMatchObject({
      id: "handoff-roundtrip",
      title: "성운의 왕관",
      sourceWorkId: "work-1",
    });
    expect(loaded?.pages.map((item) => [item.name, item.width, item.height])).toEqual([
      ["cover.png", 8, 6],
      ["page-2.png", 4, 9],
    ]);

    await repository.remove(saved.id);
    await expect(repository.load(saved.id)).resolves.toBeNull();
    expect(assets.ownerSnapshot("studio-publish-handoff-v1:handoff-roundtrip")).toEqual([]);
  });

  it("24시간이 지난 인계는 읽기 전에 제거한다", async () => {
    let timestamp = 10_000;
    const database = memoryDatabase();
    const assets = memoryAssets();
    const repository = createStudioPublishHandoffRepository({
      acquireDatabase: async () => database,
      acquireAssets: async () => assets,
      now: () => timestamp,
      createId: () => "handoff-expired",
      runExclusive: null,
    });
    await repository.save({ title: "만료 테스트", pages: [page()] });
    timestamp += STUDIO_PUBLISH_HANDOFF_TTL_MS + 1;

    await expect(repository.load("handoff-expired")).resolves.toBeNull();
    expect(assets.ownerSnapshot("studio-publish-handoff-v1:handoff-expired")).toEqual([]);
  });

  it("선언한 크기와 이미지 헤더가 다르면 저장하지 않는다", async () => {
    const repository = createStudioPublishHandoffRepository({
      acquireDatabase: async () => memoryDatabase(),
      acquireAssets: async () => memoryAssets(),
      createId: () => "handoff-mismatch",
      runExclusive: null,
    });
    await expect(repository.save({
      title: "불일치",
      pages: [{ ...page(), width: 999 }],
    })).rejects.toThrow(/실제 바이트와 일치하지 않습니다/u);
  });

  it("CAS 바이트가 손상되면 인계를 제거하고 명시적인 오류를 반환한다", async () => {
    const database = memoryDatabase();
    const assets = memoryAssets();
    const repository = createStudioPublishHandoffRepository({
      acquireDatabase: async () => database,
      acquireAssets: async () => assets,
      createId: () => "handoff-corrupt",
      runExclusive: null,
    });
    const saved = await repository.save({ title: "손상", pages: [page()] });
    assets.corrupt(saved.pages[0]!.hash);

    await expect(repository.load(saved.id)).rejects.toBeInstanceOf(StudioPublishHandoffError);
    expect(assets.ownerSnapshot("studio-publish-handoff-v1:handoff-corrupt")).toEqual([]);
  });

  it("활성 인계를 8개로 제한하고 가장 오래된 인계를 정리한다", async () => {
    let timestamp = 1_000;
    let sequence = 0;
    const database = memoryDatabase();
    const assets = memoryAssets();
    const repository = createStudioPublishHandoffRepository({
      acquireDatabase: async () => database,
      acquireAssets: async () => assets,
      now: () => timestamp++,
      createId: () => `handoff-${String(++sequence).padStart(4, "0")}`,
      runExclusive: null,
    });
    for (let index = 0; index < 9; index += 1) {
      await repository.save({ title: `작품 ${index}`, pages: [page(`page-${index}.png`)] });
    }

    await expect(repository.load("handoff-0001")).resolves.toBeNull();
    await expect(repository.load("handoff-0009")).resolves.toMatchObject({
      record: { title: "작품 8" },
    });
  });

  it("URL에는 검증된 인계 식별자만 넣는다", () => {
    expect(studioPublishHandoffHref("handoff-valid-1")).toBe(
      "/studio/publish?handoff=handoff-valid-1",
    );
    expect(studioPublishHandoffHref("handoff-valid-1", "work/one")).toBe(
      "/studio/work/work%2Fone/publish?handoff=handoff-valid-1",
    );
    expect(() => studioPublishHandoffHref("../other")).toThrow(StudioPublishHandoffError);
  });
});
