import {
  STUDIO_OFFLINE_BRANCH_LIMITS,
  STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION,
  isStudioOfflineBranchIdentifier,
  type StudioOfflineBranchTargetType,
} from "./studio-offline-branch-contract";
import { validatePayload } from "../live/studio-crdt-document-payload";
import {
  validateStudioCrdtLayerGroupPayload,
  validateStudioCrdtSceneElementPayload,
} from "../live/studio-crdt-scene-schema";

import type {
  StudioCrdtDrawStrokePayload,
  StudioCrdtLayerGroupInput,
  StudioCrdtSceneElementInput,
  StudioCrdtStrokeInput,
} from "../live/studio-crdt-document-types";

export type StudioOfflineBranchCanonicalInput =
  | StudioCrdtStrokeInput
  | StudioCrdtSceneElementInput
  | StudioCrdtLayerGroupInput;

export interface StudioOfflineBranchPayloadEnvelope {
  readonly version: typeof STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION;
  readonly targetType: StudioOfflineBranchTargetType;
  readonly value: StudioOfflineBranchCanonicalInput;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJsonValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalJsonValue(entry, `${path}[${index}]`));
  }
  if (!record(value)) throw new Error(`${path} is not JSON-compatible`);
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry === undefined) continue;
    normalized[key] = canonicalJsonValue(entry, `${path}.${key}`);
  }
  return normalized;
}

export function stableStudioOfflineBranchJson(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value, "$"));
}

/** Non-cryptographic fingerprint used only for optimistic conflict detection. */
export function fingerprintStudioOfflineBranchValue(value: unknown): string {
  const input = TEXT_ENCODER.encode(stableStudioOfflineBranchJson(value));
  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;
  for (const byte of input) {
    primary = Math.imul(primary ^ byte, 0x01000193) >>> 0;
    secondary = Math.imul(secondary ^ byte, 0x85ebca6b) >>> 0;
    secondary = (secondary ^ (secondary >>> 13)) >>> 0;
  }
  const high = primary.toString(16).padStart(8, "0");
  const low = secondary.toString(16).padStart(8, "0");
  return `fp1:${high}${low}`;
}

function targetMatches(
  targetType: StudioOfflineBranchTargetType,
  value: Record<string, unknown>,
): boolean {
  if (
    !isStudioOfflineBranchIdentifier(value.id)
    || !isStudioOfflineBranchIdentifier(value.pageId)
    || !record(value.payload)
  ) return false;

  try {
    if (targetType === "stroke") {
      if (!isStudioOfflineBranchIdentifier(value.layerId)) return false;
      validatePayload(value.payload as unknown as StudioCrdtDrawStrokePayload, false);
      return value.payload.type === "draw";
    }
    if (targetType === "scene-element") {
      if (!isStudioOfflineBranchIdentifier(value.layerId)) return false;
      validateStudioCrdtSceneElementPayload(value.payload as unknown as StudioCrdtSceneElementInput["payload"]);
      return true;
    }
    validateStudioCrdtLayerGroupPayload(value.payload as unknown as StudioCrdtLayerGroupInput["payload"]);
    return value.layerId === undefined;
  } catch {
    return false;
  }
}

export function encodeStudioOfflineBranchPayload(
  targetType: StudioOfflineBranchTargetType,
  value: StudioOfflineBranchCanonicalInput,
): Uint8Array {
  const envelope: StudioOfflineBranchPayloadEnvelope = {
    version: STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION,
    targetType,
    value,
  };
  const bytes = TEXT_ENCODER.encode(stableStudioOfflineBranchJson(envelope));
  if (bytes.byteLength === 0 || bytes.byteLength > STUDIO_OFFLINE_BRANCH_LIMITS.maxPayloadBytes) {
    throw new Error(`offline branch payload exceeds ${STUDIO_OFFLINE_BRANCH_LIMITS.maxPayloadBytes} bytes`);
  }
  return bytes;
}

export function decodeStudioOfflineBranchPayload(
  bytes: Uint8Array,
  expectedTargetType?: StudioOfflineBranchTargetType,
): StudioOfflineBranchPayloadEnvelope {
  if (
    !(bytes instanceof Uint8Array)
    || bytes.byteLength === 0
    || bytes.byteLength > STUDIO_OFFLINE_BRANCH_LIMITS.maxPayloadBytes
  ) throw new Error("offline branch payload byte budget is invalid");

  let parsed: unknown;
  try {
    parsed = JSON.parse(TEXT_DECODER.decode(bytes)) as unknown;
  } catch (cause) {
    throw new Error("offline branch payload is not canonical JSON", { cause });
  }
  if (
    !record(parsed)
    || parsed.version !== STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION
    || !["stroke", "scene-element", "layer-group"].includes(String(parsed.targetType))
    || !record(parsed.value)
  ) throw new Error("offline branch payload envelope is invalid");

  const targetType = parsed.targetType as StudioOfflineBranchTargetType;
  if (expectedTargetType && expectedTargetType !== targetType) {
    throw new Error("offline branch payload target type does not match its operation");
  }
  if (!targetMatches(targetType, parsed.value)) {
    throw new Error("offline branch payload canonical input is invalid");
  }
  return {
    version: STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION,
    targetType,
    value: canonicalJsonValue(parsed.value, "$.value") as StudioOfflineBranchCanonicalInput,
  };
}
