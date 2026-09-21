import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioWorldManifestSchema } from "@toonspectrum/studio-project-model/world-publication";
import { studioWorldTemplatePackageSchema } from "./studio-world-template-contract";

import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest } from "./studio-virtual-space-world-manifest";
import { createStudioWorldStarterTemplate, createStudioWorldTemplatePackage, parseStudioWorldTemplatePackage,
  pinStudioWorldAssets, retainStudioWorldPrivacy, verifyStudioWorldTemplatePackage } from "./studio-world-template-package";
import { parseStudioWorldAuthoringImport, studioWorldManifestToTiledMap } from "./studio-virtual-space-world-authoring";
import { prepareStudioWorldAssets, type StudioWorldAssetDependencies } from "./world-publication/studio-world-publication-assets";
import { studioWorldDigest } from "./world-publication/studio-world-publication-client";

beforeEach(() => vi.stubGlobal("crypto", webcrypto)); afterEach(() => vi.unstubAllGlobals());
const details = { packageId: "test-package", packageVersion: "1.0.0", title: "내 작업실", description: "",
  rights: { author: "fixture", statement: "Test-only authorship statement, not a rights grant" } };
function dependencies() {
  let i = 0;
  return { fetch: vi.fn(async () => new Response(new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMxkAAAAASUVORK5CYII="), (value) => value.charCodeAt(0))], { type: "image/png" }))),
    decode: vi.fn(async () => {}), createUrl: vi.fn(() => `blob:fixture-${++i}`), revokeUrl: vi.fn() } satisfies StudioWorldAssetDependencies;
}
describe("verified world package contracts", () => {
  it.each(["solo", "team", "review"] as const)("creates a valid %s starter without replacing work identity or artwork", (kind) => {
    const before = { ...DEFAULT_STUDIO_WORLD_MANIFEST, id: "my-team", version: 31 };
    const serialized = JSON.stringify(before), next = createStudioWorldStarterTemplate(kind, before);
    expect(validateStudioWorldManifest(next)).toEqual([]); expect(next.id).toBe(before.id); expect(next.version).toBe(before.version);
    expect(next.backgroundUrl).toBe(before.backgroundUrl); expect(next.interactions).toEqual(before.interactions);
    expect(JSON.stringify(before)).toBe(serialized);
  });
  it("never removes or downgrades private/door boundaries when applying templates", () => {
    const privateZone = { ...DEFAULT_STUDIO_WORLD_MANIFEST.acousticZones![0]!, policy: "private" as const, doorId: "private-door" };
    const current = { ...DEFAULT_STUDIO_WORLD_MANIFEST, acousticZones: [privateZone, ...DEFAULT_STUDIO_WORLD_MANIFEST.acousticZones!.slice(1)] };
    expect(() => retainStudioWorldPrivacy(current, DEFAULT_STUDIO_WORLD_MANIFEST)).toThrow("private boundaries");
    expect(createStudioWorldStarterTemplate("team", current).acousticZones).toEqual(current.acousticZones);
  });
  it("pins exact actual bytes, preserves the old world and keeps parsing entirely local", async () => {
    const deps = dependencies(), before = DEFAULT_STUDIO_WORLD_MANIFEST;
    const pkg = await createStudioWorldTemplatePackage(before, details, new AbortController().signal, deps);
    expect(before.assetIntegrity).toBeUndefined(); expect(pkg.manifest.assetIntegrity).toHaveLength(1);
    expect(deps.revokeUrl).toHaveBeenCalledTimes(1); expect(deps.fetch).toHaveBeenCalledWith(before.backgroundUrl,
      { signal: expect.any(AbortSignal), credentials: "omit", referrerPolicy: "no-referrer" });
    const reads = deps.fetch.mock.calls.length;
    expect(await parseStudioWorldTemplatePackage(JSON.stringify(pkg))).toEqual(pkg);
    expect(deps.fetch.mock.calls.length).toBe(reads);
    await expect(verifyStudioWorldTemplatePackage(JSON.stringify(pkg), new AbortController().signal, deps)).resolves.toEqual(pkg);
  });
  it("rejects changed package geometry before a network read", async () => {
    const deps = dependencies(), pkg = await createStudioWorldTemplatePackage(DEFAULT_STUDIO_WORLD_MANIFEST, details, new AbortController().signal, deps);
    const before = deps.fetch.mock.calls.length;
    await expect(verifyStudioWorldTemplatePackage(JSON.stringify({ ...pkg, manifest: { ...pkg.manifest, version: 999 } }), new AbortController().signal, deps)).rejects.toThrow("modified");
    expect(deps.fetch.mock.calls.length).toBe(before);
  });
  it("rejects mutable asset bytes at adoption and releases all earlier object URLs", async () => {
    const deps = dependencies(), pkg = await createStudioWorldTemplatePackage(DEFAULT_STUDIO_WORLD_MANIFEST, details, new AbortController().signal, deps);
    deps.fetch.mockImplementation(async () => new Response(new Blob(["modified-image"], { type: "image/webp" })));
    await expect(verifyStudioWorldTemplatePackage(JSON.stringify(pkg), new AbortController().signal, deps)).rejects.toThrow();
    const publication = { contract: "studio-world-publication-v1" as const, workId: "work", projectId: "project", artifactId: "artifact",
      revisionId: "r1", previousPublishedRevisionId: null, contentHash: await studioWorldDigest(pkg.manifest), sequence: 1,
      publishedBy: "host", publishedAt: "2026-09-21T00:00:00Z", manifest: pkg.manifest };
    await expect(prepareStudioWorldAssets(publication, new AbortController().signal, deps)).rejects.toMatchObject({ reason: "assets" });
  });
  it("rejects partial/duplicate pins and forbidden package fields", async () => {
    const deps = dependencies(), pkg = await createStudioWorldTemplatePackage(DEFAULT_STUDIO_WORLD_MANIFEST, details, new AbortController().signal, deps);
    expect(studioWorldTemplatePackageSchema.safeParse({ ...pkg, execute: "anything" }).success).toBe(false);
    expect(studioWorldManifestSchema.safeParse({ ...pkg.manifest, assetIntegrity: [] }).success).toBe(false);
    expect(studioWorldManifestSchema.safeParse({ ...pkg.manifest, assetIntegrity: [...pkg.manifest.assetIntegrity!, ...pkg.manifest.assetIntegrity!] }).success).toBe(false);
    expect(studioWorldTemplatePackageSchema.safeParse({ ...pkg, manifest: DEFAULT_STUDIO_WORLD_MANIFEST }).success).toBe(false);
  });
  it("cancels pinning without orphaning decoded URLs", async () => {
    const deps = dependencies(), abort = new AbortController();
    deps.decode.mockImplementation(async () => { abort.abort(); });
    await expect(pinStudioWorldAssets(DEFAULT_STUDIO_WORLD_MANIFEST, abort.signal, deps)).rejects.toThrow();
    expect(deps.revokeUrl).toHaveBeenCalledTimes(1);
  });
  it("round-trips integrity in Tiled and never inherits pins from an unrelated import", async () => {
    const pkg = await createStudioWorldTemplatePackage(DEFAULT_STUDIO_WORLD_MANIFEST, details, new AbortController().signal, dependencies());
    const tiled = studioWorldManifestToTiledMap(pkg.manifest);
    expect(parseStudioWorldAuthoringImport(JSON.stringify(tiled), DEFAULT_STUDIO_WORLD_MANIFEST).assetIntegrity).toEqual(pkg.manifest.assetIntegrity);
    const legacy = studioWorldManifestToTiledMap(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(parseStudioWorldAuthoringImport(JSON.stringify(legacy), pkg.manifest).assetIntegrity).toBeUndefined();
  });
});
