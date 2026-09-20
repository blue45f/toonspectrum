import { describe, expect, it } from "vitest";

import { matchingFacts, peakOverlap } from "./hiring-matching";
import { parseHiring, slotTermsSchema } from "./hiring.validation";

import type { HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";

const now = Date.parse("2026-09-20T01:00:00Z");
const terms: HiringSlotTerms = { model: "freelance-task", role: "lineart", publicScope: "선화 10컷", quantity: 10, quantityUnit: "cut", startsAt: "2026-09-20T02:00:00Z", dueAt: "2026-09-20T03:00:00Z", timeZone: "Asia/Seoul", compensation: "paid", currency: "KRW", minRate: 10000, maxRate: 20000, rateUnit: "cut", tools: ["Clip Studio Paint"], formats: ["PSD"], revisionRounds: 2, acceptanceCriteria: "선화 검수와 정산", ndaRequired: false, creditPolicy: "작가명 표기", portfolioPolicy: "approval-required", aiPolicy: "prohibited" };
const available = { startsAt: "2026-09-20T00:00:00Z", endsAt: "2026-09-20T05:00:00Z", expiresAt: "2026-09-20T02:00:00Z", roles: ["lineart"], tools: ["Clip Studio Paint"], formats: ["PSD"], minRate: 15000, rateUnit: "cut", discoverable: true, notificationOptIn: true };
describe("factual hiring matching", () => {
  it("explains only explicit role, tools, formats, time and rate", () => { expect(matchingFacts(available, terms, now)).toHaveLength(4); });
  it.each([{ discoverable: false }, { notificationOptIn: false }, { roles: ["story"] }, { tools: [] }, { formats: [] }, { minRate: 30000 }, { rateUnit: "hour" }, { expiresAt: "2026-09-20T01:00:00Z" }, { startsAt: "2026-09-20T01:30:00Z" }, { endsAt: "2026-09-20T02:30:00Z" }])("rejects revoked, expired or incompatible candidate %j", (delta) => {
    expect(matchingFacts({ ...available, ...delta }, terms, now, true)).toBeNull();
  });
  it("rejects elapsed task deadlines but permits replacement work that already started", () => {
    expect(matchingFacts(available, { ...terms, dueAt: new Date(now).toISOString() }, now)).toBeNull();
    expect(matchingFacts(available, { ...terms, startsAt: available.startsAt }, now)).not.toBeNull();
  });
  it("does not count sequential past/future jobs as simultaneous capacity", () => {
    expect(peakOverlap([{ startsAt: 1, endsAt: 3 }, { startsAt: 3, endsAt: 5 }, { startsAt: 10, endsAt: 15 }], { startsAt: 1, endsAt: 5 })).toBe(1);
    expect(peakOverlap([{ startsAt: 1, endsAt: 4 }, { startsAt: 3, endsAt: 5 }], { startsAt: 2, endsAt: 5 })).toBe(2);
    expect(peakOverlap([{ startsAt: 1, endsAt: 2 }], { startsAt: 2, endsAt: 3 })).toBe(0);
  });
  it.each(["employment", "freelance-task"])("requires paid terms for %s", (model) => {
    for (const compensation of ["unpaid", "revenue-share"]) expect(() => parseHiring(slotTermsSchema, { ...terms, model, compensation, minRate: 0, maxRate: 0 })).toThrow();
    expect(parseHiring(slotTermsSchema, { ...terms, model }).compensation).toBe("paid");
  });
  it("blocks unsupported revenue-share confirmation for every collaboration model", () => {
    for (const model of ["co-creation", "partial-collaboration"]) {
      expect(() => parseHiring(slotTermsSchema, { ...terms, model, compensation: "revenue-share", minRate: 0, maxRate: 0 })).toThrow();
      expect(parseHiring(slotTermsSchema, { ...terms, model, compensation: "unpaid", minRate: 0, maxRate: 0 }).compensation).toBe("unpaid");
    }
  });
  it("rejects misleading compensation and invalid schedule/timezone", () => {
    expect(() => parseHiring(slotTermsSchema, { ...terms, compensation: "unpaid" })).toThrow();
    expect(() => parseHiring(slotTermsSchema, { ...terms, compensation: "revenue-share", minRate: 0, maxRate: 0 })).toThrow();
    expect(() => parseHiring(slotTermsSchema, { ...terms, dueAt: terms.startsAt })).toThrow();
    expect(() => parseHiring(slotTermsSchema, { ...terms, timeZone: "Nowhere/Fake" })).toThrow();
    expect(parseHiring(slotTermsSchema, terms)).toEqual(terms);
  });
});
