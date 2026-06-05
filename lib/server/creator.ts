// 창작 게시판(사용자 제작 웹툰/컷툰) 서버 로직 — feedback.ts 패턴을 따른다.
// 스키마는 lib/db/schema.ts에 이미 존재(creatorWorks/creatorWorkLikes/creatorWorkComments) — 재정의하지 않는다.
import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { creatorWorkComments, creatorWorkLikes, creatorWorks, db, users } from "../db";

const SORTS = new Set<CreatorWorkSort>(["recent", "likes", "views"]);
const FORMATS = new Set<CreatorWorkFormat>(["cuttoon", "upload"]);
const STATUSES = new Set<CreatorWorkStatus>(["draft", "published"]);
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_COMMENT = 1000;
const MAX_TAGS = 8;
const MAX_TAG_LEN = 24;
const MAX_PAGES = 200;

export type CreatorWorkSort = "recent" | "likes" | "views";
export type CreatorWorkFormat = "cuttoon" | "upload";
export type CreatorWorkStatus = "draft" | "published";

export interface CreatorAuthor {
  id?: string;
  name: string;
  avatar: string;
}

export interface CreatorWorkSummary {
  id: string;
  title: string;
  description: string;
  cover: string;
  tags: string[];
  format: CreatorWorkFormat;
  titleId: string | null;
  status: CreatorWorkStatus;
  author: CreatorAuthor;
  likes: number;
  comments: number;
  views: number;
  liked: boolean;
  createdAt: string;
}

export interface CreatorWorkDetail extends CreatorWorkSummary {
  pages: string[];
  doc: unknown;
  isOwner: boolean;
  updatedAt: string;
}

export interface CreatorWorkComment {
  id: string;
  workId: string;
  author: CreatorAuthor;
  text: string;
  createdAt: string;
}

export interface CreatorWorkInput {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  format?: unknown;
  titleId?: unknown;
  cover?: unknown;
  pages?: unknown;
  doc?: unknown;
  status?: unknown;
}

function safeDate(value: Date | number | null | undefined): string {
  return new Date(value ?? Date.now()).toISOString();
}

function authorOf(row: { userId?: string | null; author?: string | null; avatar?: string | null }): CreatorAuthor {
  return { id: row.userId ?? undefined, name: row.author ?? "익명", avatar: row.avatar ?? "#7c5cfc" };
}

function clampText(value: unknown, max: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizeMultiline(value: unknown, max: number): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().replace(/\n{3,}/g, "\n\n").slice(0, max);
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const tag = clampText(raw, MAX_TAG_LEN).replace(/^#/, "");
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
    if (out.length >= MAX_TAGS) break;
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

function cleanPages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((p) => String(p ?? "")).filter((p) => p.length > 0).slice(0, MAX_PAGES);
}

function parsePages(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((p) => String(p ?? ""));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((p) => String(p ?? ""));
    } catch {
      return [];
    }
  }
  return [];
}

function parseFormat(value: unknown): CreatorWorkFormat {
  return FORMATS.has(value as CreatorWorkFormat) ? (value as CreatorWorkFormat) : "cuttoon";
}

function parseStatus(value: unknown): CreatorWorkStatus {
  return STATUSES.has(value as CreatorWorkStatus) ? (value as CreatorWorkStatus) : "published";
}

function parseTitleId(value: unknown): string | null {
  const id = clampText(value, 160);
  return id.length > 0 ? id : null;
}

export function parseCreatorSort(value: unknown): CreatorWorkSort {
  return SORTS.has(value as CreatorWorkSort) ? (value as CreatorWorkSort) : "recent";
}

// ── 목록 ─────────────────────────────────────────────────────────────
export async function listWorks(opts: {
  titleId?: string;
  userId?: string;
  sort?: CreatorWorkSort;
  tag?: string;
  viewerId?: string;
  includeHidden?: boolean;
} = {}): Promise<CreatorWorkSummary[]> {
  try {
    const sort = parseCreatorSort(opts.sort);
    let where: SQL | undefined;
    const addWhere = (c: SQL | undefined) => {
      if (!c) return;
      where = where ? and(where, c) : c;
    };
    // 소유자가 본인 목록을 조회하면(viewerId === userId) 초안·비공개까지 포함(내 게시물 관리용).
    // 그 외에는 공개(published) + 비노출 제외(관리자 includeHidden 제외).
    const ownerView = !!opts.userId && !!opts.viewerId && opts.viewerId === opts.userId;
    if (!ownerView) {
      addWhere(eq(creatorWorks.status, "published"));
      if (!opts.includeHidden) addWhere(eq(creatorWorks.hidden, false));
    }
    if (opts.titleId) addWhere(eq(creatorWorks.titleId, opts.titleId));
    if (opts.userId) addWhere(eq(creatorWorks.userId, opts.userId));
    const tag = String(opts.tag ?? "").trim().replace(/^#/, "").toLowerCase();
    if (tag) {
      addWhere(sql`lower(${creatorWorks.tags}::text) LIKE ${`%"${tag.replace(/[%_]/g, "\\$&")}"%`} ESCAPE '\\'`);
    }

    const likeCountExpr = sql<number>`(
      SELECT count(*) FROM ${creatorWorkLikes} WHERE ${creatorWorkLikes.workId} = ${creatorWorks.id}
    )`;
    const commentCountExpr = sql<number>`(
      SELECT count(*) FROM ${creatorWorkComments}
      WHERE ${creatorWorkComments.workId} = ${creatorWorks.id} AND ${creatorWorkComments.hidden} = false
    )`;

    let q = db
      .select({
        id: creatorWorks.id,
        title: creatorWorks.title,
        description: creatorWorks.description,
        cover: creatorWorks.cover,
        tags: creatorWorks.tags,
        format: creatorWorks.format,
        titleId: creatorWorks.titleId,
        status: creatorWorks.status,
        views: creatorWorks.views,
        createdAt: creatorWorks.createdAt,
        userId: users.id,
        author: users.name,
        avatar: users.avatar,
        likes: likeCountExpr.as("likes"),
        comments: commentCountExpr.as("comments"),
      })
      .from(creatorWorks)
      .innerJoin(users, eq(creatorWorks.userId, users.id))
      .$dynamic();
    if (where) q = q.where(where);

    const orderBy =
      sort === "likes"
        ? [desc(likeCountExpr), desc(creatorWorks.createdAt), desc(creatorWorks.id)]
        : sort === "views"
          ? [desc(creatorWorks.views), desc(creatorWorks.createdAt), desc(creatorWorks.id)]
          : [desc(creatorWorks.createdAt), desc(creatorWorks.id)];
    const rows = await q.orderBy(...orderBy);

    // 뷰어가 좋아요한 작품 집합
    const ids = rows.map((r) => r.id);
    const likedSet = new Set<string>();
    if (opts.viewerId && ids.length) {
      const likedRows = await db
        .select({ workId: creatorWorkLikes.workId })
        .from(creatorWorkLikes)
        .where(eq(creatorWorkLikes.userId, opts.viewerId));
      for (const r of likedRows) likedSet.add(r.workId);
    }

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      cover: r.cover ?? "",
      tags: parseTagValue(r.tags),
      format: parseFormat(r.format),
      titleId: r.titleId ?? null,
      status: parseStatus(r.status),
      author: authorOf(r),
      likes: Number(r.likes ?? 0),
      comments: Number(r.comments ?? 0),
      views: Number(r.views ?? 0),
      liked: likedSet.has(r.id),
      createdAt: safeDate(r.createdAt),
    }));
  } catch {
    return [];
  }
}

// ── 단건 조회(전체) ──────────────────────────────────────────────────
export async function getWork(id: string, viewerId?: string): Promise<CreatorWorkDetail | null> {
  try {
    const [row] = await db
      .select({
        id: creatorWorks.id,
        title: creatorWorks.title,
        description: creatorWorks.description,
        cover: creatorWorks.cover,
        tags: creatorWorks.tags,
        format: creatorWorks.format,
        titleId: creatorWorks.titleId,
        status: creatorWorks.status,
        hidden: creatorWorks.hidden,
        views: creatorWorks.views,
        pages: creatorWorks.pages,
        doc: creatorWorks.doc,
        createdAt: creatorWorks.createdAt,
        updatedAt: creatorWorks.updatedAt,
        ownerId: creatorWorks.userId,
        userId: users.id,
        author: users.name,
        avatar: users.avatar,
      })
      .from(creatorWorks)
      .innerJoin(users, eq(creatorWorks.userId, users.id))
      .where(eq(creatorWorks.id, id))
      .limit(1);
    if (!row) return null;
    const isOwner = !!viewerId && viewerId === row.ownerId;
    if (row.hidden && !isOwner) return null;

    const [likeCount] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(creatorWorkLikes)
      .where(eq(creatorWorkLikes.workId, id));
    const [commentCount] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(creatorWorkComments)
      .where(and(eq(creatorWorkComments.workId, id), eq(creatorWorkComments.hidden, false)));

    let liked = false;
    if (viewerId) {
      const [likedRow] = await db
        .select({ workId: creatorWorkLikes.workId })
        .from(creatorWorkLikes)
        .where(and(eq(creatorWorkLikes.workId, id), eq(creatorWorkLikes.userId, viewerId)))
        .limit(1);
      liked = !!likedRow;
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      cover: row.cover ?? "",
      tags: parseTagValue(row.tags),
      format: parseFormat(row.format),
      titleId: row.titleId ?? null,
      status: parseStatus(row.status),
      author: authorOf(row),
      likes: Number(likeCount?.count ?? 0),
      comments: Number(commentCount?.count ?? 0),
      views: Number(row.views ?? 0),
      liked,
      createdAt: safeDate(row.createdAt),
      updatedAt: safeDate(row.updatedAt),
      pages: parsePages(row.pages),
      doc: row.doc ?? {},
      isOwner,
    };
  } catch {
    return null;
  }
}

// ── 조회수 증가(best-effort) ─────────────────────────────────────────
export async function bumpViews(id: string): Promise<void> {
  try {
    await db
      .update(creatorWorks)
      .set({ views: sql`${creatorWorks.views} + 1` })
      .where(eq(creatorWorks.id, id));
  } catch {
    // best-effort: 실패해도 무시
  }
}

// ── 생성 ─────────────────────────────────────────────────────────────
export async function createWork(userId: string, input: CreatorWorkInput): Promise<CreatorWorkSummary> {
  const title = clampText(input.title, MAX_TITLE);
  if (title.length < 1) throw new Error("제목을 입력해 주세요.");
  const description = normalizeMultiline(input.description, MAX_DESCRIPTION);
  const tags = cleanTags(input.tags);
  const format = parseFormat(input.format);
  const titleId = parseTitleId(input.titleId);
  const cover = String(input.cover ?? "");
  const pages = cleanPages(input.pages);
  const doc = input.doc ?? {};
  const status = parseStatus(input.status);

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(creatorWorks).values({
    id,
    userId,
    titleId,
    title,
    description,
    cover,
    tags,
    format,
    pages,
    doc,
    status,
    createdAt: now,
    updatedAt: now,
  });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return {
    id,
    title,
    description,
    cover,
    tags,
    format,
    titleId,
    status,
    author: { id: userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "#7c5cfc" },
    likes: 0,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: safeDate(now),
  };
}

// ── 수정(작성자 전용) ────────────────────────────────────────────────
export async function updateWork(userId: string, id: string, patch: CreatorWorkInput): Promise<CreatorWorkSummary> {
  const [existing] = await db
    .select({ id: creatorWorks.id, ownerId: creatorWorks.userId })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, id))
    .limit(1);
  if (!existing) throw new Error("작품을 찾을 수 없습니다.");
  if (existing.ownerId !== userId) throw new Error("작성자만 수정할 수 있습니다.");

  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    const title = clampText(patch.title, MAX_TITLE);
    if (title.length < 1) throw new Error("제목을 입력해 주세요.");
    fields.title = title;
  }
  if (patch.description !== undefined) fields.description = normalizeMultiline(patch.description, MAX_DESCRIPTION);
  if (patch.tags !== undefined) fields.tags = cleanTags(patch.tags);
  if (patch.cover !== undefined) fields.cover = String(patch.cover ?? "");
  if (patch.pages !== undefined) fields.pages = cleanPages(patch.pages);
  if (patch.doc !== undefined) fields.doc = patch.doc ?? {};
  if (patch.status !== undefined) fields.status = parseStatus(patch.status);
  if (patch.titleId !== undefined) fields.titleId = parseTitleId(patch.titleId);

  await db.update(creatorWorks).set(fields).where(eq(creatorWorks.id, id));
  const detail = await getWork(id, userId);
  if (!detail) throw new Error("작품을 찾을 수 없습니다.");
  const { pages: _pages, doc: _doc, isOwner: _isOwner, updatedAt: _updatedAt, ...summary } = detail;
  return summary;
}

// ── 삭제(작성자 또는 관리자) ─────────────────────────────────────────
export async function deleteWork(userId: string, id: string, isAdmin: boolean): Promise<{ deleted: boolean }> {
  const [existing] = await db
    .select({ id: creatorWorks.id, ownerId: creatorWorks.userId })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, id))
    .limit(1);
  if (!existing) return { deleted: false };
  if (existing.ownerId !== userId && !isAdmin) throw new Error("작성자만 삭제할 수 있습니다.");
  await db.delete(creatorWorks).where(eq(creatorWorks.id, id));
  return { deleted: true };
}

// ── 좋아요 토글 ──────────────────────────────────────────────────────
export async function toggleLike(userId: string, workId: string): Promise<{ liked: boolean; likes: number }> {
  const [existing] = await db
    .select({ workId: creatorWorkLikes.workId })
    .from(creatorWorkLikes)
    .where(and(eq(creatorWorkLikes.workId, workId), eq(creatorWorkLikes.userId, userId)))
    .limit(1);

  let liked: boolean;
  if (existing) {
    await db
      .delete(creatorWorkLikes)
      .where(and(eq(creatorWorkLikes.workId, workId), eq(creatorWorkLikes.userId, userId)));
    liked = false;
  } else {
    await db.insert(creatorWorkLikes).values({ userId, workId }).onConflictDoNothing();
    liked = true;
  }

  const [count] = await db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(creatorWorkLikes)
    .where(eq(creatorWorkLikes.workId, workId));
  return { liked, likes: Number(count?.count ?? 0) };
}

// ── 댓글 목록 ────────────────────────────────────────────────────────
export async function listComments(workId: string, includeHidden = false): Promise<CreatorWorkComment[]> {
  try {
    let where: SQL | undefined = eq(creatorWorkComments.workId, workId);
    if (!includeHidden) where = and(where, eq(creatorWorkComments.hidden, false));
    const rows = await db
      .select({
        id: creatorWorkComments.id,
        workId: creatorWorkComments.workId,
        text: creatorWorkComments.text,
        createdAt: creatorWorkComments.createdAt,
        userId: users.id,
        author: users.name,
        avatar: users.avatar,
      })
      .from(creatorWorkComments)
      .innerJoin(users, eq(creatorWorkComments.userId, users.id))
      .where(where)
      .orderBy(creatorWorkComments.createdAt);
    return rows.map((r) => ({
      id: r.id,
      workId: r.workId,
      author: authorOf(r),
      text: r.text,
      createdAt: safeDate(r.createdAt),
    }));
  } catch {
    return [];
  }
}

// ── 댓글 작성 ────────────────────────────────────────────────────────
export async function addComment(userId: string, workId: string, text: unknown): Promise<CreatorWorkComment> {
  const clean = normalizeMultiline(text, MAX_COMMENT);
  if (clean.length < 1) throw new Error("댓글 내용을 입력해 주세요.");
  const [work] = await db
    .select({ id: creatorWorks.id })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  if (!work) throw new Error("댓글을 달 작품을 찾을 수 없습니다.");

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(creatorWorkComments).values({ id, workId, userId, text: clean, createdAt: now });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return {
    id,
    workId,
    author: { id: userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "#7c5cfc" },
    text: clean,
    createdAt: safeDate(now),
  };
}
