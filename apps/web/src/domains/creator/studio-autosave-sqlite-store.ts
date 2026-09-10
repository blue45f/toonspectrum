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

export interface StudioAutosaveSqlitePort {
  read(key: string): Promise<StudioAutosaveSqliteReadResult>;
  write(key: string, payload: StudioAutosavePayload): Promise<void>;
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
): Promise<void> {
  const raw = await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key);
  if (raw === null) return;

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
            { cause: primaryCause },
          );
        }
        throw primaryCause;
      }
    },

    async write(key: string, payload: StudioAutosavePayload) {
      if (!studioAutosaveHasContent(payload)) {
        throw new Error("내용이 없는 Studio 자동저장은 SQLite snapshot으로 기록하지 않습니다.");
      }
      await archiveCurrentEnvelope(database, key);
      await database.kvSet(
        STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
        key,
        encodeEnvelope("snapshot", payload.savedAt, payload),
      );
    },

    async clear(key: string, savedAt = new Date().toISOString()) {
      const tombstone = encodeEnvelope("cleared", savedAt, null);
      // Commit the recovery tombstone first. If it cannot be made durable, the operation fails
      // while the primary snapshot remains intact; acknowledging success would allow that older
      // recovery generation to resurrect after a later primary-row failure.
      await database.kvSet(
        STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
        studioAutosaveSqliteLastKnownGoodKey(key),
        tombstone,
      );
      await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, tombstone);
    },
  });
}

/** Lazy product entry: shares the single app-lifetime OPFS SQLite handle with history/tournament. */
export async function acquireStudioAutosaveSqliteStore(): Promise<StudioAutosaveSqlitePort> {
  return createStudioAutosaveSqliteStore(await acquireStudioLocalDatabase());
}
