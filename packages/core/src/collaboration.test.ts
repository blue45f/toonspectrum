import { describe, expect, it } from "vitest";

import {
  COLLABORATION_ROLES, assertCollaborationList, collaborationBudget, collaborationCursor,
  collaborationDeadline, isCollaborationPost, safeCollaborationUrl,
  validateCollaborationApplication, validateCollaborationInput,
} from "./collaboration";

import type { CollaborationInput, CollaborationPost } from "./collaboration";

export const validCollaboration = (): CollaborationInput => ({
  type: "commission", role: "ink", title: "선화 보조 작업자를 구합니다", payType: "paid", workMode: "remote",
  details: { description: "주 1회 연재하는 판타지 웹툰의 선화 작업입니다. 작업 범위와 일정을 협의합니다.",
    deliverables: "매주 10컷, PSD 원본 납품", terms: "수정 1회, 작업자 크레딧 표기", compensation: "회차 검수 후 7일 이내 지급",
    budgetMin: 100000, budgetMax: 200000, budgetUnit: "episode", deadline: "", location: "", genre: "판타지",
    tools: ["Clip Studio"], portfolioUrl: "https://example.com/portfolio" },
});
const ID = "11111111-1111-4111-8111-111111111111";
const validPost = (): CollaborationPost => ({ ...validCollaboration(), id: ID, author: { id: "writer", name: "작가" },
  status: "open", version: 1, hidden: false, saved: false, expired: false,
  createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z" });

describe("collaboration compensation and write contract", () => {
  it("normalizes valid input without trusting caller ownership", () => {
    const value = validateCollaborationInput({ ...validCollaboration(), userId: "forged", hidden: false }).value;
    expect(value).toEqual(validCollaboration());
    expect(value).not.toHaveProperty("userId");
  });
  it.each(Object.keys(COLLABORATION_ROLES))("accepts role %s", (role) => {
    expect(validateCollaborationInput({ ...validCollaboration(), role }).error).toBeUndefined();
  });
  it.each([null, [], 0, true, "text"])("rejects non-object %j", (value) => {
    expect(validateCollaborationInput(value).error).toBeTruthy();
  });
  it.each([{ type: "constructor" }, { role: "__proto__" }, { payType: "cash" }, { workMode: "office" },
    { title: "짧음" }, { title: "x".repeat(101) }])("rejects top-level %j", (value) => {
    expect(validateCollaborationInput({ ...validCollaboration(), ...value }).error).toBeTruthy();
  });
  it.each([{ budgetMin: 0 }, { budgetMin: -1 }, { budgetMin: 1.5 }, { budgetMin: "100" }, { budgetMin: NaN },
    { budgetMin: 1000000001 }, { budgetMin: null }, { budgetMax: 1 }, { description: "too short" },
    { deliverables: "" }, { terms: "" }, { compensation: "" }, { budgetUnit: "year" }, { tools: [1] },
    { tools: Array(9).fill("tool") }, { tools: ["x".repeat(31)] }, { location: "x".repeat(81) }])("rejects details %j", (value) => {
    const base = validCollaboration();
    expect(validateCollaborationInput({ ...base, details: { ...base.details, ...value } }).error).toBeTruthy();
  });
  it.each(["volunteer", "revenue_share"])("never markets %s as a paid commission", (payType) => {
    const base = validCollaboration(), details = { ...base.details, budgetMin: null, budgetMax: null };
    expect(validateCollaborationInput({ ...base, payType, details }).error).toBeTruthy();
    expect(validateCollaborationInput({ ...base, type: "available", payType, details }).error).toBeTruthy();
    expect(validateCollaborationInput({ ...base, type: "team", payType, details }).value).toBeTruthy();
    expect(validateCollaborationInput({ ...base, type: "team", payType }).error).toBeTruthy();
  });
  it("requires location for onsite and hybrid work", () => {
    for (const workMode of ["onsite", "hybrid"]) expect(validateCollaborationInput({ ...validCollaboration(), workMode }).error).toBeTruthy();
  });
  it("formats amount per unit rather than a misleading total", () => {
    expect(collaborationBudget(validCollaboration())).toBe("100,000원 ~ 200,000원 / 회차");
  });
});
describe("deadline and external links", () => {
  it("keeps Korea's entire final calendar day open", () => {
    const end = Date.parse("2026-09-13T14:59:59.999Z");
    expect(collaborationDeadline("2026-09-13")).toBe(end);
    const base = validCollaboration(), input = { ...base, details: { ...base.details, deadline: "2026-09-13" } };
    expect(validateCollaborationInput(input, end).value).toBeTruthy();
    expect(validateCollaborationInput(input, end + 1).error).toBeTruthy();
  });
  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-9-13", "invalid"])("rejects impossible date %s", (date) => {
    expect(collaborationDeadline(date)).toBeNull();
  });
  it.each(["javascript:alert(1)", "data:text/html,hello", "https://user:password@example.com", "https://example.com/ a", "https://example.com/" + "x".repeat(500)])("rejects unsafe external link %s", (url) => {
    expect(safeCollaborationUrl(url)).toBeNull();
  });
  it("validates private contact and portfolio independently", () => {
    const application = { message: "선화 경력과 가능한 작업 일정을 소개합니다. 주 10컷 가능합니다.", contact: "artist@example.com", portfolioUrl: "" };
    expect(validateCollaborationApplication(application).value).toBeTruthy();
    for (const contact of ["", "javascript:alert(1)", "bad email"]) expect(validateCollaborationApplication({ ...application, contact }).error).toBeTruthy();
    expect(validateCollaborationApplication({ ...application, portfolioUrl: "javascript:alert(1)" }).error).toBeTruthy();
  });
});
describe("response and keyset pagination", () => {
  it("permits reading expired posts without permitting past-deadline writes", () => {
    const post = validPost(); post.details.deadline = "2020-01-01"; post.expired = true;
    expect(isCollaborationPost(post)).toBe(true);
    expect(validateCollaborationInput(post).error).toBeTruthy();
  });
  it.each([{}, { items: [] }, { items: [null], hasMore: false, canModerate: false, nextCursor: null },
    { items: [], hasMore: true, canModerate: false, nextCursor: null }])("rejects corrupt response %j", (page) => {
    expect(() => assertCollaborationList(page)).toThrow();
  });
  it("validates a complete page", () => {
    expect(() => assertCollaborationList({ items: [validPost()], hasMore: false, canModerate: false, nextCursor: null })).not.toThrow();
  });
  it.each([null, [], "broken", "2026-02-30T00:00:00.000Z|" + ID, "2026-09-13|" + ID,
    "2026-09-13T00:00:00.000Z|invalid", "2026-09-13T00:00:00.000Z|" + ID + "|extra"])("rejects cursor %j", (cursor) => {
    expect(() => collaborationCursor(cursor)).toThrow();
  });
  it("round trips canonical cursor", () => {
    expect(collaborationCursor("2026-09-13T00:00:00.000Z|" + ID)).toEqual({ createdAt: "2026-09-13T00:00:00.000Z", id: ID });
    expect(collaborationCursor(undefined)).toBeNull();
  });
});
