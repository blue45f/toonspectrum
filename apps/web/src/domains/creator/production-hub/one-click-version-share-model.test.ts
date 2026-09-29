// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  buildVersionShareUrl,
  createVersionShareLink,
  isVersionShareLinkExpired,
  listVersionShareLinks,
  revokeVersionShareLink,
  toExternalReviewPermission,
} from "./one-click-version-share-model";

const ARTIFACT = "test-artifact-ocvs";

beforeEach(() => {
  window.localStorage.clear();
});

describe("buildVersionShareUrl", () => {
  it("토큰으로 공유 URL을 만든다", () => {
    expect(buildVersionShareUrl("abc123", "https://example.com"))
      .toBe("https://example.com/share/version/abc123");
  });

  it("origin 끝의 슬래시를 정리한다", () => {
    expect(buildVersionShareUrl("abc123", "https://example.com///"))
      .toBe("https://example.com/share/version/abc123");
  });
});

describe("createVersionShareLink", () => {
  it("링크를 발급하고 기본 설정을 적용한다", () => {
    const link = createVersionShareLink(
      ARTIFACT,
      { snapshotId: "snap-1", snapshotName: "v1" },
      {},
      { token: "fixed-token-123456789012", origin: "https://example.com", now: "2026-09-30T00:00:00.000Z" },
    );
    expect(link).not.toBeNull();
    expect(link?.url).toBe("https://example.com/share/version/fixed-token-123456789012");
    expect(link?.settings.permission).toBe("comment");
    expect(link?.settings.expiresInDays).toBe(7);
    expect(link?.settings.watermark).toBe(true);
    expect(link?.settings.password).toBe("");
    expect(link?.expiresAt).toBe("2026-10-07T00:00:00.000Z");
    expect(link?.revoked).toBe(false);
  });

  it("만료 없음을 선택하면 expiresAt이 null이다", () => {
    const link = createVersionShareLink(
      ARTIFACT,
      { snapshotId: "snap-1", snapshotName: "v1" },
      { expiresInDays: 0 },
      { token: "t".repeat(24), origin: "https://example.com" },
    );
    expect(link?.expiresAt).toBeNull();
  });

  it("비밀번호와 권한을 저장한다", () => {
    const link = createVersionShareLink(
      ARTIFACT,
      { snapshotId: "snap-1", snapshotName: "v1" },
      { permission: "view", password: "secret123" },
      { token: "t".repeat(24), origin: "https://example.com" },
    );
    expect(link?.settings.permission).toBe("view");
    expect(link?.settings.password).toBe("secret123");
  });

  it("필수 값이 없으면 null을 반환한다", () => {
    expect(createVersionShareLink("", { snapshotId: "s", snapshotName: "v1" })).toBeNull();
    expect(createVersionShareLink(ARTIFACT, { snapshotId: "", snapshotName: "v1" })).toBeNull();
  });
});

describe("listVersionShareLinks / revokeVersionShareLink", () => {
  it("최신순으로 목록을 반환한다", () => {
    createVersionShareLink(ARTIFACT, { snapshotId: "s1", snapshotName: "v1" }, {},
      { token: "a".repeat(24), origin: "https://example.com", now: "2026-09-29T00:00:00.000Z" });
    createVersionShareLink(ARTIFACT, { snapshotId: "s2", snapshotName: "v2" }, {},
      { token: "b".repeat(24), origin: "https://example.com", now: "2026-09-30T00:00:00.000Z" });
    const links = listVersionShareLinks(ARTIFACT);
    expect(links).toHaveLength(2);
    expect(links[0]?.snapshotName).toBe("v2");
    expect(links[1]?.snapshotName).toBe("v1");
  });

  it("링크를 회수하면 revoked가 true가 된다", () => {
    const link = createVersionShareLink(ARTIFACT, { snapshotId: "s1", snapshotName: "v1" }, {},
      { token: "a".repeat(24), origin: "https://example.com" });
    const next = revokeVersionShareLink(ARTIFACT, link?.id ?? "");
    expect(next[0]?.revoked).toBe(true);
  });

  it("다른 artifact의 링크와 섞이지 않는다", () => {
    createVersionShareLink(ARTIFACT, { snapshotId: "s1", snapshotName: "v1" }, {},
      { token: "a".repeat(24), origin: "https://example.com" });
    expect(listVersionShareLinks("other-artifact")).toHaveLength(0);
  });
});

describe("isVersionShareLinkExpired", () => {
  it("만료일이 지나면 true", () => {
    const link = createVersionShareLink(ARTIFACT, { snapshotId: "s1", snapshotName: "v1" },
      { expiresInDays: 1 },
      { token: "a".repeat(24), origin: "https://example.com", now: "2026-09-01T00:00:00.000Z" });
    expect(isVersionShareLinkExpired(link!, "2026-09-03T00:00:00.000Z")).toBe(true);
    expect(isVersionShareLinkExpired(link!, "2026-09-01T12:00:00.000Z")).toBe(false);
  });

  it("회수된 링크는 만료로 취급한다", () => {
    const link = createVersionShareLink(ARTIFACT, { snapshotId: "s1", snapshotName: "v1" },
      { expiresInDays: 0 },
      { token: "a".repeat(24), origin: "https://example.com" });
    const revoked = revokeVersionShareLink(ARTIFACT, link!.id)[0]!;
    expect(isVersionShareLinkExpired(revoked)).toBe(true);
  });
});

describe("toExternalReviewPermission", () => {
  it("마법사 권한 프리셋으로 매핑한다", () => {
    expect(toExternalReviewPermission("view")).toBe("viewer");
    expect(toExternalReviewPermission("comment")).toBe("commenter");
    expect(toExternalReviewPermission("edit")).toBe("approver");
  });
});
