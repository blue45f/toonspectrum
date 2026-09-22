import {
  STUDIO_OFFLINE_BRANCH_LIMITS,
  isStudioOfflineBranchContentHash,
} from "./studio-offline-branch-contract";

export const STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE =
  "studio-offline-branch-peer-bundle-v2" as const;
export const STUDIO_OFFLINE_BRANCH_PEER_PAYLOAD_CHUNK_BYTES = 192 * 1024 * 1024;
export const STUDIO_OFFLINE_BRANCH_PEER_PAYLOAD_CHUNK_COUNT = 128;

const MAX_HEADER_BYTES = 512 * 1024;
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024;

interface PayloadDescriptor {
  readonly hash: string;
  readonly offset: number;
  readonly length: number;
}

interface BundleHeader {
  readonly wire: typeof STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE;
  readonly workId: string;
  readonly scope: string;
  readonly documentOffset: number;
  readonly documentLength: number;
  readonly payloads: readonly PayloadDescriptor[];
}

export interface StudioOfflineBranchPeerPayload {
  readonly hash: string;
  readonly bytes: Uint8Array;
}

export interface StudioOfflineBranchPeerBundle {
  readonly workId: string;
  readonly scope: string;
  readonly documentBytes: Uint8Array | null;
  readonly payloads: readonly StudioOfflineBranchPeerPayload[];
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedIdentity(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= STUDIO_OFFLINE_BRANCH_LIMITS.maxIdentifierLength;
}

function validPayload(payload: StudioOfflineBranchPeerPayload): boolean {
  return isStudioOfflineBranchContentHash(payload.hash)
    && payload.bytes instanceof Uint8Array
    && payload.bytes.byteLength > 0
    && payload.bytes.byteLength <= STUDIO_OFFLINE_BRANCH_LIMITS.maxPayloadBytes;
}

export function chunkStudioOfflineBranchPeerPayloads(
  payloads: readonly StudioOfflineBranchPeerPayload[],
): StudioOfflineBranchPeerPayload[][] {
  const chunks: StudioOfflineBranchPeerPayload[][] = [];
  let current: StudioOfflineBranchPeerPayload[] = [];
  let currentBytes = 0;
  const seen = new Set<string>();
  for (const payload of payloads) {
    if (!validPayload(payload) || seen.has(payload.hash)) {
      throw new Error("offline branch peer payload is invalid");
    }
    seen.add(payload.hash);
    if (
      current.length > 0
      && (
        current.length >= STUDIO_OFFLINE_BRANCH_PEER_PAYLOAD_CHUNK_COUNT
        || currentBytes + payload.bytes.byteLength
          > STUDIO_OFFLINE_BRANCH_PEER_PAYLOAD_CHUNK_BYTES
      )
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(payload);
    currentBytes += payload.bytes.byteLength;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function encodeStudioOfflineBranchPeerBundle(
  bundle: StudioOfflineBranchPeerBundle,
): Uint8Array {
  if (!boundedIdentity(bundle.workId) || !boundedIdentity(bundle.scope)) {
    throw new Error("offline branch peer bundle identity is invalid");
  }
  const documentBytes = bundle.documentBytes;
  if (
    documentBytes !== null
    && (!(documentBytes instanceof Uint8Array)
      || documentBytes.byteLength === 0
      || documentBytes.byteLength > STUDIO_OFFLINE_BRANCH_LIMITS.maxDocumentBytes)
  ) throw new Error("offline branch peer document is invalid");
  if (
    (documentBytes === null && bundle.payloads.length === 0)
    || bundle.payloads.length > STUDIO_OFFLINE_BRANCH_PEER_PAYLOAD_CHUNK_COUNT
  ) throw new Error("offline branch peer bundle is empty or has too many payloads");

  let bodyBytes = documentBytes?.byteLength ?? 0;
  const descriptors: PayloadDescriptor[] = [];
  const seen = new Set<string>();
  for (const payload of bundle.payloads) {
    if (!validPayload(payload) || seen.has(payload.hash)) {
      throw new Error("offline branch peer payload is invalid");
    }
    seen.add(payload.hash);
    descriptors.push({
      hash: payload.hash,
      offset: bodyBytes,
      length: payload.bytes.byteLength,
    });
    bodyBytes += payload.bytes.byteLength;
  }

  const header: BundleHeader = {
    wire: STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE,
    workId: bundle.workId,
    scope: bundle.scope,
    documentOffset: 0,
    documentLength: documentBytes?.byteLength ?? 0,
    payloads: descriptors,
  };
  const headerBytes = ENCODER.encode(JSON.stringify(header));
  const total = 4 + headerBytes.byteLength + bodyBytes;
  if (
    headerBytes.byteLength === 0
    || headerBytes.byteLength > MAX_HEADER_BYTES
    || total > MAX_BUNDLE_BYTES
  ) throw new Error("offline branch peer bundle exceeds its byte budget");

  const result = new Uint8Array(total);
  new DataView(result.buffer).setUint32(0, headerBytes.byteLength, true);
  result.set(headerBytes, 4);
  const bodyOffset = 4 + headerBytes.byteLength;
  if (documentBytes) result.set(documentBytes, bodyOffset);
  for (let index = 0; index < bundle.payloads.length; index += 1) {
    const descriptor = descriptors[index]!;
    result.set(bundle.payloads[index]!.bytes, bodyOffset + descriptor.offset);
  }
  return result;
}

function parseHeader(value: unknown): BundleHeader {
  if (
    !record(value)
    || value.wire !== STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE
    || !boundedIdentity(value.workId)
    || !boundedIdentity(value.scope)
    || value.documentOffset !== 0
    || !Number.isSafeInteger(value.documentLength)
    || Number(value.documentLength) < 0
    || Number(value.documentLength) > STUDIO_OFFLINE_BRANCH_LIMITS.maxDocumentBytes
    || !Array.isArray(value.payloads)
    || value.payloads.length > STUDIO_OFFLINE_BRANCH_PEER_PAYLOAD_CHUNK_COUNT
    || (Number(value.documentLength) === 0 && value.payloads.length === 0)
  ) throw new Error("offline branch peer bundle header is invalid");

  const payloads: PayloadDescriptor[] = [];
  const seen = new Set<string>();
  for (const candidate of value.payloads) {
    if (
      !record(candidate)
      || !isStudioOfflineBranchContentHash(candidate.hash)
      || !Number.isSafeInteger(candidate.offset)
      || !Number.isSafeInteger(candidate.length)
      || Number(candidate.offset) < Number(value.documentLength)
      || Number(candidate.length) <= 0
      || Number(candidate.length) > STUDIO_OFFLINE_BRANCH_LIMITS.maxPayloadBytes
      || seen.has(candidate.hash)
    ) throw new Error("offline branch peer payload descriptor is invalid");
    seen.add(candidate.hash);
    payloads.push({
      hash: candidate.hash,
      offset: Number(candidate.offset),
      length: Number(candidate.length),
    });
  }
  return {
    wire: STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE,
    workId: value.workId,
    scope: value.scope,
    documentOffset: 0,
    documentLength: Number(value.documentLength),
    payloads,
  };
}

export function decodeStudioOfflineBranchPeerBundle(
  bytes: Uint8Array,
): StudioOfflineBranchPeerBundle {
  if (
    !(bytes instanceof Uint8Array)
    || bytes.byteLength < 5
    || bytes.byteLength > MAX_BUNDLE_BYTES
  ) throw new Error("offline branch peer bundle bytes are invalid");

  const headerLength = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0, true);
  if (
    headerLength === 0
    || headerLength > MAX_HEADER_BYTES
    || 4 + headerLength >= bytes.byteLength
  ) throw new Error("offline branch peer bundle header length is invalid");

  let parsed: unknown;
  try {
    parsed = JSON.parse(DECODER.decode(bytes.subarray(4, 4 + headerLength))) as unknown;
  } catch (cause) {
    throw new Error("offline branch peer bundle header is not JSON", { cause });
  }
  const header = parseHeader(parsed);
  const body = bytes.subarray(4 + headerLength);
  if (header.documentLength > body.byteLength) {
    throw new Error("offline branch peer document is truncated");
  }

  let previousEnd = header.documentLength;
  const payloads = header.payloads.map((descriptor) => {
    const end = descriptor.offset + descriptor.length;
    if (descriptor.offset < previousEnd || end > body.byteLength) {
      throw new Error("offline branch peer payload range is invalid");
    }
    previousEnd = end;
    return {
      hash: descriptor.hash,
      bytes: Uint8Array.from(body.subarray(descriptor.offset, end)),
    };
  });
  if (previousEnd !== body.byteLength) {
    throw new Error("offline branch peer bundle has unclaimed trailing bytes");
  }
  return {
    workId: header.workId,
    scope: header.scope,
    documentBytes: header.documentLength > 0
      ? Uint8Array.from(body.subarray(0, header.documentLength))
      : null,
    payloads,
  };
}
