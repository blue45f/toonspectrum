import { describe, expect, it } from "vitest";

import { assertFeedbackComments, assertFeedbackPage, isFeedbackComment, isFeedbackEntry, isFeedbackVote } from "./feedback-response";

import type { FeedbackComment, FeedbackEntry } from "./feedback";

const entry: FeedbackEntry = {
  id: "post-1", category: "bug", title: "응답 검증", text: "초안을 안전하게 보존합니다.", tags: ["브러시"],
  status: "open", progress: "received", metadata: { area: "drawing" }, answeredAt: null,
  createdAt: "2026-09-01T09:00:00.000Z", author: { id: "member", name: "창작자", avatar: "" },
  replyCount: 0, voteCount: 0, viewerVoted: false,
};
const reply = (id = "reply-1", parentId: string | null = null): FeedbackComment => ({
  id, parentId, postId: entry.id, author: entry.author, text: "같은 경험입니다.", isOfficial: false, createdAt: entry.createdAt,
});
const page = () => ({ contractVersion: 2, items: [entry], hasMore: false, nextCursor: null, canManage: false });

describe("feedback response boundary", () => {
  it("accepts valid server entries and pages", () => {
    expect(isFeedbackEntry(entry)).toBe(true);
    expect(() => assertFeedbackPage(page())).not.toThrow();
    expect(() => assertFeedbackPage({ ...page(), items: [] })).not.toThrow();
  });
  it.each([
    { id: "../other" }, { category: "unknown" }, { title: {} }, { text: [] }, { tags: [null] },
    { status: "completed" }, { progress: "answered" }, { metadata: null }, { metadata: { area: "unknown" } },
    { metadata: { steps: {} } }, { createdAt: "invalid" }, { answeredAt: "invalid" }, { author: null },
    { author: { name: {}, avatar: "" } }, { replyCount: -1 }, { voteCount: NaN }, { voteCount: 0.5 }, { viewerVoted: "false" },
  ])("rejects unsafe entry fields %j", (patch) => {
    expect(isFeedbackEntry({ ...entry, ...patch })).toBe(false);
    expect(() => assertFeedbackPage({ ...page(), items: [{ ...entry, ...patch }] })).toThrow();
  });
  it.each([
    null, [], {}, { ...page(), contractVersion: 1 }, { ...page(), items: [entry, entry] },
    { ...page(), hasMore: true }, { ...page(), hasMore: true, nextCursor: "20", items: [] },
    { ...page(), nextCursor: {} }, { ...page(), nextCursor: "x".repeat(129) }, { ...page(), canManage: "true" },
  ])("rejects invalid page envelopes %j", (value) => {
    expect(() => assertFeedbackPage(value)).toThrow();
  });
  it("accepts a nonempty next page cursor", () => {
    expect(() => assertFeedbackPage({ ...page(), hasMore: true, nextCursor: "20" })).not.toThrow();
  });
  it("accepts an empty thread and a valid orphan root", () => {
    expect(() => assertFeedbackComments([], entry.id)).not.toThrow();
    expect(() => assertFeedbackComments([reply("orphan", "deleted-parent")], entry.id)).not.toThrow();
  });
  it("validates the exact post for a created reply before clearing the draft", () => {
    expect(isFeedbackComment(reply(), entry.id)).toBe(true);
    expect(isFeedbackComment(reply(), "other-post")).toBe(false);
    expect(isFeedbackComment({ ...reply(), text: {} }, entry.id)).toBe(false);
    expect(isFeedbackComment({ ...reply(), children: [reply("child")] }, entry.id)).toBe(false);
  });
  it("accepts four child levels but rejects excessive depth", () => {
    const root = reply(); let current = root;
    for (let index = 1; index <= 4; index++) {
      const child = reply(`reply-${index + 1}`, current.id); current.children = [child]; current = child;
    }
    expect(() => assertFeedbackComments([root], entry.id)).not.toThrow();
    current.children = [reply("too-deep", current.id)];
    expect(() => assertFeedbackComments([root], entry.id)).toThrow();
  });
  it("rejects duplicates, cycles, malformed children and cross-post ancestry", () => {
    for (const value of [null, {}, [reply(), reply()], [{ ...reply(), children: {} }],
      [{ ...reply(), children: [reply("child", "wrong-parent")] }], [{ ...reply(), postId: "other" }]]) {
      expect(() => assertFeedbackComments(value, entry.id)).toThrow();
    }
    const cyclic = reply(); cyclic.parentId = cyclic.id; cyclic.children = [cyclic];
    expect(() => assertFeedbackComments([cyclic], entry.id)).toThrow();
  });
  it.each([-1, NaN, Infinity, 0.5, "2", Number.MAX_SAFE_INTEGER + 1])("rejects an invalid vote count %j", (voteCount) => {
    expect(isFeedbackVote({ voted: true, voteCount })).toBe(false);
  });
  it("accepts acknowledged votes and rejects empty or nonboolean acknowledgements", () => {
    expect(isFeedbackVote({ voted: true, voteCount: 1 })).toBe(true);
    expect(isFeedbackVote({ voted: false, voteCount: 0 })).toBe(true);
    expect(isFeedbackVote({ voted: "true", voteCount: 1 })).toBe(false);
    expect(isFeedbackVote(undefined)).toBe(false);
  });
});
