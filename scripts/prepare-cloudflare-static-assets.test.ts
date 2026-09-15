import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import {
  CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
} from "../deploy/cloudflare-static/src/large-static-assets";

import { prepareCloudflareStaticAssets } from "./prepare-cloudflare-static-assets.mts";

const temporaryDirectories: string[] = [];

function temporaryDist(): string {
  const directory = mkdtempSync(join(tmpdir(), "toonspectrum-cf-assets-"));
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

describe("Cloudflare static large asset preparation", () => {
  it("creates bounded Brotli and gzip sidecars for reviewed large assets", async () => {
    const dist = temporaryDist();
    const relativePath = "assets/opencascade.wasm-testbuild.wasm";
    const originalBytes = CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1;
    sparseFile(join(dist, relativePath), originalBytes);

    await expect(prepareCloudflareStaticAssets(dist)).resolves.toEqual([
      relativePath,
    ]);
    const brotliPath = join(dist, `${relativePath}.br`);
    const gzipPath = join(dist, `${relativePath}.gz`);
    expect(statSync(brotliPath).size).toBeLessThanOrEqual(
      CLOUDFLARE_STATIC_MAX_FILE_BYTES,
    );
    expect(statSync(gzipPath).size).toBeLessThanOrEqual(
      CLOUDFLARE_STATIC_MAX_FILE_BYTES,
    );
    expect(brotliDecompressSync(readFileSync(brotliPath)).length).toBe(
      originalBytes,
    );
    expect(gunzipSync(readFileSync(gzipPath)).length).toBe(originalBytes);
    expect(readFileSync(join(dist, ".assetsignore"), "utf8")).toBe(
      `${CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS.join("\n")}\n`,
    );
  });

  it("fails closed when a new unreviewed file exceeds the platform limit", async () => {
    const dist = temporaryDist();
    sparseFile(
      join(dist, "assets/unreviewed-model.glb"),
      CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1,
    );

    await expect(prepareCloudflareStaticAssets(dist)).rejects.toThrow(
      /unsupported files above 25 MiB/u,
    );
  });
});
