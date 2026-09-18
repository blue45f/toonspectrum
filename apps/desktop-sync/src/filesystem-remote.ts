import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { DesktopSyncPathError, resolveSyncPath } from "./path-policy.js";
import { scanSyncFolder, sha256File } from "./scanner.js";

import type { RemoteFileSnapshot, SyncFileSnapshot } from "./model.js";
import type { DesktopSyncRemote } from "./runtime.js";
import type { ScanSyncFolderOptions } from "./scanner.js";

export interface FileSystemDesktopSyncRemoteOptions extends ScanSyncFolderOptions {
  readonly createRoot?: boolean;
}

export type FileSystemDesktopSyncRemoteErrorCode =
  | "same-root"
  | "nested-root"
  | "unsafe-parent"
  | "hash-mismatch"
  | "version-conflict";

export class FileSystemDesktopSyncRemoteError extends Error {
  constructor(
    readonly code: FileSystemDesktopSyncRemoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FileSystemDesktopSyncRemoteError";
  }
}

function versionFor(snapshot: SyncFileSnapshot): string {
  return `${snapshot.modifiedAtMs}:${snapshot.size}:${snapshot.sha256}`;
}

function remoteSnapshot(snapshot: SyncFileSnapshot): RemoteFileSnapshot {
  return {
    relativePath: snapshot.relativePath,
    sha256: snapshot.sha256,
    size: snapshot.size,
    version: versionFor(snapshot),
  };
}

function isSameOrNested(parent: string, candidate: string): boolean {
  const value = relative(parent, candidate);
  return value === "" || (
    !isAbsolute(value)
    && value !== ".."
    && !value.startsWith(`..${sep}`)
  );
}

async function ensureDirectoryChain(root: string, targetDirectory: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(targetDirectory);
  const relativePath = relative(lexicalRoot, lexicalTarget);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new DesktopSyncPathError("outside-root");
  }

  let current = lexicalRoot;
  for (const segment of relativePath.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new FileSystemDesktopSyncRemoteError(
          "unsafe-parent",
          `desktop sync parent is not a real directory: ${current}`,
        );
      }
      const canonicalCurrent = await realpath(current);
      if (!isSameOrNested(canonicalRoot, canonicalCurrent)) {
        throw new FileSystemDesktopSyncRemoteError(
          "unsafe-parent",
          `desktop sync parent escaped the configured root: ${current}`,
        );
      }
    } catch (error) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "ENOENT"
      ) {
        await mkdir(current, { mode: 0o700 });
        continue;
      }
      throw error;
    }
  }
}

async function replaceAtomically(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    if (
      process.platform !== "win32"
      || typeof error !== "object"
      || error === null
      || !("code" in error)
      || (error.code !== "EEXIST" && error.code !== "EPERM")
    ) {
      throw error;
    }
    await rm(destination, { force: true });
    await rename(source, destination);
  }
}

export class FileSystemDesktopSyncRemote implements DesktopSyncRemote {
  readonly root: string;
  private readonly scanOptions: ScanSyncFolderOptions;

  private constructor(root: string, scanOptions: ScanSyncFolderOptions) {
    this.root = root;
    this.scanOptions = scanOptions;
  }

  static async create(
    root: string,
    options: FileSystemDesktopSyncRemoteOptions = {},
  ): Promise<FileSystemDesktopSyncRemote> {
    const requested = resolve(root);
    if (options.createRoot !== false) {
      await mkdir(requested, { recursive: true, mode: 0o700 });
    }
    const canonical = await realpath(requested);
    const metadata = await stat(canonical);
    if (!metadata.isDirectory()) {
      throw new TypeError("desktop sync remote root must be a directory");
    }
    return new FileSystemDesktopSyncRemote(canonical, {
      includeUnknownFiles: options.includeUnknownFiles,
      maximumFileBytes: options.maximumFileBytes,
    });
  }

  async assertDistinctFrom(localRoot: string): Promise<void> {
    const canonicalLocal = await realpath(resolve(localRoot));
    if (canonicalLocal === this.root) {
      throw new FileSystemDesktopSyncRemoteError(
        "same-root",
        "local and remote desktop sync roots must be different",
      );
    }
    if (
      isSameOrNested(canonicalLocal, this.root)
      || isSameOrNested(this.root, canonicalLocal)
    ) {
      throw new FileSystemDesktopSyncRemoteError(
        "nested-root",
        "local and remote desktop sync roots must not contain one another",
      );
    }
  }

  async listRemoteFiles(signal?: AbortSignal): Promise<readonly RemoteFileSnapshot[]> {
    if (signal?.aborted) throw signal.reason;
    const files = await scanSyncFolder(this.root, this.scanOptions);
    if (signal?.aborted) throw signal.reason;
    return files.map(remoteSnapshot);
  }

  private async current(relativePath: string): Promise<RemoteFileSnapshot | null> {
    const absolutePath = resolveSyncPath(this.root, relativePath);
    try {
      const metadata = await lstat(absolutePath);
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new DesktopSyncPathError("symlink");
      }
      const snapshot: SyncFileSnapshot = {
        relativePath,
        size: metadata.size,
        modifiedAtMs: Math.trunc(metadata.mtimeMs),
        sha256: await sha256File(absolutePath),
      };
      return remoteSnapshot(snapshot);
    } catch (error) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  }

  private assertExpectedVersion(
    relativePath: string,
    current: RemoteFileSnapshot | null,
    expectedVersion: string | null,
  ): void {
    const actual = current?.version ?? null;
    if (actual !== expectedVersion) {
      throw new FileSystemDesktopSyncRemoteError(
        "version-conflict",
        `desktop sync remote version changed for ${relativePath}: expected ${expectedVersion ?? "missing"}, actual ${actual ?? "missing"}`,
      );
    }
  }

  async uploadFile(input: {
    readonly relativePath: string;
    readonly absolutePath: string;
    readonly sha256: string;
    readonly size: number;
    readonly expectedRemoteVersion: string | null;
  }): Promise<RemoteFileSnapshot> {
    const initial = await this.current(input.relativePath);
    this.assertExpectedVersion(
      input.relativePath,
      initial,
      input.expectedRemoteVersion,
    );

    const sourceMetadata = await lstat(input.absolutePath);
    if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) {
      throw new DesktopSyncPathError("symlink");
    }
    const sourceHash = await sha256File(input.absolutePath);
    if (sourceMetadata.size !== input.size || sourceHash !== input.sha256) {
      throw new FileSystemDesktopSyncRemoteError(
        "hash-mismatch",
        `desktop sync upload source changed while reading ${input.relativePath}`,
      );
    }

    const absolutePath = resolveSyncPath(this.root, input.relativePath);
    const directory = dirname(absolutePath);
    await ensureDirectoryChain(this.root, directory);
    const basename = input.relativePath.split("/").at(-1) ?? "file";
    const temporaryPath = join(
      directory,
      `.${basename}.${randomUUID()}.toonstudio-sync.tmp`,
    );
    try {
      await copyFile(input.absolutePath, temporaryPath);
      await chmod(temporaryPath, 0o600);
      const temporaryMetadata = await stat(temporaryPath);
      const temporaryHash = await sha256File(temporaryPath);
      if (
        temporaryMetadata.size !== input.size
        || temporaryHash !== input.sha256
      ) {
        throw new FileSystemDesktopSyncRemoteError(
          "hash-mismatch",
          `desktop sync temporary write failed verification for ${input.relativePath}`,
        );
      }

      const beforeCommit = await this.current(input.relativePath);
      this.assertExpectedVersion(
        input.relativePath,
        beforeCommit,
        input.expectedRemoteVersion,
      );
      await replaceAtomically(temporaryPath, absolutePath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }

    const next = await this.current(input.relativePath);
    if (next === null || next.sha256 !== input.sha256 || next.size !== input.size) {
      throw new FileSystemDesktopSyncRemoteError(
        "hash-mismatch",
        `desktop sync committed upload failed verification for ${input.relativePath}`,
      );
    }
    return next;
  }

  async downloadFile(input: {
    readonly remote: RemoteFileSnapshot;
    readonly temporaryAbsolutePath: string;
  }): Promise<void> {
    const current = await this.current(input.remote.relativePath);
    this.assertExpectedVersion(
      input.remote.relativePath,
      current,
      input.remote.version,
    );
    if (
      current?.sha256 !== input.remote.sha256
      || current.size !== input.remote.size
    ) {
      throw new FileSystemDesktopSyncRemoteError(
        "hash-mismatch",
        `desktop sync remote content changed for ${input.remote.relativePath}`,
      );
    }

    const source = resolveSyncPath(this.root, input.remote.relativePath);
    await mkdir(dirname(input.temporaryAbsolutePath), { recursive: true });
    await copyFile(source, input.temporaryAbsolutePath);
    await chmod(input.temporaryAbsolutePath, 0o600);
    const downloadedHash = await sha256File(input.temporaryAbsolutePath);
    if (downloadedHash !== input.remote.sha256) {
      await rm(input.temporaryAbsolutePath, { force: true });
      throw new FileSystemDesktopSyncRemoteError(
        "hash-mismatch",
        `desktop sync downloaded bytes failed verification for ${input.remote.relativePath}`,
      );
    }

    const afterCopy = await this.current(input.remote.relativePath);
    this.assertExpectedVersion(
      input.remote.relativePath,
      afterCopy,
      input.remote.version,
    );
  }

  async deleteRemoteFile(input: {
    readonly remote: RemoteFileSnapshot;
    readonly expectedRemoteVersion: string;
  }): Promise<void> {
    const current = await this.current(input.remote.relativePath);
    this.assertExpectedVersion(
      input.remote.relativePath,
      current,
      input.expectedRemoteVersion,
    );
    if (current === null) return;
    await rm(resolveSyncPath(this.root, input.remote.relativePath));
  }
}
