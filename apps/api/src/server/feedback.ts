// First-party feedback community. Preserve existing post IDs, Q&A status and reply trees.
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";

import {
  cleanFeedbackTags, feedbackPageLimit, feedbackText, FEEDBACK_PROGRESS_LABELS,
  isFeedbackKind, isFeedbackProgress, parseFeedbackCursor, validateFeedbackInput,
} from "../../../../packages/core/src/feedback";
import { db, feedbackPosts, feedbackReplies, feedbackVotes, users } from "../db";

import type {
  FeedbackComment, FeedbackEntry, FeedbackInput, FeedbackKind, FeedbackPageResult,
  FeedbackProgress,
} from "../../../../packages/core/src/feedback";
import type { SQL } from "drizzle-orm";

export type FeedbackCategoryFilter = FeedbackKind | "all";
export type FeedbackStatusFilter = "open" | "answered" | "all";
export type FeedbackSort = "recent";
export type ValidatedFeedbackPost = FeedbackInput;
const MAX_REPLY = 1500;
const MAX_DEPTH = 4;
let ensurePromise: Promise<void> | null = null;

/** Additive, serialized runtime migration, also safe on databases created by the old Q&A page. */
export function ensureFeedbackTables(): Promise<void> {
  ensurePromise ??= db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(82361742)`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS feedback_post (
      id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'question', title TEXT NOT NULL, text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', "answeredAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await tx.execute(sql`ALTER TABLE feedback_post
      ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS progress TEXT NOT NULL DEFAULT 'received',
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS idx_feedback_post_progress_created
      ON feedback_post(progress, "createdAt", id)`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS idx_feedback_post_user_created
      ON feedback_post("userId", "createdAt", id)`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS feedback_reply (
      id TEXT PRIMARY KEY, "postId" TEXT NOT NULL REFERENCES feedback_post(id) ON DELETE CASCADE,
      "parentId" TEXT, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      text TEXT NOT NULL, "isOfficial" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS idx_feedback_reply_post
      ON feedback_reply("postId", "createdAt")`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS feedback_vote (
      "postId" TEXT NOT NULL REFERENCES feedback_post(id) ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY ("postId", "userId")
    )`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS idx_feedback_vote_user ON feedback_vote("userId")`);
  }).catch((error: unknown) => { ensurePromise = null; throw error; });
  return ensurePromise;
}

export class FeedbackError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 = 400) { super(message); this.name = "FeedbackError"; }
}
export function parseFeedbackCategory(value: unknown): FeedbackKind { return isFeedbackKind(value) ? value : "question"; }
export function parseFeedbackCategoryFilter(value: unknown): FeedbackCategoryFilter { return isFeedbackKind(value) ? value : "all"; }
export function parseFeedbackStatusFilter(value: unknown): FeedbackStatusFilter { return value === "open" || value === "answered" ? value : "all"; }
// Legacy `active` was accepted but never sorted. Only expose the stable, cursor-safe order.
export function parseFeedbackSort(_value: unknown): FeedbackSort { return "recent"; }
export const validateFeedbackPost = validateFeedbackInput;

export async function isOfficialUser(userId: string): Promise<boolean> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return ["admin", "operator"].includes(String(user?.role ?? "").toLowerCase());
}
export function validateFeedbackReply(input: unknown): { text?: string; parentId?: string | null; error?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "답변 내용을 입력해 주세요." };
  const body = input as Record<string, unknown>;
  const text = feedbackText(body.text);
  if (!text) return { error: "답변 내용을 입력해 주세요." };
  if (text.length > MAX_REPLY) return { error: "답변은 1500자 이하로 입력해 주세요." };
  if (body.parentId != null && (typeof body.parentId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(body.parentId))) return { error: "상위 답변을 확인해 주세요." };
  return { text, parentId: typeof body.parentId === "string" ? body.parentId : null };
}
function authorOf(row: { userId: string | null; author: string | null; avatar: string | null }) {
  return { id: row.userId ?? undefined, name: row.author ?? "익명", avatar: row.avatar ?? "" };
}
function safeDate(value: Date | null): string { return (value ?? new Date()).toISOString(); }
function buildReplyTree(rows: FeedbackComment[]): FeedbackComment[] {
  const nodes = rows.map((row) => ({ ...row, children: [] as FeedbackComment[] }));
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const roots: FeedbackComment[] = [];
  for (const node of nodes) {
    const parent = node.parentId ? lookup.get(node.parentId) : undefined;
    // The write path validates ancestry; this guard also avoids self-referential legacy rows.
    if (parent && parent.id !== node.id) parent.children.push(node); else roots.push(node);
  }
  return roots;
}
export interface FeedbackListOptions {
  category?: FeedbackCategoryFilter;
  status?: FeedbackStatusFilter;
  progress?: FeedbackProgress | "all";
  query?: string;
  tag?: string;
  sort?: FeedbackSort;
  cursor?: string | null;
  limit?: number;
  viewerId?: string;
  mine?: boolean;
  id?: string;
}
export async function listFeedbackPosts(opts: FeedbackListOptions): Promise<FeedbackPageResult> {
  await ensureFeedbackTables();
  const limit = feedbackPageLimit(opts.limit);
  const cursor = parseFeedbackCursor(opts.cursor);
  if (opts.cursor && !cursor) throw new FeedbackError("페이지 정보가 만료되었어요. 목록을 새로고침해 주세요.");
  if (opts.mine && !opts.viewerId) throw new FeedbackError("내 제보를 보려면 로그인해 주세요.", 403);
  const clauses: SQL[] = [eq(feedbackPosts.hidden, false)];
  if (opts.id) clauses.push(eq(feedbackPosts.id, opts.id));
  if (opts.category && opts.category !== "all") clauses.push(eq(feedbackPosts.category, opts.category));
  if (opts.status && opts.status !== "all") clauses.push(eq(feedbackPosts.status, opts.status));
  if (opts.progress && opts.progress !== "all") clauses.push(eq(feedbackPosts.progress, opts.progress));
  if (opts.mine && opts.viewerId) clauses.push(eq(feedbackPosts.userId, opts.viewerId));
  const search = (opts.query ?? "").trim().toLowerCase().slice(0, 200);
  if (search) clauses.push(sql`(strpos(lower(${feedbackPosts.title}), ${search}) > 0 OR strpos(lower(${feedbackPosts.text}), ${search}) > 0)`);
  const tag = (opts.tag ?? "").trim().replace(/^#/, "").toLowerCase().slice(0, 20);
  if (tag) clauses.push(sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(${feedbackPosts.tags}) = 'array' THEN ${feedbackPosts.tags} ELSE '[]'::jsonb END
  ) AS feedback_tag(value) WHERE lower(feedback_tag.value) = ${tag})`);
  if (cursor) {
    const timestamp = new Date(cursor.createdAt);
    clauses.push(or(lt(feedbackPosts.createdAt, timestamp), and(eq(feedbackPosts.createdAt, timestamp), lt(feedbackPosts.id, cursor.id)))!);
  }
  const rows = await db.select({
    id: feedbackPosts.id, category: feedbackPosts.category, title: feedbackPosts.title, text: feedbackPosts.text,
    tags: feedbackPosts.tags, metadata: feedbackPosts.metadata, progress: feedbackPosts.progress,
    status: feedbackPosts.status, answeredAt: feedbackPosts.answeredAt, createdAt: feedbackPosts.createdAt,
    userId: users.id, author: users.name, avatar: users.avatar,
  }).from(feedbackPosts).innerJoin(users, eq(feedbackPosts.userId, users.id))
    .where(and(...clauses)).orderBy(desc(feedbackPosts.createdAt), desc(feedbackPosts.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const ids = page.map((row) => row.id);
  const [replies, votes, mine] = ids.length ? await Promise.all([
    db.select({ postId: feedbackReplies.postId, count: sql<number>`count(*)` }).from(feedbackReplies).where(inArray(feedbackReplies.postId, ids)).groupBy(feedbackReplies.postId),
    db.select({ postId: feedbackVotes.postId, count: sql<number>`count(*)` }).from(feedbackVotes).where(inArray(feedbackVotes.postId, ids)).groupBy(feedbackVotes.postId),
    opts.viewerId ? db.select({ postId: feedbackVotes.postId }).from(feedbackVotes).where(and(inArray(feedbackVotes.postId, ids), eq(feedbackVotes.userId, opts.viewerId))) : Promise.resolve([]),
  ]) : [[], [], []];
  const replyCounts = new Map(replies.map((row) => [row.postId, Number(row.count)]));
  const voteCounts = new Map(votes.map((row) => [row.postId, Number(row.count)]));
  const voted = new Set(mine.map((row) => row.postId));
  const items: FeedbackEntry[] = page.map((row) => ({
    id: row.id, category: parseFeedbackCategory(row.category), title: row.title, text: row.text,
    tags: cleanFeedbackTags(row.tags), metadata: row.metadata ?? {},
    status: row.status === "answered" ? "answered" : "open",
    progress: isFeedbackProgress(row.progress) ? row.progress : "received",
    answeredAt: row.answeredAt?.toISOString() ?? null, createdAt: safeDate(row.createdAt), author: authorOf(row),
    replyCount: replyCounts.get(row.id) ?? 0, voteCount: voteCounts.get(row.id) ?? 0, viewerVoted: voted.has(row.id),
  }));
  const last = page.at(-1);
  const hasMore = rows.length > limit;
  return { items, hasMore, nextCursor: hasMore && last?.createdAt ? `${last.createdAt.getTime()}:${last.id}` : null };
}
export async function getFeedbackPost(postId: string, viewerId?: string): Promise<FeedbackEntry> {
  const { items } = await listFeedbackPosts({ id: postId, viewerId, limit: 1 });
  if (!items[0]) throw new FeedbackError("게시글을 찾을 수 없거나 비공개 처리되었어요.", 404);
  return items[0];
}
export async function createFeedbackPost(userId: string, input: ValidatedFeedbackPost): Promise<FeedbackEntry> {
  await ensureFeedbackTables();
  const id = crypto.randomUUID();
  await db.insert(feedbackPosts).values({ id, userId, ...input, status: "open", progress: "received" });
  return getFeedbackPost(id, userId);
}
export async function listFeedbackReplies(postId: string): Promise<FeedbackComment[]> {
  // A guessed ID must not expose comments of a hidden post.
  await getFeedbackPost(postId);
  const rows = await db.select({
    id: feedbackReplies.id, postId: feedbackReplies.postId, parentId: feedbackReplies.parentId,
    text: feedbackReplies.text, isOfficial: feedbackReplies.isOfficial, createdAt: feedbackReplies.createdAt,
    userId: users.id, author: users.name, avatar: users.avatar,
  }).from(feedbackReplies).innerJoin(users, eq(feedbackReplies.userId, users.id))
    .innerJoin(feedbackPosts, eq(feedbackReplies.postId, feedbackPosts.id))
    .where(and(eq(feedbackReplies.postId, postId), eq(feedbackPosts.hidden, false))).orderBy(feedbackReplies.createdAt, feedbackReplies.id);
  return buildReplyTree(rows.map((row) => ({
    id: row.id, postId: row.postId, parentId: row.parentId, text: row.text,
    isOfficial: row.isOfficial, createdAt: safeDate(row.createdAt), author: authorOf(row),
  })));
}
export async function createFeedbackReply(input: { postId: string; parentId?: string | null; userId: string; text: string; isOfficial: boolean }): Promise<FeedbackComment> {
  await ensureFeedbackTables();
  const id = crypto.randomUUID();
  const createdAt = new Date();
  await db.transaction(async (tx) => {
    const [post] = await tx.select({ id: feedbackPosts.id, status: feedbackPosts.status }).from(feedbackPosts)
      .where(and(eq(feedbackPosts.id, input.postId), eq(feedbackPosts.hidden, false))).for("update").limit(1);
    if (!post) throw new FeedbackError("답변할 게시글을 찾을 수 없습니다.", 404);
    const seen = new Set<string>();
    let parentId = input.parentId ?? null;
    while (parentId) {
      if (seen.size >= MAX_DEPTH || seen.has(parentId)) throw new FeedbackError("답변은 최대 4단계까지만 작성할 수 있습니다.");
      seen.add(parentId);
      const [parent] = await tx.select({ parentId: feedbackReplies.parentId }).from(feedbackReplies)
        .where(and(eq(feedbackReplies.id, parentId), eq(feedbackReplies.postId, input.postId))).limit(1);
      if (!parent) throw new FeedbackError("답변의 상위 항목을 찾을 수 없습니다.");
      parentId = parent.parentId;
    }
    await tx.insert(feedbackReplies).values({ ...input, id, parentId: input.parentId ?? null, createdAt });
    if (input.isOfficial && post.status !== "answered") await tx.update(feedbackPosts)
      .set({ status: "answered", answeredAt: createdAt }).where(eq(feedbackPosts.id, input.postId));
  });
  const [user] = await db.select({ name: users.name, avatar: users.avatar }).from(users).where(eq(users.id, input.userId)).limit(1);
  return { id, postId: input.postId, parentId: input.parentId ?? null, text: input.text, isOfficial: input.isOfficial,
    author: { id: input.userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "" }, createdAt: createdAt.toISOString() };
}
export async function setFeedbackVote(postId: string, userId: string, voted: boolean): Promise<{ voted: boolean; voteCount: number }> {
  await ensureFeedbackTables();
  return db.transaction(async (tx) => {
    const [post] = await tx.select({ id: feedbackPosts.id }).from(feedbackPosts)
      .where(and(eq(feedbackPosts.id, postId), eq(feedbackPosts.hidden, false))).for("update").limit(1);
    if (!post) throw new FeedbackError("공감할 게시글을 찾을 수 없습니다.", 404);
    if (voted) await tx.insert(feedbackVotes).values({ postId, userId }).onConflictDoNothing();
    else await tx.delete(feedbackVotes).where(and(eq(feedbackVotes.postId, postId), eq(feedbackVotes.userId, userId)));
    const [count] = await tx.select({ value: sql<number>`count(*)` }).from(feedbackVotes).where(eq(feedbackVotes.postId, postId));
    return { voted, voteCount: Number(count?.value ?? 0) };
  });
}
export async function updateFeedbackProgress(postId: string, userId: string, progress: FeedbackProgress, note: string, expectedProgress?: FeedbackProgress): Promise<FeedbackEntry> {
  if (!isFeedbackProgress(progress) || !isFeedbackProgress(expectedProgress) || note.trim().length < 2 || note.length > 1000) {
    throw new FeedbackError("처리 상태와 안내 내용을 확인해 주세요.");
  }
  // Enforce role here too, not just in the UI/controller.
  if (!await isOfficialUser(userId)) throw new FeedbackError("운영자만 처리 상태를 변경할 수 있어요.", 403);
  await ensureFeedbackTables();
  await db.transaction(async (tx) => {
    const [post] = await tx.select({ progress: feedbackPosts.progress }).from(feedbackPosts)
      .where(and(eq(feedbackPosts.id, postId), eq(feedbackPosts.hidden, false))).for("update").limit(1);
    if (!post) throw new FeedbackError("게시글을 찾을 수 없습니다.", 404);
    if (expectedProgress && post.progress !== expectedProgress) throw new FeedbackError("처리 상태가 변경되었어요. 새로고침 후 다시 확인해 주세요.", 409);
    if (post.progress === progress) return;
    const now = new Date();
    await tx.update(feedbackPosts).set({ progress, status: "answered", answeredAt: now }).where(eq(feedbackPosts.id, postId));
    await tx.insert(feedbackReplies).values({
      id: crypto.randomUUID(), postId, userId, isOfficial: true, createdAt: now,
      text: `[처리 상태: ${FEEDBACK_PROGRESS_LABELS[progress]}]\n${note}`,
    });
  });
  return getFeedbackPost(postId, userId);
}
