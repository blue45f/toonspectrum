import { describe, expect, it, vi } from "vitest";

import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { buildStudioPackageArchiveBytes } from "../studio-package-archive";
import { createStudioAnimaticWorkspace, studioAnimaticWorkspaceSnapshot, type StudioAnimaticWorkspaceDocument } from "./studio-animatic-workspace";
import { createStudioAnimaticWorkspaceRepository } from "./studio-animatic-workspace-persistence";

import type { StudioLocalDatabase } from "../studio-local-database";

function harness() {
  const values = new Map<string, string>();
  const kvSet = vi.fn(async (namespace: string, key: string, value: string) => { values.set(`${namespace}:${key}`, value); });
  const database = { kvGet: async (namespace: string, key: string) => values.get(`${namespace}:${key}`) ?? null, kvSet } as unknown as StudioLocalDatabase;
  const store = createStudioOpfsAssetStore({ fs: createStudioOpfsMemoryFileSystem() });
  const repository = createStudioAnimaticWorkspaceRepository({ acquireDatabase: async () => database, acquireAssets: async () => store, crc32ExecutionMode: "direct-headless" });
  return { repository, store, kvSet };
}
async function fixture(h: ReturnType<typeof harness>): Promise<StudioAnimaticWorkspaceDocument> {
  const original = createStudioAnimaticWorkspace([{ id: "page-1", canvasH: 1280 }], "episode-1");
  const asset = await h.repository.putAsset(Uint8Array.of(1, 2, 3, 4), "image/png");
  return { ...original, artwork: [{ pageId: "page-1", asset, width: 720, height: 1280, documentWidth: 720, documentHeight: 1280 }] };
}

describe("storyboard media persistence and portable ZIP", () => {
  it("round-trips authored media, markers, comments and variants into a new store", async () => {
    const source = harness(), target = harness();
    const first = await fixture(source);
    const workspace: StudioAnimaticWorkspaceDocument = { ...first,
      markers: [{ id: "marker", timeMs: 10, label: "대사" }],
      variants: [{ id: "v1", name: "첫 편집", createdAt: 1, snapshot: studioAnimaticWorkspaceSnapshot(first) }],
      reviews: [{ id: "r1", variantId: "v1", timeMs: 10, text: "전환을 길게", resolved: false }],
    };
    await source.repository.save(workspace);
    expect(await source.repository.load(workspace.workScope)).toEqual(workspace);
    const blob = await source.repository.exportArchive(workspace);
    const imported = await target.repository.importArchive(new Uint8Array(await blob.arrayBuffer()), workspace.workScope);
    expect(imported).toEqual(workspace);
    expect(await target.repository.getAsset(imported.artwork[0]!.asset)).toEqual(Uint8Array.of(1, 2, 3, 4));
    await expect(target.repository.importArchive(new Uint8Array(await blob.arrayBuffer()), "another-episode")).rejects.toThrow("다른 작품");
  });
  it("protects undoable media and keeps the old document intact when SQL commit fails", async () => {
    const h = harness(), before = await fixture(h);
    await h.repository.save(before);
    const newAsset = await h.repository.putAsset(Uint8Array.of(5, 6, 7), "image/png");
    const after = { ...before, artwork: [{ ...before.artwork[0]!, asset: newAsset }] };
    h.kvSet.mockRejectedValueOnce(new Error("disk full"));
    await expect(h.repository.save(after, [before])).rejects.toThrow("disk full");
    expect(await h.repository.load(before.workScope)).toEqual(before);
    const owner = `studio-animatic-workspace-v12:${before.workScope}`;
    expect(await h.store.ownerRefs(owner)).toEqual(expect.arrayContaining([before.artwork[0]!.asset.hash, newAsset.hash]));
    await h.repository.save(after, [before]);
    expect(await h.store.ownerRefs(owner)).toHaveLength(2);
    await h.repository.save(after);
    expect(await h.store.ownerRefs(owner)).toEqual([newAsset.hash]);
  });
  it("rejects a valid-CRC archive when media content does not match its document hash", async () => {
    const h = harness(), workspace = await fixture(h);
    const bytes = await buildStudioPackageArchiveBytes([
      { path: "storyboard.json", data: new TextEncoder().encode(JSON.stringify(workspace)) },
      { path: `media/${workspace.artwork[0]!.asset.hash.slice(7)}.bin`, data: Uint8Array.of(4, 3, 2, 1) },
    ], { crc32ExecutionMode: "direct-headless" });
    await expect(h.repository.importArchive(bytes, workspace.workScope)).rejects.toThrow("내용 해시");
    expect(await h.repository.load(workspace.workScope)).toBeNull();
  });
  it("rejects unreferenced files instead of silently importing a different archive", async () => {
    const h = harness();
    const workspace = createStudioAnimaticWorkspace([{ id: "p1" }], "episode-1");
    const bytes = await buildStudioPackageArchiveBytes([
      { path: "storyboard.json", data: new TextEncoder().encode(JSON.stringify(workspace)) },
      { path: "unexpected.bin", data: Uint8Array.of(1) },
    ], { crc32ExecutionMode: "direct-headless" });
    await expect(h.repository.importArchive(bytes, workspace.workScope)).rejects.toThrow("참조하지 않는");
  });
});
