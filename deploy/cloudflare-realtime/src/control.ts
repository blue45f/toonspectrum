import { isRealtimeId } from "./protocol";

export const REALTIME_CONTROL_VERSION =
  "toonspectrum.realtime-control.v1" as const;
export const REALTIME_CONTROL_PATH = "/v1/control/revocations" as const;
export const REALTIME_CONTROL_CONTENT_TYPE =
  "application/vnd.toonspectrum.realtime-revocation+json; version=1" as const;
export const REALTIME_CONTROL_MAX_BODY_BYTES = 2_048;
export const REALTIME_CONTROL_MAX_AGE_MS = 30_000;
export const REALTIME_CONTROL_FUTURE_SKEW_MS = 5_000;
export const REALTIME_CONTROL_NONCE_HEADER =
  "X-ToonSpectrum-Realtime-Control-Nonce" as const;
export const REALTIME_CONTROL_TIMESTAMP_HEADER =
  "X-ToonSpectrum-Realtime-Control-Timestamp" as const;
export const REALTIME_CONTROL_SIGNATURE_HEADER =
  "X-ToonSpectrum-Realtime-Control-Signature" as const;

const CONTROL_HMAC_CONTEXT =
  "toonspectrum/realtime-control/hmac-sha256/v1\n";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface RealtimeControlEventBase {
  readonly version: typeof REALTIME_CONTROL_VERSION;
  readonly actorId: string;
  readonly issuedAtMs: number;
  readonly nonce: string;
}

export interface RealtimeSessionVersionRevocation
extends RealtimeControlEventBase {
  readonly kind: "session-version";
  readonly minimumSessionVersion: number;
}

export interface RealtimeRoomAuthorizationRevocation
extends RealtimeControlEventBase {
  readonly kind: "room-authorization";
  readonly workId: string;
  readonly roomId: string;
  readonly minimumAuthorizationEpochMs: number;
}

export type RealtimeControlEvent =
  | RealtimeSessionVersionRevocation
  | RealtimeRoomAuthorizationRevocation;

export interface RealtimeControlHeaders {
  readonly nonce: string;
  readonly timestamp: string;
  readonly signature: string;
}

export type RealtimeControlVerificationResult =
  | { readonly ok: true; readonly event: RealtimeControlEvent }
  | {
      readonly ok: false;
      readonly code:
        | "invalid-body"
        | "invalid-headers"
        | "invalid-secret"
        | "invalid-signature"
        | "expired";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  const expectedSet = new Set(expected);
  return (
    keys.length === expected.length &&
    keys.every((key) => expectedSet.has(key)) &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

export function parseRealtimeControlEvent(
  value: unknown,
): RealtimeControlEvent | null {
  if (
    !isRecord(value) ||
    value.version !== REALTIME_CONTROL_VERSION ||
    !isRealtimeId(value.actorId) ||
    !isPositiveSafeInteger(value.issuedAtMs) ||
    typeof value.nonce !== "string" ||
    !NONCE_PATTERN.test(value.nonce)
  ) {
    return null;
  }
  if (
    value.kind === "session-version" &&
    hasExactKeys(value, [
      "version",
      "kind",
      "actorId",
      "minimumSessionVersion",
      "issuedAtMs",
      "nonce",
    ]) &&
    isPositiveSafeInteger(value.minimumSessionVersion)
  ) {
    return value as unknown as RealtimeSessionVersionRevocation;
  }
  if (
    value.kind === "room-authorization" &&
    hasExactKeys(value, [
      "version",
      "kind",
      "actorId",
      "workId",
      "roomId",
      "minimumAuthorizationEpochMs",
      "issuedAtMs",
      "nonce",
    ]) &&
    isRealtimeId(value.workId) &&
    isRealtimeId(value.roomId) &&
    isPositiveSafeInteger(value.minimumAuthorizationEpochMs)
  ) {
    return value as unknown as RealtimeRoomAuthorizationRevocation;
  }
  return null;
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!BASE64URL_PATTERN.test(value)) return null;
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(
      value.replaceAll("-", "+").replaceAll("_", "/") + padding,
    );
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function importHmacKey(
  secret: string | Uint8Array,
  usage: "sign" | "verify",
): Promise<CryptoKey | null> {
  const secretBytes =
    typeof secret === "string" ? encodeText(secret) : new Uint8Array(secret);
  if (secretBytes.byteLength < 32) return null;
  return await crypto.subtle.importKey(
    "raw",
    copyToArrayBuffer(secretBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

async function sha256Base64Url(body: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    copyToArrayBuffer(body),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

async function createSigningInput(
  body: Uint8Array,
  headers: Pick<RealtimeControlHeaders, "nonce" | "timestamp">,
): Promise<Uint8Array> {
  const digest = await sha256Base64Url(body);
  return encodeText(
    `${CONTROL_HMAC_CONTEXT}POST\n${REALTIME_CONTROL_PATH}\n${headers.timestamp}\n${headers.nonce}\n${digest}`,
  );
}

export function serializeRealtimeControlEvent(
  event: RealtimeControlEvent,
): Uint8Array {
  const parsed = parseRealtimeControlEvent(event);
  if (parsed === null) throw new Error("Invalid realtime control event");
  return encodeText(JSON.stringify(parsed));
}

export async function signRealtimeControlEvent(
  event: RealtimeControlEvent,
  secret: string | Uint8Array,
): Promise<{
  readonly body: Uint8Array;
  readonly headers: RealtimeControlHeaders;
}> {
  const body = serializeRealtimeControlEvent(event);
  if (body.byteLength > REALTIME_CONTROL_MAX_BODY_BYTES) {
    throw new Error("Realtime control event exceeds the body budget");
  }
  const key = await importHmacKey(secret, "sign");
  if (key === null) throw new Error("Realtime control secret is invalid");
  const unsignedHeaders = {
    nonce: event.nonce,
    timestamp: String(event.issuedAtMs),
  } as const;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    copyToArrayBuffer(await createSigningInput(body, unsignedHeaders)),
  );
  return {
    body,
    headers: {
      ...unsignedHeaders,
      signature: encodeBase64Url(new Uint8Array(signature)),
    },
  };
}

export async function verifyRealtimeControlEvent(
  body: Uint8Array,
  headers: RealtimeControlHeaders,
  secret: string | Uint8Array,
  nowMs: number,
): Promise<RealtimeControlVerificationResult> {
  if (
    body.byteLength === 0 ||
    body.byteLength > REALTIME_CONTROL_MAX_BODY_BYTES ||
    !NONCE_PATTERN.test(headers.nonce) ||
    !/^[1-9]\d*$/u.test(headers.timestamp) ||
    !BASE64URL_PATTERN.test(headers.signature)
  ) {
    return { ok: false, code: "invalid-headers" };
  }
  const timestamp = Number(headers.timestamp);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp > nowMs + REALTIME_CONTROL_FUTURE_SKEW_MS ||
    timestamp < nowMs - REALTIME_CONTROL_MAX_AGE_MS
  ) {
    return { ok: false, code: "expired" };
  }
  const key = await importHmacKey(secret, "verify");
  if (key === null) return { ok: false, code: "invalid-secret" };
  const signature = decodeBase64Url(headers.signature);
  if (signature === null) return { ok: false, code: "invalid-signature" };
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    copyToArrayBuffer(signature),
    copyToArrayBuffer(await createSigningInput(body, headers)),
  );
  if (!valid) return { ok: false, code: "invalid-signature" };

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return { ok: false, code: "invalid-body" };
  }
  const event = parseRealtimeControlEvent(value);
  if (
    event === null ||
    event.nonce !== headers.nonce ||
    event.issuedAtMs !== timestamp
  ) {
    return { ok: false, code: "invalid-body" };
  }
  return { ok: true, event };
}
