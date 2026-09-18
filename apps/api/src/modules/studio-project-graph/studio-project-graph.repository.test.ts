import { describe, expect, it } from "vitest";

import {
  studioIdempotencyKeyHash,
  studioRequestHash,
  studioUnreadyBlobHashes,
} from "./studio-project-graph.repository";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

describe("Studio ProjectGraph deterministic mutation contracts", () => {
  it("hashes canonical request JSON independent of object key order", () => {
    expect(studioRequestHash({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(studioRequestHash({ a: { c: 3, d: 4 }, b: 2 }));
    expect(studioRequestHash({ a: 1 })).not.toBe(studioRequestHash({ a: 2 }));
  });

  it("never stores a raw idempotency key", () => {
    const digest = studioIdempotencyKeyHash("request-1234");
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(digest).not.toContain("request-1234");
  });
});

describe("Studio blob readiness", () => {
  const cleanValid = {
    hash: HASH_A,
    malwareStatus: "clean",
    formatStatus: "valid",
  };

  it("accepts scanned valid blobs for every revision role", () => {
    expect(studioUnreadyBlobHashes(
      [{ sha256: HASH_A, role: "graph" }],
      [cleanValid],
    )).toEqual([]);
  });

  it("preserves an unsupported original source without treating it as editable", () => {
    const unsupported = {
      hash: HASH_B,
      malwareStatus: "clean",
      formatStatus: "unsupported",
    };
    expect(studioUnreadyBlobHashes(
      [{ sha256: HASH_B, role: "source" }],
      [unsupported],
    )).toEqual([]);
    expect(studioUnreadyBlobHashes(
      [{ sha256: HASH_B, role: "graph" }],
      [unsupported],
    )).toEqual([HASH_B]);
  });

  it("blocks missing, unscanned, or infected content exactly once per hash", () => {
    expect(studioUnreadyBlobHashes(
      [
        { sha256: HASH_A, role: "graph" },
        { sha256: HASH_B, role: "tile" },
        { sha256: HASH_B, role: "preview" },
        { sha256: HASH_C, role: "source" },
      ],
      [
        cleanValid,
        { hash: HASH_B, malwareStatus: "pending", formatStatus: "valid" },
      ],
    )).toEqual([HASH_B, HASH_C]);
  });
});
