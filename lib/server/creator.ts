// 창작 게시판(사용자 제작 웹툰/컷툰) 서버 로직 — feedback.ts 패턴을 따른다.
// 스키마는 lib/db/schema.ts에 이미 존재(creatorWorks/creatorWorkLikes/creatorWorkComments) — 재정의하지 않는다.
// 연재 시리즈·챌린지·팔로우(creatorSeries/creatorChallenges/creatorFollows)도 이 파일에서 함께 다룬다.
import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  creatorAssets,
  creatorChallenges,
  creatorFollows,
  creatorSeries,
  creatorWorkComments,
  creatorWorkLikes,
  creatorWorks,
  db,
  dbPool,
  users,
} from "../db";

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
  // 연재 시리즈/챌린지 연결(스키마 미준비 환경에선 항상 null — 하위호환)
  seriesId: string | null;
  episodeNo: number | null;
  seriesTitle: string | null;
  challengeId: string | null;
  challengeTitle: string | null;
  createdAt: string;
}

// 작품 상세의 시리즈 이웃 회차(이전화/다음화) 내비게이션 항목.
export interface CreatorEpisodeRef {
  id: string;
  title: string;
  episodeNo: number | null;
}

export interface CreatorWorkDetail extends CreatorWorkSummary {
  pages: string[];
  doc: unknown;
  isOwner: boolean;
  updatedAt: string;
  series: { id: string; title: string; status: CreatorSeriesStatus } | null;
  prevEpisode: CreatorEpisodeRef | null;
  nextEpisode: CreatorEpisodeRef | null;
  challenge: { id: string; slug: string; title: string; endsAt: string | null } | null;
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
  // 연재 시리즈/챌린지 연결(선택) — 미전달 시 기존 단편 게시 플로우와 완전 동일하게 동작.
  seriesId?: unknown;
  challengeId?: unknown;
}

function safeDate(value: Date | number | string | null | undefined): string {
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

// seriesId/challengeId 같은 참조 id 정규화 — 빈 문자열은 null.
function parseRefId(value: unknown): string | null {
  const id = clampText(value, 160);
  return id.length > 0 ? id : null;
}

// ── 연재 시리즈/챌린지/팔로우 공통 타입·순수 헬퍼 ─────────────────────
export type CreatorSeriesStatus = "ongoing" | "completed";
export type CreatorSeriesSort = "recent" | "likes" | "views";
export type CreatorChallengeState = "upcoming" | "ongoing" | "ended";

const SERIES_STATUSES = new Set<CreatorSeriesStatus>(["ongoing", "completed"]);
const SERIES_SORTS = new Set<CreatorSeriesSort>(["recent", "likes", "views"]);
const MAX_SERIES_TITLE = 80;

export function parseSeriesStatus(value: unknown): CreatorSeriesStatus {
  return SERIES_STATUSES.has(value as CreatorSeriesStatus) ? (value as CreatorSeriesStatus) : "ongoing";
}

export function parseSeriesSort(value: unknown): CreatorSeriesSort {
  return SERIES_SORTS.has(value as CreatorSeriesSort) ? (value as CreatorSeriesSort) : "recent";
}

export interface CreatorSeriesInput {
  title?: unknown;
  description?: unknown;
  cover?: unknown;
  tags?: unknown;
  status?: unknown;
}

export interface ValidatedSeriesInput {
  title: string;
  description: string;
  cover: string;
  tags: string[];
  status: CreatorSeriesStatus;
}

// 시리즈 입력 정규화 — community.validatePostInput과 같은 {value,error} 패턴.
export function validateSeriesInput(input: CreatorSeriesInput): { value?: ValidatedSeriesInput; error?: string } {
  const title = clampText(input.title, MAX_SERIES_TITLE);
  if (title.length < 1) return { error: "시리즈 제목을 입력해 주세요." };
  return {
    value: {
      title,
      description: normalizeMultiline(input.description, MAX_DESCRIPTION),
      cover: String(input.cover ?? ""),
      tags: cleanTags(input.tags),
      status: parseSeriesStatus(input.status),
    },
  };
}

// 회차 번호 자동 부여 — 시리즈 내 최대 회차 + 1 (유효하지 않은 값은 무시, 최소 1화).
export function nextEpisodeNumber(existing: Array<number | string | null | undefined>): number {
  let max = 0;
  for (const raw of existing) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > max) max = Math.floor(value);
  }
  return max + 1;
}

// 팔로우 쌍 검증 — 자기 자신 팔로우 금지(순수 로직: 단위 테스트 대상).
export function validateFollowPair(
  followerId: unknown,
  creatorId: unknown
): { followerId?: string; creatorId?: string; error?: string } {
  const follower = clampText(followerId, 160);
  const creator = clampText(creatorId, 160);
  if (!follower || !creator) return { error: "로그인이 필요해요." };
  if (follower === creator) return { error: "자기 자신은 팔로우할 수 없습니다." };
  return { followerId: follower, creatorId: creator };
}

// 챌린지 진행 상태 — startsAt/endsAt이 없으면 항상 시작됨/끝나지 않음으로 본다.
export function challengeStateOf(
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined,
  now: Date = new Date()
): CreatorChallengeState {
  const start = startsAt == null ? null : new Date(startsAt);
  const end = endsAt == null ? null : new Date(endsAt);
  if (start && start.getTime() > now.getTime()) return "upcoming";
  if (end && end.getTime() < now.getTime()) return "ended";
  return "ongoing";
}

// 기본(시드) 챌린지 — 코드 정의 주간 주제. ensureDefaultChallenges가 idempotent하게 보장한다.
export interface SeedChallengeDef {
  slug: string;
  title: string;
  theme: string;
  durationDays: number;
}

export const SEED_CHALLENGES: SeedChallengeDef[] = [
  {
    slug: "rainy-day",
    title: "비 오는 날",
    theme: "창밖의 빗소리, 우산 속 두 사람, 젖은 골목… ‘비 오는 날’을 주제로 한 컷툰·일러스트를 올려 보세요.",
    durationDays: 7,
  },
  {
    slug: "first-meeting-4cut",
    title: "첫 만남 4컷",
    theme: "두 캐릭터의 첫 만남을 딱 4컷으로! 기승전결이 살아있는 4컷 만화에 도전해 보세요.",
    durationDays: 14,
  },
  {
    slug: "remake-my-fav",
    title: "나의 최애 리메이크",
    theme: "내가 사랑하는 작품의 명장면을 나만의 그림체로 리메이크해 공유하는 챌린지입니다.",
    durationDays: 21,
  },
  {
    slug: "midnight-snack",
    title: "한밤의 야식툰",
    theme: "새벽 1시, 참을 수 없는 야식의 유혹… 먹는 장면이 한 컷 이상 들어간 일상툰을 그려 보세요.",
    durationDays: 28,
  },
];

// 시드 챌린지의 노출 기간 — 기준 시각의 자정(UTC)부터 durationDays 동안. 순수 함수(테스트 대상).
export function seedChallengeWindow(def: SeedChallengeDef, now: Date = new Date()): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + Math.max(1, def.durationDays) * 86_400_000);
  return { startsAt, endsAt };
}

// ── 커뮤니티 확장 스키마 자가생성(멱등) — creator_asset의 ensure 패턴과 동일 ──
// drizzle-kit push 전에도 API가 500으로 죽지 않도록 simple query 프로토콜(raw 풀)로 DDL을 보장한다.
// 실패 시 false 반환 → 호출부가 기능을 우아하게 비활성화(목록 빈 배열·친절한 에러 메시지).
const CREATE_COMMUNITY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS "creator_work" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "titleId" text,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "cover" text NOT NULL DEFAULT '',
    "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "format" text NOT NULL DEFAULT 'cuttoon',
    "pages" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "doc" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "status" text NOT NULL DEFAULT 'published',
    "hidden" boolean NOT NULL DEFAULT false,
    "views" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp,
    "updatedAt" timestamp
  );
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "seriesId" text;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "episodeNo" integer;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "challengeId" text;
  CREATE INDEX IF NOT EXISTS "creator_work_series_idx" ON "creator_work" ("seriesId", "episodeNo");
  CREATE INDEX IF NOT EXISTS "creator_work_challenge_idx" ON "creator_work" ("challengeId");
  CREATE TABLE IF NOT EXISTS "creator_series" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "author" text NOT NULL DEFAULT '',
    "avatar" text NOT NULL DEFAULT '',
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "cover" text NOT NULL DEFAULT '',
    "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "status" text NOT NULL DEFAULT 'ongoing',
    "hidden" boolean NOT NULL DEFAULT false,
    "createdAt" timestamp,
    "updatedAt" timestamp
  );
  CREATE INDEX IF NOT EXISTS "creator_series_user_idx" ON "creator_series" ("userId");
  CREATE TABLE IF NOT EXISTS "creator_challenge" (
    "id" text PRIMARY KEY NOT NULL,
    "slug" text NOT NULL UNIQUE,
    "title" text NOT NULL,
    "theme" text NOT NULL DEFAULT '',
    "startsAt" timestamp,
    "endsAt" timestamp,
    "createdAt" timestamp
  );
  CREATE TABLE IF NOT EXISTS "creator_follow" (
    "followerId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "creatorId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "createdAt" timestamp,
    CONSTRAINT "creator_follow_pk" PRIMARY KEY ("followerId", "creatorId")
  );
`;
let communitySchemaReady = false;
export async function ensureCreatorCommunitySchema(): Promise<boolean> {
  if (communitySchemaReady) return true;
  try {
    await dbPool.query(CREATE_COMMUNITY_SCHEMA_SQL); // simple protocol; 다중 statement 허용
    communitySchemaReady = true;
    return true;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error(`[creator_community] ensure schema failed (code=${e?.code ?? "?"}): ${e?.message ?? error}`);
    return false;
  }
}

// ── 목록 ─────────────────────────────────────────────────────────────
export async function listWorks(opts: {
  titleId?: string;
  userId?: string;
  sort?: CreatorWorkSort;
  tag?: string;
  viewerId?: string;
  includeHidden?: boolean;
  // 커뮤니티 확장 필터 — 시리즈 회차 / 챌린지 참여작 / 팔로잉 피드(팔로우한 창작자의 작품)
  seriesId?: string;
  challengeId?: string;
  followedBy?: string;
} = {}): Promise<CreatorWorkSummary[]> {
  try {
    // 새 테이블·컬럼 보장(멱등, 1회). 실패해도 기본 목록은 동작해야 하므로 ready 플래그로 분기.
    const ready = await ensureCreatorCommunitySchema();
    if (!ready && (opts.seriesId || opts.challengeId || opts.followedBy)) return [];
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
    if (ready && opts.seriesId) addWhere(eq(creatorWorks.seriesId, opts.seriesId));
    if (ready && opts.challengeId) addWhere(eq(creatorWorks.challengeId, opts.challengeId));
    if (ready && opts.followedBy) {
      addWhere(
        sql`${creatorWorks.userId} IN (
          SELECT ${creatorFollows.creatorId} FROM ${creatorFollows}
          WHERE ${creatorFollows.followerId} = ${opts.followedBy}
        )`
      );
    }
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
        // 스키마 미준비(ready=false) 시 컬럼 참조 대신 NULL 리터럴 — 구버전 DB에서도 쿼리가 죽지 않는다.
        seriesId: ready ? creatorWorks.seriesId : sql<string | null>`NULL`,
        episodeNo: ready ? creatorWorks.episodeNo : sql<number | null>`NULL`,
        challengeId: ready ? creatorWorks.challengeId : sql<string | null>`NULL`,
        seriesTitle: ready ? creatorSeries.title : sql<string | null>`NULL`,
        challengeTitle: ready ? creatorChallenges.title : sql<string | null>`NULL`,
      })
      .from(creatorWorks)
      .innerJoin(users, eq(creatorWorks.userId, users.id))
      .$dynamic();
    if (ready) {
      q = q
        .leftJoin(creatorSeries, eq(creatorWorks.seriesId, creatorSeries.id))
        .leftJoin(creatorChallenges, eq(creatorWorks.challengeId, creatorChallenges.id));
    }
    if (where) q = q.where(where);

    const orderBy =
      ready && opts.seriesId
        ? // 시리즈 회차 목록은 회차 번호 순(미지정 회차는 뒤로)
          [sql`${creatorWorks.episodeNo} ASC NULLS LAST`, asc(creatorWorks.createdAt), asc(creatorWorks.id)]
        : sort === "likes"
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
      seriesId: r.seriesId ?? null,
      episodeNo: r.episodeNo == null ? null : Number(r.episodeNo),
      seriesTitle: r.seriesTitle ?? null,
      challengeId: r.challengeId ?? null,
      challengeTitle: r.challengeTitle ?? null,
      createdAt: safeDate(r.createdAt),
    }));
  } catch {
    return [];
  }
}

// ── 단건 조회(전체) ──────────────────────────────────────────────────
export async function getWork(id: string, viewerId?: string): Promise<CreatorWorkDetail | null> {
  try {
    const ready = await ensureCreatorCommunitySchema();
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
        seriesId: ready ? creatorWorks.seriesId : sql<string | null>`NULL`,
        episodeNo: ready ? creatorWorks.episodeNo : sql<number | null>`NULL`,
        challengeId: ready ? creatorWorks.challengeId : sql<string | null>`NULL`,
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

    // 시리즈/챌린지 부가 정보(배지 + 이전화/다음화) — best-effort.
    let series: CreatorWorkDetail["series"] = null;
    let seriesTitle: string | null = null;
    let prevEpisode: CreatorEpisodeRef | null = null;
    let nextEpisode: CreatorEpisodeRef | null = null;
    let challenge: CreatorWorkDetail["challenge"] = null;
    let challengeTitle: string | null = null;
    if (ready && row.seriesId) {
      const [s] = await db
        .select({ id: creatorSeries.id, title: creatorSeries.title, status: creatorSeries.status })
        .from(creatorSeries)
        .where(eq(creatorSeries.id, row.seriesId))
        .limit(1);
      if (s) {
        series = { id: s.id, title: s.title, status: parseSeriesStatus(s.status) };
        seriesTitle = s.title;
      }
      if (row.episodeNo != null) {
        const visible = and(
          eq(creatorWorks.seriesId, row.seriesId),
          eq(creatorWorks.status, "published"),
          eq(creatorWorks.hidden, false)
        );
        const [prev] = await db
          .select({ id: creatorWorks.id, title: creatorWorks.title, episodeNo: creatorWorks.episodeNo })
          .from(creatorWorks)
          .where(and(visible, lt(creatorWorks.episodeNo, row.episodeNo)))
          .orderBy(desc(creatorWorks.episodeNo))
          .limit(1);
        const [next] = await db
          .select({ id: creatorWorks.id, title: creatorWorks.title, episodeNo: creatorWorks.episodeNo })
          .from(creatorWorks)
          .where(and(visible, gt(creatorWorks.episodeNo, row.episodeNo)))
          .orderBy(asc(creatorWorks.episodeNo))
          .limit(1);
        if (prev) prevEpisode = { id: prev.id, title: prev.title, episodeNo: prev.episodeNo ?? null };
        if (next) nextEpisode = { id: next.id, title: next.title, episodeNo: next.episodeNo ?? null };
      }
    }
    if (ready && row.challengeId) {
      const [c] = await db
        .select({
          id: creatorChallenges.id,
          slug: creatorChallenges.slug,
          title: creatorChallenges.title,
          endsAt: creatorChallenges.endsAt,
        })
        .from(creatorChallenges)
        .where(eq(creatorChallenges.id, row.challengeId))
        .limit(1);
      if (c) {
        challenge = { id: c.id, slug: c.slug, title: c.title, endsAt: c.endsAt ? safeDate(c.endsAt) : null };
        challengeTitle = c.title;
      }
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
      seriesId: row.seriesId ?? null,
      episodeNo: row.episodeNo == null ? null : Number(row.episodeNo),
      seriesTitle,
      challengeId: row.challengeId ?? null,
      challengeTitle,
      createdAt: safeDate(row.createdAt),
      updatedAt: safeDate(row.updatedAt),
      pages: parsePages(row.pages),
      doc: row.doc ?? {},
      isOwner,
      series,
      prevEpisode,
      nextEpisode,
      challenge,
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

  // 시리즈/챌린지 연결(선택) — 미전달이면 기존 플로우 그대로(새 컬럼을 건드리지 않아 push 전 DB와도 호환).
  const seriesId = parseRefId(input.seriesId);
  const challengeId = parseRefId(input.challengeId);
  let episodeNo: number | null = null;
  let seriesTitle: string | null = null;
  let challengeTitle: string | null = null;
  if (seriesId || challengeId) {
    if (!(await ensureCreatorCommunitySchema())) {
      throw new Error("연재·챌린지 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
    }
    if (seriesId) {
      const series = await getOwnedSeriesOrThrow(seriesId, userId);
      seriesTitle = series.title;
      episodeNo = await nextEpisodeNoOf(seriesId); // 시리즈 내 max+1 자동 부여
    }
    if (challengeId) {
      const challenge = await assertJoinableChallenge(challengeId);
      challengeTitle = challenge.title;
    }
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const values: typeof creatorWorks.$inferInsert = {
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
  };
  if (seriesId) {
    values.seriesId = seriesId;
    values.episodeNo = episodeNo;
  }
  if (challengeId) values.challengeId = challengeId;
  await db.insert(creatorWorks).values(values);
  if (seriesId) await touchSeries(seriesId);
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
    seriesId,
    episodeNo,
    seriesTitle,
    challengeId,
    challengeTitle,
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

  // 시리즈/챌린지 연결 변경(선택 필드 — 미전달 시 기존 값 유지, 새 컬럼도 건드리지 않음).
  let bumpSeriesId: string | null = null;
  if (patch.seriesId !== undefined || patch.challengeId !== undefined) {
    if (!(await ensureCreatorCommunitySchema())) {
      throw new Error("연재·챌린지 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
    }
    const [current] = await db
      .select({ seriesId: creatorWorks.seriesId, challengeId: creatorWorks.challengeId })
      .from(creatorWorks)
      .where(eq(creatorWorks.id, id))
      .limit(1);
    if (patch.seriesId !== undefined) {
      const nextSeriesId = parseRefId(patch.seriesId);
      if (nextSeriesId !== (current?.seriesId ?? null)) {
        if (nextSeriesId) {
          await getOwnedSeriesOrThrow(nextSeriesId, userId);
          fields.seriesId = nextSeriesId;
          fields.episodeNo = await nextEpisodeNoOf(nextSeriesId); // 새 시리즈 기준 max+1
          bumpSeriesId = nextSeriesId;
        } else {
          fields.seriesId = null;
          fields.episodeNo = null;
        }
      }
    }
    if (patch.challengeId !== undefined) {
      const nextChallengeId = parseRefId(patch.challengeId);
      if (nextChallengeId !== (current?.challengeId ?? null)) {
        if (nextChallengeId) await assertJoinableChallenge(nextChallengeId);
        fields.challengeId = nextChallengeId;
      }
    }
  }

  await db.update(creatorWorks).set(fields).where(eq(creatorWorks.id, id));
  if (bumpSeriesId) await touchSeries(bumpSeriesId);
  const detail = await getWork(id, userId);
  if (!detail) throw new Error("작품을 찾을 수 없습니다.");
  const {
    pages: _pages,
    doc: _doc,
    isOwner: _isOwner,
    updatedAt: _updatedAt,
    series: _series,
    prevEpisode: _prevEpisode,
    nextEpisode: _nextEpisode,
    challenge: _challenge,
    ...summary
  } = detail;
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
// 주의: drizzle의 db.execute는 prepared(extended) 경로 — 일부 풀러(pgbouncer)에서 DDL 실패.
// 그래서 raw 풀(simple query protocol)로 실행한다. 실패해도 throw 대신 false 반환 → 호출부가 우아하게 처리.
const CREATE_ASSET_TABLE_SQL = `
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
  );
  CREATE INDEX IF NOT EXISTS "creator_asset_created_idx" ON "creator_asset" ("createdAt");
`;
let assetTableReady = false;
async function ensureAssetTable(): Promise<boolean> {
  if (assetTableReady) return true;
  try {
    await dbPool.query(CREATE_ASSET_TABLE_SQL); // simple protocol; 다중 statement 허용
    assetTableReady = true;
    return true;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error(`[creator_asset] ensure table failed (code=${e?.code ?? "?"}): ${e?.message ?? error}`);
    return false;
  }
}

export async function listSharedAssets(opts: {
  limit?: number;
  offset?: number;
  mineUserId?: string; // 지정 시 해당 회원이 올린 것만(내 공유 목록)
  viewerId?: string;
} = {}): Promise<CreatorSharedAsset[]> {
  if (!(await ensureAssetTable())) return []; // 테이블 미생성(권한/풀러) 시 빈 목록으로 우아하게
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
  if (!(await ensureAssetTable())) throw new Error("에셋 공유 기능을 준비 중입니다. 잠시 후 다시 시도해주세요.");
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
  if (!(await ensureAssetTable())) return { deleted: false };
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
  if (!(await ensureAssetTable())) return;
  await db
    .update(creatorAssets)
    .set({ downloads: sql`${creatorAssets.downloads} + 1` })
    .where(eq(creatorAssets.id, id));
}

// ═══════════════════════════════════════════════════════════════════
// 연재 시리즈 (코미코 베스트도전 스타일) — 회차는 creator_work.seriesId 로 연결
// ═══════════════════════════════════════════════════════════════════

export interface CreatorSeriesSummary {
  id: string;
  title: string;
  description: string;
  cover: string;
  tags: string[];
  status: CreatorSeriesStatus;
  author: CreatorAuthor;
  episodes: number; // 공개 회차 수
  views: number; // 공개 회차 조회 합산
  likes: number; // 회차 좋아요 합산
  latestEpisodeAt: string | null; // 최신 회차 게시일
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorSeriesDetail extends CreatorSeriesSummary {
  episodeList: CreatorWorkSummary[]; // episodeNo 오름차순(미지정 회차는 뒤)
}

// 시리즈 행 + 회차 집계 select 맵(공유) — 공개(published)·비노출 제외 기준 합산.
function seriesAggregates() {
  const visibleEpisode = sql`${creatorWorks.seriesId} = ${creatorSeries.id} AND ${creatorWorks.status} = 'published' AND ${creatorWorks.hidden} = false`;
  return {
    episodes: sql<number>`(SELECT count(*) FROM ${creatorWorks} WHERE ${visibleEpisode})`.as("episodes"),
    views: sql<number>`(SELECT coalesce(sum(${creatorWorks.views}), 0) FROM ${creatorWorks} WHERE ${visibleEpisode})`.as(
      "views"
    ),
    likes: sql<number>`(
      SELECT count(*) FROM ${creatorWorkLikes}
      INNER JOIN ${creatorWorks} ON ${creatorWorkLikes.workId} = ${creatorWorks.id}
      WHERE ${visibleEpisode}
    )`.as("likes"),
    latestEpisodeAt: sql<Date | string | null>`(
      SELECT max(${creatorWorks.createdAt}) FROM ${creatorWorks} WHERE ${visibleEpisode}
    )`.as("latestEpisodeAt"),
    // 시리즈 커버가 비어 있으면 1화(가장 앞 회차) 커버로 폴백.
    coverFallback: sql<string | null>`(
      SELECT ${creatorWorks.cover} FROM ${creatorWorks}
      WHERE ${visibleEpisode} AND ${creatorWorks.cover} <> ''
      ORDER BY ${creatorWorks.episodeNo} ASC NULLS LAST, ${creatorWorks.createdAt} ASC
      LIMIT 1
    )`.as("coverFallback"),
  };
}

interface SeriesRow {
  id: string;
  title: string;
  description: string | null;
  cover: string | null;
  tags: unknown;
  status: string | null;
  ownerId: string;
  authorSnapshot: string | null;
  avatarSnapshot: string | null;
  author: string | null;
  avatar: string | null;
  episodes: number;
  views: number;
  likes: number;
  latestEpisodeAt: Date | string | null;
  coverFallback: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function mapSeriesRow(row: SeriesRow, viewerId?: string): CreatorSeriesSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    cover: row.cover || row.coverFallback || "",
    tags: parseTagValue(row.tags),
    status: parseSeriesStatus(row.status),
    author: {
      id: row.ownerId,
      // users 조인 값 우선, 없으면 게시 시점 스냅샷 폴백
      name: row.author || row.authorSnapshot || "익명",
      avatar: row.avatar || row.avatarSnapshot || "#7c5cfc",
    },
    episodes: Number(row.episodes ?? 0),
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    latestEpisodeAt: row.latestEpisodeAt == null ? null : safeDate(row.latestEpisodeAt),
    isOwner: !!viewerId && viewerId === row.ownerId,
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
  };
}

function seriesSelectMap() {
  return {
    id: creatorSeries.id,
    title: creatorSeries.title,
    description: creatorSeries.description,
    cover: creatorSeries.cover,
    tags: creatorSeries.tags,
    status: creatorSeries.status,
    ownerId: creatorSeries.userId,
    authorSnapshot: creatorSeries.author,
    avatarSnapshot: creatorSeries.avatar,
    author: users.name,
    avatar: users.avatar,
    createdAt: creatorSeries.createdAt,
    updatedAt: creatorSeries.updatedAt,
    ...seriesAggregates(),
  };
}

// ── 시리즈 목록 — 정렬: recent(최신 갱신) | likes(좋아요 합산) | views(조회 합산) ──
export async function listSeries(opts: {
  userId?: string;
  sort?: CreatorSeriesSort;
  viewerId?: string;
} = {}): Promise<CreatorSeriesSummary[]> {
  try {
    if (!(await ensureCreatorCommunitySchema())) return [];
    const sort = parseSeriesSort(opts.sort);
    let where: SQL | undefined;
    const addWhere = (c: SQL | undefined) => {
      if (!c) return;
      where = where ? and(where, c) : c;
    };
    const ownerView = !!opts.userId && !!opts.viewerId && opts.viewerId === opts.userId;
    if (!ownerView) addWhere(eq(creatorSeries.hidden, false));
    if (opts.userId) addWhere(eq(creatorSeries.userId, opts.userId));

    const agg = seriesAggregates();
    let q = db
      .select(seriesSelectMap())
      .from(creatorSeries)
      .leftJoin(users, eq(creatorSeries.userId, users.id))
      .$dynamic();
    if (where) q = q.where(where);
    const orderBy =
      sort === "likes"
        ? [desc(agg.likes), desc(creatorSeries.updatedAt), desc(creatorSeries.id)]
        : sort === "views"
          ? [desc(agg.views), desc(creatorSeries.updatedAt), desc(creatorSeries.id)]
          : [desc(creatorSeries.updatedAt), desc(creatorSeries.id)];
    const rows = await q.orderBy(...orderBy);
    return rows.map((row) => mapSeriesRow(row, opts.viewerId));
  } catch {
    return [];
  }
}

// ── 시리즈 상세(회차 목록 포함) ──────────────────────────────────────
export async function getSeries(id: string, viewerId?: string): Promise<CreatorSeriesDetail | null> {
  try {
    if (!(await ensureCreatorCommunitySchema())) return null;
    const [row] = await db
      .select({ ...seriesSelectMap(), hidden: creatorSeries.hidden })
      .from(creatorSeries)
      .leftJoin(users, eq(creatorSeries.userId, users.id))
      .where(eq(creatorSeries.id, id))
      .limit(1);
    if (!row) return null;
    const isOwner = !!viewerId && viewerId === row.ownerId;
    if (row.hidden && !isOwner) return null;
    // 소유자는 초안 회차까지(내 연재 관리), 그 외는 공개 회차만.
    const episodeList = await listWorks({
      seriesId: id,
      viewerId,
      userId: isOwner ? row.ownerId : undefined,
    });
    return { ...mapSeriesRow(row, viewerId), episodeList };
  } catch {
    return null;
  }
}

// 소유 시리즈 조회(없으면/남의 것이면 throw) — 회차 추가·시리즈 수정 공용.
async function getOwnedSeriesOrThrow(seriesId: string, userId: string): Promise<{ id: string; title: string }> {
  const [series] = await db
    .select({ id: creatorSeries.id, title: creatorSeries.title, ownerId: creatorSeries.userId })
    .from(creatorSeries)
    .where(eq(creatorSeries.id, seriesId))
    .limit(1);
  if (!series) throw new Error("시리즈를 찾을 수 없습니다.");
  if (series.ownerId !== userId) throw new Error("내 시리즈에만 회차를 추가할 수 있습니다.");
  return { id: series.id, title: series.title };
}

// 다음 회차 번호 — 시리즈 내 max(episodeNo) + 1.
async function nextEpisodeNoOf(seriesId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${creatorWorks.episodeNo})` })
    .from(creatorWorks)
    .where(eq(creatorWorks.seriesId, seriesId));
  return nextEpisodeNumber([row?.max]);
}

// 회차 추가/연결 시 시리즈 갱신일 bump — recent 정렬("최신 회차 갱신") 근거.
async function touchSeries(seriesId: string): Promise<void> {
  try {
    await db.update(creatorSeries).set({ updatedAt: new Date() }).where(eq(creatorSeries.id, seriesId));
  } catch {
    // best-effort
  }
}

// ── 시리즈 생성 ──────────────────────────────────────────────────────
export async function createSeries(userId: string, input: CreatorSeriesInput): Promise<CreatorSeriesSummary> {
  if (!(await ensureCreatorCommunitySchema())) {
    throw new Error("연재 시리즈 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
  }
  const { value, error } = validateSeriesInput(input);
  if (error || !value) throw new Error(error ?? "시리즈 정보를 확인해 주세요.");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(creatorSeries).values({
    id,
    userId,
    author: user?.name ?? "",
    avatar: user?.avatar ?? "",
    title: value.title,
    description: value.description,
    cover: value.cover,
    tags: value.tags,
    status: value.status,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    title: value.title,
    description: value.description,
    cover: value.cover,
    tags: value.tags,
    status: value.status,
    author: { id: userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "#7c5cfc" },
    episodes: 0,
    views: 0,
    likes: 0,
    latestEpisodeAt: null,
    isOwner: true,
    createdAt: safeDate(now),
    updatedAt: safeDate(now),
  };
}

// ── 시리즈 수정(소유자 전용) ─────────────────────────────────────────
export async function updateSeries(
  userId: string,
  id: string,
  patch: CreatorSeriesInput
): Promise<CreatorSeriesSummary> {
  if (!(await ensureCreatorCommunitySchema())) {
    throw new Error("연재 시리즈 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
  }
  const [existing] = await db
    .select({ id: creatorSeries.id, ownerId: creatorSeries.userId })
    .from(creatorSeries)
    .where(eq(creatorSeries.id, id))
    .limit(1);
  if (!existing) throw new Error("시리즈를 찾을 수 없습니다.");
  if (existing.ownerId !== userId) throw new Error("시리즈를 만든 사람만 수정할 수 있습니다.");

  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    const title = clampText(patch.title, MAX_SERIES_TITLE);
    if (title.length < 1) throw new Error("시리즈 제목을 입력해 주세요.");
    fields.title = title;
  }
  if (patch.description !== undefined) fields.description = normalizeMultiline(patch.description, MAX_DESCRIPTION);
  if (patch.cover !== undefined) fields.cover = String(patch.cover ?? "");
  if (patch.tags !== undefined) fields.tags = cleanTags(patch.tags);
  if (patch.status !== undefined) fields.status = parseSeriesStatus(patch.status);
  await db.update(creatorSeries).set(fields).where(eq(creatorSeries.id, id));

  const detail = await getSeries(id, userId);
  if (!detail) throw new Error("시리즈를 찾을 수 없습니다.");
  const { episodeList: _episodes, ...summary } = detail;
  return summary;
}

// ── 시리즈 삭제(소유자 또는 관리자) — 회차는 시리즈에서만 분리(작품은 보존) ──
export async function deleteSeries(userId: string, id: string, isAdmin: boolean): Promise<{ deleted: boolean }> {
  if (!(await ensureCreatorCommunitySchema())) return { deleted: false };
  const [existing] = await db
    .select({ id: creatorSeries.id, ownerId: creatorSeries.userId })
    .from(creatorSeries)
    .where(eq(creatorSeries.id, id))
    .limit(1);
  if (!existing) return { deleted: false };
  if (existing.ownerId !== userId && !isAdmin) throw new Error("시리즈를 만든 사람만 삭제할 수 있습니다.");
  await db
    .update(creatorWorks)
    .set({ seriesId: null, episodeNo: null })
    .where(eq(creatorWorks.seriesId, id));
  await db.delete(creatorSeries).where(eq(creatorSeries.id, id));
  return { deleted: true };
}

// ═══════════════════════════════════════════════════════════════════
// 창작 챌린지 (툰스푼 창작 작업실 스타일) — 주간 주제 이벤트
// ═══════════════════════════════════════════════════════════════════

export interface CreatorChallengeSummary {
  id: string;
  slug: string;
  title: string;
  theme: string;
  startsAt: string | null;
  endsAt: string | null;
  state: CreatorChallengeState;
  entries: number; // 공개 참여작 수
  createdAt: string;
}

export interface CreatorChallengeDetail extends CreatorChallengeSummary {
  works: CreatorWorkSummary[]; // 참여작(공개)
}

// 기본 챌린지 시드 — 비어 있으면 코드 정의 시드 삽입(slug 충돌 시 무시 → idempotent).
// 진행중 챌린지가 하나도 없으면 시드 챌린지의 기간을 현재 기준으로 갱신(콜드 스타트/장기 미사용 보호).
let challengesSeeded = false;
export async function ensureDefaultChallenges(): Promise<void> {
  const now = new Date();
  if (!challengesSeeded) {
    for (const def of SEED_CHALLENGES) {
      const window = seedChallengeWindow(def, now);
      await db
        .insert(creatorChallenges)
        .values({
          id: crypto.randomUUID(),
          slug: def.slug,
          title: def.title,
          theme: def.theme,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          createdAt: now,
        })
        .onConflictDoNothing();
    }
    challengesSeeded = true;
  }
  const ongoingCond = and(
    or(isNull(creatorChallenges.startsAt), lte(creatorChallenges.startsAt, now)),
    or(isNull(creatorChallenges.endsAt), gte(creatorChallenges.endsAt, now))
  );
  const [ongoing] = await db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(creatorChallenges)
    .where(ongoingCond);
  if (Number(ongoing?.count ?? 0) > 0) return;
  for (const def of SEED_CHALLENGES) {
    const window = seedChallengeWindow(def, now);
    await db
      .update(creatorChallenges)
      .set({ startsAt: window.startsAt, endsAt: window.endsAt })
      .where(and(eq(creatorChallenges.slug, def.slug), lt(creatorChallenges.endsAt, now)));
  }
}

function challengeEntriesExpr() {
  return sql<number>`(
    SELECT count(*) FROM ${creatorWorks}
    WHERE ${creatorWorks.challengeId} = ${creatorChallenges.id}
      AND ${creatorWorks.status} = 'published' AND ${creatorWorks.hidden} = false
  )`.as("entries");
}

function mapChallengeRow(row: {
  id: string;
  slug: string;
  title: string;
  theme: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  entries: number;
  createdAt: Date | null;
}): CreatorChallengeSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    theme: row.theme ?? "",
    startsAt: row.startsAt ? safeDate(row.startsAt) : null,
    endsAt: row.endsAt ? safeDate(row.endsAt) : null,
    state: challengeStateOf(row.startsAt, row.endsAt),
    entries: Number(row.entries ?? 0),
    createdAt: safeDate(row.createdAt),
  };
}

// ── 챌린지 목록 — 진행중 우선(마감 임박 순) → 예정 → 종료(최근 종료 순) ──
export async function listChallenges(): Promise<CreatorChallengeSummary[]> {
  try {
    if (!(await ensureCreatorCommunitySchema())) return [];
    await ensureDefaultChallenges();
    const rows = await db
      .select({
        id: creatorChallenges.id,
        slug: creatorChallenges.slug,
        title: creatorChallenges.title,
        theme: creatorChallenges.theme,
        startsAt: creatorChallenges.startsAt,
        endsAt: creatorChallenges.endsAt,
        createdAt: creatorChallenges.createdAt,
        entries: challengeEntriesExpr(),
      })
      .from(creatorChallenges)
      .orderBy(asc(creatorChallenges.createdAt), asc(creatorChallenges.id));
    const mapped = rows.map(mapChallengeRow);
    const stateRank: Record<CreatorChallengeState, number> = { ongoing: 0, upcoming: 1, ended: 2 };
    return mapped.sort((a, b) => {
      if (stateRank[a.state] !== stateRank[b.state]) return stateRank[a.state] - stateRank[b.state];
      const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
      // 진행중·예정은 마감 임박 순, 종료는 최근 종료 순
      return a.state === "ended" ? bEnd - aEnd : aEnd - bEnd;
    });
  } catch {
    return [];
  }
}

// ── 챌린지 상세(slug 또는 id) + 참여작 목록 ─────────────────────────
export async function getChallenge(key: string, viewerId?: string): Promise<CreatorChallengeDetail | null> {
  try {
    if (!(await ensureCreatorCommunitySchema())) return null;
    await ensureDefaultChallenges();
    const [row] = await db
      .select({
        id: creatorChallenges.id,
        slug: creatorChallenges.slug,
        title: creatorChallenges.title,
        theme: creatorChallenges.theme,
        startsAt: creatorChallenges.startsAt,
        endsAt: creatorChallenges.endsAt,
        createdAt: creatorChallenges.createdAt,
        entries: challengeEntriesExpr(),
      })
      .from(creatorChallenges)
      .where(or(eq(creatorChallenges.slug, key), eq(creatorChallenges.id, key)))
      .limit(1);
    if (!row) return null;
    const works = await listWorks({ challengeId: row.id, viewerId, sort: "likes" });
    return { ...mapChallengeRow(row), works };
  } catch {
    return null;
  }
}

// 참여 가능 챌린지 검증 — 없거나 마감/시작 전이면 throw.
async function assertJoinableChallenge(challengeId: string): Promise<{ id: string; title: string }> {
  const [challenge] = await db
    .select({
      id: creatorChallenges.id,
      title: creatorChallenges.title,
      startsAt: creatorChallenges.startsAt,
      endsAt: creatorChallenges.endsAt,
    })
    .from(creatorChallenges)
    .where(eq(creatorChallenges.id, challengeId))
    .limit(1);
  if (!challenge) throw new Error("챌린지를 찾을 수 없습니다.");
  const state = challengeStateOf(challenge.startsAt, challenge.endsAt);
  if (state === "ended") throw new Error("이미 마감된 챌린지입니다.");
  if (state === "upcoming") throw new Error("아직 시작 전인 챌린지입니다.");
  return { id: challenge.id, title: challenge.title };
}

// ═══════════════════════════════════════════════════════════════════
// 창작자 팔로우 + 공개 프로필
// ═══════════════════════════════════════════════════════════════════

export interface CreatorFollowStats {
  followers: number;
  following: number;
  isFollowing: boolean;
}

export interface CreatorPublicProfile {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  createdAt: string | null;
  followers: number;
  following: number;
  isFollowing: boolean;
  works: number; // 공개 창작 작품 수
  series: number; // 시리즈 수
}

async function countFollowers(creatorId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(creatorFollows)
    .where(eq(creatorFollows.creatorId, creatorId));
  return Number(row?.count ?? 0);
}

// ── 팔로우 토글 ──────────────────────────────────────────────────────
export async function toggleFollow(
  followerId: string,
  creatorId: string
): Promise<{ following: boolean; followers: number }> {
  const pair = validateFollowPair(followerId, creatorId);
  if (pair.error || !pair.followerId || !pair.creatorId) throw new Error(pair.error ?? "팔로우할 수 없습니다.");
  if (!(await ensureCreatorCommunitySchema())) {
    throw new Error("팔로우 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, pair.creatorId)).limit(1);
  if (!target) throw new Error("팔로우할 회원을 찾을 수 없습니다.");

  const [existing] = await db
    .select({ creatorId: creatorFollows.creatorId })
    .from(creatorFollows)
    .where(and(eq(creatorFollows.followerId, pair.followerId), eq(creatorFollows.creatorId, pair.creatorId)))
    .limit(1);
  let following: boolean;
  if (existing) {
    await db
      .delete(creatorFollows)
      .where(and(eq(creatorFollows.followerId, pair.followerId), eq(creatorFollows.creatorId, pair.creatorId)));
    following = false;
  } else {
    await db
      .insert(creatorFollows)
      .values({ followerId: pair.followerId, creatorId: pair.creatorId, createdAt: new Date() })
      .onConflictDoNothing();
    following = true;
  }
  return { following, followers: await countFollowers(pair.creatorId) };
}

// ── 팔로우 통계(팔로워/팔로잉 수 + 뷰어의 팔로우 여부) ────────────────
export async function getFollowStats(creatorId: string, viewerId?: string): Promise<CreatorFollowStats> {
  try {
    if (!(await ensureCreatorCommunitySchema())) return { followers: 0, following: 0, isFollowing: false };
    const followers = await countFollowers(creatorId);
    const [followingRow] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(creatorFollows)
      .where(eq(creatorFollows.followerId, creatorId));
    let isFollowing = false;
    if (viewerId && viewerId !== creatorId) {
      const [mine] = await db
        .select({ creatorId: creatorFollows.creatorId })
        .from(creatorFollows)
        .where(and(eq(creatorFollows.followerId, viewerId), eq(creatorFollows.creatorId, creatorId)))
        .limit(1);
      isFollowing = !!mine;
    }
    return { followers, following: Number(followingRow?.count ?? 0), isFollowing };
  } catch {
    return { followers: 0, following: 0, isFollowing: false };
  }
}

// ── 공개 프로필 — 회원 기본 정보 + 팔로우 통계 + 창작 활동 수 ─────────
export async function getCreatorPublicProfile(
  userId: string,
  viewerId?: string
): Promise<CreatorPublicProfile | null> {
  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, avatar: users.avatar, bio: users.bio, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return null;
    const stats = await getFollowStats(userId, viewerId);
    let works = 0;
    try {
      const [workRow] = await db
        .select({ count: sql<number>`count(*)`.as("count") })
        .from(creatorWorks)
        .where(
          and(eq(creatorWorks.userId, userId), eq(creatorWorks.status, "published"), eq(creatorWorks.hidden, false))
        );
      works = Number(workRow?.count ?? 0);
    } catch {
      works = 0;
    }
    let series = 0;
    if (await ensureCreatorCommunitySchema()) {
      try {
        const [seriesRow] = await db
          .select({ count: sql<number>`count(*)`.as("count") })
          .from(creatorSeries)
          .where(and(eq(creatorSeries.userId, userId), eq(creatorSeries.hidden, false)));
        series = Number(seriesRow?.count ?? 0);
      } catch {
        series = 0;
      }
    }
    return {
      id: user.id,
      name: user.name ?? "익명",
      avatar: user.avatar ?? "#7c5cfc",
      bio: user.bio ?? "",
      createdAt: user.createdAt ? safeDate(user.createdAt) : null,
      followers: stats.followers,
      following: stats.following,
      isFollowing: stats.isFollowing,
      works,
      series,
    };
  } catch {
    return null;
  }
}
