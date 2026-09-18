import { describe, expect, it } from "vitest";

import {
  createWebtoonAdaptationPlan,
  creatorAgePolicy,
  matchAssistantCandidates,
  normalizeCreatorGrowthIpState,
  type AssistantCandidate,
  type WebNovelChapter,
} from "./creator-growth-ip-model";

describe("creator growth/IP age policy", () => {
  it("keeps sensitive capabilities closed until age is known", () => {
    expect(creatorAgePolicy("unknown", "assistant-hiring").allowed).toBe(false);
    expect(creatorAgePolicy("unknown", "rights-offers").allowed).toBe(false);
    expect(creatorAgePolicy("unknown", "mature-content").allowed).toBe(false);
  });

  it("requires adult review paths for minors and opens adult capabilities", () => {
    const childRights = creatorAgePolicy("under-14", "rights-offers");
    expect(childRights.allowed).toBe(false);
    expect(childRights.guardianRequired).toBe(true);
    expect(creatorAgePolicy("18-plus", "assistant-hiring").allowed).toBe(true);
    expect(creatorAgePolicy("18-plus", "payments").allowed).toBe(true);
  });
});

describe("assistant sourcing", () => {
  const candidates: AssistantCandidate[] = [
    {
      id: "a",
      displayName: "A",
      roles: ["flat-color", "background"],
      languages: ["ko", "en"],
      region: "Vietnam",
      timezoneOverlapHours: 5,
      hourlyUsd: 12,
      portfolioUrl: "https://example.com/a",
      verified: true,
    },
    {
      id: "b",
      displayName: "B",
      roles: ["lettering"],
      languages: ["en"],
      region: "Philippines",
      timezoneOverlapHours: 2,
      hourlyUsd: 30,
      portfolioUrl: "https://example.com/b",
      verified: false,
    },
  ];

  it("ranks role, language, time, budget and verification matches", () => {
    const matches = matchAssistantCandidates({
      roles: ["flat-color"],
      languages: ["ko", "en"],
      regions: ["Vietnam"],
      timezoneOverlapHours: 3,
      maxHourlyUsd: 20,
    }, candidates);

    expect(matches[0]?.id).toBe("a");
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0);
    expect(matches[0]?.reasons.join(" ")).toContain("역할");
  });
});

describe("web novel adaptation", () => {
  const chapters: WebNovelChapter[] = [
    { id: "c1", title: "1장", summary: "주인공이 사건을 발견한다.", wordCount: 3200, status: "draft" },
    { id: "c2", title: "2장", summary: "첫 단서가 뒤집힌다.", wordCount: 2800, status: "review" },
    { id: "c3", title: "3장", summary: "새로운 적이 등장한다.", wordCount: 3000, status: "draft" },
  ];

  it("groups source chapters into editable webtoon episode plans without mutation", () => {
    const before = structuredClone(chapters);
    const episodes = createWebtoonAdaptationPlan(chapters, 2);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]?.sourceChapterIds).toEqual(["c1", "c2"]);
    expect(episodes[1]?.sourceChapterIds).toEqual(["c3"]);
    expect(chapters).toEqual(before);
  });
});

describe("persisted state normalization", () => {
  it("drops unsafe URLs and malformed records while preserving valid creator data", () => {
    const state = normalizeCreatorGrowthIpState({
      ageBand: "18-plus",
      rookieProfiles: [{
        id: "creator-1",
        penName: "New Artist",
        stage: "rookie",
        genres: ["fantasy", "fantasy"],
        portfolioUrl: "javascript:alert(1)",
        goal: "debut",
        discoveryStatus: "discoverable",
      }],
      assistantCandidates: [{
        id: "assistant-1",
        displayName: "Helper",
        roles: ["flat-color"],
        languages: ["en"],
        region: "Vietnam",
        timezoneOverlapHours: 4,
        hourlyUsd: 10,
        portfolioUrl: "https://example.com/portfolio",
        verified: true,
      }, null],
    });

    expect(state.ageBand).toBe("18-plus");
    expect(state.rookieProfiles[0]?.portfolioUrl).toBe("");
    expect(state.rookieProfiles[0]?.genres).toEqual(["fantasy"]);
    expect(state.assistantCandidates).toHaveLength(1);
    expect(state.assistantCandidates[0]?.portfolioUrl).toContain("https://example.com/portfolio");
  });
});
