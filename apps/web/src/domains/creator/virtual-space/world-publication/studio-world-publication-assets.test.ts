import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioWorldPublication } from "@toonspectrum/studio-project-model/world-publication";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "../studio-virtual-space-world-manifest";
import { prepareStudioWorldAssets, type StudioWorldAssetDependencies } from "./studio-world-publication-assets";
import { parseStudioWorldPublication, studioWorldDigest, studioWorldPublishManifest } from "./studio-world-publication-client";
import { pinStudioWorldAssets } from "../studio-world-template-package";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  const manifest = studioWorldPublishManifest({ ...DEFAULT_STUDIO_WORLD_MANIFEST, props: [{ id: "prop", kind: "decor", x: 250, y: 250, assetUrl: "/prop.png" }] });
  const publication: StudioWorldPublication = { contract: "studio-world-publication-v1", workId: "work-1", projectId: "project-1", artifactId: "studio-world-work-1",
    revisionId: "rev-1", previousPublishedRevisionId: null, contentHash: await studioWorldDigest(manifest), sequence: 1,
    publishedBy: "alice", publishedAt: "2026-09-20T00:00:00.000Z", manifest };
  let next = 0;
  const deps: StudioWorldAssetDependencies = { fetch: vi.fn(async () => new Response(new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMxkAAAAASUVORK5CYII="), (value) => value.charCodeAt(0))], { type: "image/png" }))),
    decode: vi.fn(async () => {}), createUrl: vi.fn(() => `blob:world-${++next}`), revokeUrl: vi.fn() };
  return { publication, deps };
}
describe("publication bytes and identity", () => {
  it("verifies canonical manifest hash and expected work before any renderer consumes it", async () => {
    const { publication } = await fixture(); expect(await parseStudioWorldPublication(publication, "work-1")).toEqual(publication);
    await expect(parseStudioWorldPublication({ ...publication, contentHash: "b".repeat(64) }, "work-1")).rejects.toMatchObject({ reason: "invalid-world" });
    await expect(parseStudioWorldPublication(publication, "other-work")).rejects.toMatchObject({ reason: "invalid-world" });
  });
  it("decodes every required unique asset without cookies and gives Phaser exactly those object URLs", async () => {
    const f = await fixture(), signal = new AbortController().signal, result = await prepareStudioWorldAssets(f.publication, signal, f.deps);
    expect(f.deps.fetch).toHaveBeenCalledTimes(2); expect(f.deps.decode).toHaveBeenCalledTimes(2);
    expect(f.deps.fetch).toHaveBeenCalledWith("/prop.png", { signal, credentials: "omit", referrerPolicy: "no-referrer" });
    expect(result.assetUrls.get("/prop.png")).toMatch(/^blob:/); result.dispose(); result.dispose(); expect(f.deps.revokeUrl).toHaveBeenCalledTimes(2);
  });
  it("rejects decode failure and frees all prepared bytes; no missing prop is silently skipped", async () => {
    const f = await fixture(); vi.mocked(f.deps.decode).mockRejectedValueOnce(new Error("invalid image"));
    await expect(prepareStudioWorldAssets(f.publication, new AbortController().signal, f.deps)).rejects.toThrow();
    expect(f.deps.revokeUrl).toHaveBeenCalledTimes(vi.mocked(f.deps.createUrl).mock.calls.length);
  });
  it("fences cancellation and gives identical-content undo a different shared scope", async () => {
    const f = await fixture(), abort = new AbortController(); abort.abort();
    await expect(prepareStudioWorldAssets(f.publication, abort.signal, f.deps)).rejects.toMatchObject({ reason: "context-changed" });
    expect(f.deps.fetch).not.toHaveBeenCalled();
    const first = await prepareStudioWorldAssets(f.publication, new AbortController().signal, f.deps);
    const undo = await prepareStudioWorldAssets({ ...f.publication, revisionId: "rev-undo", sequence: 3 }, new AbortController().signal, f.deps);
    expect(first.scope).not.toBe(undo.scope); first.dispose(); undo.dispose();
  });
  it("타일 아틀라스를 한 번 읽어 무결성을 고정하고 게시 원본 URL 대신 검증한 bytes를 준비한다", async () => {
    const f = await fixture();
    const tilemap = {
      orientation: "orthogonal" as const, renderOrder: "right-down" as const,
      width: 20, height: 15, tileWidth: 64, tileHeight: 64,
      tilesets: [{ firstGid: 1, name: "ground", imageUrl: "/tiles.png", imageWidth: 512, imageHeight: 512,
        tileWidth: 256, tileHeight: 256, columns: 2, tileCount: 4, margin: 0, spacing: 0 }],
      layers: [{ id: "ground", name: "Ground", x: 0, y: 0, width: 1, height: 1, data: [1], opacity: 1, visible: true, depth: 10 }],
    };
    const signal = new AbortController().signal;
    const pinned = await pinStudioWorldAssets({ ...f.publication.manifest, tilemap }, signal, f.deps);
    expect(f.deps.fetch).toHaveBeenCalledTimes(3);
    expect(pinned.assetIntegrity?.find((item) => item.url === "/tiles.png")?.sha256).toMatch(/^[a-f0-9]{64}$/u);
    vi.mocked(f.deps.fetch).mockClear();
    const manifest = studioWorldPublishManifest(pinned);
    const publication = { ...f.publication, manifest, contentHash: await studioWorldDigest(manifest) };
    const result = await prepareStudioWorldAssets(publication, signal, f.deps);
    expect(f.deps.fetch).toHaveBeenCalledTimes(3);
    expect(result.assetUrls.get("/tiles.png")).toMatch(/^blob:/);
    const changed = studioWorldPublishManifest({ ...manifest, tilemap: { ...tilemap, layers: [{ ...tilemap.layers[0], data: [2] }] } });
    expect(await studioWorldDigest(changed)).not.toBe(publication.contentHash);
    await expect(parseStudioWorldPublication({ ...publication, manifest: changed }, "work-1")).rejects.toMatchObject({ reason: "invalid-world" });
    result.dispose();
  });
});
