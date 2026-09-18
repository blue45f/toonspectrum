import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CLOUDFLARE_STATIC_MAX_FILE_BYTES } from "../deploy/cloudflare-static/src/large-static-assets";

import {
  discoverR2LargeAssets,
  r2ObjectPutArgs,
} from "./sync-cloudflare-r2-assets.mts";

const temporaryDirectories: string[] = [];

function temporaryDist(): string {
  const directory = mkdtempSync(join(tmpdir(), "toonspectrum-r2-assets-"));
  temporaryDirectories.push(directory);
  return directory;
}

function sparseFile(path: string, bytes: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
  truncateSync(path, bytes);
}
afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("Cloudflare R2 large asset synchronization", () => {
  it("discovers reviewed assets and builds a remote put command", () => {
    const dist = temporaryDist();
    const relativePath = "assets/opencascade.wasm-build123.wasm";
    sparseFile(
      join(dist, relativePath),
      CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1,
    );

    const assets = discoverR2LargeAssets(dist);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      key: relativePath,
      contentType: "application/wasm",
    });
    expect(r2ObjectPutArgs(assets[0]!)).toEqual(expect.arrayContaining([
      "toonspectrum-public-assets/assets/opencascade.wasm-build123.wasm",
      "--content-type",
      "application/wasm",
      "--remote",
      "--force",
    ]));
  });

  it("routes the product tour video through R2 with the correct media type", () => {
    const dist = temporaryDist();
    const relativePath = "brand/toonstudio-product-tour.mp4";
    sparseFile(
      join(dist, relativePath),
      CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1,
    );

    const assets = discoverR2LargeAssets(dist);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      key: relativePath,
      contentType: "video/mp4",
    });
  });

  it("fails closed for an unreviewed file above the platform limit", () => {
    const dist = temporaryDist();
    sparseFile(
      join(dist, "assets/unreviewed-model.glb"),
      CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1,
    );

    expect(() => discoverR2LargeAssets(dist)).toThrow(
      /Unreviewed file exceeds the Static Assets limit/u,
    );
  });
});
