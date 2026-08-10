/**
 * Window <-> Dedicated Worker protocol for the single Studio SQLite authority.
 *
 * OPFS SyncAccessHandle is intentionally Worker-only. Keeping this protocol
 * dependency-free lets the Window client validate every inbound message before
 * resolving repository calls while the Worker owns sqlite-wasm and the DB file.
 */
export const STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION = 1 as const;

export const STUDIO_LOCAL_DATABASE_RPC_METHODS = Object.freeze([
  "kvGet",
  "kvSet",
  "kvDelete",
  "putTournamentWinner",
  "getTournamentWinner",
  "listTournamentWinners",
  "listTournamentWinnerCandidates",
  "replaceTournamentWinners",
  "evictTournamentProvider",
  "recordCostSample",
  "listCostSamples",
  "appendJournalEntry",
  "listJournalEntries",
  "deleteJournalEntriesBefore",
  "putJournalSnapshot",
  "listJournalSnapshots",
  "queryBrushLibraryRecords",
  "getBrushLibraryRecord",
  "putBrushLibraryRecord",
  "putBrushLibraryRecords",
  "insertMissingBrushLibraryRecords",
  "deleteBrushLibraryRecord",
  "listBrushLibraryNames",
  "queryFilterLibraryRecords",
  "getFilterLibraryRecord",
  "putFilterLibraryRecord",
  "putFilterLibraryRecords",
  "insertMissingFilterLibraryRecords",
  "deleteFilterLibraryRecord",
  "deleteFilterLibraryRecords",
  "listCrdtOutboxCandidates",
  "enqueueCrdtOutboxRecord",
  "acknowledgeCrdtOutboxRecord",
  "recordCrdtOutboxRetry",
  "listCrdtRecoveryCandidates",
  "getCrdtRecoveryCandidate",
  "putCrdtRecoveryRecord",
] as const);

export type StudioLocalDatabaseRpcMethod =
  (typeof STUDIO_LOCAL_DATABASE_RPC_METHODS)[number];

export interface StudioLocalDatabaseWorkerRequest {
  readonly version: typeof STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION;
  readonly kind: "request";
  readonly requestId: number;
  readonly method: StudioLocalDatabaseRpcMethod | "close";
  readonly args: readonly unknown[];
}

export interface StudioLocalDatabaseWorkerSerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly reason?: string;
  readonly entryCount?: number;
  readonly rowCount?: number;
  readonly totalBytes?: number;
}

export type StudioLocalDatabaseWorkerResponse =
  | {
      readonly version: typeof STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION;
      readonly kind: "ready";
    }
  | {
      readonly version: typeof STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION;
      readonly kind: "fatal";
      readonly error: StudioLocalDatabaseWorkerSerializedError;
    }
  | {
      readonly version: typeof STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION;
      readonly kind: "response";
      readonly requestId: number;
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly version: typeof STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION;
      readonly kind: "response";
      readonly requestId: number;
      readonly ok: false;
      readonly error: StudioLocalDatabaseWorkerSerializedError;
    };

const methodSet: ReadonlySet<string> = new Set(STUDIO_LOCAL_DATABASE_RPC_METHODS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveRequestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isStudioLocalDatabaseWorkerRequest(
  value: unknown,
): value is StudioLocalDatabaseWorkerRequest {
  if (!isRecord(value)) return false;
  return value.version === STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION
    && value.kind === "request"
    && isPositiveRequestId(value.requestId)
    && typeof value.method === "string"
    && (value.method === "close" || methodSet.has(value.method))
    && Array.isArray(value.args);
}

export function isStudioLocalDatabaseWorkerSerializedError(
  value: unknown,
): value is StudioLocalDatabaseWorkerSerializedError {
  return isRecord(value)
    && typeof value.name === "string"
    && value.name.length > 0
    && typeof value.message === "string"
    && (value.stack === undefined || typeof value.stack === "string")
    && (value.reason === undefined || typeof value.reason === "string")
    && (value.entryCount === undefined || typeof value.entryCount === "number")
    && (value.rowCount === undefined || typeof value.rowCount === "number")
    && (value.totalBytes === undefined || typeof value.totalBytes === "number");
}

export function isStudioLocalDatabaseWorkerResponse(
  value: unknown,
): value is StudioLocalDatabaseWorkerResponse {
  if (
    !isRecord(value)
    || value.version !== STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION
    || typeof value.kind !== "string"
  ) {
    return false;
  }
  if (value.kind === "ready") return true;
  if (value.kind === "fatal") {
    return isStudioLocalDatabaseWorkerSerializedError(value.error);
  }
  if (value.kind !== "response" || !isPositiveRequestId(value.requestId)) {
    return false;
  }
  if (value.ok === true) {
    return Object.prototype.hasOwnProperty.call(value, "value");
  }
  return value.ok === false && isStudioLocalDatabaseWorkerSerializedError(value.error);
}
