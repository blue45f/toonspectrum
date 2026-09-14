#!/usr/bin/env node

import {
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
  isCloudflareOversizedAssetPath,
} from "../deploy/cloudflare-static/src/large-static-assets";

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

export function prepareCloudflareStaticAssets(
  distDirectory = resolve(process.cwd(), "dist"),
): readonly string[] {
  if (!existsSync(distDirectory) || !statSync(distDirectory).isDirectory()) {
    throw new Error(`Cloudflare asset directory does not exist: ${distDirectory}`);
  }

  const oversizedFiles = walkFiles(distDirectory)
    .map((path) => ({
      path,
      relativePath: normalizedRelativePath(distDirectory, path),
      bytes: statSync(path).size,
    }))
    .filter(({ bytes }) => bytes > CLOUDFLARE_STATIC_MAX_FILE_BYTES);

  const unsupported = oversizedFiles.filter(({ relativePath }) =>
    !isCloudflareOversizedAssetPath(`/${relativePath}`));
  if (unsupported.length > 0) {
    throw new Error(
      `Cloudflare Static Assets has unsupported files above 25 MiB:\n${unsupported
        .map(({ relativePath, bytes }) => ` - ${relativePath} (${bytes} bytes)`)
        .join("\n")}`,
    );
  }

  const ignorePath = resolve(distDirectory, ".assetsignore");
  writeFileSync(
    ignorePath,
    `${CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS.join("\n")}\n`,
    "utf8",
  );

  for (const file of oversizedFiles) {
    console.log(
      `Cloudflare large-asset passthrough: ${file.relativePath} (${file.bytes} bytes)`,
    );
  }
  console.log(`Wrote ${ignorePath}`);
  return oversizedFiles.map(({ relativePath }) => relativePath);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  prepareCloudflareStaticAssets();
}
