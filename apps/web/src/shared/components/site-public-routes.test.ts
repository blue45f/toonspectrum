import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { isDiscoverPurposeRoute, isPublicCreativeRoute, supportsPublicSiteOnwardJourney } from "./site-public-routes";

describe("public creative chrome route boundaries", () => {
  it("라우터와 같은 대소문자 규칙으로 공개·개인·정책 동선을 분류한다", () => {
    for (const pathname of ["/MARKET/", "/Learn/Lessons/Ink", "/Community/Post/ABC"]) {
      expect(isPublicCreativeRoute(pathname)).toBe(true);
      expect(supportsPublicSiteOnwardJourney(pathname)).toBe(true);
    }
    for (const pathname of ["/COLLABORATE/NEW/", "/Community/Promote/Moderation", "/MARKET/MANAGE"]) {
      expect(isPublicCreativeRoute(pathname)).toBe(false);
      expect(supportsPublicSiteOnwardJourney(pathname)).toBe(false);
    }
    expect(isPublicCreativeRoute("/PRIVACY/")).toBe(true);
    expect(supportsPublicSiteOnwardJourney("/PRIVACY/")).toBe(false);
    expect(isDiscoverPurposeRoute("/TITLE/ABC/")).toBe(true);
    expect(isDiscoverPurposeRoute("/TITLES-IN-PROGRESS")).toBe(false);
  });
  it.each(["/terms", "/privacy", "/copyright", "/terms/", "/privacy/", "/copyright/"])("정책 %s의 공개 셸은 유지하고 홍보 여정만 제외한다", (pathname) => {
    expect(isPublicCreativeRoute(pathname)).toBe(true);
    expect(supportsPublicSiteOnwardJourney(pathname)).toBe(false);
  });

  it.each(["/discover", "/learn", "/market", "/community"])("공개 창작 목적지 %s의 다음 탐색은 유지한다", (pathname) => {
    expect(supportsPublicSiteOnwardJourney(pathname)).toBe(true);
  });

  it.each([
    "/", "/about", "/about/", "/help", "/support", "/contact", "/business", "/collaborate", "/creators", "/research/assets",
    "/learn", "/learn/process", "/learn/careers", "/learn/education", "/learn/resources", "/learn/classroom", "/learn/classes",
    "/learn/lessons/panel-pacing", "/learn/paths/webtoon", "/market/browse",
    "/market/resource/brush-1", "/showcase/work/work-1", "/showcase/reviews",
    "/showcase/reviews/11111111-1111-4111-8111-111111111111", "/community/cafes/comics",
    "/about/technology/playbook", "/learn/trace", "/learn/trace/",
    "/research/catalog", "/research/open-creation", "/research/packs",
    "/ecosystem/education", "/ecosystem/collaboration", "/ecosystem/fandom", "/ecosystem/library",
    "/collaborate/positions", "/collaborate/gallery", "/collaborate/public-post",
    "/community/events", "/community/promote", "/community/promote/public-post",
    "/u/public-creator", "/create/legacy-work",
    "/accessibility", "/design", "/terms", "/privacy", "/copyright", "/feedback", "/developers",
  ])("keeps the creative journey on public destination %s", (pathname) => {
    expect(isPublicCreativeRoute(pathname)).toBe(true);
  });

  it.each([
    "/my", "/settings", "/library", "/auth/callback", "/market/library", "/market/manage",
    "/market/publish", "/market/wishlist", "/learn/records", "/studio", "/studio/new",
    "/production/pinned-review",
    "/does-not-exist", "/about/does-not-exist", "/market/does-not-exist", "/learn/does-not-exist",
    "/community/does-not-exist", "/community/all", "/research/does-not-exist", "/title/a/edit",
    "/collaborate/new", "/collaborate/new/", "/collaborate/workspace", "/collaborate/moderation",
    "/collaborate/public-post/edit", "/community/promote/new", "/community/promote/new/",
    "/community/promote/moderation", "/community/promote/public-post/edit",
    "/community/cafes/comics/manage", "/u/public-creator/edit", "/research/catalog/notebook",
    "/lists/shared-snapshot", "/ecosystem/does-not-exist", "/production/review/project/review",
    "/notifications", "/onboarding/taste", "/settings/integrations", "/automation", "/publish",
  ])("keeps promotion out of account, editing and unknown route %s", (pathname) => {
    expect(isPublicCreativeRoute(pathname)).toBe(false);
  });

  it.each(["/references", "/calendar", "/compare", "/random", "/tags", "/authors", "/author/artist", "/title/a-story"])(
    "classifies %s consistently as public discovery", (pathname) => {
      expect(isPublicCreativeRoute(pathname)).toBe(true);
      expect(isDiscoverPurposeRoute(pathname)).toBe(true);
    },
  );

  it("does not confuse a partial prefix or an account library with discovery", () => {
    expect(isDiscoverPurposeRoute("/titles-in-progress")).toBe(false);
    expect(isDiscoverPurposeRoute("/library")).toBe(false);
  });

  it("등록된 공개 정책·지원 문서를 작업 공간 셸로 보내지 않는다", () => {
    const source = readFileSync(new URL("../../app/routes/groups/legal.routes.tsx", import.meta.url), "utf8");
    const paths = [...source.matchAll(/\bpath:\s*"([^"]+)"/gu)].map((match) => match[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const pathname of paths) {
      expect(isPublicCreativeRoute(pathname), pathname).toBe(true);
    }
  });
});
