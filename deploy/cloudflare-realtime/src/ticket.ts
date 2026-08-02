import {
  REALTIME_CHANNELS,
  REALTIME_TICKET_PROTOCOL_PREFIX,
  REALTIME_WEBSOCKET_PROTOCOL,
  isRealtimeChannel,
  isRealtimeId,
  type RealtimeChannel,
} from "./protocol";

export const REALTIME_TICKET_VERSION =
  "toonspectrum.realtime-ticket.v1" as const;
export const REALTIME_TICKET_MAX_AGE_MS = 2 * 60 * 1000;
export const REALTIME_SESSION_MAX_AGE_MS = 5 * 60 * 1000;
export const REALTIME_TICKET_CLOCK_SKEW_MS = 15 * 1000;
export const REALTIME_TICKET_MAX_BYTES = 4096;

const REALTIME_TICKET_HMAC_CONTEXT =
  "toonspectrum/realtime-ticket/hmac-sha256/v1\n";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;

export interface RealtimeTicketClaims {
  readonly version: typeof REALTIME_TICKET_VERSION;
  readonly issuer: string;
  readonly audience: string;
  readonly subject: string;
  readonly sessionVersion: number;
  readonly workId: string;
  readonly roomId: string;
  readonly clientId: string;
  readonly origin: string;
  readonly scopes: readonly RealtimeChannel[];
  readonly nonce: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly sessionExpiresAtMs: number;
}

export interface RealtimeTicketExpectation {
  readonly issuer: string;
  readonly audience: string;
  readonly workId: string;
  readonly roomId: string;
  readonly origin: string;
  readonly nowMs: number;
}

export type RealtimeTicketFailureCode =
  | "malformed"
  | "invalid-secret"
  | "invalid-signature"
  | "invalid-claims"
  | "binding-mismatch"
  | "not-yet-valid"
  | "expired";

export type RealtimeTicketVerificationResult =
  | { readonly ok: true; readonly claims: RealtimeTicketClaims }
  | { readonly ok: false; readonly code: RealtimeTicketFailureCode };

export type RealtimeSubprotocolResult =
  | { readonly ok: true; readonly ticket: string }
  | { readonly ok: false };

export type RealtimeTicketSecret = string | Uint8Array;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const expectedSet = new Set(expected);
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => expectedSet.has(key))
  );
}

function isSafeTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isExactScopeArray(
  value: unknown,
): value is readonly RealtimeChannel[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= REALTIME_CHANNELS.length &&
    value.every(isRealtimeChannel) &&
    new Set(value).size === value.length
  );
}

function isHttpsOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 256) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.origin === value &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

export function parseRealtimeTicketClaims(
  value: unknown,
): RealtimeTicketClaims | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "issuer",
      "audience",
      "subject",
      "sessionVersion",
      "workId",
      "roomId",
      "clientId",
      "origin",
      "scopes",
      "nonce",
      "issuedAtMs",
      "expiresAtMs",
      "sessionExpiresAtMs",
    ]) ||
    value.version !== REALTIME_TICKET_VERSION ||
    !isRealtimeId(value.issuer) ||
    !isRealtimeId(value.audience) ||
    !isRealtimeId(value.subject) ||
    typeof value.sessionVersion !== "number" ||
    !Number.isSafeInteger(value.sessionVersion) ||
    value.sessionVersion < 1 ||
    !isRealtimeId(value.workId) ||
    !isRealtimeId(value.roomId) ||
    !isRealtimeId(value.clientId) ||
    !isHttpsOrigin(value.origin) ||
    !isExactScopeArray(value.scopes) ||
    typeof value.nonce !== "string" ||
    !NONCE_PATTERN.test(value.nonce) ||
    !isSafeTimestamp(value.issuedAtMs) ||
    !isSafeTimestamp(value.expiresAtMs) ||
    !isSafeTimestamp(value.sessionExpiresAtMs)
  ) {
    return null;
  }

  if (
    value.expiresAtMs <= value.issuedAtMs ||
    value.expiresAtMs - value.issuedAtMs > REALTIME_TICKET_MAX_AGE_MS ||
    value.sessionExpiresAtMs < value.expiresAtMs ||
    value.sessionExpiresAtMs - value.issuedAtMs > REALTIME_SESSION_MAX_AGE_MS
  ) {
    return null;
  }

  return value as unknown as RealtimeTicketClaims;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalize(record[key])}`,
    )
    .join(",")}}`;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(source: string): Uint8Array | null {
  if (!BASE64URL_PATTERN.test(source)) {
    return null;
  }
  const padding = "=".repeat((4 - (source.length % 4)) % 4);
  try {
    const binary = atob(
      source.replaceAll("-", "+").replaceAll("_", "/") + padding,
    );
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importHmacKey(
  secret: RealtimeTicketSecret,
  usage: "sign" | "verify",
): Promise<CryptoKey | null> {
  const secretBytes =
    typeof secret === "string" ? encodeText(secret) : new Uint8Array(secret);
  if (secretBytes.byteLength < 32) {
    return null;
  }
  return await crypto.subtle.importKey(
    "raw",
    copyToArrayBuffer(secretBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function signedTicketBytes(payloadSegment: string): Uint8Array {
  return encodeText(`${REALTIME_TICKET_HMAC_CONTEXT}${payloadSegment}`);
}

export async function signRealtimeTicket(
  claims: RealtimeTicketClaims,
  secret: RealtimeTicketSecret,
): Promise<string> {
  const validated = parseRealtimeTicketClaims(claims);
  if (validated === null) {
    throw new Error("Invalid realtime ticket claims");
  }
  const key = await importHmacKey(secret, "sign");
  if (key === null) {
    throw new Error("Realtime ticket secret must contain at least 32 UTF-8 bytes");
  }
  const payloadSegment = encodeBase64Url(
    encodeText(canonicalize(validated)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    copyToArrayBuffer(signedTicketBytes(payloadSegment)),
  );
  return `${payloadSegment}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyRealtimeTicket(
  ticket: string,
  secret: RealtimeTicketSecret,
  expectation: RealtimeTicketExpectation,
): Promise<RealtimeTicketVerificationResult> {
  if (
    typeof ticket !== "string" ||
    ticket.length === 0 ||
    new TextEncoder().encode(ticket).byteLength > REALTIME_TICKET_MAX_BYTES
  ) {
    return { ok: false, code: "malformed" };
  }
  const parts = ticket.split(".");
  if (parts.length !== 2) {
    return { ok: false, code: "malformed" };
  }
  const [payloadSegment, signatureSegment] = parts;
  const payloadBytes = decodeBase64Url(payloadSegment);
  const signatureBytes = decodeBase64Url(signatureSegment);
  if (
    payloadBytes === null ||
    signatureBytes === null ||
    signatureBytes.byteLength !== 32
  ) {
    return { ok: false, code: "malformed" };
  }

  const key = await importHmacKey(secret, "verify");
  if (key === null) {
    return { ok: false, code: "invalid-secret" };
  }
  const signatureIsValid = await crypto.subtle.verify(
    "HMAC",
    key,
    copyToArrayBuffer(signatureBytes),
    copyToArrayBuffer(signedTicketBytes(payloadSegment)),
  );
  if (!signatureIsValid) {
    return { ok: false, code: "invalid-signature" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes),
    ) as unknown;
  } catch {
    return { ok: false, code: "invalid-claims" };
  }
  const claims = parseRealtimeTicketClaims(decoded);
  if (claims === null) {
    return { ok: false, code: "invalid-claims" };
  }
  const canonicalPayloadSegment = encodeBase64Url(
    encodeText(canonicalize(claims)),
  );
  if (canonicalPayloadSegment !== payloadSegment) {
    return { ok: false, code: "invalid-claims" };
  }

  if (
    claims.issuer !== expectation.issuer ||
    claims.audience !== expectation.audience ||
    claims.workId !== expectation.workId ||
    claims.roomId !== expectation.roomId ||
    claims.origin !== expectation.origin
  ) {
    return { ok: false, code: "binding-mismatch" };
  }
  if (
    claims.issuedAtMs >
    expectation.nowMs + REALTIME_TICKET_CLOCK_SKEW_MS
  ) {
    return { ok: false, code: "not-yet-valid" };
  }
  if (claims.expiresAtMs <= expectation.nowMs) {
    return { ok: false, code: "expired" };
  }
  return { ok: true, claims };
}

export function extractRealtimeTicketFromSubprotocols(
  header: string | null,
): RealtimeSubprotocolResult {
  if (header === null || header.length > REALTIME_TICKET_MAX_BYTES + 256) {
    return { ok: false };
  }
  const rawProtocols = header.split(",");
  if (
    rawProtocols.length !== 2 ||
    rawProtocols.some((protocol) => protocol.trim().length === 0)
  ) {
    return { ok: false };
  }
  const protocols = rawProtocols.map((protocol) => protocol.trim());
  if (
    protocols.filter(
      (protocol) => protocol === REALTIME_WEBSOCKET_PROTOCOL,
    ).length !== 1
  ) {
    return { ok: false };
  }
  const ticketProtocols = protocols.filter((protocol) =>
    protocol.startsWith(REALTIME_TICKET_PROTOCOL_PREFIX),
  );
  if (ticketProtocols.length !== 1) {
    return { ok: false };
  }
  const ticket = ticketProtocols[0].slice(
    REALTIME_TICKET_PROTOCOL_PREFIX.length,
  );
  return ticket.length > 0 ? { ok: true, ticket } : { ok: false };
}
