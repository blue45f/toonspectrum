import { describe, expect, it, vi } from "vitest";

import {
  accountMergeDedupePolicyForReference,
  findProviderOverlap,
  isAccountMergeToken,
  maskAccountMergeEmail,
  normalizeAccountMergeProfilePreference,
  shouldTransferUserReference,
} from "./account-merge";

vi.mock("../db", () => ({ dbPool: {} }));

describe("account merge policy", () => {
  it("accepts only bounded base64url merge codes", () => {
    expect(isAccountMergeToken("a".repeat(43))).toBe(true);
    expect(isAccountMergeToken("a".repeat(42))).toBe(false);
    expect(isAccountMergeToken("a".repeat(44))).toBe(false);
    expect(isAccountMergeToken("a".repeat(42) + "+")).toBe(false);
  });

  it("masks contact email without changing the domain", () => {
    expect(maskAccountMergeEmail("creator@example.com")).toBe("cr*****@example.com");
    expect(maskAccountMergeEmail("a@example.com")).toBe("a***@example.com");
    expect(maskAccountMergeEmail(null)).toBeNull();
  });

  it("keeps immutable audit references on the source alias", () => {
    expect(shouldTransferUserReference({
      schemaName: "public",
      tableName: "production_project_event",
      columnName: "userId",
    })).toBe(false);
    expect(shouldTransferUserReference({
      schemaName: "public",
      tableName: "creator_work_report",
      columnName: "userId",
    })).toBe(false);
    expect(shouldTransferUserReference({
      schemaName: "public",
      tableName: "creator_work",
      columnName: "userId",
    })).toBe(true);
    expect(shouldTransferUserReference({
      schemaName: "public",
      tableName: "account",
      columnName: "userId",
    })).toBe(false);
  });

  it("detects provider collisions deterministically", () => {
    expect(
      findProviderOverlap(["google", "kakao", "google"], ["github", "google"]),
    ).toEqual(["google"]);
    expect(findProviderOverlap(["naver"], ["google"])).toEqual([]);
  });
  it("deduplicates only set-like relationship rows", () => {
    expect(accountMergeDedupePolicyForReference({
      schemaName: "public",
      tableName: "creator_work_bookmark",
      columnName: "userId",
    })).toMatchObject({ keyColumns: ["workId"] });
    expect(accountMergeDedupePolicyForReference({
      schemaName: "public",
      tableName: "creator_follow",
      columnName: "followerId",
    })).toMatchObject({ keyColumns: ["creatorId"], peerUserColumn: "creatorId" });
    expect(accountMergeDedupePolicyForReference({
      schemaName: "public",
      tableName: "rating",
      columnName: "userId",
    })).toBeNull();
  });

  it("defaults profile ownership to the target account", () => {
    expect(normalizeAccountMergeProfilePreference("source")).toBe("source");
    expect(normalizeAccountMergeProfilePreference("target")).toBe("target");
    expect(normalizeAccountMergeProfilePreference("unexpected")).toBe("target");
    expect(normalizeAccountMergeProfilePreference(null)).toBe("target");
  });

});
