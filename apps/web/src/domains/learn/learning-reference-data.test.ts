import { describe, expect, it } from "vitest";

import {
  EDUCATION_INSTITUTIONS,
  EDUCATION_REGIONS,
  WEBTOON_CAREER_ROLES,
  WEBTOON_PROCESS_STEPS,
  filterEducationInstitutions,
} from "./learning-reference-data";

describe("webtoon production reference data", () => {
  it("keeps production steps sequential, actionable and linked", () => {
    expect(WEBTOON_PROCESS_STEPS).toHaveLength(9);
    expect(WEBTOON_PROCESS_STEPS.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(WEBTOON_PROCESS_STEPS.map((step) => step.id)).size).toBe(WEBTOON_PROCESS_STEPS.length);

    for (const step of WEBTOON_PROCESS_STEPS) {
      expect(step.tasks.length).toBeGreaterThanOrEqual(3);
      expect(step.outputs.length).toBeGreaterThanOrEqual(3);
      expect(step.roleIds.length).toBeGreaterThan(0);
      expect(step.studioHref).toMatch(/^\//u);
      expect(step.beginnerNote.length).toBeGreaterThan(20);
    }
  });

  it("connects every career role to real production steps", () => {
    const stepIds = new Set(WEBTOON_PROCESS_STEPS.map((step) => step.id));
    expect(new Set(WEBTOON_CAREER_ROLES.map((role) => role.id)).size).toBe(WEBTOON_CAREER_ROLES.length);

    for (const role of WEBTOON_CAREER_ROLES) {
      expect(role.responsibilities.length).toBeGreaterThanOrEqual(3);
      expect(role.skills.length).toBeGreaterThanOrEqual(3);
      expect(role.portfolioEvidence.length).toBeGreaterThanOrEqual(3);
      expect(role.processStepIds.length).toBeGreaterThan(0);
      expect(role.processStepIds.every((stepId) => stepIds.has(stepId))).toBe(true);
    }
  });
});

describe("webtoon education directory", () => {
  it("keeps a unique, manually verified official-source registry", () => {
    expect(EDUCATION_INSTITUTIONS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(EDUCATION_INSTITUTIONS.map((institution) => institution.id)).size).toBe(EDUCATION_INSTITUTIONS.length);

    for (const institution of EDUCATION_INSTITUTIONS) {
      const url = new URL(institution.officialUrl);
      expect(url.protocol).toBe("https:");
      expect(url.hostname.length).toBeGreaterThan(3);
      expect(institution.verifiedAt).toBe("2026-09-16");
      expect((EDUCATION_REGIONS as readonly string[]).includes(institution.region)).toBe(true);
      expect(institution.delivery.length).toBeGreaterThan(0);
      expect(institution.goals.length).toBeGreaterThan(0);
      expect(institution.focus.length).toBeGreaterThan(0);
    }
  });

  it("combines query, type, region, delivery and purpose filters", () => {
    const universitiesInSeoul = filterEducationInstitutions({ kind: "university", region: "서울", goal: "portfolio" });
    expect(universitiesInSeoul.length).toBeGreaterThan(0);
    expect(universitiesInSeoul.every((institution) => institution.kind === "university" && institution.region === "서울" && institution.goals.includes("portfolio"))).toBe(true);

    const onlinePublicLearning = filterEducationInstitutions({ delivery: "online", query: "콘텐츠" });
    expect(onlinePublicLearning.length).toBeGreaterThan(0);
    expect(onlinePublicLearning.every((institution) => institution.delivery.includes("online"))).toBe(true);

    const pdPrograms = filterEducationInstitutions({ goal: "pd" });
    expect(pdPrograms.length).toBeGreaterThan(0);
    expect(pdPrograms.every((institution) => institution.goals.includes("pd"))).toBe(true);
  });

  it("matches multi-word Korean queries across institution metadata", () => {
    const result = filterEducationInstitutions({ query: "에듀코카 웹툰" });
    expect(result.map((institution) => institution.id)).toEqual(["educocca-webtoon"]);
  });
});
