// 창작 게시판(사용자 제작 웹툰/컷툰) 서버 로직 — feedback.ts 패턴을 따른다.
// 스키마는 lib/db/schema.ts에 이미 존재(creatorWorks/creatorWorkLikes/creatorWorkComments) — 재정의하지 않는다.
import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { creatorAssets, creatorWorkComments, creatorWorkLikes, creatorWorks, db, users } from "../db";

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

// ── 공유 에셋(회원이 사이트에 올려 모두가 재사용) ──────────────────────
const MAX_ASSET_NAME = 60;
const MAX_ASSET_DATAURL = 3_000_000; // 데이터URL 길이 상한(DB 보호; 축소 webp 기준 충분)
const ASSET_KINDS = new Set(["image", "sticker"]);

export interface CreatorSharedAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  kind: string;
  downloads: number;
  author: CreatorAuthor;
  isOwner: boolean;
  createdAt: string;
}

function clampDim(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(4096, n));
}

// creator_asset 테이블 자가생성(멱등) — 서버리스/무료DB 환경에서 drizzle push 없이도 첫 호출 시 보장.
// 운영 DB 접속문자열이 비공개(Vercel Sensitive)라 외부에서 push 불가 → 런타임 DATABASE_URL로 생성.
let assetTableReady: Promise<void> | null = null;
function ensureAssetTable(): Promise<void> {
  if (!assetTableReady) {
    assetTableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "creator_asset" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "name" text NOT NULL,
          "dataUrl" text NOT NULL,
          "width" integer NOT NULL,
          "height" integer NOT NULL,
          "kind" text NOT NULL DEFAULT 'image',
          "hidden" boolean NOT NULL DEFAULT false,
          "downloads" integer NOT NULL DEFAULT 0,
          "createdAt" timestamp
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "creator_asset_created_idx" ON "creator_asset" ("createdAt")`);
    })().catch((error) => {
      assetTableReady = null; // 실패 시 다음 호출에서 재시도
      throw error;
    });
  }
  return assetTableReady;
}

export async function listSharedAssets(opts: {
  limit?: number;
  offset?: number;
  mineUserId?: string; // 지정 시 해당 회원이 올린 것만(내 공유 목록)
  viewerId?: string;
} = {}): Promise<CreatorSharedAsset[]> {
  await ensureAssetTable();
  const limit = Math.max(1, Math.min(120, opts.limit ?? 60));
  const offset = Math.max(0, opts.offset ?? 0);
  const wheres: SQL[] = [eq(creatorAssets.hidden, false)];
  if (opts.mineUserId) wheres.push(eq(creatorAssets.userId, opts.mineUserId));
  const rows = await db
    .select({
      id: creatorAssets.id,
      userId: creatorAssets.userId,
      name: creatorAssets.name,
      dataUrl: creatorAssets.dataUrl,
      width: creatorAssets.width,
      height: creatorAssets.height,
      kind: creatorAssets.kind,
      downloads: creatorAssets.downloads,
      createdAt: creatorAssets.createdAt,
      author: users.name,
      avatar: users.avatar,
    })
    .from(creatorAssets)
    .leftJoin(users, eq(creatorAssets.userId, users.id))
    .where(and(...wheres))
    .orderBy(desc(creatorAssets.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    dataUrl: row.dataUrl,
    width: row.width,
    height: row.height,
    kind: row.kind,
    downloads: row.downloads,
    author: authorOf(row),
    isOwner: !!opts.viewerId && opts.viewerId === row.userId,
    createdAt: safeDate(row.createdAt),
  }));
}

export async function publishAsset(
  userId: string,
  input: { name?: unknown; dataUrl?: unknown; width?: unknown; height?: unknown; kind?: unknown }
): Promise<CreatorSharedAsset> {
  await ensureAssetTable();
  const name = clampText(input.name, MAX_ASSET_NAME) || "내 에셋";
  const dataUrl = String(input.dataUrl ?? "");
  if (!/^data:image\//.test(dataUrl)) throw new Error("이미지 데이터가 올바르지 않습니다.");
  if (dataUrl.length > MAX_ASSET_DATAURL) throw new Error("이미지 용량이 너무 큽니다. (3MB 이하)");
  const kind = ASSET_KINDS.has(input.kind as string) ? (input.kind as string) : "image";
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(creatorAssets).values({
    id,
    userId,
    name,
    dataUrl,
    width: clampDim(input.width),
    height: clampDim(input.height),
    kind,
    createdAt: now,
  });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return {
    id,
    name,
    dataUrl,
    width: clampDim(input.width),
    height: clampDim(input.height),
    kind,
    downloads: 0,
    author: { id: userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "#7c5cfc" },
    isOwner: true,
    createdAt: safeDate(now),
  };
}

export async function deleteSharedAsset(userId: string, id: string, isAdmin: boolean): Promise<{ deleted: boolean }> {
  await ensureAssetTable();
  const [existing] = await db
    .select({ id: creatorAssets.id, ownerId: creatorAssets.userId })
    .from(creatorAssets)
    .where(eq(creatorAssets.id, id))
    .limit(1);
  if (!existing) return { deleted: false };
  if (existing.ownerId !== userId && !isAdmin) throw new Error("올린 사람만 삭제할 수 있습니다.");
  await db.delete(creatorAssets).where(eq(creatorAssets.id, id));
  return { deleted: true };
}

export async function bumpAssetDownloads(id: string): Promise<void> {
  await ensureAssetTable();
  await db
    .update(creatorAssets)
    .set({ downloads: sql`${creatorAssets.downloads} + 1` })
    .where(eq(creatorAssets.id, id));
}
