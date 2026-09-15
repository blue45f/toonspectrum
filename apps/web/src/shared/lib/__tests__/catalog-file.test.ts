import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadCatalogTitlesFromFile,
  resolveCatalogFile,
} from "../../../../../../apps/api/src/server/catalog-file";
import { loadBundledCatalog } from "../../../../../../apps/api/src/server/catalog-loader";
import { allTitles, getCatalogState, replaceCatalogData } from "../server/catalog-store";

import { makeTitle } from "./fixtures";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "toonspectrum-catalog-file-"));
const gzPath = path.join(tmpDir, "catalog.json.gz");
const originalTitles = allTitles();
const originalState = getCatalogState();
const ORIGINAL_FILE_ENV = process.env.WEBDEX_CATALOG_FILE;
const ORIGINAL_GZ_ENV = process.env.WEBDEX_CATALOG_GZ;

function writeCatalog(payload: unknown, file = gzPath) {
  writeFileSync(file, gzipSync(Buffer.from(JSON.stringify(payload), "utf8")));
}

beforeEach(() => {
  rmSync(gzPath, { force: true });
  process.env.WEBDEX_CATALOG_FILE = gzPath;
  delete process.env.WEBDEX_CATALOG_GZ;
});

afterEach(() => {
  if (ORIGINAL_FILE_ENV == null) delete process.env.WEBDEX_CATALOG_FILE;
  else process.env.WEBDEX_CATALOG_FILE = ORIGINAL_FILE_ENV;
  if (ORIGINAL_GZ_ENV == null) delete process.env.WEBDEX_CATALOG_GZ;
  else process.env.WEBDEX_CATALOG_GZ = ORIGINAL_GZ_ENV;
  replaceCatalogData(originalTitles, {
    source: originalState.source,
    sourceVersion: originalState.sourceVersion,
  });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("catalog-file read-only loader", () => {
  it("uses an explicit file path without falling through to bundled candidates", () => {
    const missing = path.join(tmpDir, "missing.json.gz");
    expect(resolveCatalogFile({ WEBDEX_CATALOG_FILE: missing })).toBeNull();
    expect(loadCatalogTitlesFromFile({ WEBDEX_CATALOG_FILE: missing })).toBeNull();

    writeCatalog({
      titles: [makeTitle({ id: "catalog-1" })],
      sourceVersion: "manual/2026-09-15",
      runHash: "reviewed-hash",
    });

    expect(resolveCatalogFile()).toBe(gzPath);
    expect(loadCatalogTitlesFromFile()).toMatchObject({
      file: gzPath,
      sourceVersion: "manual/2026-09-15",
      runHash: "reviewed-hash",
      titles: [{ id: "catalog-1" }],
    });
  });

  it("keeps the legacy file-path alias and array payload compatibility", () => {
    writeCatalog([makeTitle({ id: "legacy-array" })]);
    delete process.env.WEBDEX_CATALOG_FILE;
    process.env.WEBDEX_CATALOG_GZ = gzPath;

    expect(loadCatalogTitlesFromFile()).toMatchObject({
      file: gzPath,
      sourceVersion: "file:catalog.json.gz",
      runHash: null,
      titles: [{ id: "legacy-array" }],
    });
  });

  it("returns null for malformed, empty, or missing artifacts", () => {
    expect(loadCatalogTitlesFromFile()).toBeNull();

    writeFileSync(gzPath, Buffer.from("not-gzip"));
    expect(loadCatalogTitlesFromFile()).toBeNull();

    writeCatalog({ titles: [] });
    expect(loadCatalogTitlesFromFile()).toBeNull();
    expect(existsSync(gzPath)).toBe(true);
    expect(readFileSync(gzPath).byteLength).toBeGreaterThan(0);
  });
});

describe("catalog-loader deployment behavior", () => {
  it("starts with an empty catalog when the reviewed artifact is absent", () => {
    const result = loadBundledCatalog();

    expect(result).toMatchObject({ loaded: false, source: "empty", titleCount: 0 });
    expect(getCatalogState().titleCount).toBe(0);
  });

  it("loads the reviewed artifact once into the in-memory catalog", () => {
    writeCatalog({
      titles: [makeTitle({ id: "boot-1" }), makeTitle({ id: "boot-2" })],
      sourceVersion: "manual/reviewed",
      runHash: "boot-hash",
    });

    const result = loadBundledCatalog();

    expect(result).toMatchObject({
      loaded: true,
      source: "catalog-file",
      sourceVersion: "manual/reviewed",
      runHash: "boot-hash",
      titleCount: 2,
    });
    expect(getCatalogState()).toMatchObject({
      source: "file-snapshot",
      sourceVersion: "manual/reviewed",
      titleCount: 2,
    });
  });
});
