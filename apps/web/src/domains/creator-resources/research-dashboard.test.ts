import { describe, expect, it } from "vitest";

import {
  buildResearchBriefMarkdown,
  isResearchQueryValid,
  normalizeResearchQuery,
  researchNextAction,
  researchSearchHref,
  sourceFreshness,
  summarizeResearchWorkspace,
} from "./research-dashboard";

import type { CreatorResource, CreatorWorkspace } from "@/shared/lib/creator-resources";

function resource(options: Partial<CreatorResource> & Pick<CreatorResource, "id" | "provider" | "title">): CreatorResource {
  const sourceUrl = options.provider === "met"
    ? "https://www.metmuseum.org/art/collection/search/1"
    : options.provider === "bizinfo"
      ? "https://www.bizinfo.go.kr/example"
      : options.provider === "openbd"
        ? "https://openbd.jp/"
        : options.provider === "kakao"
          ? "https://book.daum.net/detail/book.do?bookid=1"
          : "https://openlibrary.org/works/OL1W";
  return {
    creator: "Creator",
    description: "Reference description",
    sourceUrl,
    license: options.provider === "met" ? "CC0" : options.provider === "openbd" ? "book-promotion" : "metadata-only",
    licenseUrl: "",
    credit: "Provider",
    fetchedAt: "2026-09-08T00:00:00.000Z",
    ...options,
  };
}

function workspace(values: Partial<CreatorWorkspace> = {}): CreatorWorkspace {
  return { version: 1, saved: [], story: {}, checks: [], ...values };
}

describe("research dashboard query routing", () => {
  it("normalizes shareable searches and keeps provider-specific destinations", () => {
    expect(normalizeResearchQuery("  조선   후기  복식 ")).toBe("조선 후기 복식");
    expect(isResearchQueryValid("한")).toBe(false);
    expect(isResearchQueryValid("판본 비교")).toBe(true);
    expect(researchSearchHref("assets", " 조선 후기 복식 ")).toBe("/research/assets?q=%EC%A1%B0%EC%84%A0+%ED%9B%84%EA%B8%B0+%EB%B3%B5%EC%8B%9D&page=1");
    expect(researchSearchHref("books", "Alice & Bob")).toBe("/research/books?q=Alice+%26+Bob&page=1");
    expect(researchSearchHref("opportunities", "웹툰 지원")).toContain("/opportunities?q=");
  });
});

describe("research dashboard summaries", () => {
  const now = new Date("2026-09-09T03:00:00.000Z");

  it("summarizes source diversity, freshness, story progress, and upcoming deadlines without inventing readiness", () => {
    const value = workspace({
      saved: [
        resource({ id: "met:1", provider: "met", title: "Costume", fetchedAt: "2026-09-08T00:00:00.000Z" }),
        resource({ id: "openlibrary:1", provider: "openlibrary", title: "Edition", fetchedAt: "2026-01-01T00:00:00.000Z" }),
        resource({ id: "bizinfo:1", provider: "bizinfo", title: "Grant", fetchedAt: "2026-08-30T00:00:00.000Z", deadline: "2026-09-20" }),
      ],
      story: { title: "Night Train", protagonist: "Mina", desire: "Escape", obstacle: "Closed border" },
      checks: ["publish-rights", "recipe-lighting-0"],
    });
    const summary = summarizeResearchWorkspace(value, now);
    expect(summary).toMatchObject({
      savedCount: 3,
      providerCount: 3,
      publicDomainCount: 1,
      rightsReviewCount: 2,
      staleCount: 2,
      storyCompleted: 4,
      publishingCompleted: 1,
      recipeCompleted: 1,
      upcomingDeadlineCount: 1,
      completedStages: 4,
    });
    expect(summary.nearestDeadline?.title).toBe("Grant");
    expect(summary.providerBreakdown.map((entry) => entry.provider)).toEqual(["met", "openlibrary", "bizinfo"]);
  });

  it("uses provider-specific review windows and clearly labels stale sources", () => {
    const grant = resource({ id: "bizinfo:1", provider: "bizinfo", title: "Grant", fetchedAt: "2026-09-01T03:00:00.000Z" });
    const museum = resource({ id: "met:1", provider: "met", title: "Museum", fetchedAt: "2026-09-01T03:00:00.000Z" });
    expect(sourceFreshness(grant, now)).toMatchObject({ ageDays: 8, thresholdDays: 7, needsReview: true });
    expect(sourceFreshness(grant, now).label).toContain("재확인 권장");
    expect(sourceFreshness(museum, now)).toMatchObject({ ageDays: 8, thresholdDays: 180, needsReview: false });
  });
});

describe("research dashboard next action and exports", () => {
  it("moves from capture to comparison, story shaping, review, publishing, and studio", () => {
    const empty = summarizeResearchWorkspace(workspace(), new Date("2026-09-09T00:00:00.000Z"));
    expect(researchNextAction(empty).href).toBe("/research/assets");

    const oneSource = summarizeResearchWorkspace(workspace({ saved: [resource({ id: "met:1", provider: "met", title: "Costume" })] }), new Date("2026-09-09T00:00:00.000Z"));
    expect(researchNextAction(oneSource).href).toBe("/research/books");

    const sources = [
      resource({ id: "met:1", provider: "met", title: "Costume" }),
      resource({ id: "met:2", provider: "met", title: "Station" }),
      resource({ id: "openlibrary:1", provider: "openlibrary", title: "Edition" }),
    ];
    const noStory = summarizeResearchWorkspace(workspace({ saved: sources }), new Date("2026-09-09T00:00:00.000Z"));
    expect(researchNextAction(noStory).href).toBe("/story-lab");

    const shaped = workspace({ saved: sources, story: { title: "A", protagonist: "B", desire: "C", obstacle: "D" } });
    const needsPublishing = summarizeResearchWorkspace(shaped, new Date("2026-09-09T00:00:00.000Z"));
    expect(researchNextAction(needsPublishing).href).toBe("/publishing");

    const ready = summarizeResearchWorkspace({ ...shaped, checks: ["publish-rights"] }, new Date("2026-09-09T00:00:00.000Z"));
    expect(researchNextAction(ready)).toMatchObject({ href: "/studio", reloadDocument: true });
  });

  it("exports a deterministic brief with the user's story, source attribution, and limitations", () => {
    const value = workspace({
      saved: [resource({ id: "met:1", provider: "met", title: "Costume reference" })],
      story: { title: "Night Train", protagonist: "Mina" },
    });
    const markdown = buildResearchBriefMarkdown(value, new Date("2026-09-09T03:00:00.000Z"));
    expect(markdown).toContain("# ToonStudio 창작 리서치 브리프");
    expect(markdown).toContain("Night Train");
    expect(markdown).toContain("Costume reference");
    expect(markdown).toContain("https://www.metmuseum.org/art/collection/search/1");
    expect(markdown).toContain("권리 허가서나 법률 검토를 대신하지 않습니다");
  });
});
