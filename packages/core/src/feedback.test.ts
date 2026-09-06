import { describe, expect, it } from "vitest";

import {
  cleanFeedbackTags, FEEDBACK_KINDS, feedbackPageLimit, feedbackTimeLabel, isFeedbackProgress,
  parseFeedbackCursor, safeFeedbackPath, validateFeedbackInput,
} from "./feedback";

const base = { title: "브러시 개선", text: "브러시 동작을 개선해 주세요." };
describe("feedback community shared contract", () => {
  it.each(FEEDBACK_KINDS)("supports %s without changing legacy reply status", (category) => {
    expect(validateFeedbackInput({ ...base, category }).value?.category).toBe(category);
  });
  it("preserves the old category-less Q&A payload", () => {
    expect(validateFeedbackInput(base).value).toEqual({ ...base, category: "question", metadata: {}, tags: [] });
  });
  it.each([null, [], 42, "text", { ...base, category: "admin" }, { ...base, title: {} }, { ...base, text: true }])("rejects malformed payload %j", (input) => {
    expect(validateFeedbackInput(input).error).toBeTruthy();
  });
  it("does not silently truncate important descriptions", () => {
    expect(validateFeedbackInput({ ...base, title: "가".repeat(101) }).error).toBeTruthy();
    expect(validateFeedbackInput({ ...base, text: "가".repeat(2001) }).error).toBeTruthy();
    expect(validateFeedbackInput({ ...base, metadata: { steps: "가".repeat(1201) } }).error).toBeTruthy();
  });
  it("whitelists metadata and ignores client-supplied ownership, role and progress", () => {
    const result = validateFeedbackInput({ ...base, userId: "admin", progress: "completed", voteCount: 100, metadata: { area: "drawing", steps: "1\r\n2", token: "private", url: "https://example.invalid/private" } }).value;
    expect(result).toEqual({ ...base, category: "question", tags: [], metadata: { area: "drawing", steps: "1\n2" } });
  });
  it("rejects malformed reproduction metadata", () => {
    for (const metadata of [[], "text", { area: "unknown" }, { actual: { secret: true } }]) expect(validateFeedbackInput({ ...base, metadata }).error).toBeTruthy();
  });
  it("deduplicates and bounds tags", () => {
    expect(cleanFeedbackTags(["#UI", "ui", 42, " 모바일 ", "a", "b", "c", "d"])).toEqual(["UI", "모바일", "a", "b", "c"]);
  });
  it("does not expose query strings, fragments, project IDs or external URLs", () => {
    expect(safeFeedbackPath("/studio?token=secret#project")).toBe("/studio");
    for (const path of ["https://example.invalid", "//example.invalid", "/studio/project-private-id", "/studio\\secret", "/studio/%2e%2e/secret"]) expect(safeFeedbackPath(path)).toBe("");
  });
  it.each([undefined, null, "", "NaN", "1e9", "2x", {}, [], Infinity, NaN, -1, 0])("bounds invalid page sizes %j", (value) => {
    expect(feedbackPageLimit(value)).toBe(20);
  });
  it("bounds valid page sizes", () => {
    expect(feedbackPageLimit("1000")).toBe(50);
    expect(feedbackPageLimit(2.8)).toBe(2);
    expect(feedbackPageLimit("1")).toBe(1);
  });
  it("validates date cursors before SQL construction", () => {
    const now = Date.UTC(2026, 8, 1);
    expect(parseFeedbackCursor(`${now}:abc-123`)).toEqual({ createdAt: now, id: "abc-123" });
    for (const cursor of ["NaN:x", "-1:x", "0:x", "8640000000000001:x", "123:a:b", "123:a';drop table", "", 123]) expect(parseFeedbackCursor(cursor)).toBeNull();
  });
  it("separates delivery progress from answered status", () => {
    expect(isFeedbackProgress("answered")).toBe(false);
    expect(isFeedbackProgress("completed")).toBe(true);
  });
  it("handles future and malformed times", () => {
    expect(feedbackTimeLabel("invalid")).toBe("날짜 확인 중");
    expect(feedbackTimeLabel("2026-09-01T00:01:00Z", Date.UTC(2026, 8, 1))).toBe("방금");
  });
});
