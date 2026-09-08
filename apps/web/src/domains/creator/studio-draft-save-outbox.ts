/**
 * A content-free, tab-scoped outbox for the user's explicit "save when online" intent.
 *
 * The Studio document itself remains owned by the existing OPFS/SQLite recovery writer.
 * This record stores only an opaque work id, the server revision observed when queued,
 * and bounded timestamps so a reload cannot silently forget the user's intent.
 */
export const STUDIO_DRAFT_SAVE_OUTBOX_SCHEMA = 1 as const;
export const STUDIO_DRAFT_SAVE_OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const STUDIO_DRAFT_SAVE_OUTBOX_PREFIX =
  "toonstudio:studio-draft-save-outbox:v1:";

const MAX_WORK_ID_LENGTH = 512;
const CLOCK_SKEW_MS = 5 * 60_000;

export interface StudioDraftSaveOutboxEntry {
  readonly schema: typeof STUDIO_DRAFT_SAVE_OUTBOX_SCHEMA;
  readonly workId: string;
  readonly queuedAt: number;
  readonly expiresAt: number;
  readonly serverRevisionAtQueue: number | null;
  readonly hadServerDocumentAtQueue: boolean;
}

export interface StudioDraftSaveOutboxStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type StudioDraftSaveOutboxListener = (input: {
  readonly workId: string;
  readonly entry: StudioDraftSaveOutboxEntry | null;
}) => void;

const outboxListeners = new Set<StudioDraftSaveOutboxListener>();
const recentlyClearedEntries = new Map<string, StudioDraftSaveOutboxEntry>();

function emitStudioDraftSaveOutboxChange(
  workId: string,
  entry: StudioDraftSaveOutboxEntry | null,
): void {
  for (const listener of outboxListeners) {
    try {
      listener({ workId, entry });
    } catch {
      // Observers must never be allowed to break save durability.
    }
  }
}

function rememberStudioDraftSaveOutboxClear(
  entry: StudioDraftSaveOutboxEntry,
): void {
  recentlyClearedEntries.set(entry.workId, entry);
  queueMicrotask(() => {
    if (recentlyClearedEntries.get(entry.workId) === entry) {
      recentlyClearedEntries.delete(entry.workId);
    }
  });
}

export function subscribeStudioDraftSaveOutbox(
  listener: StudioDraftSaveOutboxListener,
): () => void {
  outboxListeners.add(listener);
  return () => {
    outboxListeners.delete(listener);
  };
}

/**
 * Returns a valid receipt only during the same synchronous turn that removed it.
 * The save wrapper uses this narrow hand-off to keep the receipt durable until
 * the existing server-save Promise acknowledges success. User cancellation does
 * not call the save wrapper, so its hand-off expires in the next microtask.
 */
export function consumeRecentlyClearedStudioDraftSaveOutbox(
  workId: string,
): StudioDraftSaveOutboxEntry | null {
  const normalized = normalizedWorkId(workId);
  if (normalized === null) return null;
  const entry = recentlyClearedEntries.get(normalized) ?? null;
  recentlyClearedEntries.delete(normalized);
  return entry;
}

function normalizedWorkId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const workId = value.trim();
  if (!workId || workId.length > MAX_WORK_ID_LENGTH) return null;
  return workId;
}

function normalizedTimestamp(value: unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null;
}

function normalizedRevision(value: unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    ? value
    : null;
}

export function studioDraftSaveOutboxKey(workId: string): string | null {
  const normalized = normalizedWorkId(workId);
  return normalized === null
    ? null
    : `${STUDIO_DRAFT_SAVE_OUTBOX_PREFIX}${encodeURIComponent(normalized)}`;
}

export function createStudioDraftSaveOutboxEntry(input: {
  readonly workId: string;
  readonly serverRevision?: number | null;
  readonly hasServerDocument?: boolean;
  readonly now?: number;
}): StudioDraftSaveOutboxEntry | null {
  const workId = normalizedWorkId(input.workId);
  const queuedAt = normalizedTimestamp(input.now ?? Date.now());
  if (workId === null || queuedAt === null) return null;
  return Object.freeze({
    schema: STUDIO_DRAFT_SAVE_OUTBOX_SCHEMA,
    workId,
    queuedAt,
    expiresAt: queuedAt + STUDIO_DRAFT_SAVE_OUTBOX_TTL_MS,
    serverRevisionAtQueue: normalizedRevision(input.serverRevision),
    hadServerDocumentAtQueue: input.hasServerDocument === true,
  });
}

function parseStudioDraftSaveOutboxEntry(
  raw: string,
  expectedWorkId: string,
  now: number,
): StudioDraftSaveOutboxEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const workId = normalizedWorkId(record.workId);
  const queuedAt = normalizedTimestamp(record.queuedAt);
  const expiresAt = normalizedTimestamp(record.expiresAt);
  const revision = record.serverRevisionAtQueue === null
    ? null
    : normalizedRevision(record.serverRevisionAtQueue);
  const hadServerDocumentAtQueue = record.hadServerDocumentAtQueue;
  if (
    record.schema !== STUDIO_DRAFT_SAVE_OUTBOX_SCHEMA
    || workId !== expectedWorkId
    || queuedAt === null
    || expiresAt === null
    || expiresAt !== queuedAt + STUDIO_DRAFT_SAVE_OUTBOX_TTL_MS
    || queuedAt > now + CLOCK_SKEW_MS
    || expiresAt <= now
    || (record.serverRevisionAtQueue !== null && revision === null)
    || typeof hadServerDocumentAtQueue !== "boolean"
  ) return null;
  return Object.freeze({
    schema: STUDIO_DRAFT_SAVE_OUTBOX_SCHEMA,
    workId,
    queuedAt,
    expiresAt,
    serverRevisionAtQueue: revision,
    hadServerDocumentAtQueue,
  });
}

function bestEffortRemove(
  storage: StudioDraftSaveOutboxStorage,
  key: string,
): void {
  try {
    storage.removeItem(key);
  } catch {
    // A corrupt or expired record must never be replayed even when cleanup is unavailable.
  }
}

export function readStudioDraftSaveOutbox(input: {
  readonly storage: StudioDraftSaveOutboxStorage | null;
  readonly workId: string;
  readonly now?: number;
}): StudioDraftSaveOutboxEntry | null {
  const key = studioDraftSaveOutboxKey(input.workId);
  const expectedWorkId = normalizedWorkId(input.workId);
  const now = normalizedTimestamp(input.now ?? Date.now());
  if (!input.storage || key === null || expectedWorkId === null || now === null) return null;
  let raw: string | null;
  try {
    raw = input.storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const entry = parseStudioDraftSaveOutboxEntry(raw, expectedWorkId, now);
  if (entry === null) bestEffortRemove(input.storage, key);
  return entry;
}

export function writeStudioDraftSaveOutbox(input: {
  readonly storage: StudioDraftSaveOutboxStorage | null;
  readonly entry: StudioDraftSaveOutboxEntry;
}): boolean {
  const key = studioDraftSaveOutboxKey(input.entry.workId);
  if (!input.storage || key === null) return false;
  try {
    input.storage.setItem(key, JSON.stringify(input.entry));
    const persisted = input.storage.getItem(key);
    const verified = persisted !== null
      && parseStudioDraftSaveOutboxEntry(
        persisted,
        input.entry.workId,
        input.entry.queuedAt,
      ) !== null;
    if (verified) emitStudioDraftSaveOutboxChange(input.entry.workId, input.entry);
    return verified;
  } catch {
    return false;
  }
}

export function clearStudioDraftSaveOutbox(input: {
  readonly storage: StudioDraftSaveOutboxStorage | null;
  readonly workId: string;
}): boolean {
  const key = studioDraftSaveOutboxKey(input.workId);
  const workId = normalizedWorkId(input.workId);
  if (!input.storage || key === null || workId === null) return false;
  const existing = readStudioDraftSaveOutbox({
    storage: input.storage,
    workId,
  });
  if (existing !== null) rememberStudioDraftSaveOutboxClear(existing);
  try {
    input.storage.removeItem(key);
    if (input.storage.getItem(key) === null) {
      emitStudioDraftSaveOutboxChange(workId, null);
      return true;
    }
  } catch {
    // Some constrained storage implementations can reject removal but still permit overwrite.
  }
  const cancelledSentinel = JSON.stringify({
    schema: STUDIO_DRAFT_SAVE_OUTBOX_SCHEMA,
    cancelled: true,
  });
  try {
    input.storage.setItem(key, cancelledSentinel);
    const invalidated = input.storage.getItem(key) === cancelledSentinel;
    if (invalidated) emitStudioDraftSaveOutboxChange(workId, null);
    return invalidated;
  } catch {
    return false;
  }
}

export function isStudioDraftSaveOutboxSatisfied(
  entry: StudioDraftSaveOutboxEntry,
  currentServerRevision: number | null,
): boolean {
  const current = normalizedRevision(currentServerRevision);
  if (current === null) return false;
  if (entry.serverRevisionAtQueue !== null) {
    return current > entry.serverRevisionAtQueue;
  }
  return !entry.hadServerDocumentAtQueue;
}
