import { describe, expect, it } from "vitest";

import { buildDirectMessageKey } from "./messaging.repository";

describe("buildDirectMessageKey", () => {
  it("is stable regardless of member order", () => {
    expect(buildDirectMessageKey("member-a", "member-b")).toBe(
      buildDirectMessageKey("member-b", "member-a"),
    );
  });

  it("returns a non-reversible SHA-256 key", () => {
    expect(buildDirectMessageKey("member-a", "member-b")).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("keeps ambiguous concatenations distinct", () => {
    expect(buildDirectMessageKey("ab", "c")).not.toBe(
      buildDirectMessageKey("a", "bc"),
    );
  });
});
