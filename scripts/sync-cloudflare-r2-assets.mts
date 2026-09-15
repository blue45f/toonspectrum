#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL,
  CLOUDFLARE_R2_LARGE_ASSET_BUCKET,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
  cloudflareLargeAssetDescriptor,
} from "../deploy/cloudflare-static/src/large-static-assets";

export interface R2LargeAssetUpload {
  readonly absolutePath: string;
  readonly key: string;
  readonly bytes: number;
  readonly contentType: string;
}

function walkFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
function normalizedRelativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export function discoverR2LargeAssets(
  distDirectory = resolve(process.cwd(), "dist"),
): readonly R2LargeAssetUpload[] {
  if (!existsSync(distDirectory) || !statSync(distDirectory).isDirectory()) {
    throw new Error(`Cloudflare asset directory does not exist: ${distDirectory}`);
  }

  const oversized = walkFiles(distDirectory)
    .map((absolutePath) => ({
      absolutePath,
      key: normalizedRelativePath(distDirectory, absolutePath),
      bytes: statSync(absolutePath).size,
    }))
    .filter(({ bytes }) => bytes > CLOUDFLARE_STATIC_MAX_FILE_BYTES);

  const uploads = oversized.map((asset) => {
    const descriptor = cloudflareLargeAssetDescriptor(`/${asset.key}`);
    if (!descriptor) {
      throw new Error(
        `Unreviewed file exceeds the Static Assets limit: ${asset.key}`,
      );
    }
    return { ...asset, contentType: descriptor.contentType };
  });

  return uploads.sort((left, right) => left.key.localeCompare(right.key));
}
export function r2ObjectPutArgs(asset: R2LargeAssetUpload): readonly string[] {
  return [
    "exec",
    "wrangler",
    "r2",
    "object",
    "put",
    `${CLOUDFLARE_R2_LARGE_ASSET_BUCKET}/${asset.key}`,
    "--file",
    asset.absolutePath,
    "--content-type",
    asset.contentType,
    "--content-disposition",
    "inline",
    "--cache-control",
    CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL,
    "--remote",
    "--force",
  ];
}

export function syncCloudflareR2Assets(
  mode: "dry-run" | "production",
  distDirectory = resolve(process.cwd(), "dist"),
): readonly R2LargeAssetUpload[] {
  const assets = discoverR2LargeAssets(distDirectory);
  for (const asset of assets) {
    console.log(
      `R2 ${mode}: ${asset.key} (${asset.bytes} bytes, ${asset.contentType})`,
    );
    if (mode === "dry-run") continue;
    const result = spawnSync("pnpm", r2ObjectPutArgs(asset), {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(`R2 upload failed for ${asset.key}`);
    }
  }
  return assets;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes("--production")
    ? "production"
    : "dry-run";
  syncCloudflareR2Assets(mode);
}
