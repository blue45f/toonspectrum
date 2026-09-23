export const STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION = 1 as const;
export const STUDIO_OFFLINE_BRANCH_WIRE = "studio-automerge-offline-branch-v1" as const;

export const STUDIO_OFFLINE_BRANCH_LIMITS = Object.freeze({
  maxOperations: 10_000,
  maxPayloadBytes: 4 * 1024 * 1024,
  maxDocumentBytes: 32 * 1024 * 1024,
  maxIdentifierLength: 180,
  maxMessageLength: 1_024,
});

export type StudioOfflineBranchTargetType =
  | "stroke"
  | "scene-element"
  | "layer-group";

export type StudioOfflineBranchOperationAction = "upsert" | "delete";

/**
 * A semantic edit kept in an Automerge journal. The result and previous payloads live in the
 * content-addressed OPFS store so the journal stays bounded and a projected draft can be reversed
 * back to its clean Yjs baseline after a reload.
 */
export interface StudioOfflineBranchOperation {
  readonly version: typeof STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION;
  readonly id: string;
  readonly dedupeKey: string;
  readonly targetType: StudioOfflineBranchTargetType;
  readonly action: StudioOfflineBranchOperationAction;
  readonly targetId: string;
  readonly pageId: string;
  readonly layerId: string | null;
  readonly beforeId: string | null;
  readonly previousBeforeId: string | null;
  readonly expectedFingerprint: string | null;
  readonly resultFingerprint: string | null;
  readonly payloadHash: string | null;
  readonly payloadBytes: number;
  readonly previousPayloadHash: string | null;
  readonly previousPayloadBytes: number;
  readonly actorId: string;
  readonly createdAt: number;
}

export interface StudioOfflineBranchReceipt {
  readonly operationId: string;
  readonly state: "canonical-local" | "server";
  readonly yjsUpdateId: string;
  readonly serverSequence: string | null;
  readonly appliedAt: number;
}

export interface StudioOfflineBranchConflict {
  readonly operationId: string;
  readonly code:
    | "target-changed"
    | "target-missing"
    | "target-exists"
    | "payload-missing"
    | "payload-corrupt"
    | "unsupported";
  readonly message: string;
  readonly detectedAt: number;
}

export interface StudioOfflineBranchMetadata {
  readonly id: string;
  readonly workId: string;
  readonly scope: string;
  readonly actorId: string;
  readonly epoch: number;
  readonly baseRevision: string | null;
  readonly createdAt: number;
  updatedAt: number;
  state: "editing" | "syncing" | "conflicted" | "merged";
}

export interface StudioOfflineBranchDocument extends Record<string, unknown> {
  schemaVersion: typeof STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION;
  branch: StudioOfflineBranchMetadata;
  operations: Record<string, StudioOfflineBranchOperation>;
  dedupe: Record<string, string>;
  receipts: Record<string, StudioOfflineBranchReceipt>;
  conflicts: Record<string, StudioOfflineBranchConflict>;
}

export interface StudioOfflineBranchSnapshot {
  readonly branch: StudioOfflineBranchMetadata;
  readonly heads: readonly string[];
  readonly operations: readonly StudioOfflineBranchOperation[];
  readonly receipts: Readonly<Record<string, StudioOfflineBranchReceipt>>;
  readonly conflicts: Readonly<Record<string, StudioOfflineBranchConflict>>;
  readonly documentBytes: number;
}

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const FINGERPRINT_PATTERN = /^fp1:[0-9a-f]{16}$/u;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStudioOfflineBranchIdentifier(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > STUDIO_OFFLINE_BRANCH_LIMITS.maxIdentifierLength
  ) return false;
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint > 31 && codePoint !== 127;
  });
}

export function isStudioOfflineBranchContentHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

export function isStudioOfflineBranchFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value);
}

function nullableIdentifier(value: unknown): value is string | null {
  return value === null || isStudioOfflineBranchIdentifier(value);
}

function nullableFingerprint(value: unknown): value is string | null {
  return value === null || isStudioOfflineBranchFingerprint(value);
}

function validPayloadReference(hash: unknown, bytes: unknown): boolean {
  return isStudioOfflineBranchContentHash(hash)
    && Number.isSafeInteger(bytes)
    && Number(bytes) > 0
    && Number(bytes) <= STUDIO_OFFLINE_BRANCH_LIMITS.maxPayloadBytes;
}

function emptyPayloadReference(hash: unknown, bytes: unknown): boolean {
  return hash === null && bytes === 0;
}

export function parseStudioOfflineBranchOperation(
  value: unknown,
): StudioOfflineBranchOperation | null {
  if (!record(value) || value.version !== STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION) return null;
  if (
    !isStudioOfflineBranchIdentifier(value.id)
    || !isStudioOfflineBranchIdentifier(value.dedupeKey)
    || !["stroke", "scene-element", "layer-group"].includes(String(value.targetType))
    || !["upsert", "delete"].includes(String(value.action))
    || !isStudioOfflineBranchIdentifier(value.targetId)
    || !isStudioOfflineBranchIdentifier(value.pageId)
    || !nullableIdentifier(value.layerId)
    || !nullableIdentifier(value.beforeId)
    || !nullableIdentifier(value.previousBeforeId)
    || !nullableFingerprint(value.expectedFingerprint)
    || !nullableFingerprint(value.resultFingerprint)
    || !isStudioOfflineBranchIdentifier(value.actorId)
    || !Number.isSafeInteger(value.createdAt)
    || Number(value.createdAt) < 0
  ) return null;

  const isUpsert = value.action === "upsert";
  const hasResult = validPayloadReference(value.payloadHash, value.payloadBytes);
  const hasPrevious = validPayloadReference(
    value.previousPayloadHash,
    value.previousPayloadBytes,
  );
  const noResult = emptyPayloadReference(value.payloadHash, value.payloadBytes);
  const noPrevious = emptyPayloadReference(
    value.previousPayloadHash,
    value.previousPayloadBytes,
  );

  if (isUpsert) {
    if (!hasResult || !isStudioOfflineBranchFingerprint(value.resultFingerprint)) return null;
    if (value.expectedFingerprint === null) {
      if (!noPrevious || value.previousBeforeId !== null) return null;
    } else if (!hasPrevious) return null;
  } else if (
    !isStudioOfflineBranchFingerprint(value.expectedFingerprint)
    || value.resultFingerprint !== null
    || value.beforeId !== null
    || !noResult
    || !hasPrevious
  ) return null;

  return {
    version: STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION,
    id: value.id,
    dedupeKey: value.dedupeKey,
    targetType: value.targetType as StudioOfflineBranchTargetType,
    action: value.action as StudioOfflineBranchOperationAction,
    targetId: value.targetId,
    pageId: value.pageId,
    layerId: value.layerId as string | null,
    beforeId: value.beforeId as string | null,
    previousBeforeId: value.previousBeforeId as string | null,
    expectedFingerprint: value.expectedFingerprint as string | null,
    resultFingerprint: value.resultFingerprint as string | null,
    payloadHash: value.payloadHash as string | null,
    payloadBytes: Number(value.payloadBytes),
    previousPayloadHash: value.previousPayloadHash as string | null,
    previousPayloadBytes: Number(value.previousPayloadBytes),
    actorId: value.actorId,
    createdAt: Number(value.createdAt),
  };
}

export function studioOfflineBranchOperationPayloadHashes(
  operation: StudioOfflineBranchOperation,
): string[] {
  return [operation.payloadHash, operation.previousPayloadHash]
    .filter((hash): hash is string => hash !== null);
}

export function studioOfflineBranchPendingOperations(
  snapshot: StudioOfflineBranchSnapshot,
): StudioOfflineBranchOperation[] {
  return snapshot.operations.filter((operation) =>
    snapshot.receipts[operation.id]?.state !== "server"
  );
}

export function studioOfflineBranchHasUnresolvedWork(
  snapshot: StudioOfflineBranchSnapshot,
): boolean {
  return studioOfflineBranchPendingOperations(snapshot).length > 0;
}
