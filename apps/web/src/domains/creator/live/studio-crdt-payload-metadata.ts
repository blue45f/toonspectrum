import { JSON_PAYLOAD_KEYS, TEXT_ENCODER } from "./studio-crdt-document-constants";
import { OPTIONAL_STRING_PAYLOAD_KEYS, type StudioCrdtDrawStrokePayload } from "./studio-crdt-document-types";

/** Pure serialized metadata sizing; safe before loading the CRDT mutation/validation runtime. */
export function payloadMetadataByteLength(payload: StudioCrdtDrawStrokePayload): number {
  const metadata: Record<string, unknown> = {
    version: payload.version,
    type: payload.type,
    kind: payload.kind,
    mode: payload.mode,
    stroke: payload.stroke,
    strokeWidth: payload.strokeWidth,
  };
  if (payload.opacity !== undefined) metadata.opacity = payload.opacity;
  if (payload.sampleSpacing !== undefined) metadata.sampleSpacing = payload.sampleSpacing;
  for (const key of OPTIONAL_STRING_PAYLOAD_KEYS) {
    if (payload[key] !== undefined) metadata[key] = payload[key];
  }
  for (const key of JSON_PAYLOAD_KEYS) {
    if (payload[key] !== undefined) metadata[key] = payload[key];
  }
  return TEXT_ENCODER.encode(JSON.stringify(metadata)).byteLength;
}

