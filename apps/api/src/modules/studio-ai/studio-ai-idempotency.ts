import { createHash } from "node:crypto";

import type { StudioAiChatDto } from "./studio-ai.dto";

export const STUDIO_AI_IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const STUDIO_AI_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
/**
 * Replay protection intentionally outlives the maximum 120 s provider timeout plus the 15 s
 * fenced-lease grace by more than 13x, while allowing a creator to deliberately repeat identical
 * work later instead of suppressing the same prompt for an entire day.
 */
export const STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS = 30 * 60 * 1_000;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
const SHA256_BYTES = 32;

export class StudioAiIdempotencyKeyError extends TypeError {
  constructor() {
    super(
      `Studio AI Idempotency-Key must be ${STUDIO_AI_IDEMPOTENCY_KEY_MIN_LENGTH}-${STUDIO_AI_IDEMPOTENCY_KEY_MAX_LENGTH} ASCII characters.`
    );
    this.name = "StudioAiIdempotencyKeyError";
  }
}

/**
 * Accept one exact opaque HTTP key. Whitespace folding, truncation, or Unicode normalization would
 * let two callers disagree about which durable receipt owns a paid request, so invalid keys fail
 * before quota reservation or provider I/O.
 */
export function parseStudioAiIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length < STUDIO_AI_IDEMPOTENCY_KEY_MIN_LENGTH
    || value.length > STUDIO_AI_IDEMPOTENCY_KEY_MAX_LENGTH
    || !IDEMPOTENCY_KEY_PATTERN.test(value)
  ) {
    throw new StudioAiIdempotencyKeyError();
  }
  return value;
}

function digestCanonicalTuple(value: readonly unknown[]): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    createHash("sha256").update(JSON.stringify(value), "utf8").digest()
  );
}

/** The database receives only this user-bound digest, never the raw operation key. */
export function studioAiUserIdempotencyKeyHash(userId: string, key: string): Uint8Array<ArrayBuffer> {
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new TypeError("Studio AI idempotency requires an authenticated user id.");
  }
  return digestCanonicalTuple(["toonspectrum-studio-ai-user-key-v1", userId, parseStudioAiIdempotencyKey(key)]);
}

/**
 * Hash the exact validated provider request without retaining prompt text. Fixed tuple order avoids
 * object-key-order ambiguity; an omitted provider is canonically identical to explicit `auto`.
 */
export function studioAiCanonicalRequestHash(input: StudioAiChatDto): Uint8Array<ArrayBuffer> {
  return digestCanonicalTuple([
    "toonspectrum-studio-ai-request-v1",
    input.task,
    input.provider ?? "auto",
    input.promptVersion,
    input.system,
    input.user,
  ]);
}

export function isStudioAiSha256Digest(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.byteLength === SHA256_BYTES;
}
