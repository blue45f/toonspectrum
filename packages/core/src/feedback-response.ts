import { isFeedbackArea, isFeedbackKind, isFeedbackProgress } from "./feedback";

import type { FeedbackComment, FeedbackEntry, FeedbackPageResult } from "./feedback";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function author(value: unknown): boolean {
  return record(value) && typeof value.name === "string" && typeof value.avatar === "string"
    && (value.id === undefined || typeof value.id === "string");
}
function metadata(value: unknown): boolean {
  return record(value) && (value.area === undefined || isFeedbackArea(value.area))
    && ["steps", "expected", "actual", "path"].every((key) => value[key] === undefined || typeof value[key] === "string");
}
/** Validate actual JSON before using it as a React child or clearing a user's draft. */
export function isFeedbackEntry(value: unknown): value is FeedbackEntry {
  return record(value) && identifier(value.id) && isFeedbackKind(value.category)
    && typeof value.title === "string" && typeof value.text === "string"
    && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")
    && (value.status === "open" || value.status === "answered") && isFeedbackProgress(value.progress)
    && metadata(value.metadata) && timestamp(value.createdAt)
    && (value.answeredAt === null || timestamp(value.answeredAt)) && author(value.author)
    && count(value.replyCount) && count(value.voteCount) && typeof value.viewerVoted === "boolean";
}
export function assertFeedbackPage(value: unknown): asserts value is FeedbackPageResult {
  if (!record(value) || value.contractVersion !== 2 || !Array.isArray(value.items)
    || typeof value.hasMore !== "boolean" || (value.canManage !== undefined && typeof value.canManage !== "boolean")
    || !(value.nextCursor === null || (typeof value.nextCursor === "string" && value.nextCursor.length > 0 && value.nextCursor.length <= 128))
    || (value.hasMore && (!value.nextCursor || value.items.length === 0))) {
    throw new Error("제보 기능 업데이트가 아직 반영되지 않았어요. 목록을 새로고침해 주세요.");
  }
  if (!value.items.every(isFeedbackEntry) || new Set(value.items.map((item) => item.id)).size !== value.items.length) {
    throw new Error("제보 목록 응답을 확인할 수 없어요. 다시 불러와 주세요.");
  }
}
export function isFeedbackComment(value: unknown, postId: string): value is FeedbackComment {
  if (!record(value) || !identifier(value.id) || value.postId !== postId
    || !(value.parentId === null || identifier(value.parentId)) || !author(value.author)
    || typeof value.text !== "string" || typeof value.isOfficial !== "boolean" || !timestamp(value.createdAt)) return false;
  return value.children === undefined || (Array.isArray(value.children) && value.children.length === 0);
}
/** Iterative and bounded in depth, including legacy orphan roots. No recursive stack overflow. */
export function assertFeedbackComments(value: unknown, postId: string): asserts value is FeedbackComment[] {
  const invalid = () => new Error("댓글 응답을 확인할 수 없어요. 다시 불러와 주세요.");
  if (!Array.isArray(value)) throw invalid();
  const pending = value.map((item: unknown) => ({ item, depth: 0 }));
  const ids = new Set<string>();
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    const { item, depth } = current;
    if (!record(item) || depth > 4 || !isFeedbackComment({ ...item, children: undefined }, postId)
      || typeof item.id !== "string" || ids.has(item.id)) throw invalid();
    ids.add(item.id);
    if (item.children !== undefined) {
      if (!Array.isArray(item.children)) throw invalid();
      for (const child of item.children) {
        if (!record(child) || child.parentId !== item.id) throw invalid();
        pending.push({ item: child, depth: depth + 1 });
      }
    }
  }
}
export function isFeedbackVote(value: unknown): value is { voted: boolean; voteCount: number } {
  return record(value) && typeof value.voted === "boolean" && count(value.voteCount);
}
