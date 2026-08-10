import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(join(process.cwd(), "src/domains/creator", fileName), "utf8");
}

describe("VRM asset SQLite/OPFS product boundary", () => {
  it("routes the poser catalog, model load, upload, thumbnail, and delete through vrm-library defaults", () => {
    const poser = source("StudioVrmPoser.tsx");
    expect(poser).toContain("listVrmLibraryEntries()");
    expect(poser).toContain("await getStoredVrmModel(entry.id)");
    expect(poser).toContain("await saveUploadedVrm(file)");
    expect(poser).toContain("saveVrmThumbnail(activeLibraryEntry.id, thumbnail)");
    expect(poser).toContain("await deleteStoredVrmModel(entry.id)");
    expect(poser).not.toContain("legacyIndexedDb");
    expect(poser).not.toContain("globalThis.indexedDB");
  });

  it("makes shared SQLite/OPFS the no-options authority while keeping IDB explicit-only", () => {
    const library = source("vrm-library.ts");
    expect(library).toContain("options.repository ?? getProductStudioVrmAssetSqliteOpfsRepository()");
    expect(library).toContain("if (usesLegacyIndexedDb(options))");
    expect(library).toContain("readonly legacyIndexedDb?: IDBFactory | null");
    expect(library).not.toContain("typeof indexedDB");
    expect(library).not.toContain("globalThis.indexedDB");
  });

  it("routes texture persistence and project archive bridges through the upgraded library defaults", () => {
    const library = source("studio-vrm-texture-paint-library.ts");
    const persistence = source("studio-vrm-texture-paint-persistence.ts");
    const project = source("studio-vrm-texture-paint-project-library.ts");
    expect(library).toContain("if (!usesLegacyIndexedDb(options))");
    expect(library).toContain("repository(options).saveTexture");
    expect(library).toContain("repository(options).getTexture");
    expect(library).not.toContain("globalThis.indexedDB");
    expect(persistence).toContain("saveArtifact: saveStudioVrmTexturePaintLibraryArtifact");
    expect(persistence).toContain("getArtifact: getStudioVrmTexturePaintLibraryArtifact");
    expect(project).toContain("saveStudioVrmTexturePaintLibraryArtifact");
    expect(project).toContain("getStudioVrmTexturePaintLibraryArtifact");
  });

  it("keeps bytes out of SQLite and commits the canonical manifest last", () => {
    const repository = source("studio-vrm-asset-sqlite-opfs-repository.ts");
    const blobWrite = repository.indexOf("assets().put");
    const markerWrite = repository.indexOf("fs().write(markerPath");
    const ownerCommit = repository.indexOf("assets().setOwnerRefs");
    const sqliteCommit = repository.indexOf("databaseHandle.kvSet");
    expect(blobWrite).toBeGreaterThan(-1);
    expect(markerWrite).toBeGreaterThan(blobWrite);
    expect(ownerCommit).toBeGreaterThan(markerWrite);
    expect(sqliteCommit).toBeGreaterThan(ownerCommit);
    expect(repository).not.toContain("base64");
    expect(repository).not.toContain("THREE.");
    expect(repository).not.toContain("WebGLRenderer");
  });

  it("labels memory-only use and blocks portable insert until durable storage succeeds", () => {
    const poser = source("StudioVrmPoser.tsx");
    const panel = source("StudioVrmCharacterLibraryPanel.tsx");
    expect(poser).toContain("현재 탭 메모리에만 유지합니다");
    expect(poser).toContain('insertLibraryEntry?.source === "memory"');
    expect(panel).toContain('entry.source === "memory"');
    expect(panel).toContain("현재 탭 임시");
  });
});
