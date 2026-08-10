import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStudioCustomFontSqliteOpfsRepository,
  parseStudioCustomFontManifest,
  serializeStudioCustomFontManifest,
  STUDIO_CUSTOM_FONT_CAS_OWNER,
  STUDIO_CUSTOM_FONT_LIMITS,
  STUDIO_CUSTOM_FONT_SQLITE_MANIFEST_KEY,
  STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE,
  type StudioCustomFontManifestEntry,
} from "./studio-custom-font-sqlite-opfs-repository";
import { openStudioLocalDatabase } from "./studio-local-database";
import { createStudioOpfsAssetStore } from "./studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "./studio-opfs-filesystem";

import type {
  StudioLocalDatabase,
  StudioSqliteApiHandle,
} from "./studio-local-database";
import type { StudioOpfsAssetStore } from "./studio-opfs-asset-store";
import type { StudioOpfsMemoryFileSystem } from "./studio-opfs-filesystem";

let sqlite3: StudioSqliteApiHandle;
const opened: StudioLocalDatabase[] = [];

beforeAll(async () => {
  const module = await import("@sqlite.org/sqlite-wasm");
  sqlite3 = (await module.default()) as unknown as StudioSqliteApiHandle;
});

afterAll(async () => {
  for (const database of opened) await database.close();
});

async function openMemoryDatabase(
  memoryFilename = `custom-font-${crypto.randomUUID()}.sqlite3`,
  tracked = true,
): Promise<StudioLocalDatabase> {
  const database = await openStudioLocalDatabase({
    vfs: "memory",
    memoryFilename,
    loadSqlite: () => Promise.resolve(sqlite3),
  });
  if (tracked) opened.push(database);
  return database;
}

function fontBytes(seed: number, size = 96): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x00, 0x01, 0x00, 0x00]);
  for (let index = 4; index < size; index++) bytes[index] = (seed + index * 31) & 0xff;
  return bytes;
}

interface Fixture {
  readonly database: StudioLocalDatabase;
  readonly fs: StudioOpfsMemoryFileSystem;
  readonly store: StudioOpfsAssetStore;
  readonly repository: ReturnType<typeof createStudioCustomFontSqliteOpfsRepository>;
}

async function fixture(options: {
  readonly database?: StudioLocalDatabase;
  readonly fs?: StudioOpfsMemoryFileSystem;
  readonly store?: StudioOpfsAssetStore;
  readonly memoryFilename?: string;
  readonly createId?: () => string;
  readonly now?: () => number;
} = {}): Promise<Fixture> {
  const database = options.database ?? await openMemoryDatabase(options.memoryFilename);
  const fs = options.fs ?? createStudioOpfsMemoryFileSystem();
  const store = options.store ?? createStudioOpfsAssetStore({ fs, graceMs: 0 });
  let sequence = 0;
  const repository = createStudioCustomFontSqliteOpfsRepository({
    acquireDatabase: async () => database,
    acquireAssetStore: async () => store,
    runExclusive: (task) => task(),
    now: options.now ?? (() => 1_800_000_000_000 + sequence),
    createId: options.createId ?? (() => `font-${String(sequence++).padStart(4, "0")}`),
  });
  return { database, fs, store, repository };
}

function proxyDatabase(
  database: StudioLocalDatabase,
  override: Partial<Pick<StudioLocalDatabase, "kvGet" | "kvSet">>,
): StudioLocalDatabase {
  return new Proxy(database, {
    get(target, property) {
      const replacement = override[property as keyof typeof override];
      if (replacement) return replacement;
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function manifestEntry(index: number, overrides: Partial<StudioCustomFontManifestEntry> = {}) {
  const format = "ttf" as const;
  return {
    id: `font-${String(index).padStart(4, "0")}`,
    family: `CJK Family ${index}`,
    fileName: `CJK-Family-${index}.ttf`,
    format,
    mimeType: "font/ttf",
    contentHash: `sha256:${"a".repeat(64)}` as const,
    byteLength: 1,
    createdAt: 1_800_000_000_000 + index,
    ...overrides,
  };
}

describe("custom-font SQLite canonical manifest plus OPFS SHA-256 CAS", () => {
  it("keeps only canonical metadata in SQLite and returns verified original bytes", async () => {
    const { database, repository, store } = await fixture();
    const original = fontBytes(7, 4_096);
    const saved = await repository.save({ fileName: "Noto Sans CJK KR.ttf", bytes: original });

    const raw = await database.kvGet(
      STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE,
      STUDIO_CUSTOM_FONT_SQLITE_MANIFEST_KEY,
    );
    expect(raw).not.toContain("data:");
    expect(raw).not.toContain("base64");
    expect(raw).not.toContain("verifiedBytes");
    expect(parseStudioCustomFontManifest(raw).entries[0]).toMatchObject({
      id: saved.id,
      family: "Noto Sans CJK KR",
      contentHash: saved.contentHash,
      byteLength: original.byteLength,
      format: "ttf",
      mimeType: "font/ttf",
    });
    expect(await store.ownerRefs(STUDIO_CUSTOM_FONT_CAS_OWNER)).toEqual([saved.contentHash]);
    const listed = await repository.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.dataUrl).toBeUndefined();
    expect(listed[0]?.verifiedBytes).toEqual(original);
  });

  it("persists through real sqlite-wasm close/reopen and a rebuilt OPFS store", async () => {
    const filename = `custom-font-reopen-${crypto.randomUUID()}.sqlite3`;
    const fs = createStudioOpfsMemoryFileSystem();
    const firstDatabase = await openMemoryDatabase(filename, false);
    const first = await fixture({ database: firstDatabase, fs, createId: () => "reopen-font" });
    const saved = await first.repository.save({ fileName: "본고딕.ttc", bytes: fontBytes(11) });
    await firstDatabase.close();

    const reopenedDatabase = await openMemoryDatabase(filename);
    const reopenedStore = createStudioOpfsAssetStore({ fs, graceMs: 0 });
    const reopened = await fixture({
      database: reopenedDatabase,
      fs,
      store: reopenedStore,
      createId: () => "unused-font",
    });
    const listed = await reopened.repository.list();
    expect(listed.map(({ id, contentHash }) => ({ id, contentHash }))).toEqual([{
      id: saved.id,
      contentHash: saved.contentHash,
    }]);
    expect(listed[0]?.verifiedBytes).toEqual(fontBytes(11));
  });

  it("fails closed when a CAS blob is missing", async () => {
    const { database, repository, store } = await fixture();
    const saved = await repository.save({ fileName: "Missing.ttf", bytes: fontBytes(13) });
    const manifestBefore = await database.kvGet(
      STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE,
      STUDIO_CUSTOM_FONT_SQLITE_MANIFEST_KEY,
    );
    await store.delete(saved.contentHash);

    await expect(repository.list()).rejects.toMatchObject({ code: "corrupt" });
    expect(await database.kvGet(
      STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE,
      STUDIO_CUSTOM_FONT_SQLITE_MANIFEST_KEY,
    )).toBe(manifestBefore);
  });

  it("detects same-length blob tampering through verify:true rehash", async () => {
    const { fs, repository, store } = await fixture();
    const saved = await repository.save({ fileName: "Tampered.ttf", bytes: fontBytes(17) });
    const stat = await store.stat(saved.contentHash);
    expect(stat).not.toBeNull();
    const tampered = fontBytes(18);
    expect(tampered.byteLength).toBe(saved.byteLength);
    await fs.write(stat!.path, tampered);

    await expect(repository.list()).rejects.toMatchObject({ code: "corrupt" });
  });

  it("rejects torn, noncanonical, unknown-field, and forged-total manifests", async () => {
    const { database, repository } = await fixture();
    for (const raw of [
      '{"version":1,"totalBytes":',
      '{ "version": 1, "totalBytes": 0, "entries": [] }',
      '{"version":1,"totalBytes":0,"entries":[],"future":true}',
      '{"version":1,"totalBytes":1,"entries":[]}',
    ]) {
      await database.kvSet(
        STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE,
        STUDIO_CUSTOM_FONT_SQLITE_MANIFEST_KEY,
        raw,
      );
      await expect(repository.list()).rejects.toMatchObject({ code: "corrupt" });
    }
  });

  it("rejects an extra entry field and a MIME/format mismatch", () => {
    const entry = manifestEntry(1);
    expect(() => serializeStudioCustomFontManifest([{ ...entry, future: true } as typeof entry]))
      .toThrow(/알 수 없는 필드/u);
    expect(() => serializeStudioCustomFontManifest([{ ...entry, mimeType: "font/woff2" }]))
      .toThrow(/MIME/u);
  });

  it("serializes overlapping saves in invocation order without losing entries", async () => {
    const { repository } = await fixture();
    const [first, second, third] = await Promise.all([
      repository.save({ fileName: "Family.ttf", bytes: fontBytes(21) }),
      repository.save({ fileName: "Family.ttf", bytes: fontBytes(22) }),
      repository.save({ fileName: "Family.ttf", bytes: fontBytes(23) }),
    ]);
    const listed = await repository.list();

    expect(listed.map(({ id }) => id)).toEqual([first.id, second.id, third.id]);
    expect(listed.map(({ family }) => family).sort()).toEqual([
      "Family",
      "Family (2)",
      "Family (3)",
    ]);
    expect(new Set(listed.map(({ contentHash }) => contentHash)).size).toBe(3);
  });

  it("commits the SQLite manifest after blob put, verification, and owner protection", async () => {
    const events: string[] = [];
    const database = await openMemoryDatabase();
    const fs = createStudioOpfsMemoryFileSystem();
    const baseStore = createStudioOpfsAssetStore({ fs, graceMs: 0 });
    const store = new Proxy(baseStore, {
      get(target, property) {
        const value = Reflect.get(target, property, target) as unknown;
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) => {
          events.push(`cas:${String(property)}`);
          return (value as (...callArgs: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const tracedDatabase = proxyDatabase(database, {
      kvSet: async (...args) => {
        events.push("sqlite:manifest");
        return database.kvSet(...args);
      },
    });
    const { repository } = await fixture({ database: tracedDatabase, fs, store });
    await repository.save({ fileName: "Ordered.ttf", bytes: fontBytes(25) });

    expect(events.indexOf("cas:put")).toBeLessThan(events.indexOf("sqlite:manifest"));
    expect(events.indexOf("cas:get")).toBeLessThan(events.indexOf("sqlite:manifest"));
    expect(events.indexOf("cas:setOwnerRefs")).toBeLessThan(events.indexOf("sqlite:manifest"));
  });

  it("rolls owner references back and preserves the previous manifest on SQLite failure", async () => {
    const database = await openMemoryDatabase();
    const fs = createStudioOpfsMemoryFileSystem();
    const store = createStudioOpfsAssetStore({ fs, graceMs: 0 });
    const stable = await fixture({ database, fs, store, createId: () => "stable-font" });
    const first = await stable.repository.save({ fileName: "Stable.ttf", bytes: fontBytes(27) });
    const manifestBefore = await database.kvGet(
      STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE,
      STUDIO_CUSTOM_FONT_SQLITE_MANIFEST_KEY,
    );
    const failing = proxyDatabase(database, {
      kvSet: async (namespace, key, value) => {
        if (namespace === STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE) throw new Error("SQLITE_FULL");
        return database.kvSet(namespace, key, value);
      },
    });
    const failed = await fixture({ database: failing, fs, store, createId: () => "failed-font" });

    await expect(failed.repository.save({ fileName: "Failed.ttf", bytes: fontBytes(29) }))
      .rejects.toMatchObject({ code: "quota-exceeded" });
    expect(await database.kvGet(
      STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE,
      STUDIO_CUSTOM_FONT_SQLITE_MANIFEST_KEY,
    )).toBe(manifestBefore);
    expect(await store.ownerRefs(STUDIO_CUSTOM_FONT_CAS_OWNER)).toEqual([first.contentHash]);
    expect((await stable.repository.list()).map(({ id }) => id)).toEqual([first.id]);
  });

  it("enforces professional but bounded count, per-file, and 2 GiB logical limits", async () => {
    expect(STUDIO_CUSTOM_FONT_LIMITS.individualBytes).toBe(128 * 1024 * 1024);
    expect(STUDIO_CUSTOM_FONT_LIMITS.logicalBytes).toBe(2 * 1024 * 1024 * 1024);
    expect(STUDIO_CUSTOM_FONT_LIMITS.fonts).toBe(512);
    expect(() => serializeStudioCustomFontManifest([
      manifestEntry(1, { byteLength: STUDIO_CUSTOM_FONT_LIMITS.individualBytes + 1 }),
    ])).toThrow(/바이트 크기/u);

    const fullEntries = Array.from({ length: 16 }, (_, index) => manifestEntry(index, {
      contentHash: `sha256:${index.toString(16).padStart(64, "0")}`,
      byteLength: STUDIO_CUSTOM_FONT_LIMITS.individualBytes,
    }));
    const { database, repository } = await fixture();
    await database.kvSet(
      STUDIO_CUSTOM_FONT_SQLITE_NAMESPACE,
      STUDIO_CUSTOM_FONT_SQLITE_MANIFEST_KEY,
      serializeStudioCustomFontManifest(fullEntries),
    );
    await expect(repository.save({ fileName: "Overflow.ttf", bytes: fontBytes(31) }))
      .rejects.toMatchObject({ code: "invalid" });

    expect(() => serializeStudioCustomFontManifest([
      ...Array.from({ length: STUDIO_CUSTOM_FONT_LIMITS.fonts }, (_, index) => manifestEntry(index)),
      manifestEntry(STUDIO_CUSTOM_FONT_LIMITS.fonts),
    ])).toThrow(/512개/u);
  });

  it("rejects a caller-provided hash that differs from the actual font bytes", async () => {
    const { repository } = await fixture();
    await expect(repository.save({
      fileName: "Hash.ttf",
      bytes: fontBytes(33),
      contentHash: `sha256:${"f".repeat(64)}`,
    })).rejects.toMatchObject({ code: "invalid" });
  });

  it("deletes metadata first-class and reclaims the unreferenced CAS blob", async () => {
    const { repository, store } = await fixture();
    const saved = await repository.save({ fileName: "Delete.ttf", bytes: fontBytes(35) });
    await repository.delete(saved.id);

    await expect(repository.list()).resolves.toEqual([]);
    expect(await store.ownerRefs(STUDIO_CUSTOM_FONT_CAS_OWNER)).toEqual([]);
    expect(await store.has(saved.contentHash)).toBe(false);
  });
});
