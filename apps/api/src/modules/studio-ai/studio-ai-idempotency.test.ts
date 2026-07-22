import { describe, expect, it } from "vitest";

import {
  parseStudioAiIdempotencyKey,
  STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS,
  studioAiCanonicalRequestHash,
  studioAiUserIdempotencyKeyHash,
} from "./studio-ai-idempotency";

import type { StudioAiChatDto } from "./studio-ai.dto";

const input = {
  task: "composition",
  promptVersion: 1,
  system: "구도를 제안하세요.",
  user: "교실 장면",
} as StudioAiChatDto;

describe("Studio AI durable idempotency identity", () => {
  it("keeps an ambiguity window well beyond the maximum provider timeout without blocking a day", () => {
    const maximumProviderTimeoutMs = 120_000;
    const leaseGraceMs = 15_000;
    expect(STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS).toBe(30 * 60 * 1_000);
    expect(STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS).toBeGreaterThan(
      (maximumProviderTimeoutMs + leaseGraceMs) * 10
    );
    expect(STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS).toBeLessThan(24 * 60 * 60 * 1_000);
  });

  it("accepts the exact bounded ASCII operation id and rejects ambiguous normalization", () => {
    const key = "composition-00000000-0000-4000-8000-000000000001";
    expect(parseStudioAiIdempotencyKey(key)).toBe(key);
    expect(() => parseStudioAiIdempotencyKey(` ${key}`)).toThrow(/Idempotency-Key/u);
    expect(() => parseStudioAiIdempotencyKey("short-key")).toThrow(/Idempotency-Key/u);
    expect(() => parseStudioAiIdempotencyKey(`composition-${"x".repeat(128)}`)).toThrow(
      /Idempotency-Key/u
    );
    expect(() => parseStudioAiIdempotencyKey("composition-key-with-한글-0001")).toThrow(
      /Idempotency-Key/u
    );
  });

  it("binds the opaque key to the authenticated user without storing either input", () => {
    const key = "composition-00000000-0000-4000-8000-000000000001";
    const first = studioAiUserIdempotencyKeyHash("user-a", key);
    const repeated = studioAiUserIdempotencyKeyHash("user-a", key);
    const otherUser = studioAiUserIdempotencyKeyHash("user-b", key);
    expect(first).toEqual(repeated);
    expect(first).toHaveLength(32);
    expect(otherUser).not.toEqual(first);
    expect(Buffer.from(first).toString("hex")).not.toContain("composition");
  });

  it("canonicalizes omitted provider to auto and changes on any paid request field", () => {
    const base = studioAiCanonicalRequestHash(input);
    expect(base).toEqual(studioAiCanonicalRequestHash({ ...input, provider: "auto" }));
    expect(base).not.toEqual(studioAiCanonicalRequestHash({ ...input, provider: "deepseek" }));
    expect(base).not.toEqual(studioAiCanonicalRequestHash({ ...input, user: "다른 장면" }));
    expect(base).toHaveLength(32);
  });
});
