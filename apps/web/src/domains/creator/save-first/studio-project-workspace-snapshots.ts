import {
  readStudioAutosave,
  studioAutosaveKey,
  type StudioAutosavePayload,
} from "../studio-autosave";
import {
  createStudioAutosaveOpfsSession,
  type StudioAutosaveOpfsReadResult,
} from "../studio-autosave-opfs-session";
import type {
  StudioAutosaveSqlitePort,
  StudioAutosaveSqliteReadResult,
} from "../studio-autosave-sqlite-store";
import type { StudioProjectDocumentEntry } from "../studio-project-document-store";

export const STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY = "documents/index.json";

export type StudioProjectWorkspaceSnapshotAuthority =
  | "memory-current"
  | "opfs-journal"
  | "sqlite-fallback"
  | "browser-storage-compatibility";

export interface StudioProjectWorkspaceSnapshot {
  readonly documentId: string;
  readonly key: string;
  readonly authority: StudioProjectWorkspaceSnapshotAuthority;
  readonly savedAt: string;
  readonly payload: StudioAutosavePayload;
}

interface StudioProjectWorkspaceSnapshotCandidate {
  readonly key: string;
  readonly authority: Exclude<StudioProjectWorkspaceSnapshotAuthority, "memory-current">;
  readonly state: "snapshot" | "cleared";
  readonly savedAt: string;
  readonly payload: StudioAutosavePayload | null;
}

export interface CollectStudioProjectWorkspaceSnapshotsInput {
  readonly storage: Storage;
  readonly projectId: string;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly authUserId?: string | null;
  readonly lastOpenedDocumentId?: string | null;
  readonly currentSnapshots?: Readonly<Record<string, StudioAutosavePayload>>;
}

export interface StudioProjectWorkspaceSnapshotReader {
  readonly read: (key: string) => Promise<StudioProjectWorkspaceSnapshotCandidate | null>;
  readonly dispose: () => Promise<void>;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestCandidate(
  candidates: readonly (StudioProjectWorkspaceSnapshotCandidate | null)[],
): StudioProjectWorkspaceSnapshotCandidate | null {
  const rank: Readonly<Record<StudioProjectWorkspaceSnapshotCandidate["authority"], number>> = {
    "opfs-journal": 3,
    "sqlite-fallback": 2,
    "browser-storage-compatibility": 1,
  };
  return candidates
    .filter((candidate): candidate is StudioProjectWorkspaceSnapshotCandidate => candidate !== null)
    .sort((left, right) => (
      timestamp(right.savedAt) - timestamp(left.savedAt)
      || Number(right.state === "cleared") - Number(left.state === "cleared")
      || rank[right.authority] - rank[left.authority]
    ))[0] ?? null;
}

function opfsCandidate(
  key: string,
  result: StudioAutosaveOpfsReadResult,
): StudioProjectWorkspaceSnapshotCandidate | null {
  if (!result) return null;
  return Object.freeze({
    key,
    authority: "opfs-journal",
    state: result.state,
    savedAt: result.savedAt,
    payload: result.state === "snapshot" ? result.payload : null,
  });
}

function sqliteCandidate(
  key: string,
  result: StudioAutosaveSqliteReadResult,
): StudioProjectWorkspaceSnapshotCandidate | null {
  if (!result) return null;
  return Object.freeze({
    key,
    authority: "sqlite-fallback",
    state: result.state,
    savedAt: result.savedAt,
    payload: result.state === "snapshot" ? result.payload : null,
  });
}

function browserCandidate(
  storage: Storage,
  key: string,
): StudioProjectWorkspaceSnapshotCandidate | null {
  try {
    const recovered = readStudioAutosave(storage, key);
    return recovered
      ? Object.freeze({
          key,
          authority: "browser-storage-compatibility" as const,
          state: "snapshot" as const,
          savedAt: recovered.payload.savedAt,
          payload: recovered.payload,
        })
      : null;
  } catch {
    return null;
  }
}

async function optionalSqliteStore(): Promise<StudioAutosaveSqlitePort | null> {
  try {
    const { acquireStudioAutosaveSqliteStore } = await import(
      "../studio-autosave-sqlite-store"
    );
    return await acquireStudioAutosaveSqliteStore();
  } catch {
    return null;
  }
}

/**
 * Read-only package collector. It deliberately does not call the normal reconciliation helper:
 * reconciliation may mirror a winner into another authority, while creating a backup must never
 * mutate the artist's recovery journal merely by inspecting it.
 */
export async function createStudioProjectWorkspaceSnapshotReader(
  storage: Storage,
): Promise<StudioProjectWorkspaceSnapshotReader> {
  const sqlite = await optionalSqliteStore();
  const sessions = new Set<Awaited<ReturnType<typeof createStudioAutosaveOpfsSession>>>();
  return Object.freeze({
    read: async (key: string) => {
      const candidates: (StudioProjectWorkspaceSnapshotCandidate | null)[] = [
        browserCandidate(storage, key),
      ];
      if (sqlite) {
        try {
          candidates.push(sqliteCandidate(key, await sqlite.read(key)));
        } catch {
          candidates.push(null);
        }
      }
      let session: Awaited<ReturnType<typeof createStudioAutosaveOpfsSession>> = null;
      try {
        session = await createStudioAutosaveOpfsSession(key, undefined, { readOnly: true });
        if (session) {
          sessions.add(session);
          candidates.push(opfsCandidate(key, await session.readLatest()));
        }
      } catch {
        candidates.push(null);
      } finally {
        if (session) {
          sessions.delete(session);
          await session.dispose().catch(() => undefined);
        }
      }
      return newestCandidate(candidates);
    },
    dispose: async () => {
      await Promise.all([...sessions].map((session) => session?.dispose().catch(() => undefined)));
      sessions.clear();
    },
  });
}

function candidateKeys(
  projectId: string,
  documentId: string,
  authUserId: string | null,
  lastOpenedDocumentId: string | null,
): readonly string[] {
  const owners = authUserId ? [authUserId, null] as const : [null] as const;
  const persistenceIds = documentId === lastOpenedDocumentId
    ? [documentId, projectId]
    : [documentId];
  const keys = new Set<string>();
  for (const persistenceId of persistenceIds) {
    for (const owner of owners) {
      keys.add(studioAutosaveKey({ userId: owner, workId: persistenceId }));
    }
  }
  return [...keys];
}

export async function collectStudioProjectWorkspaceSnapshots(
  input: CollectStudioProjectWorkspaceSnapshotsInput,
  reader?: StudioProjectWorkspaceSnapshotReader,
): Promise<readonly StudioProjectWorkspaceSnapshot[]> {
  const ownedReader = reader ?? await createStudioProjectWorkspaceSnapshotReader(input.storage);
  const ownsReader = reader === undefined;
  const snapshots: StudioProjectWorkspaceSnapshot[] = [];
  try {
    for (const document of input.documents) {
      if (document.status === "trashed") continue;
      const current = input.currentSnapshots?.[document.id];
      if (current) {
        snapshots.push(Object.freeze({
          documentId: document.id,
          key: studioAutosaveKey({ userId: input.authUserId ?? null, workId: document.id }),
          authority: "memory-current",
          savedAt: current.savedAt,
          payload: current,
        }));
        continue;
      }
      const candidates: (StudioProjectWorkspaceSnapshotCandidate | null)[] = [];
      for (const key of candidateKeys(
        input.projectId,
        document.id,
        input.authUserId ?? null,
        input.lastOpenedDocumentId ?? null,
      )) {
        candidates.push(await ownedReader.read(key));
      }
      const winner = newestCandidate(candidates);
      if (!winner || winner.state === "cleared" || !winner.payload) continue;
      snapshots.push(Object.freeze({
        documentId: document.id,
        key: winner.key,
        authority: winner.authority,
        savedAt: winner.savedAt,
        payload: winner.payload,
      }));
    }
    return Object.freeze(snapshots);
  } finally {
    if (ownsReader) await ownedReader.dispose();
  }
}

export function buildStudioProjectWorkspacePackageEntries(
  documents: readonly StudioProjectDocumentEntry[],
  snapshots: readonly StudioProjectWorkspaceSnapshot[],
): Readonly<Record<string, string>> {
  const snapshotByDocument = new Map(snapshots.map((snapshot) => [snapshot.documentId, snapshot]));
  const entries: Record<string, string> = {};
  const index = documents
    .filter((document) => document.status !== "trashed")
    .map((document, indexPosition) => {
      const snapshot = snapshotByDocument.get(document.id) ?? null;
      const entry = snapshot
        ? `documents/document-${String(indexPosition + 1).padStart(4, "0")}.autosave.json`
        : null;
      if (snapshot && entry) {
        entries[entry] = `${JSON.stringify(snapshot.payload, null, 2)}\n`;
      }
      return Object.freeze({
        documentId: document.id,
        title: document.title,
        status: document.status,
        entry,
        savedAt: snapshot?.savedAt ?? null,
        authority: snapshot?.authority ?? null,
      });
    });
  entries[STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY] = `${JSON.stringify({
    format: "toonstudio-project-workspace",
    formatVersion: 1,
    documents: index,
  }, null, 2)}\n`;
  return Object.freeze(entries);
}
