import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, opendir } from "node:fs/promises";
import path from "node:path";

import { safeBindingRoot, safeRelativePath } from "./path-safety.js";
import type { DesktopFileSnapshot, DesktopSyncBinding } from "./types.js";

const RESERVED_DIRECTORY = ".toonstudio-sync";

async function hashFile(filePath: string): Promise<string> {
  const digest = createHash("sha256");
  const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  for await (const chunk of stream) digest.update(chunk as Buffer);
  return digest.digest("hex");
}

export async function scanDesktopBinding(
  binding: DesktopSyncBinding,
): Promise<ReadonlyMap<string, DesktopFileSnapshot>> {
  const root = safeBindingRoot(binding.rootPath);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("desktop sync binding root must be a real directory");
  }
  if (!Number.isSafeInteger(binding.maxFiles) || binding.maxFiles < 1) {
    throw new Error("desktop sync maxFiles must be a positive safe integer");
  }
  if (!Number.isSafeInteger(binding.maxFileBytes) || binding.maxFileBytes < 1) {
    throw new Error("desktop sync maxFileBytes must be a positive safe integer");
  }

  const files = new Map<string, DesktopFileSnapshot>();
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) break;
    const handle = await opendir(directory);
    for await (const entry of handle) {
      if (entry.name === RESERVED_DIRECTORY) continue;
      const absolute = path.join(directory, entry.name);
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!stats.isFile()) continue;
      if (stats.size > binding.maxFileBytes) {
        throw new Error(`desktop sync file exceeds configured limit: ${entry.name}`);
      }
      if (files.size >= binding.maxFiles) {
        throw new Error("desktop sync file count exceeds configured limit");
      }
      const relativePath = safeRelativePath(root, absolute);
      files.set(relativePath, Object.freeze({
        relativePath,
        sha256: await hashFile(absolute),
        size: stats.size,
        modifiedAtMs: Math.trunc(stats.mtimeMs),
      }));
    }
  }
  return files;
}
