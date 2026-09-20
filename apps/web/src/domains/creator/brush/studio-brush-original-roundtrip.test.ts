import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { hydrateStudioBrushOriginal, prepareStudioBrushSourceExport } from "./studio-brush-original-source-store";
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
const store = createStudioOpfsAssetStore({ fs: createStudioOpfsMemoryFileSystem() });
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

describe("native brush source through existing storage and JSON owners", () => {
  it.each(["sqlite", "session"])("keeps exact MYB/KPP bytes through %s CRUD and archive reimport", async (mode) => {
    const repository = mode === "sqlite" ? createSqliteBrushLibraryRepository(database, { originalSourceStore: store }) : createMemorySessionBrushLibraryRepository();
    for (const [relative, importer] of [["myb/ink-crisp.myb", importStudioMybBytes],
      ["kpp/paintbrush-ink-basic.kpp", importStudioKppBytes]] as const) {
      const bytes = corpus(relative);
      const imported = importer(bytes, relative);
      expect(imported.brushes[0]!.snapshot).not.toHaveProperty("originalSource");
      const committed = await commitStudioBrushPackImport(imported, repository);
      const stored = (await repository.getById(committed.materialized[0]!.id))!;
      expect(stored.originalSource?.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(decodeStudioBrushOriginalSource(await hydrateStudioBrushOriginal(stored.originalSource, store))).toEqual(bytes);
      const changed = await repository.put({ ...stored, name: "이름 수정", color: "#123456", pinned: true });
      const duplicate = (await repository.duplicate(changed.id))!;
      expect(duplicate.id).not.toBe(stored.id);
      expect(duplicate.originalSource).toEqual(stored.originalSource);
      const removed = (await repository.delete(duplicate.id))!;
      const restored = await repository.restore(removed);
      const exported = writeBrushJson(await prepareStudioBrushSourceExport(restored, store));
      expect(JSON.parse(exported).kind).toBe(BRUSH_SOURCE_ARCHIVE_KIND);
      const again = await commitStudioBrushPackImport(importStudioBrushJsonText(exported, "saved.json"), repository);
      const reopened = (await repository.getById(again.materialized[0]!.id))!;
      expect(decodeStudioBrushOriginalSource(await hydrateStudioBrushOriginal(reopened.originalSource, store))).toEqual(bytes);
      expect(reopened.color).toBe("#123456");
      expect(sanitizeBrushSnapshot(reopened).snapshot).not.toHaveProperty("originalSource");
    }
  });
  it("preserves original archives larger than the ordinary 2MiB JSON ceiling", () => {
    const bytes = new Uint8Array(1_700_000); bytes[0] = 137; bytes[bytes.length - 1] = 255;
    const brush = { ...originalBrush(), originalSource: createStudioBrushOriginalSource(bytes, "large.kpp", "kpp") };
    const exported = writeBrushJson(brush);
    expect(exported.length).toBeGreaterThan(2 * 1024 * 1024);
    expect(decodeStudioBrushOriginalSource(importBrushFromJson(exported).brush.originalSource)).toEqual(bytes);
  });
  it("keeps ordinary JSON format and drawing values unchanged", () => {
    const brush = createBrush("기존", DEFAULT_STUDIO_BRUSH_SNAPSHOT);
    const json = JSON.parse(writeBrushJson(brush));
    expect(json.kind).toBe("toonspectrum-studio-brush");
    expect(json).not.toHaveProperty("originalSource");
    expect(sanitizeBrushSnapshot(importBrushFromJson(JSON.stringify(json)).brush).snapshot)
      .toEqual(sanitizeBrushSnapshot(brush).snapshot);
  });
  it("refuses corrupted provenance rather than returning a source-less brush", async () => {
    const brush = originalBrush();
    const damaged = { ...brush, originalSource: { ...brush.originalSource, sha256: "0".repeat(64) } };
    expect(normalizeStoredBrush(damaged)).toBeNull();
    expect(() => writeBrushJson(damaged)).toThrow();
    expect(() => studioBrushToSqlRecord(damaged)).toThrow();
    const repository = createSqliteBrushLibraryRepository(database, { originalSourceStore: store });
    await expect(repository.put(damaged)).rejects.toThrow();
    expect(await repository.getById(brush.id)).toBeNull();
    const record = studioBrushToSqlRecord(await repository.put(brush));
    expect(() => sqlRecordToStudioBrush({ ...record, payload: JSON.stringify(damaged) })).toThrow();
  });
  it.each(["futureVersion", "missingSource", "extraKey", "badDigest"])("fails closed for archive %s", (scenario) => {
    const archive = JSON.parse(writeBrushJson(originalBrush()));
    if (scenario === "futureVersion") archive.version = 2;
    if (scenario === "missingSource") delete archive.originalSource;
    if (scenario === "extraKey") archive.future = {};
    if (scenario === "badDigest") archive.originalSource.sha256 = "0".repeat(64);
    expect(() => importBrushFromJson(JSON.stringify(archive))).toThrow();
  });
});
