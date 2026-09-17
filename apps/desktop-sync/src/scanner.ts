import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import { isReservedSyncPath, normalizeRelativeSyncPath } from "./path-policy.js";

import type { SyncFileSnapshot } from "./model.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".toonproj", ".toon2d", ".toon3d", ".toonasset", ".toonbrush",
  ".psd", ".psb", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff",
  ".clip", ".cmc", ".glb", ".gltf", ".fbx", ".obj", ".mtl", ".vrm",
  ".usd", ".usdz", ".dae", ".stl", ".exr", ".hdr",
]);

export interface ScanSyncFolderOptions {
  readonly includeUnknownFiles?: boolean;
  readonly maximumFileBytes?: number;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

export async function scanSyncFolder(
  root: string,
  options: ScanSyncFolderOptions = {},
): Promise<readonly SyncFileSnapshot[]> {
  const maximumFileBytes = options.maximumFileBytes ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(maximumFileBytes) || maximumFileBytes <= 0) {
    throw new TypeError("maximumFileBytes must be a positive safe integer");
  }
  const snapshots: SyncFileSnapshot[] = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = normalizeRelativeSyncPath(root, absolutePath);
      if (!relativePath || isReservedSyncPath(relativePath)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (
        !options.includeUnknownFiles
        && !SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ) continue;
      const metadata = await lstat(absolutePath);
      if (metadata.size > maximumFileBytes) continue;
      snapshots.push({
        relativePath,
        size: metadata.size,
        modifiedAtMs: Math.trunc(metadata.mtimeMs),
        sha256: await sha256File(absolutePath),
      });
    }
  };

  await visit(root);
  return snapshots;
}
