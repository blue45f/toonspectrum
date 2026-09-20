import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { openStudioLocalDatabase, type StudioLocalDatabase, type StudioSqliteApiHandle } from "../studio-local-database";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { createSqliteBrushLibraryRepository, studioBrushToSqlRecord } from "./studio-brush-library-sqlite-repository";
import { commitStudioBrushPackImport, importStudioMybBytes, importStudioKppBytes, importStudioBrushJsonText } from "./studio-brush-pack-import";
import { importBrushFromJson, writeBrushJson, sanitizeBrushSnapshot } from "./studio-brush-library";
import { decodeStudioBrushOriginalSource, BRUSH_SOURCE_ARCHIVE_KIND } from "./studio-brush-original-source";
import { hydrateStudioBrushOriginal, prepareStudioBrushSourceExport } from "./studio-brush-original-source-store";

let sqlite: StudioSqliteApiHandle;
const databases: StudioLocalDatabase[] = [];
beforeAll(async () => {
  const module = await import("@sqlite.org/sqlite-wasm");
  sqlite = await module.default() as unknown as StudioSqliteApiHandle;
});
afterEach(async () => { for (const db of databases.splice(0)) await db.close(); });
async function fixture() {
  const fs = createStudioOpfsMemoryFileSystem();
  const store = createStudioOpfsAssetStore({ fs });
  const db = await openStudioLocalDatabase({ vfs: "memory", loadSqlite: async () => sqlite });
  databases.push(db);
  const repository = createSqliteBrushLibraryRepository(db, { originalSourceStore: store });
  return { fs, store, db, repository };
}
const load = (path: string) => new Uint8Array(readFileSync(new URL(`../../../../../../tests/corpus/brushes/${path}`, import.meta.url)));

describe("original import → CAS/SQLite → edited copy → portable export", () => {
  it.each(["myb", "kpp"] as const)("retains exact %s bytes without inflating catalogue rows", async (format) => {
    const f = await fixture();
    const bytes = load(format === "myb" ? "myb/ink-crisp.myb" : "kpp/paintbrush-ink-basic.kpp");
    const imported = format === "myb" ? importStudioMybBytes(bytes, "original.myb") : importStudioKppBytes(bytes, "original.kpp");
    const committed = await commitStudioBrushPackImport(imported, f.repository);
    const saved = (await f.repository.getById(committed.materialized[0]!.id))!;
    expect(saved.originalSource?.encoding).toBe("opfs-cas");
    expect(studioBrushToSqlRecord(saved).payload).not.toContain("base64");
    expect(sanitizeBrushSnapshot(saved).snapshot).not.toHaveProperty("originalSource");
    const reloaded = createSqliteBrushLibraryRepository(f.db, { originalSourceStore: f.store });
    const updated = await reloaded.put({ ...saved, name: "이름 변경", strokeWidth: 22, updatedAt: saved.updatedAt + 1 });
    const duplicate = (await reloaded.duplicate(updated.id))!;
    expect(duplicate.id).not.toBe(updated.id);
    expect(duplicate.originalSource).toEqual(saved.originalSource);
    const deleted = (await reloaded.delete(updated.id))!; await reloaded.restore(deleted);
    const exported = await prepareStudioBrushSourceExport(duplicate, f.store);
    const json = writeBrushJson(exported);
    expect(JSON.parse(json).kind).toBe(BRUSH_SOURCE_ARCHIVE_KIND);
    const restored = importBrushFromJson(json).brush;
    expect(decodeStudioBrushOriginalSource(restored.originalSource)).toEqual(bytes);
    expect(restored.strokeWidth).toBe(22);
    await commitStudioBrushPackImport(importStudioBrushJsonText(json, "archive.json"), reloaded);
    expect(await f.store.list()).toHaveLength(1);
    await f.store.sweep({ graceMs: 0 });
    expect(decodeStudioBrushOriginalSource(await hydrateStudioBrushOriginal(saved.originalSource, f.store))).toEqual(bytes);
  });
  it("refreshes a cached CAS index after another store instance writes an original", async () => {
    const f = await fixture();
    const second = createStudioOpfsAssetStore({ fs: f.fs });
    expect(await second.list()).toEqual([]);
    const result = await commitStudioBrushPackImport(importStudioMybBytes(load("myb/ink-crisp.myb"), "ink.myb"), f.repository);
    const saved = (await f.repository.getById(result.materialized[0]!.id))!;
    expect(decodeStudioBrushOriginalSource(await hydrateStudioBrushOriginal(saved.originalSource, second)))
      .toEqual(load("myb/ink-crisp.myb"));
  });
  it("does not publish a row after CAS failure or store inline source in SQL", async () => {
    const f = await fixture();
    const imported = importStudioMybBytes(load("myb/ink-crisp.myb"), "ink.myb");
    const failing = createSqliteBrushLibraryRepository(f.db, { originalSourceStore: {
      ...f.store, async put() { throw new DOMException("full", "QuotaExceededError"); },
    } });
    await expect(commitStudioBrushPackImport(imported, failing)).rejects.toThrow();
    expect((await f.repository.query()).items).toEqual([]);
    const good = await commitStudioBrushPackImport(imported, f.repository);
    expect(() => studioBrushToSqlRecord(good.materialized[0]!)).toThrow(/OPFS/u);
  });
  it("does not publish any SQL row when the second original in a batch fails", async () => {
    const f = await fixture();
    let writes = 0;
    const failing = createSqliteBrushLibraryRepository(f.db, { originalSourceStore: {
      ...f.store, async put(bytes, options) {
        if (++writes === 2) throw new Error("second CAS write failed");
        return f.store.put(bytes, options);
      },
    } });
    const first = importStudioMybBytes(load("myb/ink-crisp.myb"), "first.myb");
    const second = importStudioKppBytes(load("kpp/paintbrush-ink-basic.kpp"), "second.kpp");
    await expect(commitStudioBrushPackImport({ ...first, brushes: [...first.brushes, ...second.brushes] }, failing)).rejects.toThrow();
    expect((await f.repository.query()).items).toEqual([]);
    expect(await f.store.list()).toHaveLength(1);
  });
  it("fails export for missing/corrupt bytes without changing stored provenance", async () => {
    const f = await fixture();
    const result = await commitStudioBrushPackImport(importStudioMybBytes(load("myb/wash-soft.myb"), "wash.myb"), f.repository);
    const saved = (await f.repository.getById(result.materialized[0]!.id))!;
    const hash = `sha256:${saved.originalSource!.sha256}`;
    const entry = (await f.store.stat(hash))!;
    const physical = (await f.fs.read(entry.path))!;
    physical[physical.length - 1] ^= 255;
    await f.fs.write(entry.path, physical);
    await expect(prepareStudioBrushSourceExport(saved, f.store)).rejects.toThrow();
    expect((await f.repository.getById(saved.id))?.originalSource).toEqual(saved.originalSource);
    await f.store.delete(hash);
    await expect(prepareStudioBrushSourceExport(saved, f.store)).rejects.toThrow();
  });
  it("refuses reference-only portable archives and corrupt source instead of dropping it", async () => {
    const f = await fixture();
    const result = await commitStudioBrushPackImport(importStudioMybBytes(load("myb/ink-crisp.myb"), "ink.myb"), f.repository);
    const saved = (await f.repository.getById(result.materialized[0]!.id))!;
    expect(() => writeBrushJson(saved)).toThrow(/OPFS/u);
    const archived = JSON.parse(writeBrushJson(await prepareStudioBrushSourceExport(saved, f.store)));
    archived.originalSource = saved.originalSource;
    expect(() => importBrushFromJson(JSON.stringify(archived))).toThrow(/OPFS/u);
    archived.originalSource = { ...result.materialized[0]!.originalSource, sha256: "0".repeat(64) };
    expect(() => importBrushFromJson(JSON.stringify(archived))).toThrow();
  });
  it("keeps the legacy JSON shape for a brush without an original", async () => {
    const f = await fixture();
    const result = importStudioMybBytes(load("myb/ink-crisp.myb"), "ink.myb");
    const { originalSource: _original, ...candidate } = result.brushes[0]!;
    const saved = (await commitStudioBrushPackImport({ ...result, brushes: [candidate] }, f.repository)).materialized[0]!;
    expect(await prepareStudioBrushSourceExport(saved, f.store)).toBe(saved);
    const json = writeBrushJson(saved);
    expect(JSON.parse(json).kind).toBe("toonspectrum-studio-brush");
    expect(importBrushFromJson(json).brush).not.toHaveProperty("originalSource");
  });
});
