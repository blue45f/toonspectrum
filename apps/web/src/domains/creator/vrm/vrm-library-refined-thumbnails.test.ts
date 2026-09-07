import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SAMPLE_VRMS } from "./vrm-library";

const publicRoot = resolve(process.cwd(), "apps/web/public");
const refinedRoot = resolve(publicRoot, "assets/3d/characters/thumbnails/refined-v1");
const manifest = JSON.parse(readFileSync(resolve(refinedRoot, "manifest.json"), "utf8")) as {
  sourceMaterialsPreserved: boolean;
  entries: Array<{
    id: string;
    sourceUrl: string;
    sourceSha256: string;
    originalThumbnailSha256: string;
    thumbnailSha256: string;
    renderedTriangles: number;
    gpu: { renderer: string };
  }>;
};
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("bundled VRM thumbnail refinement", () => {
  it.each([
    ["mega-angel", "/vrm/MegaAngel.vrm"],
    ["alicia", "/vrm/AliciaSolid.vrm"],
    ["rubin", "/vrm/Victoria_Rubin.vrm"],
    ["unicorn-person", "/vrm/UnicornPerson.vrm"],
    ["vivi", "/vrm/Vivi.vrm"],
  ])("connects %s to a captured original VRM without replacing its source or prior preview", (id, url) => {
    const entry = SAMPLE_VRMS.find((model) => model.id === id);
    expect(entry).toMatchObject({ id, url, thumbnailUrl: `/assets/3d/characters/thumbnails/refined-v1/${id}.png` });
    const receipt = manifest.entries.find((item) => item.id === id);
    expect(receipt).toBeDefined();
    if (!receipt) return;
    const thumbnail = readFileSync(resolve(refinedRoot, `${id}.png`));
    expect(thumbnail.subarray(1, 4).toString()).toBe("PNG");
    expect([thumbnail.readUInt32BE(16), thumbnail.readUInt32BE(20)]).toEqual([768, 768]);
    expect(sha256(thumbnail)).toBe(receipt.thumbnailSha256);
    expect(sha256(readFileSync(resolve(publicRoot, url.slice(1))))).toBe(receipt.sourceSha256);
    expect(sha256(readFileSync(resolve(publicRoot, `assets/3d/characters/thumbnails/${id}.png`)))).toBe(receipt.originalThumbnailSha256);
    expect(receipt.sourceUrl).toBe(url);
    expect(receipt.renderedTriangles).toBeGreaterThan(0);
    expect(receipt.gpu.renderer).toMatch(/Apple.*Metal/iu);
    expect(manifest.sourceMaterialsPreserved).toBe(true);
  });

  it.each([
    ["mio", "미오 (인체 베이스)", "/vrm/fem_vroid.vrm"],
    ["noa", "노아 (인체 베이스)", "/vrm/masc_vroid.vrm"],
  ])("labels %s as a body base while retaining its saved-scene identity", (id, name, url) => {
    expect(SAMPLE_VRMS.find((model) => model.id === id)).toMatchObject({ id, name, url });
  });
});
