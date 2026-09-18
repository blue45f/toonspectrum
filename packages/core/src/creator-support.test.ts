import { describe, expect, it } from "vitest";

import {
  validateCreatorSupportApplication,
  validateCreatorSupportOffer,
} from "./creator-support";

const BASE_APPLICATION = {
  category: "student",
  ageBand: "adult",
  applicantRole: "self",
  title: "첫 웹툰 완성 프로젝트",
  story: "학교와 아르바이트를 병행하면서 첫 장편 웹툰을 준비하고 있습니다.",
  intendedUse: "작화 장비와 멘토링, 포트폴리오 피드백이 필요합니다.",
  supportNeeds: ["materials_equipment", "mentorship"],
  portfolioUrl: "https://example.com/portfolio",
  estimatedBudgetWon: 300_000,
  guardianConfirmed: false,
  consentAccepted: true,
};

describe("creator support application", () => {
  it("accepts an adult student support application", () => {
    const result = validateCreatorSupportApplication(BASE_APPLICATION);
    expect(result.ok).toBe(true);
  });

  it("requires guardian confirmation for minor applicants", () => {
    expect(validateCreatorSupportApplication({
      ...BASE_APPLICATION,
      ageBand: "youth_14_18",
    }).ok).toBe(false);
  });
  it("requires a guardian-managed application for under-14 creators", () => {
    expect(validateCreatorSupportApplication({
      ...BASE_APPLICATION,
      ageBand: "under14_guardian",
      guardianConfirmed: true,
      applicantRole: "self",
    }).ok).toBe(false);

    expect(validateCreatorSupportApplication({
      ...BASE_APPLICATION,
      ageBand: "under14_guardian",
      guardianConfirmed: true,
      applicantRole: "guardian",
    }).ok).toBe(true);
  });

  it("rejects non-HTTPS portfolio URLs", () => {
    expect(validateCreatorSupportApplication({
      ...BASE_APPLICATION,
      portfolioUrl: "http://example.com/portfolio",
    }).ok).toBe(false);
  });
});

describe("creator support offers", () => {
  it("accepts private non-monetary support offers", () => {
    const result = validateCreatorSupportOffer({
      type: "mentorship",
      message: "주 1회 온라인 멘토링을 한 달 동안 제공할 수 있습니다.",
      contactEmail: "mentor@example.com",
      consentAccepted: true,
      website: "",
    });
    expect(result.ok).toBe(true);
  });
  it("uses a hidden website field as a bot honeypot", () => {
    expect(validateCreatorSupportOffer({
      type: "equipment",
      message: "장비를 지원하겠습니다.",
      contactEmail: "spam@example.com",
      consentAccepted: true,
      website: "https://spam.invalid",
    })).toEqual({ ok: true, spam: true, value: null });
  });
});
