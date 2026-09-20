import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openStudioLocalDatabase, type StudioLocalDatabase, type StudioSqliteApiHandle } from "../studio-local-database";
import { createSqliteBrushLibraryRepository, createMemorySessionBrushLibraryRepository,
  studioBrushToSqlRecord, sqlRecordToStudioBrush } from "./studio-brush-library-sqlite-repository";
import { createBrush, DEFAULT_STUDIO_BRUSH_SNAPSHOT, importBrushFromJson, writeBrushJson,
  normalizeStoredBrush, sanitizeBrushSnapshot } from "./studio-brush-library";
import { importStudioMybBytes, importStudioKppBytes, importStudioBrushJsonText,
  commitStudioBrushPackImport } from "./studio-brush-pack-import";
import { BRUSH_SOURCE_ARCHIVE_KIND, createStudioBrushOriginalSource,
  decodeStudioBrushOriginalSource } from "./studio-brush-original-source";

const corpus = (relative: string) => new Uint8Array(readFileSync(fileURLToPath(
  new URL(`../../../../../../tests/corpus/brushes/${relative}`, import.meta.url))));
let database: StudioLocalDatabase;
beforeAll(async () => {
  const module = await import("@sqlite.org/sqlite-wasm");
  const sqlite3 = await module.default() as unknown as StudioSqliteApiHandle;
  database = await openStudioLocalDatabase({ vfs: "memory", loadSqlite: () => Promise.resolve(sqlite3) });
});
afterAll(async () => { await database?.close(); });

function originalBrush() {
  return { ...createBrush("원본", DEFAULT_STUDIO_BRUSH_SNAPSHOT), originalSource:
    createStudioBrushOriginalSource(new Uint8Array([1, 2, 0, 255]), "original.kpp", "kpp") };
}

describe("original brush preservation across SQLite and portable archives", () => {
  it.each(["myb/ink-crisp.myb", "myb/wash-soft.myb", "kpp/paintbrush-pressure-curve.kpp", "kpp/mypaint-wash-soft.kpp"])(
    "round-trips real %s through import, edit, duplicate and export", async (path) => {
      const bytes = corpus(path);
      const imported = path.endsWith(".myb") ? importStudioMybBytes(bytes, path) : importStudioKppBytes(bytes, path);
      const repository = createSqliteBrushLibraryRepository(database);
      const committed = await commitStudioBrushPackImport(imported, repository);
      const saved = (await repository.getById(committed.materialized[0]!.id))!;
      expect(saved.originalSource!.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(decodeStudioBrushOriginalSource(saved.originalSource)).toEqual(bytes);
      const edited = await repository.put({ ...saved, name: "수정된 설정", strokeWidth: 19 });
      const duplicate = (await repository.duplicate(edited.id))!;
      expect(duplicate.id).not.toBe(saved.id);
      expect(duplicate.originalSource).toEqual(saved.originalSource);
      const reloaded = (await createSqliteBrushLibraryRepository(database).getById(duplicate.id))!;
      const archive = writeBrushJson(reloaded);
      expect(JSON.parse(archive).kind).toBe(BRUSH_SOURCE_ARCHIVE_KIND);
      const restored = importBrushFromJson(archive).brush;
      expect(restored.strokeWidth).toBe(19);
      expect(decodeStudioBrushOriginalSource(restored.originalSource)).toEqual(bytes);
      expect(sanitizeBrushSnapshot(restored).snapshot).not.toHaveProperty("originalSource");
      const again = await commitStudioBrushPackImport(importStudioBrushJsonText(archive, "brush.json"), repository);
      expect(decodeStudioBrushOriginalSource(again.materialized[0]!.originalSource)).toEqual(bytes);
      const deleted = (await repository.delete(saved.id))!;
      await repository.restore(deleted);
      expect(decodeStudioBrushOriginalSource((await repository.getById(saved.id))!.originalSource)).toEqual(bytes);
    });
  it("retains original whitespace rather than reconstructing MYB JSON", () => {
    const bytes = new TextEncoder().encode(" \r\n" + new TextDecoder().decode(corpus("myb/ink-crisp.myb")) + "\r\n  ");
    const imported = importStudioMybBytes(bytes, "spaces.myb");
    expect(decodeStudioBrushOriginalSource(imported.brushes[0]!.originalSource)).toEqual(bytes);
  });
  it.each(["missing-source", "hash", "bytes", "version", "nested-version", "extra"])(
    "rejects damaged archive %s without silently dropping its source", (kind) => {
      const archive = JSON.parse(writeBrushJson(originalBrush()));
      if (kind === "missing-source") delete archive.originalSource;
      if (kind === "hash") archive.originalSource.sha256 = "0".repeat(64);
      if (kind === "bytes") archive.originalSource.base64 = "AQIE";
      if (kind === "version") archive.version = 2;
      if (kind === "nested-version") archive.brush.version = 999;
      if (kind === "extra") archive.future = true;
      expect(() => importBrushFromJson(JSON.stringify(archive))).toThrow();
    });
  it("preserves source-free legacy export shape", () => {
    const brush = createBrush("legacy", DEFAULT_STUDIO_BRUSH_SNAPSHOT);
    const text = writeBrushJson(brush);
    expect(JSON.parse(text).kind).toBe("toonspectrum-studio-brush");
    expect(JSON.parse(text)).not.toHaveProperty("originalSource");
    expect(importBrushFromJson(text).brush).not.toHaveProperty("originalSource");
  });
  it("also preserves originals in the explicitly nonpersistent repository", async () => {
    const repository = createMemorySessionBrushLibraryRepository();
    const original = await repository.put(originalBrush());
    expect((await repository.getById(original.id))!.originalSource).toEqual(original.originalSource);
  });
  it("fails closed on corrupt stored bytes and keeps a failed batch atomic", async () => {
    const good = originalBrush();
    const bad = { ...good, id: "bad-source", originalSource: { ...good.originalSource, sha256: "0".repeat(64) } };
    expect(normalizeStoredBrush(bad)).toBeNull();
    expect(() => studioBrushToSqlRecord(bad)).toThrow();
    expect(() => sqlRecordToStudioBrush({ ...studioBrushToSqlRecord(good), payload: JSON.stringify(bad) })).toThrow();
    const repository = createSqliteBrushLibraryRepository(database);
    await expect(repository.putMany([good, bad])).rejects.toMatchObject({ code: "corrupt" });
    expect(await repository.getById(good.id)).toBeNull();
  });
  it("round-trips archives above the old 2MiB settings limit without increasing that limit", async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024).fill(17);
    const brush = { ...originalBrush(), originalSource: createStudioBrushOriginalSource(bytes, "large.kpp", "kpp") };
    const repository = createSqliteBrushLibraryRepository(database);
    await repository.put(brush);
    const fromSql = (await repository.getById(brush.id))!;
    expect(fromSql.originalSource).toEqual(brush.originalSource);
    const text = writeBrushJson(fromSql);
    expect(text.length).toBeGreaterThan(2 * 1024 * 1024);
    const restored = importBrushFromJson(text).brush;
    expect(createHash("sha256").update(decodeStudioBrushOriginalSource(restored.originalSource)).digest("hex")).toBe(brush.originalSource.sha256);
    expect(() => importBrushFromJson(" ".repeat(2 * 1024 * 1024) + writeBrushJson(createBrush("legacy", DEFAULT_STUDIO_BRUSH_SNAPSHOT)))).toThrow(/2MB/u);
  });
});

describe("nonpersistent storage refuses damaged originals before write", () => {
  it("leaves the previous readable library intact after invalid single and batch writes", async () => {
    const repository = createMemorySessionBrushLibraryRepository();
    const good = originalBrush();
    await repository.put(good);
    const bad = { ...originalBrush(), originalSource: { ...good.originalSource, sha256: "0".repeat(64) } };
    await expect(repository.put(bad)).rejects.toThrow();
    await expect(repository.putMany([originalBrush(), bad])).rejects.toThrow();
    const page = await repository.query();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.originalSource).toEqual(good.originalSource);
  });
});
