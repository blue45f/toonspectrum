import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("/studio asset-library V12 authority boundary", () => {
  it("routes every no-argument product API to shared SQLite plus OPFS CAS", () => {
    const model = source("./studio-asset-library.ts");
    const repository = source("./studio-asset-library-sqlite-opfs-repository.ts");

    expect(model).toContain('import("./studio-asset-library-sqlite-opfs-repository")');
    expect(model).toContain("getProductStudioAssetLibraryRepository");
    expect(model).toContain("createLegacyIndexedDbStudioAssetLibrary");
    expect(model).toContain("Product boot and the exported no-argument functions below never");
    expect(repository).toContain("acquireStudioLocalDatabase");
    expect(repository).toContain("createStudioOpfsAssetStore");
    expect(repository).toContain('"studio-asset-library-v12"');
    expect(repository).toContain('"toonspectrum-studio-assets"');
    expect(repository).not.toContain("localStorage");
    expect(repository).not.toContain("indexedDB");
  });

  it("wires the live Studio page through queued mutations and fenced hydration", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain("assetHydrationGenerationRef");
    expect(page).toContain("assetMutationTailRef");
    expect(page).toContain("saveStudioAssetMutation");
    expect(page).toContain("deleteStudioAssetMutation");
    expect(page).toContain("renameStudioAssetMutation");
    expect(page).toContain("SQLite/OPFS 에셋 보관함을 열지 못해 현재 탭 메모리만 사용합니다");
    expect(page).toContain("손상된 manifest나 누락된 blob을 일부만 불러오지 않았습니다");
    expect(page).not.toContain('const { saveAsset } = await import("./studio-asset-library");\n      await saveAsset({ name: file.name');
  });

  it("keeps binary payloads out of SQLite and commits the canonical manifest last", () => {
    const repository = source("./studio-asset-library-sqlite-opfs-repository.ts");

    expect(repository).toContain("await store.put(decoded.bytes");
    expect(repository).toContain("await verifiedBytes(store, entry)");
    expect(repository).toContain("protectedHashes");
    expect(repository).toContain("await database.kvSet(");
    expect(repository).toContain("Manifest is now authoritative");
    expect(repository).toContain("serializeStudioAssetManifest(next.entries)");
    expect(repository).toContain("byteSize: decoded.bytes.byteLength");
  });
});
