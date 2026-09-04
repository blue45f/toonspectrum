import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const serviceSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/api/src/modules/creator-marketplace/creator-marketplace-social.service.ts",
  ),
  "utf8",
);

describe("CreatorMarketplaceSocialService policy boundary", () => {
  it("uses the public marketplace service as the resource visibility authority", () => {
    expect(serviceSource).toContain("private readonly marketplaceService: CreatorMarketplaceService");
    expect(serviceSource).toContain("return this.marketplaceService.getById(resourceId)");
  });

  it("requires server-owned acquisition evidence and blocks self reviews", () => {
    expect(serviceSource).toContain("if (resource.publisher.id === userId)");
    expect(serviceSource).toContain("배급자는 자신의 리소스를 평가할 수 없습니다.");
    expect(serviceSource).toContain("계정 라이브러리에 리소스를 추가한 뒤 평가할 수 있습니다.");
    expect(serviceSource).toContain("creatorMarketplaceLibraryItems.lastConfirmedAt");
    expect(serviceSource).toContain("creatorMarketplaceLibraryItems.lastConfirmedResourceVersion");
  });

  it("derives trust badges from publisher, library, and confirmed Studio install state", () => {
    expect(serviceSource).toContain('return "publisher"');
    expect(serviceSource).toContain('return "studio-verified"');
    expect(serviceSource).toContain('return "library-member"');
    expect(serviceSource).toContain("studioInstallVerified: Boolean(");
  });

  it("reuses the mature review, reply, and reaction relations behind a private namespace", () => {
    expect(serviceSource).toContain('const MARKET_SOCIAL_KEY_PREFIX = "toonspectrum:market-package:"');
    expect(serviceSource).toContain("reviewLikes");
    expect(serviceSource).toContain("reviewReplies");
    expect(serviceSource).toContain("reviews");
  });

  it("keeps deletion permission-aware and removes deleted author identity", () => {
    expect(serviceSource).toContain('id: "deleted"');
    expect(serviceSource).toContain('name: "삭제됨"');
    expect(serviceSource).toContain("isAdminUser");
    expect(serviceSource).toContain("canDelete:");
    expect(serviceSource).toContain("deletedAt");
  });

  it("uses a bounded reply budget larger than the root page", () => {
    expect(serviceSource).toContain("const replyLimit = rootLimit * 5");
    expect(serviceSource).toContain(".limit(replyLimit + 1)");
    expect(serviceSource).toContain("replyRows.length > replyLimit");
  });

  it("preserves original review chronology when a reviewer edits their review", () => {
    const conflictUpdate = serviceSource.slice(
      serviceSource.indexOf(".onConflictDoUpdate({"),
      serviceSource.indexOf("return this.page(resourceId, userId);", serviceSource.indexOf(".onConflictDoUpdate({")),
    );
    expect(conflictUpdate).not.toContain("createdAt: new Date()");
  });
});
