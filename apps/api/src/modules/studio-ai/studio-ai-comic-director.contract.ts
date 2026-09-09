export const STUDIO_AI_COMIC_DIRECTOR_STAGES = [
  "brief",
  "direction",
  "production",
  "finish",
] as const;
export type StudioAiComicDirectorStage =
  (typeof STUDIO_AI_COMIC_DIRECTOR_STAGES)[number];

export const STUDIO_AI_COMIC_DIRECTOR_STATUSES = [
  "draft",
  "planning",
  "ready",
  "generating",
  "review",
  "applying",
  "applied",
  "cancelled",
  "failed",
] as const;
export type StudioAiComicDirectorStatus =
  (typeof STUDIO_AI_COMIC_DIRECTOR_STATUSES)[number];

export const STUDIO_AI_COMIC_JOB_KINDS = [
  "generation",
  "repair",
  "quality",
  "decomposition",
  "apply",
] as const;
export type StudioAiComicJobKind = (typeof STUDIO_AI_COMIC_JOB_KINDS)[number];

export const STUDIO_AI_COMIC_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
] as const;
export type StudioAiComicJobStatus =
  (typeof STUDIO_AI_COMIC_JOB_STATUSES)[number];

export const STUDIO_AI_COMIC_ARTIFACT_KINDS = [
  "candidate",
  "repair",
  "mask",
  "quality-report",
  "layer-manifest",
  "apply-receipt",
] as const;
export type StudioAiComicArtifactKind =
  (typeof STUDIO_AI_COMIC_ARTIFACT_KINDS)[number];

export interface StudioAiComicDirectorSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly workId: string | null;
  readonly remixSourceWorkId: string | null;
  readonly title: string;
  readonly stage: StudioAiComicDirectorStage;
  readonly status: StudioAiComicDirectorStatus;
  readonly revision: number;
  readonly baseDocumentRevision: string | null;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioAiVisualBibleRevisionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly revision: number;
  readonly status: "draft" | "recommended" | "approved" | "deprecated";
  readonly sourceDigest: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface StudioAiComicJobRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly operationId: string;
  readonly kind: StudioAiComicJobKind;
  readonly status: StudioAiComicJobStatus;
  readonly progressDone: number;
  readonly progressTotal: number;
  readonly payload: Record<string, unknown>;
  readonly result: Record<string, unknown> | null;
  readonly error: string | null;
  readonly leaseExpiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioAiComicJobEventRecord {
  readonly id: string;
  readonly jobId: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface StudioAiComicArtifactRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly panelId: string | null;
  readonly parentArtifactId: string | null;
  readonly kind: StudioAiComicArtifactKind;
  readonly assetId: string | null;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface StudioAiComicApprovalRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly sessionRevision: number;
  readonly candidateDigest: string;
  readonly status: "active" | "superseded";
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
  readonly supersededAt: string | null;
}

export interface CreateStudioAiComicDirectorSessionInput {
  readonly id?: string;
  readonly workId?: string | null;
  readonly remixSourceWorkId?: string | null;
  readonly title?: string;
  readonly stage?: StudioAiComicDirectorStage;
  readonly status?: StudioAiComicDirectorStatus;
  readonly baseDocumentRevision?: string | null;
  readonly payload?: Record<string, unknown>;
}

export interface UpdateStudioAiComicDirectorSessionInput {
  readonly expectedRevision: number;
  readonly title?: string;
  readonly stage?: StudioAiComicDirectorStage;
  readonly status?: StudioAiComicDirectorStatus;
  readonly baseDocumentRevision?: string | null;
  readonly payload?: Record<string, unknown>;
}

export interface CreateStudioAiVisualBibleRevisionInput {
  readonly status?: "draft" | "recommended" | "approved" | "deprecated";
  readonly payload: Record<string, unknown>;
}

export interface CreateStudioAiComicJobInput {
  readonly operationId: string;
  readonly kind: StudioAiComicJobKind;
  readonly progressTotal?: number;
  readonly payload?: Record<string, unknown>;
  readonly leaseMs?: number;
}

export interface UpdateStudioAiComicJobInput {
  readonly status?: StudioAiComicJobStatus;
  readonly progressDone?: number;
  readonly progressTotal?: number;
  readonly result?: Record<string, unknown> | null;
  readonly error?: string | null;
  readonly leaseMs?: number | null;
  readonly eventType?: string;
  readonly eventPayload?: Record<string, unknown>;
}

export interface CreateStudioAiComicArtifactInput {
  readonly panelId?: string | null;
  readonly parentArtifactId?: string | null;
  readonly kind: StudioAiComicArtifactKind;
  readonly assetId?: string | null;
  readonly payload?: Record<string, unknown>;
}

export interface CreateStudioAiComicApprovalInput {
  readonly expectedRevision: number;
  readonly candidateDigest: string;
  readonly payload?: Record<string, unknown>;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_JSON_BYTES) {
    throw new RangeError(`${name} is too large.`);
  }
  return value as Record<string, unknown>;
}

export function comicDirectorRecord(
  value: unknown,
  name = "payload",
): Record<string, unknown> {
  return record(value ?? {}, name);
}

export function comicDirectorId(value: unknown, name: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value.trim())) {
    throw new TypeError(`${name} is invalid.`);
  }
  return value.trim();
}

export function comicDirectorOptionalId(
  value: unknown,
  name: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return comicDirectorId(value, name);
}

export function comicDirectorText(
  value: unknown,
  name: string,
  maximum = 240,
): string {
  if (typeof value !== "string") throw new TypeError(`${name} must be text.`);
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > maximum) {
    throw new RangeError(`${name} must contain 1-${maximum} characters.`);
  }
  return normalized;
}

export function comicDirectorOptionalText(
  value: unknown,
  name: string,
  maximum = 240,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return comicDirectorText(value, name, maximum);
}

export function comicDirectorInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value as number;
}

export function comicDirectorEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  name: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new TypeError(`${name} is invalid.`);
  }
  return value as T[number];
}

export function parseCreateStudioAiComicDirectorSessionInput(
  value: unknown,
): CreateStudioAiComicDirectorSessionInput {
  const input = record(value ?? {}, "session");
  const workId = comicDirectorOptionalId(input.workId, "workId");
  const remixSourceWorkId = comicDirectorOptionalId(
    input.remixSourceWorkId,
    "remixSourceWorkId",
  );
  if (workId && remixSourceWorkId) {
    throw new TypeError("A session cannot belong to work and remix scopes at the same time.");
  }
  return {
    ...(input.id === undefined ? {} : { id: comicDirectorId(input.id, "id") }),
    ...(workId === undefined ? {} : { workId }),
    ...(remixSourceWorkId === undefined ? {} : { remixSourceWorkId }),
    ...(input.title === undefined
      ? {}
      : { title: comicDirectorText(input.title, "title", 160) }),
    ...(input.stage === undefined
      ? {}
      : {
          stage: comicDirectorEnum(
            input.stage,
            STUDIO_AI_COMIC_DIRECTOR_STAGES,
            "stage",
          ),
        }),
    ...(input.status === undefined
      ? {}
      : {
          status: comicDirectorEnum(
            input.status,
            STUDIO_AI_COMIC_DIRECTOR_STATUSES,
            "status",
          ),
        }),
    ...(input.baseDocumentRevision === undefined
      ? {}
      : {
          baseDocumentRevision: comicDirectorOptionalText(
            input.baseDocumentRevision,
            "baseDocumentRevision",
            200,
          ),
        }),
    ...(input.payload === undefined
      ? {}
      : { payload: comicDirectorRecord(input.payload) }),
  };
}

export function parseUpdateStudioAiComicDirectorSessionInput(
  value: unknown,
): UpdateStudioAiComicDirectorSessionInput {
  const input = record(value, "session update");
  return {
    expectedRevision: comicDirectorInteger(
      input.expectedRevision,
      "expectedRevision",
      1,
      2_147_483_647,
    ),
    ...(input.title === undefined
      ? {}
      : { title: comicDirectorText(input.title, "title", 160) }),
    ...(input.stage === undefined
      ? {}
      : {
          stage: comicDirectorEnum(
            input.stage,
            STUDIO_AI_COMIC_DIRECTOR_STAGES,
            "stage",
          ),
        }),
    ...(input.status === undefined
      ? {}
      : {
          status: comicDirectorEnum(
            input.status,
            STUDIO_AI_COMIC_DIRECTOR_STATUSES,
            "status",
          ),
        }),
    ...(input.baseDocumentRevision === undefined
      ? {}
      : {
          baseDocumentRevision: comicDirectorOptionalText(
            input.baseDocumentRevision,
            "baseDocumentRevision",
            200,
          ),
        }),
    ...(input.payload === undefined
      ? {}
      : { payload: comicDirectorRecord(input.payload) }),
  };
}

export function parseCreateStudioAiVisualBibleRevisionInput(
  value: unknown,
): CreateStudioAiVisualBibleRevisionInput {
  const input = record(value, "Visual Bible revision");
  const allowed = ["draft", "recommended", "approved", "deprecated"] as const;
  return {
    status:
      input.status === undefined
        ? "draft"
        : comicDirectorEnum(input.status, allowed, "status"),
    payload: comicDirectorRecord(input.payload, "Visual Bible payload"),
  };
}

export function parseCreateStudioAiComicJobInput(
  value: unknown,
): CreateStudioAiComicJobInput {
  const input = record(value, "job");
  return {
    operationId: comicDirectorId(input.operationId, "operationId"),
    kind: comicDirectorEnum(input.kind, STUDIO_AI_COMIC_JOB_KINDS, "kind"),
    progressTotal:
      input.progressTotal === undefined
        ? 0
        : comicDirectorInteger(input.progressTotal, "progressTotal", 0, 100_000),
    payload: comicDirectorRecord(input.payload ?? {}),
    leaseMs:
      input.leaseMs === undefined
        ? 120_000
        : comicDirectorInteger(input.leaseMs, "leaseMs", 5_000, 300_000),
  };
}

export function parseUpdateStudioAiComicJobInput(
  value: unknown,
): UpdateStudioAiComicJobInput {
  const input = record(value, "job update");
  return {
    ...(input.status === undefined
      ? {}
      : {
          status: comicDirectorEnum(
            input.status,
            STUDIO_AI_COMIC_JOB_STATUSES,
            "status",
          ),
        }),
    ...(input.progressDone === undefined
      ? {}
      : {
          progressDone: comicDirectorInteger(
            input.progressDone,
            "progressDone",
            0,
            100_000,
          ),
        }),
    ...(input.progressTotal === undefined
      ? {}
      : {
          progressTotal: comicDirectorInteger(
            input.progressTotal,
            "progressTotal",
            0,
            100_000,
          ),
        }),
    ...(input.result === undefined
      ? {}
      : {
          result:
            input.result === null
              ? null
              : comicDirectorRecord(input.result, "job result"),
        }),
    ...(input.error === undefined
      ? {}
      : { error: comicDirectorOptionalText(input.error, "error", 4_000) }),
    ...(input.leaseMs === undefined
      ? {}
      : {
          leaseMs:
            input.leaseMs === null
              ? null
              : comicDirectorInteger(input.leaseMs, "leaseMs", 5_000, 300_000),
        }),
    ...(input.eventType === undefined
      ? {}
      : { eventType: comicDirectorText(input.eventType, "eventType", 80) }),
    ...(input.eventPayload === undefined
      ? {}
      : { eventPayload: comicDirectorRecord(input.eventPayload) }),
  };
}

export function parseCreateStudioAiComicArtifactInput(
  value: unknown,
): CreateStudioAiComicArtifactInput {
  const input = record(value, "artifact");
  return {
    panelId: comicDirectorOptionalId(input.panelId, "panelId") ?? null,
    parentArtifactId:
      comicDirectorOptionalId(input.parentArtifactId, "parentArtifactId") ?? null,
    kind: comicDirectorEnum(
      input.kind,
      STUDIO_AI_COMIC_ARTIFACT_KINDS,
      "kind",
    ),
    assetId: comicDirectorOptionalId(input.assetId, "assetId") ?? null,
    payload: comicDirectorRecord(input.payload ?? {}),
  };
}

export function parseCreateStudioAiComicApprovalInput(
  value: unknown,
): CreateStudioAiComicApprovalInput {
  const input = record(value, "approval");
  return {
    expectedRevision: comicDirectorInteger(
      input.expectedRevision,
      "expectedRevision",
      1,
      2_147_483_647,
    ),
    candidateDigest: comicDirectorText(
      input.candidateDigest,
      "candidateDigest",
      128,
    ),
    payload: comicDirectorRecord(input.payload ?? {}),
  };
}
