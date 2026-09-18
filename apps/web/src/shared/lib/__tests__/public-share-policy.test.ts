import { describe, expect, it } from "vitest";

import {
  canShareCollaborationPost,
  canShareCreatorSeries,
  canShareCreatorWork,
  canShareCommunityCafe,
  canShareCommunityPost,
  canSharePromotionPost,
  compactPublicShareDescription,
  publicShareImageUrl,
} from "../public-share-policy";

describe("public share policy", () => {
  it("normalizes public descriptions without exposing unlimited text", () => {
    const text = `  소개\n\n${"내용 ".repeat(80)}`;
    const description = compactPublicShareDescription(text, "대체 설명");
    expect(description.startsWith("소개 내용")).toBe(true);
    expect(description.length).toBeLessThanOrEqual(200);
    expect(compactPublicShareDescription("   ", "대체 설명")).toBe("대체 설명");
  });

  it("keeps only secure, externally usable preview images", () => {
    expect(publicShareImageUrl("/brand/toonstudio-og.png")).toBe("/brand/toonstudio-og.png");
    expect(publicShareImageUrl("https://cdn.example.com/cover.jpg"))
      .toBe("https://cdn.example.com/cover.jpg");
    expect(publicShareImageUrl("//evil.example/cover.jpg")).toBeUndefined();
    expect(publicShareImageUrl("/\\evil.example/cover.jpg")).toBeUndefined();
    // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
    expect(publicShareImageUrl("https://user:pass@example.com/cover.jpg")).toBeUndefined();
    expect(publicShareImageUrl("data:image/jpeg;base64,abc")).toBeUndefined();
    expect(publicShareImageUrl("http://example.com/cover.jpg")).toBeUndefined();
  });

  it("blocks surfaces whose public visibility cannot be guaranteed", () => {
    expect(canShareCommunityPost({ scope: "title" })).toBe(true);
    expect(canShareCommunityPost({ scope: "cafe" })).toBe(false);
    expect(canShareCommunityCafe({ visibility: "public", status: "active" })).toBe(true);
    expect(canShareCommunityCafe({ visibility: "private", status: "active" })).toBe(false);
    expect(canShareCommunityCafe({ visibility: "public", status: "archived" })).toBe(false);
  });

  it("shares published creator work and series while keeping drafts and private work closed", () => {
    expect(canShareCreatorWork({ status: "published" }, { visibility: "public" })).toBe(true);
    expect(canShareCreatorWork({ status: "published" }, { visibility: "unlisted" })).toBe(true);
    expect(canShareCreatorWork({ status: "published" }, { visibility: "private" })).toBe(false);
    expect(canShareCreatorWork({ status: "draft" }, { visibility: "public" })).toBe(false);
    expect(canShareCreatorSeries([{ status: "draft" }, { status: "published" }])).toBe(true);
    expect(canShareCreatorSeries([{ status: "draft" }])).toBe(false);
  });

  it("shares only live promotion and collaboration opportunities", () => {
    expect(canSharePromotionPost({ hidden: false, archived: false })).toBe(true);
    expect(canSharePromotionPost({ hidden: true, archived: false })).toBe(false);
    expect(canShareCollaborationPost({ hidden: false, status: "open", expired: false })).toBe(true);
    expect(canShareCollaborationPost({ hidden: false, status: "closed", expired: false })).toBe(false);
    expect(canShareCollaborationPost({ hidden: false, status: "open", expired: true })).toBe(false);
  });
});
