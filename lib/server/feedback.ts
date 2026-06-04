// 사이트 Q&A·의견 게시판 서버 로직 — community.ts 패턴을 따른다(검증·트리·ensure-schema).
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, dbClient, feedbackPosts, feedbackReplies, users } from "../db";
import type {
  CommunityAuthor,
  FeedbackCategory,
  FeedbackPost,
  FeedbackPostList,
  FeedbackReply,
  FeedbackStatus,
} from "../types";

const CATEGORIES = new Set<FeedbackCategory>(["question", "idea", "bug"]);
const SORTS = new Set<"recent" | "active">(["recent", "active"]);
const MAX_TITLE = 100;
const MAX_TEXT = 2000;
const MAX_REPLY = 1500;
const MAX_DEPTH = 4;
const PAGE_SIZE = 20;

export type FeedbackSort = "recent" | "active";
export type FeedbackCategoryFilter = FeedbackCategory | "all";
export type FeedbackStatusFilter = FeedbackStatus | "all";

let ensured = false;
export async function ensureFeedbackTables() {
  if (ensured) return;
  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS feedback_post (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'question',
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      "answeredAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await dbClient.execute('CREATE INDEX IF NOT EXISTS idx_feedback_post_created ON feedback_post(category, status, "createdAt")');
  // 기존 테이블에 tags 컬럼 보강(신규 컬럼).
  await dbClient.execute(`ALTER TABLE feedback_post ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS feedback_reply (
      id TEXT PRIMARY KEY,
      "postId" TEXT NOT NULL REFERENCES feedback_post(id) ON DELETE CASCADE,
      "parentId" TEXT,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      "isOfficial" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await dbClient.execute('CREATE INDEX IF NOT EXISTS idx_feedback_reply_post ON feedback_reply("postId", "createdAt")');
  ensured = true;
}

function clampText(value: unknown, max: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}
function normalizeMultiline(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
}
function safeDate(value: Date | number | null | undefined): string {
  return new Date(value ?? Date.now()).toISOString();
}
function nullableDate(value: Date | number | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString();
}
function authorOf(row: { userId?: string | null; author?: string | null; avatar?: string | null }): CommunityAuthor {
  return { id: row.userId ?? undefined, name: row.author ?? "익명", avatar: row.avatar ?? "#7c5cfc" };
}
function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

export function parseFeedbackCategory(value: unknown): FeedbackCategory {
  return CATEGORIES.has(value as FeedbackCategory) ? (value as FeedbackCategory) : "question";
}
export function parseFeedbackCategoryFilter(value: unknown): FeedbackCategoryFilter {
  return CATEGORIES.has(value as FeedbackCategory) ? (value as FeedbackCategory) : "all";
}
export function parseFeedbackStatusFilter(value: unknown): FeedbackStatusFilter {
  return value === "open" || value === "answered" ? value : "all";
}
export function parseFeedbackSort(value: unknown): FeedbackSort {
  return SORTS.has(value as FeedbackSort) ? (value as FeedbackSort) : "recent";
}

// 운영자(admin/operator) 여부 — 답변에 isOfficial 플래그 + 게시글 '답변완료' 승격에 사용.
export async function isOfficialUser(userId: string): Promise<boolean> {
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  const role = String(u?.role ?? "").toLowerCase();
  return role === "admin" || role === "operator";
}

export interface ValidatedFeedbackPost {
  category: FeedbackCategory;
  title: string;
  text: string;
  tags: string[];
}
function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const tag = clampText(raw, 20).replace(/^#/, "");
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
    if (out.length >= 5) break;
  }
  return out;
}
function parseTagValue(value: unknown): string[] {
  if (Array.isArray(value)) return cleanTags(value);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return cleanTags(parsed);
    } catch {
      return cleanTags(value.split(/[,\n]/));
    }
  }
  return [];
}
export function validateFeedbackPost(input: unknown): { value?: ValidatedFeedbackPost; error?: string } {
  const body = (input ?? {}) as Record<string, unknown>;
  const category = parseFeedbackCategory(body.category);
  const titleRaw = String(body.title ?? "").trim();
  const textRaw = normalizeMultiline(body.text);
  const title = clampText(titleRaw, MAX_TITLE);
  const text = textRaw.slice(0, MAX_TEXT);
  const tags = cleanTags(body.tags);
  if (titleRaw.length > MAX_TITLE) return { error: "제목은 100자 이하로 입력해 주세요." };
  if (textRaw.length > MAX_TEXT) return { error: "본문은 2000자 이하로 입력해 주세요." };
  if (title.length < 2) return { error: "제목은 2자 이상 입력해 주세요." };
  if (text.length < 5) return { error: "내용은 5자 이상 입력해 주세요." };
  return { value: { category, title, text, tags } };
}

export function validateFeedbackReply(input: unknown): { text?: string; parentId?: string | null; error?: string } {
  const body = (input ?? {}) as Record<string, unknown>;
  const text = normalizeMultiline(body.text).slice(0, MAX_REPLY);
  if (text.length < 1) return { error: "답변 내용을 입력해 주세요." };
  const parentRaw = String(body.parentId ?? "").trim().slice(0, 80);
  return { text, parentId: parentRaw || null };
}

function buildReplyTree(rows: FeedbackReply[]): FeedbackReply[] {
  const nodes = rows.map((row) => ({ ...row, children: [] as FeedbackReply[] }));
  const lookup = new Map(nodes.map((n) => [n.id, n]));
  const roots: FeedbackReply[] = [];
  for (const node of nodes) {
    if (node.parentId) {
      const parent = lookup.get(node.parentId);
      if (parent) {
        parent.children!.push(node);
        continue;
      }
    }
    roots.push(node);
  }
  return roots;
}

async function getReplyDepth(postId: string, parentId: string | null): Promise<number | "missing" | "exceed"> {
  if (!parentId) return 0;
  const seen = new Set<string>();
  let current: string | null = parentId;
  let depth = 0;
  while (current) {
    if (depth >= MAX_DEPTH) return "exceed";
    if (seen.has(current)) return "exceed";
    seen.add(current);
    const [parent] = await db
      .select({ id: feedbackReplies.id, parentId: feedbackReplies.parentId })
      .from(feedbackReplies)
      .where(and(eq(feedbackReplies.id, current), eq(feedbackReplies.postId, postId)))
      .limit(1);
    if (!parent) return "missing";
    current = parent.parentId;
    depth += 1;
  }
  return depth;
}

export interface FeedbackCursor {
  createdAt: number;
  id: string;
}
function parseCursor(value: unknown): FeedbackCursor | null {
  if (typeof value !== "string") return null;
  const [a, b] = value.split(":");
  const createdAt = Number(a);
  if (!Number.isFinite(createdAt) || !b) return null;
  return { createdAt, id: b };
}
function encodeCursor(c: FeedbackCursor): string {
  return `${c.createdAt}:${c.id}`;
}

export async function listFeedbackPosts(opts: {
  category?: FeedbackCategoryFilter;
  status?: FeedbackStatusFilter;
  query?: string;
  tag?: string;
  sort?: FeedbackSort;
  cursor?: string | null;
  limit?: number;
}): Promise<FeedbackPostList> {
  await ensureFeedbackTables();
  const limit = opts.limit ?? PAGE_SIZE;
  const cursor = parseCursor(opts.cursor ?? null);
  let where: SQL | undefined;
  const addWhere = (c: SQL | undefined) => {
    if (!c) return;
    where = where ? and(where, c) : c;
  };
  if (opts.category && opts.category !== "all") addWhere(eq(feedbackPosts.category, opts.category));
  if (opts.status && opts.status !== "all") addWhere(eq(feedbackPosts.status, opts.status));
  addWhere(eq(feedbackPosts.hidden, false)); // 비노출 처리 글 제외
  const search = String(opts.query ?? "").trim().toLowerCase();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    addWhere(
      or(
        sql`lower(${feedbackPosts.title}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${feedbackPosts.text}) LIKE ${pattern} ESCAPE '\\'`
      )
    );
  }
  const tag = String(opts.tag ?? "").trim().replace(/^#/, "").toLowerCase();
  if (tag) {
    addWhere(sql`lower(${feedbackPosts.tags}::text) LIKE ${`%"${tag.replace(/[%_]/g, "\\$&")}"%`} ESCAPE '\\'`);
  }
  if (cursor) {
    addWhere(
      or(
        sql`${feedbackPosts.createdAt} < ${cursor.createdAt}`,
        and(sql`${feedbackPosts.createdAt} = ${cursor.createdAt}`, sql`${feedbackPosts.id} < ${cursor.id}`)
      )
    );
  }

  let q = db
    .select({
      id: feedbackPosts.id,
      category: feedbackPosts.category,
      title: feedbackPosts.title,
      text: feedbackPosts.text,
      tags: feedbackPosts.tags,
      status: feedbackPosts.status,
      answeredAt: feedbackPosts.answeredAt,
      createdAt: feedbackPosts.createdAt,
      userId: users.id,
      author: users.name,
      avatar: users.avatar,
    })
    .from(feedbackPosts)
    .innerJoin(users, eq(feedbackPosts.userId, users.id))
    .$dynamic();
  if (where) q = q.where(where);
  const rows = await q.orderBy(desc(feedbackPosts.createdAt), desc(feedbackPosts.id)).limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const ids = page.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ postId: feedbackReplies.postId, count: sql<number>`count(*)`.as("count") })
        .from(feedbackReplies)
        .where(inArray(feedbackReplies.postId, ids))
        .groupBy(feedbackReplies.postId)
    : [];
  const countMap = new Map(counts.map((r) => [r.postId, Number(r.count)]));

  const items: FeedbackPost[] = page.map((r) => ({
    id: r.id,
    category: r.category as FeedbackCategory,
    title: r.title,
    text: r.text,
    tags: parseTagValue(r.tags),
    status: r.status as FeedbackStatus,
    answeredAt: nullableDate(r.answeredAt),
    author: authorOf(r),
    createdAt: safeDate(r.createdAt),
    replyCount: countMap.get(r.id) ?? 0,
  }));

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: Number(last.createdAt), id: last.id }) : null;
  return { items, nextCursor, hasMore };
}

export async function createFeedbackPost(userId: string, input: ValidatedFeedbackPost): Promise<FeedbackPost> {
  await ensureFeedbackTables();
  const id = crypto.randomUUID();
  await db.insert(feedbackPosts).values({
    id,
    userId,
    category: input.category,
    title: input.title,
    text: input.text,
    tags: input.tags,
    status: "open",
  });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return {
    id,
    category: input.category,
    title: input.title,
    text: input.text,
    tags: input.tags,
    status: "open",
    answeredAt: null,
    author: { id: userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "#7c5cfc" },
    createdAt: new Date().toISOString(),
    replyCount: 0,
  };
}

export async function listFeedbackReplies(postId: string): Promise<FeedbackReply[]> {
  await ensureFeedbackTables();
  const rows = await db
    .select({
      id: feedbackReplies.id,
      postId: feedbackReplies.postId,
      parentId: feedbackReplies.parentId,
      text: feedbackReplies.text,
      isOfficial: feedbackReplies.isOfficial,
      createdAt: feedbackReplies.createdAt,
      userId: users.id,
      author: users.name,
      avatar: users.avatar,
    })
    .from(feedbackReplies)
    .innerJoin(users, eq(feedbackReplies.userId, users.id))
    .where(eq(feedbackReplies.postId, postId))
    .orderBy(feedbackReplies.createdAt);
  const mapped: FeedbackReply[] = rows.map((r) => ({
    id: r.id,
    postId: r.postId,
    parentId: r.parentId,
    author: authorOf(r),
    text: r.text,
    isOfficial: !!r.isOfficial,
    createdAt: safeDate(r.createdAt),
  }));
  return buildReplyTree(mapped);
}

export async function createFeedbackReply(input: {
  postId: string;
  parentId?: string | null;
  userId: string;
  text: string;
  isOfficial: boolean;
}): Promise<FeedbackReply> {
  await ensureFeedbackTables();
  const [post] = await db
    .select({ id: feedbackPosts.id, status: feedbackPosts.status })
    .from(feedbackPosts)
    .where(eq(feedbackPosts.id, input.postId))
    .limit(1);
  if (!post) throw new Error("답변할 게시글을 찾을 수 없습니다.");
  const depth = await getReplyDepth(input.postId, input.parentId ?? null);
  if (depth === "missing") throw new Error("답변의 상위 항목을 찾을 수 없습니다.");
  if (depth === "exceed") throw new Error("답변은 최대 4단계까지만 작성할 수 있습니다.");

  const id = crypto.randomUUID();
  await db.insert(feedbackReplies).values({
    id,
    postId: input.postId,
    parentId: input.parentId ?? null,
    userId: input.userId,
    text: input.text,
    isOfficial: input.isOfficial,
  });
  // 운영자 답변이면 게시글을 '답변완료'로 승격.
  if (input.isOfficial && post.status !== "answered") {
    await db
      .update(feedbackPosts)
      .set({ status: "answered", answeredAt: new Date() })
      .where(eq(feedbackPosts.id, input.postId));
  }
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  return {
    id,
    postId: input.postId,
    parentId: input.parentId ?? null,
    author: { id: input.userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "#7c5cfc" },
    text: input.text,
    isOfficial: input.isOfficial,
    createdAt: new Date().toISOString(),
  };
}
