import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DESKTOP_SYNC_JOURNAL_SCHEMA } from "./model.js";

import type { SyncJournal, SyncJournalEntry } from "./model.js";

const JOURNAL_DIRECTORY = ".toonstudio";
const JOURNAL_FILE = "sync-journal.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): SyncJournalEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.relativePath !== "string" || typeof value.syncedAt !== "string") {
    return null;
  }
  const nullableStrings = ["localSha256", "remoteSha256", "remoteVersion"] as const;
  if (nullableStrings.some((key) => value[key] !== null && typeof value[key] !== "string")) {
    return null;
  }
  return value as unknown as SyncJournalEntry;
}

export class DesktopSyncJournalError extends Error {
  constructor(readonly code: "invalid" | "root-mismatch") {
    super(`desktop sync journal rejected: ${code}`);
    this.name = "DesktopSyncJournalError";
  }
}

export async function desktopSyncRootFingerprint(root: string): Promise<string> {
  const canonical = await realpath(root);
  const metadata = await stat(canonical);
  return createHash("sha256")
    .update(`${canonical}\0${metadata.dev}\0${metadata.ino}`)
    .digest("hex");
}

export function desktopSyncJournalPath(root: string): string {
  return join(root, JOURNAL_DIRECTORY, JOURNAL_FILE);
}

export function createEmptySyncJournal(
  rootFingerprint: string,
  updatedAt: string,
): SyncJournal {
  return {
    schemaVersion: DESKTOP_SYNC_JOURNAL_SCHEMA,
    rootFingerprint,
    updatedAt,
    entries: {},
  };
}

export function parseSyncJournal(value: unknown): SyncJournal {
  if (!isRecord(value) || value.schemaVersion !== DESKTOP_SYNC_JOURNAL_SCHEMA) {
    throw new DesktopSyncJournalError("invalid");
  }
  if (
    typeof value.rootFingerprint !== "string"
    || typeof value.updatedAt !== "string"
    || !isRecord(value.entries)
  ) {
    throw new DesktopSyncJournalError("invalid");
  }
  const entries: Record<string, SyncJournalEntry> = {};
  for (const [path, entryValue] of Object.entries(value.entries)) {
    const entry = parseEntry(entryValue);
    if (entry === null || entry.relativePath !== path) {
      throw new DesktopSyncJournalError("invalid");
    }
    entries[path] = entry;
  }
  return {
    schemaVersion: DESKTOP_SYNC_JOURNAL_SCHEMA,
    rootFingerprint: value.rootFingerprint,
    updatedAt: value.updatedAt,
    entries,
  };
}

export async function loadSyncJournal(root: string): Promise<SyncJournal> {
  const fingerprint = await desktopSyncRootFingerprint(root);
  const path = desktopSyncJournalPath(root);
  try {
    const parsed = parseSyncJournal(JSON.parse(await readFile(path, "utf8")));
    if (parsed.rootFingerprint !== fingerprint) {
      throw new DesktopSyncJournalError("root-mismatch");
    }
    return parsed;
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code === "ENOENT"
    ) {
      return createEmptySyncJournal(fingerprint, new Date(0).toISOString());
    }
    throw error;
  }
}

export async function saveSyncJournal(
  root: string,
  journal: SyncJournal,
): Promise<void> {
  const currentFingerprint = await desktopSyncRootFingerprint(root);
  if (journal.rootFingerprint !== currentFingerprint) {
    throw new DesktopSyncJournalError("root-mismatch");
  }
  const path = desktopSyncJournalPath(root);
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directory, `${JOURNAL_FILE}.${randomUUID()}.tmp`);
  const body = `${JSON.stringify(journal, null, 2)}\n`;
  await writeFile(temporaryPath, body, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}
