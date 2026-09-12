import {
  readStudioAutosave,
  serializeStudioAutosave,
  studioAutosaveHasContent,
  type StudioAutosavePayload,
} from "./studio-autosave";
import { acquireStudioLocalDatabase } from "./studio-local-database-runtime";

import type { StudioLocalDatabase } from "./studio-local-database";

export const STUDIO_AUTOSAVE_SQLITE_NAMESPACE = "studio-autosave-v1" as const;
export const STUDIO_AUTOSAVE_SQLITE_ENVELOPE_KIND =
  "toonspectrum:studio-autosave-sqlite" as const;
export const STUDIO_AUTOSAVE_SQLITE_ENVELOPE_VERSION = 1 as const;
export const STUDIO_AUTOSAVE_SQLITE_LAST_KNOWN_GOOD_PREFIX =
  "last-known-good:" as const;

type StudioAutosaveSqliteEnvelope = Readonly<{
  kind: typeof STUDIO_AUTOSAVE_SQLITE_ENVELOPE_KIND;
  version: typeof STUDIO_AUTOSAVE_SQLITE_ENVELOPE_VERSION;
  state: "snapshot" | "cleared";
  savedAt: string;
  payload: string | null;
}>;

type StudioAutosaveSqliteRecoveryMarker = Readonly<{
  recoveredFrom?: "last-known-good";
}>;

export type StudioAutosaveSqliteReadResult =
  | (Readonly<{
      state: "snapshot";
      savedAt: string;
      payload: StudioAutosavePayload;
    }> & StudioAutosaveSqliteRecoveryMarker)
  | (Readonly<{
      state: "cleared";
      savedAt: string;
    }> & StudioAutosaveSqliteRecoveryMarker)
  | null;

export type StudioAutosaveSqliteWriteOptions = Readonly<{
  mode?: "normal" | "emergency";
}>;

export interface StudioAutosaveSqlitePort {
  read(key: string): Promise<StudioAutosaveSqliteReadResult>;
  write(
    key: string,
    payload: StudioAutosavePayload,
    options?: StudioAutosaveSqliteWriteOptions,
  ): Promise<void>;
  clear(key: string, savedAt?: string): Promise<void>;
}

export function studioAutosaveSqliteLastKnownGoodKey(key: string): string {
  return `${STUDIO_AUTOSAVE_SQLITE_LAST_KNOWN_GOOD_PREFIX}${key}`;
}

function validSavedAt(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length >= 20
    && value.length <= 64
    && Number.isFinite(Date.parse(value))
  );
}

function encodeEnvelope(
  state: "snapshot" | "cleared",
  savedAt: string,
  payload: StudioAutosavePayload | null,
): string {
  if (!validSavedAt(savedAt)) {
    throw new Error("SQLite 자동저장 시각이 올바르지 않습니다.");
  }
  const envelope: StudioAutosaveSqliteEnvelope = Object.freeze({
    kind: STUDIO_AUTOSAVE_SQLITE_ENVELOPE_KIND,
    version: STUDIO_AUTOSAVE_SQLITE_ENVELOPE_VERSION,
    state,
    savedAt,
    payload: payload === null ? null : serializeStudioAutosave(payload),
  });
  return JSON.stringify(envelope);
}

function decodeEnvelope(raw: string, key: string): StudioAutosaveSqliteReadResult {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new Error("SQLite 자동저장 envelope JSON이 손상되었습니다.", { cause });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("SQLite 자동저장 envelope 형식이 올바르지 않습니다.");
  }
  const envelope = value as Partial<StudioAutosaveSqliteEnvelope>;
  if (
    envelope.kind !== STUDIO_AUTOSAVE_SQLITE_ENVELOPE_KIND
    || envelope.version !== STUDIO_AUTOSAVE_SQLITE_ENVELOPE_VERSION
    || (envelope.state !== "snapshot" && envelope.state !== "cleared")
    || !validSavedAt(envelope.savedAt)
  ) {
    throw new Error("SQLite 자동저장 envelope 계약이 일치하지 않습니다.");
  }
  if (envelope.state === "cleared") {
    if (envelope.payload !== null) {
      throw new Error("SQLite 자동저장 tombstone에 payload가 포함되어 있습니다.");
    }
    return Object.freeze({ state: "cleared", savedAt: envelope.savedAt });
  }
  if (typeof envelope.payload !== "string") {
    throw new Error("SQLite 자동저장 snapshot payload가 없습니다.");
  }
  const normalized = readStudioAutosave(
    { getItem: (candidate) => (candidate === key ? envelope.payload! : null) },
    key,
  )?.payload ?? null;
  if (!normalized || !studioAutosaveHasContent(normalized)) {
    throw new Error("SQLite 자동저장 snapshot에 복구할 Studio 내용이 없습니다.");
  }
  if (normalized.savedAt !== envelope.savedAt) {
    throw new Error("SQLite 자동저장 envelope와 payload 시각이 일치하지 않습니다.");
  }
  return Object.freeze({
    state: "snapshot",
    savedAt: envelope.savedAt,
    payload: normalized,
  });
}

function markRecovered(
  result: Exclude<StudioAutosaveSqliteReadResult, null>,
): Exclude<StudioAutosaveSqliteReadResult, null> {
  return Object.freeze({ ...result, recoveredFrom: "last-known-good" as const });
}

async function readLastKnownGood(
  database: Pick<StudioLocalDatabase, "kvGet">,
  key: string,
): Promise<Exclude<StudioAutosaveSqliteReadResult, null> | null> {
  const raw = await database.kvGet(
    STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
    studioAutosaveSqliteLastKnownGoodKey(key),
  );
  if (raw === null) return null;
  const decoded = decodeEnvelope(raw, key);
  return decoded === null ? null : markRecovered(decoded);
}

async function archiveCurrentEnvelope(
  database: Pick<StudioLocalDatabase, "kvGet" | "kvSet">,
  key: string,
  isCurrent: () => boolean,
): Promise<void> {
  const raw = await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key);
  if (raw === null || !isCurrent()) return;

  try {
    // Only rotate a fully validated authority row. A corrupt primary must never overwrite the
    // last-known-good generation that may still be the user's only recoverable draft.
    if (decodeEnvelope(raw, key) === null) return;
    await database.kvSet(
      STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
      studioAutosaveSqliteLastKnownGoodKey(key),
      raw,
    );
  } catch {
    // The newest primary write is more important than rotating an optional recovery generation.
    // The outer write still reports its own failure through the existing save reliability path.
  }
}

export function createStudioAutosaveSqliteStore(
  database: Pick<StudioLocalDatabase, "kvGet" | "kvSet">,
): StudioAutosaveSqlitePort {
  type Mutation = Readonly<{ completion: Promise<void> }>;
  type MutationGroup = { latest: Mutation; pending: number };
  const mutations = new Map<string, MutationGroup>();

  function mutate(key: string, execute: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    let resolveCompletion!: () => void;
    let rejectCompletion!: (cause: unknown) => void;
    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    const mutation: Mutation = { completion };
    const group = mutations.get(key) ?? { latest: mutation, pending: 0 };
    group.latest = mutation;
    group.pending += 1;
    mutations.set(key, group);

    async function finish() {
      let outcome: { failed: false } | { failed: true; cause: unknown } = { failed: false };
      try {
        // Start immediately: an emergency primary must not queue behind an older recovery RPC.
        await execute(() => group.latest === mutation);
      } catch (cause) {
        outcome = { failed: true, cause };
      }

      // Superseded callers share the newest result instead of acknowledging a snapshot that was
      // skipped. Follow further successors too if another mutation starts while awaiting a receipt.
      let observed = mutation;
      while (group.latest !== observed) {
        observed = group.latest;
        try {
          await observed.completion;
          outcome = { failed: false };
        } catch (cause) {
          outcome = { failed: true, cause };
        }
      }
      if (outcome.failed) rejectCompletion(outcome.cause);
      else resolveCompletion();
      group.pending -= 1;
      if (group.pending === 0) mutations.delete(key);
    }

    void finish();
    return completion;
  }

  return Object.freeze({
    async read(key: string) {
      const raw = await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key);
      if (raw === null) return readLastKnownGood(database, key);

      try {
        return decodeEnvelope(raw, key);
      } catch (primaryCause) {
        try {
          const recovered = await readLastKnownGood(database, key);
          if (recovered !== null) return recovered;
        } catch (recoveryCause) {
          throw new AggregateError(
            [primaryCause, recoveryCause],
            "SQLite 자동저장 주 저장본과 마지막 정상 저장본이 모두 손상되었습니다.",
            { cause: recoveryCause },
          );
        }
        throw primaryCause;
      }
    },

    async write(
      key: string,
      payload: StudioAutosavePayload,
      options?: StudioAutosaveSqliteWriteOptions,
    ) {
      if (!studioAutosaveHasContent(payload)) {
        throw new Error("내용이 없는 Studio 자동저장은 SQLite snapshot으로 기록하지 않습니다.");
      }
      const envelope = encodeEnvelope("snapshot", payload.savedAt, payload);
      // beforeunload can suspend the recovery-read response before this document submits its
      // newest snapshot. Emergency writes submit the primary without that round trip, retaining
      // the existing recovery generation until a normal write rotates it. Success still requires
      // the primary commit below; dispatch alone is not a durability receipt.
      return mutate(key, async (isCurrent) => {
        if (options?.mode !== "emergency") {
          await archiveCurrentEnvelope(database, key, isCurrent);
        }
        if (!isCurrent()) return;
        await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, envelope);
      });
    },

    async clear(key: string, savedAt = new Date().toISOString()) {
      const tombstone = encodeEnvelope("cleared", savedAt, null);
      // Commit the recovery tombstone first. If it cannot be made durable, the operation fails
      // while the primary snapshot remains intact; acknowledging success would allow that older
      // recovery generation to resurrect after a later primary-row failure.
      return mutate(key, async (isCurrent) => {
        await database.kvSet(
          STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
          studioAutosaveSqliteLastKnownGoodKey(key),
          tombstone,
        );
        if (!isCurrent()) return;
        await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, tombstone);
      });
    },
  });
}

/** Lazy product entry: shares the single app-lifetime OPFS SQLite handle with history/tournament. */
export async function acquireStudioAutosaveSqliteStore(): Promise<StudioAutosaveSqlitePort> {
  return createStudioAutosaveSqliteStore(await acquireStudioLocalDatabase());
}
