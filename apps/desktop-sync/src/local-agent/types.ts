export const DESKTOP_SYNC_MODES = ["linked", "mirrored", "embedded"] as const;
export type DesktopSyncMode = (typeof DESKTOP_SYNC_MODES)[number];

export interface DesktopSyncBinding {
  readonly id: string;
  readonly projectId: string;
  readonly rootPath: string;
  readonly mode: DesktopSyncMode;
  readonly maxFiles: number;
  readonly maxFileBytes: number;
}

export interface DesktopFileSnapshot {
  readonly relativePath: string;
  readonly sha256: string;
  readonly size: number;
  readonly modifiedAtMs: number;
}

export interface DesktopSyncJournalEntry {
  readonly version: 1;
  readonly bindingId: string;
  readonly projectId: string;
  readonly sequence: number;
  readonly operation: "upsert" | "delete";
  readonly relativePath: string;
  readonly sha256: string | null;
  readonly size: number | null;
  readonly modifiedAtMs: number | null;
  readonly observedAt: string;
}

export interface DesktopSyncUploadGrant {
  readonly url: string;
  readonly method: "PUT" | "POST" | "DELETE";
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface DesktopSyncCredentialBroker {
  grant(entry: DesktopSyncJournalEntry): Promise<DesktopSyncUploadGrant>;
}

export interface DesktopSyncTransport {
  send(
    entry: DesktopSyncJournalEntry,
    grant: DesktopSyncUploadGrant,
    absolutePath: string | null,
  ): Promise<void>;
}

export interface DesktopSyncReconcileResult {
  readonly entries: readonly DesktopSyncJournalEntry[];
  readonly snapshot: ReadonlyMap<string, DesktopFileSnapshot>;
}
