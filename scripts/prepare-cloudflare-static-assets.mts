#!/usr/bin/env node

import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  constants as zlibConstants,
  createBrotliCompress,
  createGzip,
} from "node:zlib";

import {
  CLOUDFLARE_LARGE_ASSET_ENCODINGS,
  CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
  cloudflareLargeAssetSidecarPath,
  isCloudflareOversizedAssetPath,
  type CloudflareLargeAssetEncoding,
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

function compressor(
  encoding: CloudflareLargeAssetEncoding,
  sourceBytes: number,
) {
  if (encoding === "br") {
    return createBrotliCompress({
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 9,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: sourceBytes,
      },
    });
  }
  return createGzip({ level: 9 });
}
async function writeCompressedSidecar(
  sourcePath: string,
  destinationPath: string,
  encoding: CloudflareLargeAssetEncoding,
  sourceBytes: number,
): Promise<number> {
  const temporaryPath = `${destinationPath}.tmp-${process.pid}`;
  rmSync(temporaryPath, { force: true });
  try {
    await pipeline(
      createReadStream(sourcePath),
      compressor(encoding, sourceBytes),
      createWriteStream(temporaryPath),
    );
    const compressedBytes = statSync(temporaryPath).size;
    if (compressedBytes > CLOUDFLARE_STATIC_MAX_FILE_BYTES) {
      throw new Error(
        `${encoding} sidecar still exceeds 25 MiB: ${destinationPath} (${compressedBytes} bytes)`,
      );
    }
    rmSync(destinationPath, { force: true });
    renameSync(temporaryPath, destinationPath);
    return compressedBytes;
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export async function prepareCloudflareStaticAssets(
  distDirectory = resolve(process.cwd(), "dist"),
): Promise<readonly string[]> {
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
        .map(({ relativePath, bytes }) =>
          ` - ${relativePath} (${bytes} bytes)`)
        .join("\n")}`,
    );
  }

  for (const file of oversizedFiles) {
    for (const encoding of CLOUDFLARE_LARGE_ASSET_ENCODINGS) {
      const sidecarRelativePath = cloudflareLargeAssetSidecarPath(
        `/${file.relativePath}`,
        encoding,
      ).slice(1);
      const sidecarPath = resolve(distDirectory, sidecarRelativePath);
      const compressedBytes = await writeCompressedSidecar(
        file.path,
        sidecarPath,
        encoding,
        file.bytes,
      );
      console.log(
        `Cloudflare compressed large asset: ${sidecarRelativePath} (${compressedBytes} bytes from ${file.bytes})`,
      );
    }
  }

  const ignorePath = resolve(distDirectory, ".assetsignore");
  writeFileSync(
    ignorePath,
    `${CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS.join("\n")}\n`,
    "utf8",
  );
  console.log(`Wrote ${ignorePath}`);
  return oversizedFiles.map(({ relativePath }) => relativePath);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await prepareCloudflareStaticAssets();
}
