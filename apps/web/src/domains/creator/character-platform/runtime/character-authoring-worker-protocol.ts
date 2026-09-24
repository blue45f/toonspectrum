import type { CharacterDocumentV2 } from "../document/character-document-v2";
import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type {
  CharacterGroomGuideCurve,
  CharacterGroomProfile,
} from "../groom/character-groom-document";
import type { CharacterGeometryStroke } from "../surface-ink/character-geometry-stroke";

export const CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION = 1 as const;
export const CHARACTER_AUTHORING_WORKER_MAX_INPUT_BYTES = 16 * 1024 * 1024;
export const CHARACTER_AUTHORING_WORKER_MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
export const CHARACTER_AUTHORING_WORKER_MAX_POINTS = 100_000;

export type CharacterAuthoringWorkerTask =
  | {
      readonly kind: "migrate-document-v2";
      readonly document: CharacterDocumentV2;
    }
  | {
      readonly kind: "validate-document-v3";
      readonly document: CharacterDocumentV3;
    }
  | {
      readonly kind: "resample-groom-guide";
      readonly guide: CharacterGroomGuideCurve;
      readonly spacing: number;
    }
  | {
      readonly kind: "build-groom-ribbon";
      readonly guide: CharacterGroomGuideCurve;
      readonly profile: CharacterGroomProfile;
    }
  | {
      readonly kind: "build-geometry-stroke";
      readonly stroke: CharacterGeometryStroke;
    };

export interface CharacterAuthoringWorkerRequest {
  readonly version: typeof CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION;
  readonly kind: "execute";
  readonly requestId: number;
  readonly generationId: number;
  readonly inputBytes: number;
  readonly task: CharacterAuthoringWorkerTask;
}

export interface CharacterAuthoringWorkerMeshPayload {
  readonly kind: "mesh";
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly byteLength: number;
  readonly positions: ArrayBuffer;
  readonly normals: ArrayBuffer;
  readonly uvs: ArrayBuffer;
  readonly indices: ArrayBuffer;
}

export type CharacterAuthoringWorkerResultPayload =
  | {
      readonly kind: "document-v3";
      readonly document: CharacterDocumentV3;
    }
  | {
      readonly kind: "groom-guide";
      readonly guide: CharacterGroomGuideCurve;
    }
  | CharacterAuthoringWorkerMeshPayload;

export interface CharacterAuthoringWorkerProgressResponse {
  readonly version: typeof CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION;
  readonly kind: "progress";
  readonly requestId: number;
  readonly generationId: number;
  readonly stage: "validating" | "computing" | "packing";
  readonly progress: number;
}

export interface CharacterAuthoringWorkerResultResponse {
  readonly version: typeof CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION;
  readonly kind: "result";
  readonly requestId: number;
  readonly generationId: number;
  readonly result: CharacterAuthoringWorkerResultPayload;
}

export type CharacterAuthoringWorkerFailureCode =
  | "invalid-request"
  | "input-too-large"
  | "output-too-large"
  | "point-budget-exceeded"
  | "task-failed";

export interface CharacterAuthoringWorkerErrorResponse {
  readonly version: typeof CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION;
  readonly kind: "error";
  readonly requestId: number;
  readonly generationId: number;
  readonly code: CharacterAuthoringWorkerFailureCode;
  readonly message: string;
}

export type CharacterAuthoringWorkerResponse =
  | CharacterAuthoringWorkerProgressResponse
  | CharacterAuthoringWorkerResultResponse
  | CharacterAuthoringWorkerErrorResponse;

const TASKS = new Set<CharacterAuthoringWorkerTask["kind"]>([
  "migrate-document-v2",
  "validate-document-v3",
  "resample-groom-guide",
  "build-groom-ribbon",
  "build-geometry-stroke",
]);
const STAGES = new Set<CharacterAuthoringWorkerProgressResponse["stage"]>([
  "validating",
  "computing",
  "packing",
]);
const FAILURE_CODES = new Set<CharacterAuthoringWorkerFailureCode>([
  "invalid-request",
  "input-too-large",
  "output-too-large",
  "point-budget-exceeded",
  "task-failed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function requestIdentity(value: Record<string, unknown>): boolean {
  return value.version === CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION
    && isPositiveSafeInteger(value.requestId)
    && isPositiveSafeInteger(value.generationId);
}

function isTask(value: unknown): value is CharacterAuthoringWorkerTask {
  if (!isRecord(value) || !TASKS.has(value.kind as CharacterAuthoringWorkerTask["kind"])) return false;
  if (value.kind === "migrate-document-v2" || value.kind === "validate-document-v3") {
    return isRecord(value.document);
  }
  if (value.kind === "resample-groom-guide") {
    return isRecord(value.guide)
      && typeof value.spacing === "number"
      && Number.isFinite(value.spacing)
      && value.spacing > 0;
  }
  if (value.kind === "build-groom-ribbon") {
    return isRecord(value.guide) && isRecord(value.profile);
  }
  return isRecord(value.stroke);
}

export function isCharacterAuthoringWorkerRequest(
  value: unknown,
): value is CharacterAuthoringWorkerRequest {
  return isRecord(value)
    && requestIdentity(value)
    && value.kind === "execute"
    && isPositiveSafeInteger(value.inputBytes)
    && value.inputBytes <= CHARACTER_AUTHORING_WORKER_MAX_INPUT_BYTES
    && isTask(value.task);
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

export function isCharacterAuthoringWorkerMeshPayload(
  value: unknown,
): value is CharacterAuthoringWorkerMeshPayload {
  if (!isRecord(value)
    || value.kind !== "mesh"
    || !isPositiveSafeInteger(value.vertexCount)
    || !isNonNegativeSafeInteger(value.triangleCount)
    || !isPositiveSafeInteger(value.byteLength)
    || value.byteLength > CHARACTER_AUTHORING_WORKER_MAX_OUTPUT_BYTES
    || !isArrayBuffer(value.positions)
    || !isArrayBuffer(value.normals)
    || !isArrayBuffer(value.uvs)
    || !isArrayBuffer(value.indices)) return false;
  const vertexCount = value.vertexCount;
  const triangleCount = value.triangleCount;
  const measured = value.positions.byteLength + value.normals.byteLength
    + value.uvs.byteLength + value.indices.byteLength;
  return value.positions.byteLength === vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT
    && value.normals.byteLength === vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT
    && value.uvs.byteLength === vertexCount * 2 * Float32Array.BYTES_PER_ELEMENT
    && value.indices.byteLength === triangleCount * 3 * Uint32Array.BYTES_PER_ELEMENT
    && measured === value.byteLength;
}

function isResultPayload(value: unknown): value is CharacterAuthoringWorkerResultPayload {
  if (!isRecord(value)) return false;
  if (value.kind === "document-v3") return isRecord(value.document);
  if (value.kind === "groom-guide") return isRecord(value.guide);
  return isCharacterAuthoringWorkerMeshPayload(value);
}

export function isCharacterAuthoringWorkerResponse(
  value: unknown,
): value is CharacterAuthoringWorkerResponse {
  if (!isRecord(value) || !requestIdentity(value)) return false;
  if (value.kind === "progress") {
    return STAGES.has(value.stage as CharacterAuthoringWorkerProgressResponse["stage"])
      && typeof value.progress === "number"
      && Number.isFinite(value.progress)
      && value.progress >= 0
      && value.progress < 1;
  }
  if (value.kind === "error") {
    return FAILURE_CODES.has(value.code as CharacterAuthoringWorkerFailureCode)
      && typeof value.message === "string"
      && value.message.length > 0
      && value.message.length <= 512;
  }
  return value.kind === "result" && isResultPayload(value.result);
}

export function characterAuthoringWorkerResponseTransfers(
  response: CharacterAuthoringWorkerResponse,
): Transferable[] {
  if (response.kind !== "result" || response.result.kind !== "mesh") return [];
  return [
    response.result.positions,
    response.result.normals,
    response.result.uvs,
    response.result.indices,
  ];
}

export function estimateCharacterAuthoringTaskBytes(
  task: CharacterAuthoringWorkerTask,
): number {
  const encoded = new TextEncoder().encode(JSON.stringify(task));
  return encoded.byteLength;
}

export function characterAuthoringTaskPointCount(
  task: CharacterAuthoringWorkerTask,
): number {
  if (task.kind === "resample-groom-guide" || task.kind === "build-groom-ribbon") {
    return task.guide.points.length;
  }
  if (task.kind === "build-geometry-stroke") return task.stroke.points.length;
  return 0;
}
