import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveSyncPath } from "./path-policy.js";
import { sha256File } from "./scanner.js";

import type {
  RemoteFileSnapshot,
  SyncFileSnapshot,
  SyncJournal,
  SyncJournalEntry,
} from "./model.js";
import type { SyncPlanItem } from "./planner.js";

export interface DesktopSyncTransport {
  uploadFile(input: {
    readonly relativePath: string;
    readonly absolutePath: string;
    readonly sha256: string;
    readonly size: number;
    readonly expectedRemoteVersion: string | null;
  }): Promise<RemoteFileSnapshot>;
  downloadFile(input: {
    readonly remote: RemoteFileSnapshot;
    readonly temporaryAbsolutePath: string;
  }): Promise<void>;
  deleteRemoteFile(input: {
    readonly remote: RemoteFileSnapshot;
    readonly expectedRemoteVersion: string;
  }): Promise<void>;
}

export class DesktopSyncConflictError extends Error {
  constructor(readonly conflicts: readonly SyncPlanItem[]) {
    super(`${conflicts.length} desktop sync conflict(s) require review`);
    this.name = "DesktopSyncConflictError";
  }
}

export class DesktopSyncIntegrityError extends Error {
  constructor(readonly relativePath: string) {
    super(`downloaded file hash mismatch: ${relativePath}`);
    this.name = "DesktopSyncIntegrityError";
  }
}

export interface DesktopSyncExecutionResult {
  readonly journal: SyncJournal;
  readonly uploaded: number;
  readonly downloaded: number;
  readonly deletedLocal: number;
  readonly deletedRemote: number;
  readonly recorded: number;
}

function entry(
  relativePath: string,
  localSha256: string | null,
  remoteSha256: string | null,
  remoteVersion: string | null,
  syncedAt: string,
): SyncJournalEntry {
  return { relativePath, localSha256, remoteSha256, remoteVersion, syncedAt };
}

async function moveLocalFileToTrash(
  root: string,
  relativePath: string,
  transactionId: string,
): Promise<void> {
  const source = resolveSyncPath(root, relativePath);
  const destination = join(root, ".toonstudio", "trash", transactionId, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await rename(source, destination);
}

async function downloadAtomically(
  root: string,
  remote: RemoteFileSnapshot,
  transport: DesktopSyncTransport,
): Promise<SyncFileSnapshot> {
  const destination = resolveSyncPath(root, remote.relativePath);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.download`;
  try {
    await transport.downloadFile({ remote, temporaryAbsolutePath: temporary });
    const hash = await sha256File(temporary);
    if (hash !== remote.sha256) {
      throw new DesktopSyncIntegrityError(remote.relativePath);
    }
    const metadata = await stat(temporary);
    await rename(temporary, destination);
    return {
      relativePath: remote.relativePath,
      size: metadata.size,
      modifiedAtMs: Math.trunc(metadata.mtimeMs),
      sha256: hash,
    };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function executeDesktopSyncPlan(
  root: string,
  plan: readonly SyncPlanItem[],
  journal: SyncJournal,
  transport: DesktopSyncTransport,
  now = new Date().toISOString(),
): Promise<DesktopSyncExecutionResult> {
  const conflicts = plan.filter((item) => item.action === "conflict");
  if (conflicts.length > 0) throw new DesktopSyncConflictError(conflicts);

  const entries: Record<string, SyncJournalEntry> = { ...journal.entries };
  const transactionId = now.replace(/[^0-9]/gu, "") || randomUUID();
  let uploaded = 0;
  let downloaded = 0;
  let deletedLocal = 0;
  let deletedRemote = 0;
  let recorded = 0;

  for (const item of plan) {
    if (item.action === "record") {
      if (!item.local || !item.remote) throw new TypeError("record action requires both sides");
      entries[item.relativePath] = entry(
        item.relativePath,
        item.local.sha256,
        item.remote.sha256,
        item.remote.version,
        now,
      );
      recorded += 1;
      continue;
    }
    if (item.action === "upload") {
      if (!item.local) throw new TypeError("upload action requires local file");
      const remote = await transport.uploadFile({
        relativePath: item.relativePath,
        absolutePath: resolveSyncPath(root, item.relativePath),
        sha256: item.local.sha256,
        size: item.local.size,
        expectedRemoteVersion: item.base?.remoteVersion ?? null,
      });
      if (remote.sha256 !== item.local.sha256) {
        throw new DesktopSyncIntegrityError(item.relativePath);
      }
      entries[item.relativePath] = entry(
        item.relativePath,
        item.local.sha256,
        remote.sha256,
        remote.version,
        now,
      );
      uploaded += 1;
      continue;
    }

    if (item.action === "download") {
      if (!item.remote) throw new TypeError("download action requires remote file");
      const local = await downloadAtomically(root, item.remote, transport);
      entries[item.relativePath] = entry(
        item.relativePath,
        local.sha256,
        item.remote.sha256,
        item.remote.version,
        now,
      );
      downloaded += 1;
      continue;
    }
    if (item.action === "delete-local") {
      if (!item.local) throw new TypeError("delete-local action requires local file");
      await moveLocalFileToTrash(root, item.relativePath, transactionId);
      delete entries[item.relativePath];
      deletedLocal += 1;
      continue;
    }

    if (item.action === "delete-remote") {
      if (!item.remote) throw new TypeError("delete-remote action requires remote file");
      await transport.deleteRemoteFile({
        remote: item.remote,
        expectedRemoteVersion: item.remote.version,
      });
      delete entries[item.relativePath];
      deletedRemote += 1;
    }
  }

  return {
    journal: {
      ...journal,
      updatedAt: now,
      entries,
    },
    uploaded,
    downloaded,
    deletedLocal,
    deletedRemote,
    recorded,
  };
}
