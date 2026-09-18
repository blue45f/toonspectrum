export const DESKTOP_SYNC_JOURNAL_SCHEMA = 1 as const;

export interface SyncFileSnapshot {
  readonly relativePath: string;
  readonly size: number;
  readonly modifiedAtMs: number;
  readonly sha256: string;
}

export interface SyncJournalEntry {
  readonly relativePath: string;
  readonly localSha256: string | null;
  readonly remoteSha256: string | null;
  readonly remoteVersion: string | null;
  readonly syncedAt: string;
}

export interface SyncJournal {
  readonly schemaVersion: typeof DESKTOP_SYNC_JOURNAL_SCHEMA;
  readonly rootFingerprint: string;
  readonly updatedAt: string;
  readonly entries: Readonly<Record<string, SyncJournalEntry>>;
}

export interface RemoteFileSnapshot {
  readonly relativePath: string;
  readonly sha256: string;
  readonly version: string;
  readonly size: number;
}
