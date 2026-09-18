import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import {
  desktopSyncRootFingerprint,
  loadSyncJournal,
} from "./journal.js";
import { resolveSyncPath } from "./path-policy.js";
import { buildDesktopSyncPlan } from "./planner.js";
import { runDesktopSyncCycle } from "./runtime.js";
import { scanSyncFolder, sha256File } from "./scanner.js";

import type {
  RemoteFileSnapshot,
  SyncFileSnapshot,
  SyncJournalEntry,
} from "./model.js";
import type { SyncPlanItem } from "./planner.js";
import type {
  DesktopSyncCycleOptions,
  DesktopSyncCycleResult,
  DesktopSyncRemote,
} from "./runtime.js";

export const DESKTOP_SYNC_CONFLICT_REPORT_SCHEMA = 1 as const;
export const DESKTOP_SYNC_CONFLICT_RECEIPT_SCHEMA = 1 as const;

export type DesktopSyncConflictResolution =
  | "use-local"
  | "use-remote"
  | "keep-both-local-primary"
  | "keep-both-remote-primary";

export interface DesktopSyncConflictSide {
  readonly exists: boolean;
  readonly sha256: string | null;
  readonly size: number | null;
  readonly modifiedAtMs: number | null;
  readonly version: string | null;
}

export interface DesktopSyncConflictDescriptor {
  readonly id: string;
  readonly relativePath: string;
  readonly reason: string;
  readonly local: DesktopSyncConflictSide;
  readonly remote: DesktopSyncConflictSide;
  readonly base: {
    readonly localSha256: string | null;
    readonly remoteSha256: string | null;
    readonly remoteVersion: string | null;
    readonly syncedAt: string | null;
  };
  readonly allowedResolutions: readonly DesktopSyncConflictResolution[];
}

export interface DesktopSyncConflictReport {
  readonly schemaVersion: typeof DESKTOP_SYNC_CONFLICT_REPORT_SCHEMA;
  readonly reportId: string;
  readonly createdAt: string;
  readonly rootFingerprint: string;
  readonly remoteLabel: string;
  readonly conflicts: readonly DesktopSyncConflictDescriptor[];
}

export interface DesktopSyncConflictDecision {
  readonly conflictId: string;
  readonly resolution: DesktopSyncConflictResolution;
}

export interface DesktopSyncConflictBackupReceipt {
  readonly side: "local" | "remote";
  readonly relativePath: string;
  readonly backupPath: string;
  readonly sha256: string;
  readonly size: number;
}

export interface DesktopSyncConflictDecisionReceipt {
  readonly conflictId: string;
  readonly relativePath: string;
  readonly resolution: DesktopSyncConflictResolution;
  readonly sidecarPath: string | null;
  readonly backups: readonly DesktopSyncConflictBackupReceipt[];
}

export interface DesktopSyncConflictResolutionReceipt {
  readonly schemaVersion: typeof DESKTOP_SYNC_CONFLICT_RECEIPT_SCHEMA;
  readonly receiptSha256: string;
  readonly sessionId: string;
  readonly reportId: string;
  readonly remoteLabel: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly decisions: readonly DesktopSyncConflictDecisionReceipt[];
  readonly finalSync: DesktopSyncCycleResult["counts"];
}

export interface DesktopSyncConflictResolutionResult {
  readonly receipt: DesktopSyncConflictResolutionReceipt;
  readonly receiptPath: string;
  readonly finalCycle: DesktopSyncCycleResult;
}

interface ConflictTransactionRecord {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly reportId: string;
  readonly remoteLabel: string;
  readonly state: "applying" | "completed" | "failed";
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly decisions: readonly DesktopSyncConflictDecision[];
  readonly receiptSha256: string | null;
  readonly failure: string | null;
}

export class DesktopSyncConflictResolutionError extends Error {
  constructor(
    readonly code:
      | "decision-invalid"
      | "decision-missing"
      | "integrity"
      | "no-conflicts"
      | "stale-report"
      | "unresolved-after-apply",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DesktopSyncConflictResolutionError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

function side(
  value: SyncFileSnapshot | RemoteFileSnapshot | null,
): DesktopSyncConflictSide {
  if (value === null) {
    return {
      exists: false,
      sha256: null,
      size: null,
      modifiedAtMs: null,
      version: null,
    };
  }
  return {
    exists: true,
    sha256: value.sha256,
    size: value.size,
    modifiedAtMs: "modifiedAtMs" in value ? value.modifiedAtMs : null,
    version: "version" in value ? value.version : null,
  };
}

function base(value: SyncJournalEntry | null): DesktopSyncConflictDescriptor["base"] {
  return {
    localSha256: value?.localSha256 ?? null,
    remoteSha256: value?.remoteSha256 ?? null,
    remoteVersion: value?.remoteVersion ?? null,
    syncedAt: value?.syncedAt ?? null,
  };
}

function allowedResolutions(
  item: SyncPlanItem,
): readonly DesktopSyncConflictResolution[] {
  const values: DesktopSyncConflictResolution[] = ["use-local", "use-remote"];
  if (item.local !== null && item.remote !== null) {
    values.push("keep-both-local-primary", "keep-both-remote-primary");
  }
  return Object.freeze(values);
}

function descriptor(item: SyncPlanItem): DesktopSyncConflictDescriptor {
  const identity = {
    relativePath: item.relativePath,
    reason: item.reason,
    local: side(item.local),
    remote: side(item.remote),
    base: base(item.base),
  };
  return Object.freeze({
    id: sha256Json(identity),
    ...identity,
    allowedResolutions: allowedResolutions(item),
  });
}

function reportIdentity(input: {
  readonly rootFingerprint: string;
  readonly remoteLabel: string;
  readonly conflicts: readonly DesktopSyncConflictDescriptor[];
}): string {
  return sha256Json({
    rootFingerprint: input.rootFingerprint,
    remoteLabel: input.remoteLabel,
    conflicts: input.conflicts.map((conflict) => ({
      id: conflict.id,
      relativePath: conflict.relativePath,
    })),
  });
}

export async function buildDesktopSyncConflictReport(
  root: string,
  remote: DesktopSyncRemote,
  options: DesktopSyncCycleOptions & {
    readonly remoteLabel: string;
    readonly createdAt?: string;
  },
): Promise<DesktopSyncConflictReport> {
  if (options.signal?.aborted) throw options.signal.reason;
  await remote.assertDistinctFrom?.(root);
  const [journal, localFiles, remoteFiles, rootFingerprint] = await Promise.all([
    loadSyncJournal(root),
    scanSyncFolder(root, options),
    remote.listRemoteFiles(options.signal),
    desktopSyncRootFingerprint(root),
  ]);
  const conflicts = buildDesktopSyncPlan(localFiles, remoteFiles, journal)
    .filter((item) => item.action === "conflict")
    .map(descriptor);
  const reportId = reportIdentity({
    rootFingerprint,
    remoteLabel: options.remoteLabel,
    conflicts,
  });
  return Object.freeze({
    schemaVersion: DESKTOP_SYNC_CONFLICT_REPORT_SCHEMA,
    reportId,
    createdAt: options.createdAt ?? options.now ?? new Date().toISOString(),
    rootFingerprint,
    remoteLabel: options.remoteLabel,
    conflicts: Object.freeze(conflicts),
  });
}

function safePathSegments(relativePath: string): readonly string[] {
  return relativePath.split("/").filter(Boolean);
}

function internalPath(
  root: string,
  area: "attempts" | "backups" | "receipts",
  sessionId: string,
  ...segments: readonly string[]
): string {
  return join(
    root,
    ".toonstudio",
    "conflicts",
    area,
    sessionId,
    ...segments,
  );
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function fileSnapshot(
  absolutePath: string,
  relativePath: string,
): Promise<SyncFileSnapshot> {
  const metadata = await stat(absolutePath);
  return {
    relativePath,
    size: metadata.size,
    modifiedAtMs: Math.trunc(metadata.mtimeMs),
    sha256: await sha256File(absolutePath),
  };
}

async function assertLocalSnapshot(
  root: string,
  expected: SyncFileSnapshot,
): Promise<void> {
  const current = await fileSnapshot(
    resolveSyncPath(root, expected.relativePath),
    expected.relativePath,
  );
  if (current.sha256 !== expected.sha256 || current.size !== expected.size) {
    throw new DesktopSyncConflictResolutionError(
      "stale-report",
      `local file changed before conflict resolution: ${expected.relativePath}`,
    );
  }
}

async function backupLocal(
  root: string,
  sessionId: string,
  local: SyncFileSnapshot,
): Promise<DesktopSyncConflictBackupReceipt> {
  await assertLocalSnapshot(root, local);
  const destination = internalPath(
    root,
    "backups",
    sessionId,
    "local",
    ...safePathSegments(local.relativePath),
  );
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await copyFile(resolveSyncPath(root, local.relativePath), destination);
  const backup = await fileSnapshot(destination, local.relativePath);
  if (backup.sha256 !== local.sha256 || backup.size !== local.size) {
    throw new DesktopSyncConflictResolutionError(
      "integrity",
      `local conflict backup failed verification: ${local.relativePath}`,
    );
  }
  return Object.freeze({
    side: "local",
    relativePath: local.relativePath,
    backupPath: destination.slice(root.length + 1),
    sha256: backup.sha256,
    size: backup.size,
  });
}

async function downloadVerified(
  remote: DesktopSyncRemote,
  snapshot: RemoteFileSnapshot,
  destination: string,
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.download`;
  try {
    await remote.downloadFile({
      remote: snapshot,
      temporaryAbsolutePath: temporary,
    });
    const metadata = await stat(temporary);
    const hash = await sha256File(temporary);
    if (metadata.size !== snapshot.size || hash !== snapshot.sha256) {
      throw new DesktopSyncConflictResolutionError(
        "integrity",
        `remote download failed verification: ${snapshot.relativePath}`,
      );
    }
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function backupRemote(
  root: string,
  sessionId: string,
  remote: DesktopSyncRemote,
  snapshot: RemoteFileSnapshot,
): Promise<DesktopSyncConflictBackupReceipt> {
  const destination = internalPath(
    root,
    "backups",
    sessionId,
    "remote",
    ...safePathSegments(snapshot.relativePath),
  );
  await downloadVerified(remote, snapshot, destination);
  return Object.freeze({
    side: "remote",
    relativePath: snapshot.relativePath,
    backupPath: destination.slice(root.length + 1),
    sha256: snapshot.sha256,
    size: snapshot.size,
  });
}

function conflictSidecarCandidate(
  relativePath: string,
  source: "local" | "remote",
  conflictId: string,
  attempt: number,
): string {
  const extension = extname(relativePath);
  const name = basename(relativePath, extension);
  const parent = dirname(relativePath);
  const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
  const fileName = `${name}.conflict-${source}-${conflictId.slice(0, 8)}${suffix}${extension}`;
  return parent === "." ? fileName : `${parent}/${fileName}`;
}

function occupiedPaths(
  localFiles: readonly SyncFileSnapshot[],
  remoteFiles: readonly RemoteFileSnapshot[],
): Set<string> {
  return new Set([
    ...localFiles.map((file) => file.relativePath),
    ...remoteFiles.map((file) => file.relativePath),
  ]);
}

function chooseConflictSidecarPath(
  relativePath: string,
  source: "local" | "remote",
  conflictId: string,
  occupied: Set<string>,
): string {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const candidate = conflictSidecarCandidate(
      relativePath,
      source,
      conflictId,
      attempt,
    );
    if (!occupied.has(candidate)) {
      occupied.add(candidate);
      return candidate;
    }
  }
  throw new DesktopSyncConflictResolutionError(
    "decision-invalid",
    `could not reserve a conflict copy path for ${relativePath}`,
  );
}

async function uploadLocalSnapshot(
  root: string,
  remote: DesktopSyncRemote,
  local: SyncFileSnapshot,
  relativePath: string,
  expectedRemoteVersion: string | null,
): Promise<RemoteFileSnapshot> {
  await assertLocalSnapshot(root, local);
  return remote.uploadFile({
    relativePath,
    absolutePath: resolveSyncPath(root, local.relativePath),
    sha256: local.sha256,
    size: local.size,
    expectedRemoteVersion,
  });
}

async function copyLocalToSidecar(
  root: string,
  local: SyncFileSnapshot,
  sidecarPath: string,
): Promise<SyncFileSnapshot> {
  await assertLocalSnapshot(root, local);
  const destination = resolveSyncPath(root, sidecarPath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolveSyncPath(root, local.relativePath), destination);
  const copied = await fileSnapshot(destination, sidecarPath);
  if (copied.sha256 !== local.sha256 || copied.size !== local.size) {
    throw new DesktopSyncConflictResolutionError(
      "integrity",
      `local conflict copy failed verification: ${sidecarPath}`,
    );
  }
  return copied;
}

async function applyConflict(
  root: string,
  remote: DesktopSyncRemote,
  sessionId: string,
  item: SyncPlanItem,
  descriptorValue: DesktopSyncConflictDescriptor,
  resolution: DesktopSyncConflictResolution,
  occupied: Set<string>,
): Promise<DesktopSyncConflictDecisionReceipt> {
  const backups: DesktopSyncConflictBackupReceipt[] = [];
  let sidecarPath: string | null = null;

  if (resolution === "use-local") {
    if (item.remote) backups.push(await backupRemote(root, sessionId, remote, item.remote));
    if (item.local) {
      await uploadLocalSnapshot(
        root,
        remote,
        item.local,
        item.relativePath,
        item.remote?.version ?? null,
      );
    } else if (item.remote) {
      await remote.deleteRemoteFile({
        remote: item.remote,
        expectedRemoteVersion: item.remote.version,
      });
    }
  } else if (resolution === "use-remote") {
    if (item.local) backups.push(await backupLocal(root, sessionId, item.local));
    if (item.remote) {
      if (item.local) await assertLocalSnapshot(root, item.local);
      await downloadVerified(
        remote,
        item.remote,
        resolveSyncPath(root, item.relativePath),
      );
    } else if (item.local) {
      await assertLocalSnapshot(root, item.local);
      await rm(resolveSyncPath(root, item.relativePath));
    }
  } else if (resolution === "keep-both-local-primary") {
    if (!item.local || !item.remote) {
      throw new DesktopSyncConflictResolutionError(
        "decision-invalid",
        `keep-both requires local and remote files: ${item.relativePath}`,
      );
    }
    backups.push(await backupRemote(root, sessionId, remote, item.remote));
    sidecarPath = chooseConflictSidecarPath(
      item.relativePath,
      "remote",
      descriptorValue.id,
      occupied,
    );
    await downloadVerified(
      remote,
      item.remote,
      resolveSyncPath(root, sidecarPath),
    );
    const remoteSidecarLocal = await fileSnapshot(
      resolveSyncPath(root, sidecarPath),
      sidecarPath,
    );
    await uploadLocalSnapshot(
      root,
      remote,
      remoteSidecarLocal,
      sidecarPath,
      null,
    );
    await uploadLocalSnapshot(
      root,
      remote,
      item.local,
      item.relativePath,
      item.remote.version,
    );
  } else {
    if (!item.local || !item.remote) {
      throw new DesktopSyncConflictResolutionError(
        "decision-invalid",
        `keep-both requires local and remote files: ${item.relativePath}`,
      );
    }
    backups.push(await backupLocal(root, sessionId, item.local));
    sidecarPath = chooseConflictSidecarPath(
      item.relativePath,
      "local",
      descriptorValue.id,
      occupied,
    );
    const localSidecar = await copyLocalToSidecar(
      root,
      item.local,
      sidecarPath,
    );
    await uploadLocalSnapshot(
      root,
      remote,
      localSidecar,
      sidecarPath,
      null,
    );
    await assertLocalSnapshot(root, item.local);
    await downloadVerified(
      remote,
      item.remote,
      resolveSyncPath(root, item.relativePath),
    );
  }

  return Object.freeze({
    conflictId: descriptorValue.id,
    relativePath: item.relativePath,
    resolution,
    sidecarPath,
    backups: Object.freeze(backups),
  });
}

function decisionsByConflict(
  report: DesktopSyncConflictReport,
  decisions: readonly DesktopSyncConflictDecision[],
): ReadonlyMap<string, DesktopSyncConflictResolution> {
  const map = new Map<string, DesktopSyncConflictResolution>();
  for (const decision of decisions) {
    if (map.has(decision.conflictId)) {
      throw new DesktopSyncConflictResolutionError(
        "decision-invalid",
        `duplicate conflict decision: ${decision.conflictId}`,
      );
    }
    map.set(decision.conflictId, decision.resolution);
  }
  if (map.size !== report.conflicts.length) {
    throw new DesktopSyncConflictResolutionError(
      "decision-missing",
      "every conflict requires exactly one decision",
    );
  }
  for (const conflict of report.conflicts) {
    const resolution = map.get(conflict.id);
    if (!resolution) {
      throw new DesktopSyncConflictResolutionError(
        "decision-missing",
        `missing decision for ${conflict.relativePath}`,
      );
    }
    if (!conflict.allowedResolutions.includes(resolution)) {
      throw new DesktopSyncConflictResolutionError(
        "decision-invalid",
        `resolution ${resolution} is not available for ${conflict.relativePath}`,
      );
    }
  }
  return map;
}

async function currentConflictPlan(
  root: string,
  remote: DesktopSyncRemote,
  options: DesktopSyncCycleOptions,
): Promise<{
  readonly plan: readonly SyncPlanItem[];
  readonly localFiles: readonly SyncFileSnapshot[];
  readonly remoteFiles: readonly RemoteFileSnapshot[];
}> {
  const [journal, localFiles, remoteFiles] = await Promise.all([
    loadSyncJournal(root),
    scanSyncFolder(root, options),
    remote.listRemoteFiles(options.signal),
  ]);
  return {
    plan: buildDesktopSyncPlan(localFiles, remoteFiles, journal),
    localFiles,
    remoteFiles,
  };
}

function safeFailure(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\r\n\t]+/gu, " ").slice(0, 500);
}

export async function applyDesktopSyncConflictDecisions(
  root: string,
  remote: DesktopSyncRemote,
  report: DesktopSyncConflictReport,
  decisions: readonly DesktopSyncConflictDecision[],
  options: DesktopSyncCycleOptions & {
    readonly remoteLabel: string;
    readonly now?: string;
    readonly sessionId?: string;
  },
): Promise<DesktopSyncConflictResolutionResult> {
  if (report.conflicts.length === 0) {
    throw new DesktopSyncConflictResolutionError(
      "no-conflicts",
      "the conflict report has no conflicts to resolve",
    );
  }
  const selected = decisionsByConflict(report, decisions);
  const currentReport = await buildDesktopSyncConflictReport(root, remote, {
    ...options,
    createdAt: report.createdAt,
  });
  if (
    currentReport.reportId !== report.reportId
    || currentReport.rootFingerprint !== report.rootFingerprint
    || currentReport.remoteLabel !== report.remoteLabel
  ) {
    throw new DesktopSyncConflictResolutionError(
      "stale-report",
      "local or remote files changed after the conflict report was created",
    );
  }
  const current = await currentConflictPlan(root, remote, options);
  const conflictItems = current.plan.filter((item) => item.action === "conflict");
  const itemById = new Map(
    conflictItems.map((item) => [descriptor(item).id, item] as const),
  );
  const sessionId = options.sessionId ?? randomUUID();
  const startedAt = options.now ?? new Date().toISOString();
  const attemptPath = internalPath(
    root,
    "attempts",
    sessionId,
    "transaction.json",
  );
  const writeAttempt = async (
    state: ConflictTransactionRecord["state"],
    failure: string | null,
    receiptSha256: string | null,
  ): Promise<void> => {
    await writeJsonAtomically(attemptPath, {
      schemaVersion: 1,
      sessionId,
      reportId: report.reportId,
      remoteLabel: report.remoteLabel,
      state,
      startedAt,
      updatedAt: new Date().toISOString(),
      decisions,
      receiptSha256,
      failure,
    } satisfies ConflictTransactionRecord);
  };
  await writeAttempt("applying", null, null);

  try {
    const occupied = occupiedPaths(current.localFiles, current.remoteFiles);
    const decisionReceipts: DesktopSyncConflictDecisionReceipt[] = [];
    for (const conflict of report.conflicts) {
      const item = itemById.get(conflict.id);
      if (!item) {
        throw new DesktopSyncConflictResolutionError(
          "stale-report",
          `conflict disappeared before apply: ${conflict.relativePath}`,
        );
      }
      decisionReceipts.push(await applyConflict(
        root,
        remote,
        sessionId,
        item,
        conflict,
        selected.get(conflict.id)!,
        occupied,
      ));
    }

    await remote.commitMetadata?.(options.signal);
    const finalCycle = await runDesktopSyncCycle(root, remote, options);
    if (finalCycle.counts.conflict > 0 || finalCycle.execution === null) {
      throw new DesktopSyncConflictResolutionError(
        "unresolved-after-apply",
        "conflicts remain after applying the selected resolutions",
      );
    }
    const completedAt = new Date().toISOString();
    const receiptBody = {
      schemaVersion: DESKTOP_SYNC_CONFLICT_RECEIPT_SCHEMA,
      sessionId,
      reportId: report.reportId,
      remoteLabel: report.remoteLabel,
      startedAt,
      completedAt,
      decisions: Object.freeze(decisionReceipts),
      finalSync: finalCycle.counts,
    };
    const receipt: DesktopSyncConflictResolutionReceipt = Object.freeze({
      ...receiptBody,
      receiptSha256: sha256Json(receiptBody),
    });
    const receiptPath = internalPath(
      root,
      "receipts",
      sessionId,
      "receipt.json",
    );
    await writeJsonAtomically(receiptPath, receipt);
    await writeAttempt("completed", null, receipt.receiptSha256);
    return Object.freeze({ receipt, receiptPath, finalCycle });
  } catch (error) {
    await writeAttempt("failed", safeFailure(error), null).catch(() => undefined);
    throw error;
  }
}

export async function readDesktopSyncConflictReceipt(
  receiptPath: string,
): Promise<DesktopSyncConflictResolutionReceipt> {
  const parsed: unknown = JSON.parse(await readFile(receiptPath, "utf8"));
  if (!parsed || typeof parsed !== "object") {
    throw new DesktopSyncConflictResolutionError(
      "integrity",
      "conflict receipt is invalid",
    );
  }
  const receipt = parsed as Partial<DesktopSyncConflictResolutionReceipt>;
  const { receiptSha256, ...body } = receipt;
  if (
    receipt.schemaVersion !== DESKTOP_SYNC_CONFLICT_RECEIPT_SCHEMA
    || typeof receiptSha256 !== "string"
    || receiptSha256 !== sha256Json(body)
  ) {
    throw new DesktopSyncConflictResolutionError(
      "integrity",
      "conflict receipt checksum is invalid",
    );
  }
  return receipt as DesktopSyncConflictResolutionReceipt;
}
