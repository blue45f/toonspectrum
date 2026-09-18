import type {
  RemoteFileSnapshot,
  SyncFileSnapshot,
  SyncJournal,
  SyncJournalEntry,
} from "./model.js";

export type SyncPlanAction =
  | "upload"
  | "download"
  | "delete-local"
  | "delete-remote"
  | "record"
  | "forget"
  | "conflict";

export interface SyncPlanItem {
  readonly relativePath: string;
  readonly action: SyncPlanAction;
  readonly local: SyncFileSnapshot | null;
  readonly remote: RemoteFileSnapshot | null;
  readonly base: SyncJournalEntry | null;
  readonly reason: string;
}

function mapByPath<T extends { readonly relativePath: string }>(
  values: readonly T[],
): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const value of values) {
    if (map.has(value.relativePath)) {
      throw new TypeError(`duplicate sync path: ${value.relativePath}`);
    }
    map.set(value.relativePath, value);
  }
  return map;
}

function planExistingPair(
  path: string,
  local: SyncFileSnapshot,
  remote: RemoteFileSnapshot,
  base: SyncJournalEntry | null,
): SyncPlanItem {
  if (local.sha256 === remote.sha256) {
    return { relativePath: path, action: "record", local, remote, base, reason: "same-content" };
  }
  if (base === null) {
    return { relativePath: path, action: "conflict", local, remote, base, reason: "independent-files" };
  }
  const localChanged = local.sha256 !== base.localSha256;
  const remoteChanged = remote.sha256 !== base.remoteSha256;
  if (localChanged && remoteChanged) {
    return { relativePath: path, action: "conflict", local, remote, base, reason: "both-modified" };
  }
  if (localChanged) {
    return { relativePath: path, action: "upload", local, remote, base, reason: "local-modified" };
  }
  if (remoteChanged) {
    return { relativePath: path, action: "download", local, remote, base, reason: "remote-modified" };
  }
  return { relativePath: path, action: "conflict", local, remote, base, reason: "divergent-base" };
}

function planLocalOnly(
  path: string,
  local: SyncFileSnapshot,
  base: SyncJournalEntry | null,
): SyncPlanItem {
  if (base?.remoteSha256 === null || base === null) {
    return { relativePath: path, action: "upload", local, remote: null, base, reason: "local-only" };
  }
  if (local.sha256 !== base.localSha256) {
    return {
      relativePath: path,
      action: "conflict",
      local,
      remote: null,
      base,
      reason: "remote-deleted-local-modified",
    };
  }
  return {
    relativePath: path,
    action: "delete-local",
    local,
    remote: null,
    base,
    reason: "remote-deleted",
  };
}

function planRemoteOnly(
  path: string,
  remote: RemoteFileSnapshot,
  base: SyncJournalEntry | null,
): SyncPlanItem {
  if (base?.localSha256 === null || base === null) {
    return { relativePath: path, action: "download", local: null, remote, base, reason: "remote-only" };
  }
  if (remote.sha256 !== base.remoteSha256) {
    return {
      relativePath: path,
      action: "conflict",
      local: null,
      remote,
      base,
      reason: "local-deleted-remote-modified",
    };
  }
  return {
    relativePath: path,
    action: "delete-remote",
    local: null,
    remote,
    base,
    reason: "local-deleted",
  };
}

export function buildDesktopSyncPlan(
  localFiles: readonly SyncFileSnapshot[],
  remoteFiles: readonly RemoteFileSnapshot[],
  journal: SyncJournal,
): readonly SyncPlanItem[] {
  const local = mapByPath(localFiles);
  const remote = mapByPath(remoteFiles);
  const paths = new Set([
    ...local.keys(),
    ...remote.keys(),
    ...Object.keys(journal.entries),
  ]);
  const plan: SyncPlanItem[] = [];
  for (const path of [...paths].sort()) {
    const localFile = local.get(path) ?? null;
    const remoteFile = remote.get(path) ?? null;
    const base = journal.entries[path] ?? null;
    if (localFile && remoteFile) {
      plan.push(planExistingPair(path, localFile, remoteFile, base));
    } else if (localFile) {
      plan.push(planLocalOnly(path, localFile, base));
    } else if (remoteFile) {
      plan.push(planRemoteOnly(path, remoteFile, base));
    } else if (base) {
      plan.push({ relativePath: path, action: "forget", local: null, remote: null, base, reason: "both-deleted" });
    }
  }
  return plan;
}

export function countSyncPlanActions(
  plan: readonly SyncPlanItem[],
): Readonly<Record<SyncPlanAction, number>> {
  const counts: Record<SyncPlanAction, number> = {
    upload: 0,
    download: 0,
    "delete-local": 0,
    "delete-remote": 0,
    record: 0,
    forget: 0,
    conflict: 0,
  };
  for (const item of plan) counts[item.action] += 1;
  return counts;
}
