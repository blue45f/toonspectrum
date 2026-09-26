import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("database outage response contracts", () => {
  it("returns explicit 503 contracts for account and review endpoints", () => {
    const reviews = source("apps/api/src/server/reviews.ts");
    const me = source("apps/api/src/server/me.ts");
    const catalog = source("apps/api/src/modules/catalog/catalog.service.ts");

    expect(reviews).toContain('withDatabaseCapability("community.reviews.read"');
    expect(catalog).toContain('withDatabaseCapability("catalog.reviews.read"');
    expect(me).toContain('withDatabaseCapability("account.library.read"');
    expect(reviews).not.toContain("빈 목록 폴백");
    expect(me).not.toContain("빈 데이터로 폴백");
  });

  it("names partial review data instead of rendering an empty-state lie", () => {
    const titleServer = source("apps/api/src/server/title.ts");
    const titlePage = source("apps/web/src/domains/catalog/TitleDetailPage.tsx");
    const homePage = source("apps/web/src/domains/catalog/HomePage.tsx");

    expect(titleServer).toContain("reviewsStatus: reviewLoad.status");
    expect(titleServer).toContain("isDatabaseAvailabilityError(error)");
    expect(titlePage).toContain('data.reviewsStatus !== "unavailable"');
    expect(titlePage).toContain("리뷰 목록이 비어 있다는 뜻은 아닙니다");
    expect(homePage).toContain('data.reviewsStatus === "unavailable"');
  });

  it("does not turn creator directory or schema-dependent filters into empty success", () => {
    const follows = source("apps/api/src/server/creator/follows.ts");
    const works = source("apps/api/src/server/creator/works.ts");

    expect(follows).toContain('withDatabaseCapability("creator.directory.read"');
    expect(works).not.toContain(
      "if (!ready && (opts.seriesId || opts.challengeId || opts.followedBy)) return [];",
    );
    expect(works).toContain('code: "SCHEMA_NOT_READY"');
  });
});
