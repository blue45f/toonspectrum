// 창작 게시판(사용자 제작 웹툰/컷툰) 서버 로직 — feedback.ts 패턴을 따른다.
// 스키마는 lib/db/schema.ts에 이미 존재(creatorWorks/creatorWorkLikes/creatorWorkComments) — 재정의하지 않는다.
// 연재 시리즈·챌린지·팔로우(creatorSeries/creatorChallenges/creatorFollows)도 이 파일에서 함께 다룬다.
import { and, asc, desc, eq, gt, gte, ilike, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import {
  assertCreatorAssetListResponseBudget,
  CREATOR_ASSET_CATALOG_MAX_PAGE_SIZE,
  CREATOR_ASSET_LEGACY_FULL_MAX_PAGE_SIZE,
  CREATOR_ASSET_MODERATION_MAX_PAGE_SIZE,
  CREATOR_ASSET_PREVIEW_MAX_DATA_URL_CHARACTERS,
  creatorAssetLicenseOf,
  isCreatorAssetLicenseId,
  isCreatorAssetReportReason,
  normalizeCreatorAssetTags,
  parseCreatorAssetCatalogSort,
} from "../creator-asset-contract";
import {
  creatorAssetReports,
  creatorAssets,
  creatorChallenges,
  creatorFollows,
  creatorSeries,
  creatorWorkComments,
  creatorWorkLikes,
  creatorWorkRevisions,
  creatorWorks,
  db,
  dbPool,
  users,
} from "../db";


import {
  assertCreatorAssetPersistedIntegrity,
  inspectCreatorAssetPayload,
  inspectCreatorAssetPreviewDataUrl,
  resolveCreatorAssetPreviewForResponse,
} from "./creator-asset-image";
import { toPublicCreatorDoc } from "./creator-doc-visibility";
import {
  CREATOR_WORK_REVISION_MAX,
  CREATOR_WORK_REVISION_RETENTION,
  CreatorWorkRevisionConflictError,
  CreatorWorkRevisionNotFoundError,
  createCreatorWorkRevisionComparisonSnapshot,
  createCreatorWorkRevisionSnapshot,
  creatorWorkRevisionRetentionCutoff,
  parseCreatorWorkRevision,
} from "./creator-work-revisions";

import type {
  CreatorWorkRevisionComparisonSnapshot,
  CreatorWorkRevisionSnapshot,
  CreatorWorkRevisionSnapshotSource,
} from "./creator-work-revisions";
import type {
  CreatorAssetCatalogSort,
  CreatorAssetLicenseId,
  CreatorAssetModerationStatus,
  CreatorAssetReportReason,
} from "../creator-asset-contract";
import type { SQL, SQLWrapper } from "drizzle-orm";

const SORTS = new Set<CreatorWorkSort>(["recent", "likes", "views"]);
const FORMATS = new Set<CreatorWorkFormat>(["cuttoon", "upload"]);
const STATUSES = new Set<CreatorWorkStatus>(["draft", "published"]);
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_COMMENT = 1000;
const MAX_TAGS = 8;
const MAX_TAG_LEN = 24;
const MAX_PAGES = 200;
// 브라우저/DB 통합 QA가 예약해서 쓰는 계정 접두사. 로컬 데모 시드(`seed-*`)는 의도적으로
// 포함하지 않는다. db:seed가 원격 Neon 실행을 거부하므로 시드 데이터는 로컬 기능 시연에
// 남아 있어야 하며, QA 임시 계정만 공개 창작 피드에서 격리한다.
const QA_USER_ID_PREFIX = "test-user-" as const;

function postgresErrorCode(error: unknown): string | undefined {
  let current = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null || visited.has(current)) return undefined;
    visited.add(current);
    const candidate = current as { cause?: unknown; code?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

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
  // 리믹스 (이어서 편집하기) 관계 필드
  remixFromId: string | null;
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
  /** Owner-only optimistic concurrency token. Public projections omit it. */
  revision?: number;
  updatedAt: string;
  series: { id: string; title: string; status: CreatorSeriesStatus } | null;
  prevEpisode: CreatorEpisodeRef | null;
  nextEpisode: CreatorEpisodeRef | null;
  challenge: { id: string; slug: string; title: string; endsAt: string | null } | null;
  remixFromTitle: string | null;
  remixedChildren?: {
    id: string;
    title: string;
    cover: string;
    author: CreatorAuthor;
  }[];
}

export interface CreatorWorkMutationResult extends CreatorWorkSummary {
  revision: number;
}

export interface CreatorWorkRevisionSummary {
  revision: number;
  restoredFromRevision: number | null;
  createdAt: string;
}

export interface CreatorWorkRevisionDetail extends CreatorWorkRevisionSummary {
  snapshot: CreatorWorkRevisionSnapshot;
}

export interface CreatorWorkRevisionComparisonDetail extends CreatorWorkRevisionSummary {
  snapshot: CreatorWorkRevisionComparisonSnapshot;
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
  // 리믹스 (이어서 편집하기) 원본 작품 ID
  remixFromId?: unknown;
  // 생략 시 레거시 last-write-wins. 전달 시 현재 revision과 정확히 일치해야만 수정한다.
  baseRevision?: unknown;
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

function isTestUserId(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(QA_USER_ID_PREFIX));
}

function excludeTestUserId(column: SQLWrapper): SQL {
  return sql`coalesce(${column}, '') NOT LIKE ${`${QA_USER_ID_PREFIX}%`}`;
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
    "revision" integer NOT NULL DEFAULT 1,
    "createdAt" timestamp,
    "updatedAt" timestamp
  );
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'creator_work_revision_value_positive_check'
        AND conrelid = 'creator_work'::regclass
    ) THEN
      ALTER TABLE "creator_work"
        ADD CONSTRAINT "creator_work_revision_value_positive_check" CHECK ("revision" >= 1);
    END IF;
  END $$;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "seriesId" text;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "episodeNo" integer;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "challengeId" text;
  ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "remixFromId" text;
  CREATE INDEX IF NOT EXISTS "creator_work_series_idx" ON "creator_work" ("seriesId", "episodeNo");
  CREATE INDEX IF NOT EXISTS "creator_work_challenge_idx" ON "creator_work" ("challengeId");
  CREATE TABLE IF NOT EXISTS "creator_work_revision" (
    "workId" text NOT NULL REFERENCES "creator_work"("id") ON DELETE CASCADE,
    "revision" integer NOT NULL CHECK ("revision" >= 1),
    "snapshot" jsonb NOT NULL CHECK (jsonb_typeof("snapshot") = 'object'),
    "restoredFromRevision" integer CHECK ("restoredFromRevision" IS NULL OR "restoredFromRevision" >= 1),
    "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "creator_work_revision_pkey" PRIMARY KEY ("workId", "revision")
  );
  INSERT INTO "creator_work_revision" ("workId", "revision", "snapshot", "createdAt")
  SELECT
    work."id",
    work."revision",
    jsonb_build_object(
      'titleId', work."titleId",
      'title', work."title",
      'description', COALESCE(work."description", ''),
      'cover', COALESCE(work."cover", ''),
      'tags', COALESCE(work."tags", '[]'::jsonb),
      'format', COALESCE(work."format", 'cuttoon'),
      'pages', COALESCE(work."pages", '[]'::jsonb),
      'doc', COALESCE(work."doc", '{}'::jsonb),
      'status', COALESCE(work."status", 'draft'),
      'seriesId', work."seriesId",
      'episodeNo', work."episodeNo",
      'challengeId', work."challengeId",
      'remixFromId', work."remixFromId"
    ),
    COALESCE(work."updatedAt", work."createdAt", CURRENT_TIMESTAMP)
  FROM "creator_work" AS work
  ON CONFLICT ("workId", "revision") DO NOTHING;
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
      if (!opts.includeHidden) {
        addWhere(eq(creatorWorks.hidden, false));
        addWhere(excludeTestUserId(users.id));
      }
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
      SELECT count(*) FROM ${creatorWorkLikes}
      WHERE ${creatorWorkLikes.workId} = ${creatorWorks.id}
        AND ${excludeTestUserId(creatorWorkLikes.userId)}
    )`;
    const commentCountExpr = sql<number>`(
      SELECT count(*) FROM ${creatorWorkComments}
      WHERE ${creatorWorkComments.workId} = ${creatorWorks.id}
        AND ${creatorWorkComments.hidden} = false
        AND ${excludeTestUserId(creatorWorkComments.userId)}
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
        remixFromId: ready ? creatorWorks.remixFromId : sql<string | null>`NULL`,
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
      remixFromId: r.remixFromId ?? null,
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
        revision: creatorWorks.revision,
        createdAt: creatorWorks.createdAt,
        updatedAt: creatorWorks.updatedAt,
        ownerId: creatorWorks.userId,
        userId: users.id,
        author: users.name,
        avatar: users.avatar,
        seriesId: ready ? creatorWorks.seriesId : sql<string | null>`NULL`,
        episodeNo: ready ? creatorWorks.episodeNo : sql<number | null>`NULL`,
        challengeId: ready ? creatorWorks.challengeId : sql<string | null>`NULL`,
        remixFromId: ready ? creatorWorks.remixFromId : sql<string | null>`NULL`,
      })
      .from(creatorWorks)
      .innerJoin(users, eq(creatorWorks.userId, users.id))
      .where(eq(creatorWorks.id, id))
      .limit(1);
    if (!row) return null;
    if (isTestUserId(row.ownerId) && row.ownerId !== viewerId) return null;
    const isOwner = !!viewerId && viewerId === row.ownerId;
    if ((row.hidden || row.status !== "published") && !isOwner) return null;

    const [likeCount] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(creatorWorkLikes)
      .where(and(eq(creatorWorkLikes.workId, id), excludeTestUserId(creatorWorkLikes.userId)));
    const [commentCount] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(creatorWorkComments)
      .where(
        and(
          eq(creatorWorkComments.workId, id),
          eq(creatorWorkComments.hidden, false),
          excludeTestUserId(creatorWorkComments.userId)
        )
      );

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
          eq(creatorWorks.hidden, false),
          excludeTestUserId(creatorWorks.userId)
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

    let remixFromTitle: string | null = null;
    let remixedChildren: CreatorWorkDetail["remixedChildren"] = [];
    if (ready) {
      if (row.remixFromId) {
        const [parent] = await db
          .select({ title: creatorWorks.title })
          .from(creatorWorks)
          .where(
            and(
              eq(creatorWorks.id, row.remixFromId),
              eq(creatorWorks.status, "published"),
              eq(creatorWorks.hidden, false),
              excludeTestUserId(creatorWorks.userId)
            )
          )
          .limit(1);
        if (parent) {
          remixFromTitle = parent.title;
        }
      }
      const childrenRows = await db
        .select({
          id: creatorWorks.id,
          title: creatorWorks.title,
          cover: creatorWorks.cover,
          userId: users.id,
          author: users.name,
          avatar: users.avatar,
        })
        .from(creatorWorks)
        .innerJoin(users, eq(creatorWorks.userId, users.id))
        .where(
          and(
            eq(creatorWorks.remixFromId, id),
            eq(creatorWorks.status, "published"),
            eq(creatorWorks.hidden, false),
            excludeTestUserId(users.id)
          )
        )
        .orderBy(desc(creatorWorks.createdAt))
        .limit(10);
      remixedChildren = childrenRows.map((c) => ({
        id: c.id,
        title: c.title,
        cover: c.cover,
        author: { id: c.userId, name: c.author ?? "익명", avatar: c.avatar ?? "#7c5cfc" },
      }));
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
      remixFromId: row.remixFromId ?? null,
      remixFromTitle,
      remixedChildren,
      createdAt: safeDate(row.createdAt),
      updatedAt: safeDate(row.updatedAt),
      pages: parsePages(row.pages),
      doc: isOwner ? row.doc ?? {} : toPublicCreatorDoc(row.doc),
      isOwner,
      ...(isOwner ? { revision: Number(row.revision ?? 1) } : {}),
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
export async function createWork(userId: string, input: CreatorWorkInput): Promise<CreatorWorkMutationResult> {
  if (!(await ensureCreatorCommunitySchema())) {
    throw new Error("작품 revision 저장소를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
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

  const remixFromId = parseRefId(input.remixFromId);

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
    remixFromId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  if (seriesId) {
    values.seriesId = seriesId;
    values.episodeNo = episodeNo;
  }
  if (challengeId) values.challengeId = challengeId;
  await db.transaction(async (tx) => {
    await tx.insert(creatorWorks).values(values);
    await tx.insert(creatorWorkRevisions).values({
      workId: id,
      revision: 1,
      snapshot: createCreatorWorkRevisionSnapshot(values),
      createdAt: now,
    });
  });
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
    remixFromId,
    revision: 1,
    createdAt: safeDate(now),
  };
}

const creatorWorkSnapshotSelection = {
  titleId: creatorWorks.titleId,
  title: creatorWorks.title,
  description: creatorWorks.description,
  cover: creatorWorks.cover,
  tags: creatorWorks.tags,
  format: creatorWorks.format,
  pages: creatorWorks.pages,
  doc: creatorWorks.doc,
  status: creatorWorks.status,
  seriesId: creatorWorks.seriesId,
  episodeNo: creatorWorks.episodeNo,
  challengeId: creatorWorks.challengeId,
  remixFromId: creatorWorks.remixFromId,
  revision: creatorWorks.revision,
};

async function mutationResultForWork(
  userId: string,
  id: string,
  revision: number
): Promise<CreatorWorkMutationResult> {
  const detail = await getWork(id, userId);
  if (!detail) throw new Error("작품을 찾을 수 없습니다.");
  const {
    pages: _pages,
    doc: _doc,
    isOwner: _isOwner,
    revision: _detailRevision,
    updatedAt: _updatedAt,
    series: _series,
    prevEpisode: _prevEpisode,
    nextEpisode: _nextEpisode,
    challenge: _challenge,
    ...summary
  } = detail;
  return { ...summary, revision };
}

// ── 수정(작성자 전용) ────────────────────────────────────────────────
export async function updateWork(
  userId: string,
  id: string,
  patch: CreatorWorkInput
): Promise<CreatorWorkMutationResult> {
  if (!(await ensureCreatorCommunitySchema())) {
    throw new Error("작품 revision 저장소를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const baseRevision = patch.baseRevision === undefined
    ? undefined
    : parseCreatorWorkRevision(patch.baseRevision, "baseRevision");
  const [existing] = await db
    .select({
      id: creatorWorks.id,
      ownerId: creatorWorks.userId,
      revision: creatorWorks.revision,
      seriesId: creatorWorks.seriesId,
      challengeId: creatorWorks.challengeId,
    })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, id))
    .limit(1);
  if (!existing) throw new Error("작품을 찾을 수 없습니다.");
  if (existing.ownerId !== userId) throw new Error("작성자만 수정할 수 있습니다.");
  if (baseRevision !== undefined && existing.revision !== baseRevision) {
    throw new CreatorWorkRevisionConflictError(existing.revision);
  }
  if (existing.revision >= CREATOR_WORK_REVISION_MAX) {
    throw new Error("작품 revision 상한에 도달해 더 저장할 수 없습니다.");
  }

  const now = new Date();
  const fields: Record<string, unknown> = { updatedAt: now };
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

  // 시리즈/챌린지 연결 변경(선택 필드 — 미전달 시 기존 값 유지).
  let bumpSeriesId: string | null = null;
  if (patch.seriesId !== undefined) {
    const nextSeriesId = parseRefId(patch.seriesId);
    if (nextSeriesId !== (existing.seriesId ?? null)) {
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
    if (nextChallengeId !== (existing.challengeId ?? null)) {
      if (nextChallengeId) await assertJoinableChallenge(nextChallengeId);
      fields.challengeId = nextChallengeId;
    }
  }

  const updated = await db.transaction(async (tx) => {
    // `baseRevision`을 생략한 레거시 저장도 동시 요청으로 PostgreSQL integer 상한을 넘지 않게
    // write 조건에서 다시 막는다. 사전 조회는 친절한 오류용이며 안전성은 이 조건이 담당한다.
    const conditions = [
      eq(creatorWorks.id, id),
      eq(creatorWorks.userId, userId),
      lt(creatorWorks.revision, CREATOR_WORK_REVISION_MAX),
    ];
    if (baseRevision !== undefined) conditions.push(eq(creatorWorks.revision, baseRevision));
    const [row] = await tx
      .update(creatorWorks)
      .set({ ...fields, revision: sql`${creatorWorks.revision} + 1` })
      .where(and(...conditions))
      .returning(creatorWorkSnapshotSelection);

    if (!row) {
      const [current] = await tx
        .select({ ownerId: creatorWorks.userId, revision: creatorWorks.revision })
        .from(creatorWorks)
        .where(eq(creatorWorks.id, id))
        .limit(1);
      if (!current) throw new Error("작품을 찾을 수 없습니다.");
      if (current.ownerId !== userId) throw new Error("작성자만 수정할 수 있습니다.");
      if (current.revision >= CREATOR_WORK_REVISION_MAX) {
        throw new Error("작품 revision 상한에 도달해 더 저장할 수 없습니다.");
      }
      if (baseRevision !== undefined) throw new CreatorWorkRevisionConflictError(current.revision);
      throw new Error("작품을 수정할 수 없습니다.");
    }

    await tx.insert(creatorWorkRevisions).values({
      workId: id,
      revision: row.revision,
      snapshot: createCreatorWorkRevisionSnapshot(row),
      createdAt: now,
    });
    const cutoff = creatorWorkRevisionRetentionCutoff(row.revision);
    if (cutoff !== null) {
      await tx
        .delete(creatorWorkRevisions)
        .where(and(eq(creatorWorkRevisions.workId, id), lte(creatorWorkRevisions.revision, cutoff)));
    }
    return row;
  });

  if (bumpSeriesId) await touchSeries(bumpSeriesId);
  return mutationResultForWork(userId, id, updated.revision);
}

async function assertRevisionOwner(userId: string, workId: string): Promise<void> {
  const [work] = await db
    .select({ ownerId: creatorWorks.userId })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  // Owner-only endpoint에서는 작품 없음과 타인 작품을 같은 오류로 취급해 존재 여부를 노출하지 않는다.
  if (!work || work.ownerId !== userId) throw new CreatorWorkRevisionNotFoundError();
}

export async function listWorkRevisions(
  userId: string,
  workId: string,
  limit = CREATOR_WORK_REVISION_RETENTION
): Promise<CreatorWorkRevisionSummary[]> {
  if (!(await ensureCreatorCommunitySchema())) throw new CreatorWorkRevisionNotFoundError();
  await assertRevisionOwner(userId, workId);
  const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : CREATOR_WORK_REVISION_RETENTION;
  const safeLimit = Math.max(1, Math.min(CREATOR_WORK_REVISION_RETENTION, parsedLimit));
  const rows = await db
    .select({
      revision: creatorWorkRevisions.revision,
      restoredFromRevision: creatorWorkRevisions.restoredFromRevision,
      createdAt: creatorWorkRevisions.createdAt,
    })
    .from(creatorWorkRevisions)
    .where(eq(creatorWorkRevisions.workId, workId))
    .orderBy(desc(creatorWorkRevisions.revision))
    .limit(safeLimit);
  return rows.map((row) => ({
    revision: row.revision,
    restoredFromRevision: row.restoredFromRevision ?? null,
    createdAt: safeDate(row.createdAt),
  }));
}

export async function getWorkRevision(
  userId: string,
  workId: string,
  revisionValue: unknown
): Promise<CreatorWorkRevisionDetail> {
  if (!(await ensureCreatorCommunitySchema())) throw new CreatorWorkRevisionNotFoundError();
  await assertRevisionOwner(userId, workId);
  const revision = parseCreatorWorkRevision(revisionValue);
  const [row] = await db
    .select({
      revision: creatorWorkRevisions.revision,
      snapshot: creatorWorkRevisions.snapshot,
      restoredFromRevision: creatorWorkRevisions.restoredFromRevision,
      createdAt: creatorWorkRevisions.createdAt,
    })
    .from(creatorWorkRevisions)
    .where(and(eq(creatorWorkRevisions.workId, workId), eq(creatorWorkRevisions.revision, revision)))
    .limit(1);
  if (!row) throw new CreatorWorkRevisionNotFoundError();
  return {
    revision: row.revision,
    restoredFromRevision: row.restoredFromRevision ?? null,
    createdAt: safeDate(row.createdAt),
    snapshot: createCreatorWorkRevisionSnapshot(row.snapshot as CreatorWorkRevisionSnapshotSource),
  };
}

/**
 * Owner-only semantic comparison payload. The full revision endpoint remains available for restore
 * workflows, while this projection deliberately keeps rendered cover/page data URLs off the wire.
 */
export async function getWorkRevisionComparison(
  userId: string,
  workId: string,
  revisionValue: unknown
): Promise<CreatorWorkRevisionComparisonDetail> {
  if (!(await ensureCreatorCommunitySchema())) throw new CreatorWorkRevisionNotFoundError();
  await assertRevisionOwner(userId, workId);
  const revision = parseCreatorWorkRevision(revisionValue);
  const [row] = await db
    .select({
      revision: creatorWorkRevisions.revision,
      // PostgreSQL performs the heavy-field omission before sending JSONB to the API process.
      snapshot: sql<CreatorWorkRevisionSnapshotSource>`${creatorWorkRevisions.snapshot} - 'cover' - 'pages'`,
      restoredFromRevision: creatorWorkRevisions.restoredFromRevision,
      createdAt: creatorWorkRevisions.createdAt,
    })
    .from(creatorWorkRevisions)
    .where(and(eq(creatorWorkRevisions.workId, workId), eq(creatorWorkRevisions.revision, revision)))
    .limit(1);
  if (!row) throw new CreatorWorkRevisionNotFoundError();
  return {
    revision: row.revision,
    restoredFromRevision: row.restoredFromRevision ?? null,
    createdAt: safeDate(row.createdAt),
    snapshot: await createCreatorWorkRevisionComparisonSnapshot(row.snapshot),
  };
}

export async function restoreWorkRevision(
  userId: string,
  workId: string,
  revisionValue: unknown,
  baseRevisionValue: unknown
): Promise<CreatorWorkMutationResult> {
  if (!(await ensureCreatorCommunitySchema())) throw new CreatorWorkRevisionNotFoundError();
  const targetRevision = parseCreatorWorkRevision(revisionValue);
  const baseRevision = parseCreatorWorkRevision(baseRevisionValue, "baseRevision");
  const now = new Date();

  const restored = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ ownerId: creatorWorks.userId, revision: creatorWorks.revision })
      .from(creatorWorks)
      .where(eq(creatorWorks.id, workId))
      .limit(1);
    if (!current || current.ownerId !== userId) throw new CreatorWorkRevisionNotFoundError();
    if (current.revision !== baseRevision) throw new CreatorWorkRevisionConflictError(current.revision);
    if (current.revision >= CREATOR_WORK_REVISION_MAX) {
      throw new Error("작품 revision 상한에 도달해 더 저장할 수 없습니다.");
    }

    const [target] = await tx
      .select({ snapshot: creatorWorkRevisions.snapshot })
      .from(creatorWorkRevisions)
      .where(
        and(
          eq(creatorWorkRevisions.workId, workId),
          eq(creatorWorkRevisions.revision, targetRevision)
        )
      )
      .limit(1);
    if (!target) throw new CreatorWorkRevisionNotFoundError();
    const snapshot = createCreatorWorkRevisionSnapshot(
      target.snapshot as CreatorWorkRevisionSnapshotSource
    );

    const [row] = await tx
      .update(creatorWorks)
      .set({
        ...snapshot,
        revision: sql`${creatorWorks.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(creatorWorks.id, workId),
          eq(creatorWorks.userId, userId),
          eq(creatorWorks.revision, baseRevision)
        )
      )
      .returning(creatorWorkSnapshotSelection);
    if (!row) {
      const [latest] = await tx
        .select({ ownerId: creatorWorks.userId, revision: creatorWorks.revision })
        .from(creatorWorks)
        .where(eq(creatorWorks.id, workId))
        .limit(1);
      if (!latest || latest.ownerId !== userId) throw new CreatorWorkRevisionNotFoundError();
      throw new CreatorWorkRevisionConflictError(latest.revision);
    }

    await tx.insert(creatorWorkRevisions).values({
      workId,
      revision: row.revision,
      snapshot: createCreatorWorkRevisionSnapshot(row),
      restoredFromRevision: targetRevision,
      createdAt: now,
    });
    const cutoff = creatorWorkRevisionRetentionCutoff(row.revision);
    if (cutoff !== null) {
      await tx
        .delete(creatorWorkRevisions)
        .where(and(eq(creatorWorkRevisions.workId, workId), lte(creatorWorkRevisions.revision, cutoff)));
    }
    return row;
  });

  return mutationResultForWork(userId, workId, restored.revision);
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

async function assertPublicCreatorWork(workId: string): Promise<void> {
  const [work] = await db
    .select({ id: creatorWorks.id, status: creatorWorks.status, hidden: creatorWorks.hidden, ownerId: creatorWorks.userId })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  if (!work || work.hidden || work.status !== "published" || isTestUserId(work.ownerId)) {
    throw new Error("공개된 작품을 찾을 수 없습니다.");
  }
}

// ── 좋아요 토글 ──────────────────────────────────────────────────────
export async function toggleLike(userId: string, workId: string): Promise<{ liked: boolean; likes: number }> {
  await assertPublicCreatorWork(workId);
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
    .where(and(eq(creatorWorkLikes.workId, workId), excludeTestUserId(creatorWorkLikes.userId)));
  return { liked, likes: Number(count?.count ?? 0) };
}

// ── 댓글 목록 ────────────────────────────────────────────────────────
export async function listComments(workId: string, includeHidden = false): Promise<CreatorWorkComment[]> {
  try {
    await assertPublicCreatorWork(workId);
    let where: SQL | undefined = eq(creatorWorkComments.workId, workId);
    if (!includeHidden) {
      where = and(
        where,
        eq(creatorWorkComments.hidden, false),
        excludeTestUserId(creatorWorkComments.userId)
      );
    }
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
  await assertPublicCreatorWork(workId);

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
const MAX_ASSET_DESCRIPTION = 500;
const MAX_ASSET_ATTRIBUTION = 160;
const MAX_ASSET_REPORT_DETAILS = 500;
const MAX_ASSET_MODERATION_NOTE = 500;
const ASSET_KINDS = new Set(["image", "sticker", "vrm_pose"]);
const IMAGE_ASSET_MODEL = "gpt-image-2";
const IMAGE_ASSET_ENDPOINT = "https://api.openai.com/v1/images/generations";
const MAX_IMAGE_ASSET_PROMPT = 1000;
const IMAGE_ASSET_SIZES = {
  "1024x1024": { width: 1024, height: 1024 },
  "1536x1024": { width: 1536, height: 1024 },
  "1024x1536": { width: 1024, height: 1536 },
} as const;
const IMAGE_ASSET_QUALITIES = new Set(["low", "medium", "high", "auto"]);

export type ImageAssetSize = keyof typeof IMAGE_ASSET_SIZES;
export type ImageAssetQuality = "low" | "medium" | "high" | "auto";

export interface CreatorSharedAssetSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
  width: number;
  height: number;
  kind: string;
  license: CreatorAssetLicenseId;
  licenseLabel: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  commercialUse: boolean;
  attributionText: string;
  containsAi: boolean;
  moderationStatus: CreatorAssetModerationStatus;
  reportCount: number;
  downloads: number;
  author: CreatorAuthor;
  isOwner: boolean;
  createdAt: string;
}

/** Legacy/full-content projection kept for the VRM shared-pose library. */
export interface CreatorSharedAsset extends CreatorSharedAssetSummary {
  dataUrl: string;
}

/** Bounded catalog projection. The original data URL is deliberately absent. */
export interface CreatorSharedAssetCatalogItem extends CreatorSharedAssetSummary {
  previewDataUrl: string;
  previewWidth: number;
  previewHeight: number;
  previewAvailable: boolean;
}

export interface CreatorSharedAssetContent {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  kind: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
}

export interface CreatorAssetCatalogPage {
  items: CreatorSharedAssetCatalogItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface CreatorAssetModerationQueueItem {
  reportId: string;
  reason: CreatorAssetReportReason;
  details: string;
  reportStatus: "open" | "resolved" | "dismissed";
  reportedAt: string;
  reporter: CreatorAuthor;
  asset: CreatorSharedAssetCatalogItem;
}

export interface GeneratedCreatorAsset {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  model: typeof IMAGE_ASSET_MODEL;
  size: ImageAssetSize;
  quality: ImageAssetQuality;
}

function parseImageAssetSize(value: unknown): ImageAssetSize {
  const key = String(value ?? "");
  return Object.prototype.hasOwnProperty.call(IMAGE_ASSET_SIZES, key) ? (key as ImageAssetSize) : "1024x1024";
}

function parseImageAssetQuality(value: unknown): ImageAssetQuality {
  const key = String(value ?? "");
  return IMAGE_ASSET_QUALITIES.has(key) ? (key as ImageAssetQuality) : "medium";
}

function assetNameFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0] ?? "";
  return clampText(firstLine.replace(/[^\p{L}\p{N}\s._-]/gu, " "), MAX_ASSET_NAME) || "AI 에셋";
}

function buildImageAssetPrompt(userPrompt: string): string {
  return [
    "Create a reusable image asset for a Korean webtoon and comic creation canvas.",
    `User request: ${userPrompt}`,
    "Style: polished webtoon illustration, clean readable silhouette, crisp edges, centered subject, generous padding.",
    "If the user asks for a background scene, create a full-panel background. Otherwise create a single reusable prop, character, effect, or object asset.",
    "Constraints: no text, no captions, no logos, no watermark, no UI screenshot, no copyrighted characters, no real-person likeness.",
  ].join("\n");
}

function openAiImageErrorMessage(status: number, payload: unknown): string {
  const error = payload && typeof payload === "object" ? (payload as { error?: { code?: string; message?: string } }).error : undefined;
  if (error?.code === "moderation_blocked") return "요청이 안전 정책에 의해 차단되었습니다. 프롬프트를 조정해 주세요.";
  if (status === 401) return "OpenAI API 키를 확인해 주세요.";
  if (status === 429) return "OpenAI 이미지 생성 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  if (status >= 500) return "OpenAI 이미지 생성 서버가 일시적으로 응답하지 않습니다.";
  return error?.message || "이미지를 생성하지 못했습니다.";
}

export async function generateImageAsset(
  input: { prompt?: unknown; name?: unknown; size?: unknown; quality?: unknown }
): Promise<GeneratedCreatorAsset> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");

  const userPrompt = normalizeMultiline(input.prompt, MAX_IMAGE_ASSET_PROMPT);
  if (userPrompt.length < 3) throw new Error("생성할 에셋 설명을 입력해 주세요.");

  const size = parseImageAssetSize(input.size);
  const quality = parseImageAssetQuality(input.quality);
  const dims = IMAGE_ASSET_SIZES[size];
  const name = clampText(input.name, MAX_ASSET_NAME) || assetNameFromPrompt(userPrompt);

  const response = await fetch(IMAGE_ASSET_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_ASSET_MODEL,
      prompt: buildImageAssetPrompt(userPrompt),
      n: 1,
      size,
      quality,
      output_format: "webp",
      output_compression: 82,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(openAiImageErrorMessage(response.status, payload));

  const b64 = payload && typeof payload === "object" ? (payload as { data?: Array<{ b64_json?: unknown }> }).data?.[0]?.b64_json : undefined;
  if (typeof b64 !== "string" || b64.length === 0) throw new Error("OpenAI 이미지 응답이 비어 있습니다.");

  return {
    name,
    dataUrl: `data:image/webp;base64,${b64}`,
    width: dims.width,
    height: dims.height,
    model: IMAGE_ASSET_MODEL,
    size,
    quality,
  };
}

interface SharedAssetListOptions {
  limit?: number;
  offset?: number;
  mineUserId?: string; // 지정 시 해당 회원이 올린 것만(내 공유 목록)
  viewerId?: string;
  search?: string;
  tag?: string;
  license?: string;
  kind?: string;
  sort?: CreatorAssetCatalogSort;
}

function creatorAssetModerationStatusOf(value: unknown): CreatorAssetModerationStatus {
  return value === "published" || value === "rejected" ? value : "under_review";
}

function sharedAssetQueryParts(opts: SharedAssetListOptions): { wheres: SQL[]; order: SQL[] } {
  const wheres: SQL[] = [eq(creatorAssets.hidden, false)];
  if (opts.mineUserId) wheres.push(eq(creatorAssets.userId, opts.mineUserId));
  const ownerView = Boolean(opts.mineUserId && opts.viewerId === opts.mineUserId);
  if (!ownerView) {
    wheres.push(eq(creatorAssets.moderationStatus, "published"));
    wheres.push(isNotNull(creatorAssets.rightsConfirmedAt));
    wheres.push(excludeTestUserId(creatorAssets.userId));
  }
  const search = clampText(opts.search, 80);
  if (search) {
    const pattern = `%${search}%`;
    wheres.push(
      or(
        ilike(creatorAssets.name, pattern),
        ilike(creatorAssets.description, pattern),
        ilike(users.name, pattern),
        sql`${creatorAssets.tags}::text ILIKE ${pattern}`
      )!
    );
  }
  const [tag] = normalizeCreatorAssetTags(opts.tag);
  if (tag) wheres.push(sql`${creatorAssets.tags} @> ${JSON.stringify([tag])}::jsonb`);
  if (isCreatorAssetLicenseId(opts.license)) wheres.push(eq(creatorAssets.license, opts.license));
  if (ASSET_KINDS.has(opts.kind ?? "")) wheres.push(eq(creatorAssets.kind, opts.kind!));
  const sort = parseCreatorAssetCatalogSort(opts.sort);
  const order =
    sort === "popular"
      ? [desc(creatorAssets.downloads), desc(creatorAssets.createdAt)]
      : sort === "name"
        ? [asc(creatorAssets.name), desc(creatorAssets.createdAt)]
        : [desc(creatorAssets.createdAt)];
  return { wheres, order };
}

async function selectSharedAssets(
  opts: SharedAssetListOptions,
  requestedLimit: number
): Promise<CreatorSharedAsset[]> {
  const limit = Math.max(1, Math.min(121, requestedLimit));
  const offset = Math.max(0, opts.offset ?? 0);
  const { wheres, order } = sharedAssetQueryParts(opts);
  const rows = await db
    .select({
      id: creatorAssets.id,
      userId: creatorAssets.userId,
      name: creatorAssets.name,
      description: creatorAssets.description,
      tags: creatorAssets.tags,
      dataUrl: creatorAssets.dataUrl,
      width: creatorAssets.width,
      height: creatorAssets.height,
      kind: creatorAssets.kind,
      mimeType: creatorAssets.mimeType,
      byteSize: creatorAssets.byteSize,
      contentHash: creatorAssets.contentHash,
      license: creatorAssets.license,
      attributionText: creatorAssets.attributionText,
      containsAi: creatorAssets.containsAi,
      moderationStatus: creatorAssets.moderationStatus,
      reportCount: creatorAssets.reportCount,
      downloads: creatorAssets.downloads,
      createdAt: creatorAssets.createdAt,
      author: users.name,
      avatar: users.avatar,
    })
    .from(creatorAssets)
    .leftJoin(users, eq(creatorAssets.userId, users.id))
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  return rows.map((row) => {
    const license = creatorAssetLicenseOf(row.license);
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      dataUrl: row.dataUrl,
      width: row.width,
      height: row.height,
      kind: row.kind,
      license: license.id,
      licenseLabel: license.shortLabel,
      licenseUrl: license.url,
      attributionRequired: license.attributionRequired,
      commercialUse: license.commercialUse,
      attributionText: row.attributionText ?? "",
      containsAi: row.containsAi ?? false,
      moderationStatus: creatorAssetModerationStatusOf(row.moderationStatus),
      reportCount: row.reportCount ?? 0,
      downloads: row.downloads,
      author: authorOf(row),
      isOwner: !!opts.viewerId && opts.viewerId === row.userId,
      createdAt: safeDate(row.createdAt),
    };
  });
}

async function selectSharedAssetCatalogItems(
  opts: SharedAssetListOptions,
  requestedLimit: number
): Promise<CreatorSharedAssetCatalogItem[]> {
  const limit = Math.max(1, Math.min(CREATOR_ASSET_CATALOG_MAX_PAGE_SIZE + 1, requestedLimit));
  const offset = Math.max(0, opts.offset ?? 0);
  const { wheres, order } = sharedAssetQueryParts(opts);
  const rows = await db
    .select({
      id: creatorAssets.id,
      userId: creatorAssets.userId,
      name: creatorAssets.name,
      description: creatorAssets.description,
      tags: creatorAssets.tags,
      previewDataUrl: sql<string | null>`CASE
        WHEN octet_length(${creatorAssets.previewDataUrl}) BETWEEN 1 AND ${CREATOR_ASSET_PREVIEW_MAX_DATA_URL_CHARACTERS}
        THEN ${creatorAssets.previewDataUrl}
        ELSE NULL
      END`,
      previewWidth: creatorAssets.previewWidth,
      previewHeight: creatorAssets.previewHeight,
      previewMimeType: creatorAssets.previewMimeType,
      previewByteSize: creatorAssets.previewByteSize,
      previewContentHash: creatorAssets.previewContentHash,
      width: creatorAssets.width,
      height: creatorAssets.height,
      kind: creatorAssets.kind,
      license: creatorAssets.license,
      attributionText: creatorAssets.attributionText,
      containsAi: creatorAssets.containsAi,
      moderationStatus: creatorAssets.moderationStatus,
      reportCount: creatorAssets.reportCount,
      downloads: creatorAssets.downloads,
      createdAt: creatorAssets.createdAt,
      author: users.name,
      avatar: users.avatar,
    })
    .from(creatorAssets)
    .leftJoin(users, eq(creatorAssets.userId, users.id))
    .where(and(...wheres))
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  return rows.map((row) => {
    const license = creatorAssetLicenseOf(row.license);
    const preview = resolveCreatorAssetPreviewForResponse({
      dataUrl: row.previewDataUrl,
      width: row.previewWidth,
      height: row.previewHeight,
      mimeType: row.previewMimeType,
      byteSize: row.previewByteSize,
      contentHash: row.previewContentHash,
    });
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      previewDataUrl: preview.dataUrl,
      previewWidth: preview.width,
      previewHeight: preview.height,
      previewAvailable: preview.available,
      width: row.width,
      height: row.height,
      kind: row.kind,
      license: license.id,
      licenseLabel: license.shortLabel,
      licenseUrl: license.url,
      attributionRequired: license.attributionRequired,
      commercialUse: license.commercialUse,
      attributionText: row.attributionText ?? "",
      containsAi: row.containsAi ?? false,
      moderationStatus: creatorAssetModerationStatusOf(row.moderationStatus),
      reportCount: row.reportCount ?? 0,
      downloads: row.downloads,
      author: authorOf(row),
      isOwner: !!opts.viewerId && opts.viewerId === row.userId,
      createdAt: safeDate(row.createdAt),
    };
  });
}

export async function listSharedAssets(opts: SharedAssetListOptions = {}): Promise<CreatorSharedAsset[]> {
  const assets = await selectSharedAssets(
    opts,
    Math.max(1, Math.min(CREATOR_ASSET_LEGACY_FULL_MAX_PAGE_SIZE, opts.limit ?? 1))
  );
  assertCreatorAssetListResponseBudget(assets);
  return assets;
}

export async function listSharedAssetCatalog(
  opts: SharedAssetListOptions = {}
): Promise<CreatorAssetCatalogPage> {
  const limit = Math.max(
    1,
    Math.min(CREATOR_ASSET_CATALOG_MAX_PAGE_SIZE, opts.limit ?? CREATOR_ASSET_CATALOG_MAX_PAGE_SIZE)
  );
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = await selectSharedAssetCatalogItems({ ...opts, offset }, limit + 1);
  const hasMore = rows.length > limit;
  const page = {
    items: hasMore ? rows.slice(0, limit) : rows,
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
  assertCreatorAssetListResponseBudget(page);
  return page;
}

export async function publishAsset(
  userId: string,
  input: {
    name?: unknown;
    description?: unknown;
    tags?: unknown;
    dataUrl?: unknown;
    width?: unknown;
    height?: unknown;
    previewDataUrl?: unknown;
    previewWidth?: unknown;
    previewHeight?: unknown;
    kind?: unknown;
    license?: unknown;
    attributionText?: unknown;
    containsAi?: unknown;
    rightsConfirmed?: unknown;
  }
): Promise<CreatorSharedAsset> {
  if (input.rightsConfirmed !== true) {
    throw new Error("직접 제작했거나 공유 권한을 가진 에셋인지 확인해 주세요.");
  }
  const name = clampText(input.name, MAX_ASSET_NAME) || "내 에셋";
  const description = normalizeMultiline(input.description, MAX_ASSET_DESCRIPTION);
  const tags = normalizeCreatorAssetTags(input.tags);
  if (!isCreatorAssetLicenseId(input.license)) throw new Error("에셋 사용권을 선택해 주세요.");
  const license = creatorAssetLicenseOf(input.license);
  const kind = ASSET_KINDS.has(input.kind as string) ? (input.kind as string) : "image";
  const inspected = inspectCreatorAssetPayload(input.dataUrl, kind, input.width, input.height);
  const preview = inspectCreatorAssetPreviewDataUrl(
    input.previewDataUrl,
    input.previewWidth,
    input.previewHeight
  );
  const aspectError = Math.abs(
    preview.width / preview.height - inspected.width / inspected.height
  ) / Math.max(preview.width / preview.height, inspected.width / inspected.height);
  if (
    preview.width > inspected.width ||
    preview.height > inspected.height ||
    !Number.isFinite(aspectError) ||
    aspectError > 0.03
  ) {
    throw new Error("미리보기 크기 비율이 원본 이미지와 일치하지 않습니다.");
  }
  const id = crypto.randomUUID();
  const now = new Date();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const attributionText =
    clampText(input.attributionText, MAX_ASSET_ATTRIBUTION) ||
    (license.attributionRequired ? user?.name || "원저작자" : "");
  try {
    await db.insert(creatorAssets).values({
      id,
      userId,
      name,
      description,
      tags,
      dataUrl: inspected.dataUrl,
      width: inspected.width,
      height: inspected.height,
      kind,
      mimeType: inspected.mimeType,
      byteSize: inspected.byteSize,
      contentHash: inspected.sha256,
      previewDataUrl: preview.dataUrl,
      previewWidth: preview.width,
      previewHeight: preview.height,
      previewMimeType: preview.mimeType,
      previewByteSize: preview.byteSize,
      previewContentHash: preview.sha256,
      license: license.id,
      attributionText,
      containsAi: input.containsAi === true,
      rightsConfirmedAt: now,
      moderationStatus: "published",
      createdAt: now,
    });
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      throw new Error("같은 에셋을 이미 공유했습니다.", { cause: error });
    }
    throw error;
  }
  return {
    id,
    name,
    description,
    tags,
    dataUrl: inspected.dataUrl,
    width: inspected.width,
    height: inspected.height,
    kind,
    license: license.id,
    licenseLabel: license.shortLabel,
    licenseUrl: license.url,
    attributionRequired: license.attributionRequired,
    commercialUse: license.commercialUse,
    attributionText,
    containsAi: input.containsAi === true,
    moderationStatus: "published",
    reportCount: 0,
    downloads: 0,
    author: { id: userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "#7c5cfc" },
    isOwner: true,
    createdAt: safeDate(now),
  };
}

export async function deleteSharedAsset(userId: string, id: string, isAdmin: boolean): Promise<{ deleted: boolean }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: creatorAssets.id,
        ownerId: creatorAssets.userId,
        reportCount: creatorAssets.reportCount,
        moderationStatus: creatorAssets.moderationStatus,
        reviewedAt: creatorAssets.reviewedAt,
      })
      .from(creatorAssets)
      .where(eq(creatorAssets.id, id))
      .limit(1)
      .for("update");
    if (!existing) return { deleted: false };
    if (existing.ownerId !== userId && !isAdmin) throw new Error("올린 사람만 삭제할 수 있습니다.");

    if (existing.reportCount > 0) {
      const now = new Date();
      let approvedAssetHasOpenReport = false;
      if (
        !isAdmin &&
        existing.moderationStatus === "published" &&
        existing.reviewedAt !== null
      ) {
        const [openReport] = await tx
          .select({ id: creatorAssetReports.id })
          .from(creatorAssetReports)
          .where(
            and(
              eq(creatorAssetReports.assetId, id),
              eq(creatorAssetReports.status, "open")
            )
          )
          .limit(1);
        approvedAssetHasOpenReport = Boolean(openReport);
      }
      const ownerMustPreserveFinalModeration =
        !isAdmin &&
        (existing.moderationStatus === "rejected" ||
          (existing.moderationStatus === "published" &&
            existing.reviewedAt !== null &&
            !approvedAssetHasOpenReport));
      await tx
        .update(creatorAssets)
        .set({
          hidden: true,
          ...(isAdmin
            ? {
                moderationStatus: "rejected" as const,
                moderationNote: "관리자가 신고 증거를 보존한 채 에셋을 비공개 처리했습니다.",
                reviewedBy: userId,
                reviewedAt: now,
              }
            : ownerMustPreserveFinalModeration
              ? {}
              : {
                  moderationStatus: "under_review" as const,
                  moderationNote: "소유자가 신고 검수 중 공유를 철회했습니다.",
                }),
        })
        .where(eq(creatorAssets.id, id));
      return { deleted: true };
    }

    await tx.delete(creatorAssets).where(eq(creatorAssets.id, id));
    return { deleted: true };
  });
}

export async function reportSharedAsset(
  reporterId: string,
  assetId: string,
  input: { reason?: unknown; details?: unknown }
): Promise<{ reported: true; reportCount: number }> {
  if (!isCreatorAssetReportReason(input.reason)) throw new Error("신고 사유를 선택해 주세요.");
  const reportId = crypto.randomUUID();
  const details = normalizeMultiline(input.details, MAX_ASSET_REPORT_DETAILS);
  try {
    const reportCount = await db.transaction(async (tx) => {
      // Serialize reporting, moderation, owner withdrawal, and admin deletion on the asset row.
      // Eligibility must be checked after the lock is acquired so a report cannot slip in after
      // the asset became hidden/rejected, and every caller observes the authoritative counter.
      const [asset] = await tx
        .select({
          ownerId: creatorAssets.userId,
          hidden: creatorAssets.hidden,
          moderationStatus: creatorAssets.moderationStatus,
        })
        .from(creatorAssets)
        .where(eq(creatorAssets.id, assetId))
        .limit(1)
        .for("update");
      if (!asset || asset.hidden || asset.moderationStatus !== "published") {
        throw new Error("신고할 수 있는 공개 에셋을 찾지 못했습니다.");
      }
      if (asset.ownerId === reporterId) {
        throw new Error("자신이 공유한 에셋은 신고할 수 없습니다.");
      }

      await tx.insert(creatorAssetReports).values({
        id: reportId,
        assetId,
        reporterId,
        reason: input.reason as CreatorAssetReportReason,
        details,
      });
      const [updated] = await tx
        .update(creatorAssets)
        .set({ reportCount: sql`${creatorAssets.reportCount} + 1` })
        .where(eq(creatorAssets.id, assetId))
        .returning({ reportCount: creatorAssets.reportCount });
      if (!updated) {
        throw new Error("신고할 수 있는 공개 에셋을 찾지 못했습니다.");
      }
      return updated.reportCount;
    });
    return { reported: true, reportCount };
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      throw new Error("이미 이 에셋을 신고했습니다.", { cause: error });
    }
    throw error;
  }
}

function creatorAssetReportStatusOf(value: unknown): "open" | "resolved" | "dismissed" {
  return value === "resolved" || value === "dismissed" ? value : "open";
}

export async function listAssetModerationQueue(opts: {
  limit?: number;
  offset?: number;
  status?: "open" | "resolved" | "dismissed";
} = {}): Promise<CreatorAssetModerationQueueItem[]> {
  const limit = Math.max(
    1,
    Math.min(
      CREATOR_ASSET_MODERATION_MAX_PAGE_SIZE,
      opts.limit ?? CREATOR_ASSET_MODERATION_MAX_PAGE_SIZE
    )
  );
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = await db
    .select({
      reportId: creatorAssetReports.id,
      reason: creatorAssetReports.reason,
      details: creatorAssetReports.details,
      reportStatus: creatorAssetReports.status,
      reportedAt: creatorAssetReports.createdAt,
      reporterId: creatorAssetReports.reporterId,
      assetId: creatorAssets.id,
      assetUserId: creatorAssets.userId,
      assetName: creatorAssets.name,
      assetDescription: creatorAssets.description,
      assetTags: creatorAssets.tags,
      assetPreviewDataUrl: sql<string | null>`CASE
        WHEN octet_length(${creatorAssets.previewDataUrl}) BETWEEN 1 AND ${CREATOR_ASSET_PREVIEW_MAX_DATA_URL_CHARACTERS}
        THEN ${creatorAssets.previewDataUrl}
        ELSE NULL
      END`,
      assetPreviewWidth: creatorAssets.previewWidth,
      assetPreviewHeight: creatorAssets.previewHeight,
      assetPreviewMimeType: creatorAssets.previewMimeType,
      assetPreviewByteSize: creatorAssets.previewByteSize,
      assetPreviewContentHash: creatorAssets.previewContentHash,
      assetWidth: creatorAssets.width,
      assetHeight: creatorAssets.height,
      assetKind: creatorAssets.kind,
      assetLicense: creatorAssets.license,
      assetAttributionText: creatorAssets.attributionText,
      assetContainsAi: creatorAssets.containsAi,
      assetModerationStatus: creatorAssets.moderationStatus,
      assetReportCount: creatorAssets.reportCount,
      assetDownloads: creatorAssets.downloads,
      assetCreatedAt: creatorAssets.createdAt,
      assetAuthor: users.name,
      assetAvatar: users.avatar,
    })
    .from(creatorAssetReports)
    .innerJoin(creatorAssets, eq(creatorAssetReports.assetId, creatorAssets.id))
    .leftJoin(users, eq(creatorAssets.userId, users.id))
    .where(eq(creatorAssetReports.status, opts.status ?? "open"))
    .orderBy(desc(creatorAssetReports.createdAt))
    .limit(limit)
    .offset(offset);
  const items = rows.map((row) => {
    const license = creatorAssetLicenseOf(row.assetLicense);
    const preview = resolveCreatorAssetPreviewForResponse({
      dataUrl: row.assetPreviewDataUrl,
      width: row.assetPreviewWidth,
      height: row.assetPreviewHeight,
      mimeType: row.assetPreviewMimeType,
      byteSize: row.assetPreviewByteSize,
      contentHash: row.assetPreviewContentHash,
    });
    return {
      reportId: row.reportId,
      reason: isCreatorAssetReportReason(row.reason) ? row.reason : "other",
      details: row.details,
      reportStatus: creatorAssetReportStatusOf(row.reportStatus),
      reportedAt: safeDate(row.reportedAt),
      reporter: { id: row.reporterId, name: "신고 회원", avatar: "#64748b" },
      asset: {
        id: row.assetId,
        name: row.assetName,
        description: row.assetDescription,
        tags: Array.isArray(row.assetTags) ? row.assetTags : [],
        previewDataUrl: preview.dataUrl,
        previewWidth: preview.width,
        previewHeight: preview.height,
        previewAvailable: preview.available,
        width: row.assetWidth,
        height: row.assetHeight,
        kind: row.assetKind,
        license: license.id,
        licenseLabel: license.shortLabel,
        licenseUrl: license.url,
        attributionRequired: license.attributionRequired,
        commercialUse: license.commercialUse,
        attributionText: row.assetAttributionText,
        containsAi: row.assetContainsAi,
        moderationStatus: creatorAssetModerationStatusOf(row.assetModerationStatus),
        reportCount: row.assetReportCount,
        downloads: row.assetDownloads,
        author: {
          id: row.assetUserId,
          name: row.assetAuthor ?? "익명",
          avatar: row.assetAvatar ?? "#7c5cfc",
        },
        isOwner: false,
        createdAt: safeDate(row.assetCreatedAt),
      },
    };
  });
  assertCreatorAssetListResponseBudget(items);
  return items;
}

export async function moderateSharedAsset(
  reviewerId: string,
  assetId: string,
  input: { status?: unknown; note?: unknown }
): Promise<{ updated: true; status: CreatorAssetModerationStatus }> {
  const status = creatorAssetModerationStatusOf(input.status);
  if (status !== input.status) throw new Error("검수 상태가 올바르지 않습니다.");
  const note = normalizeMultiline(input.note, MAX_ASSET_MODERATION_NOTE);
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(creatorAssets)
      .set({
        moderationStatus: status,
        moderationNote: note,
        reviewedBy: reviewerId,
        reviewedAt: now,
      })
      .where(eq(creatorAssets.id, assetId))
      .returning({ id: creatorAssets.id });
    if (rows.length === 0) return false;
    if (status !== "under_review") {
      await tx
        .update(creatorAssetReports)
        .set({
          status: status === "rejected" ? "resolved" : "dismissed",
          resolutionNote: note,
          reviewedBy: reviewerId,
          reviewedAt: now,
        })
        .where(and(eq(creatorAssetReports.assetId, assetId), eq(creatorAssetReports.status, "open")));
    }
    return true;
  });
  if (!updated) throw new Error("검수할 에셋을 찾지 못했습니다.");
  return { updated: true, status };
}

/**
 * Resolve one original only after applying the same public-catalog visibility rule, while still
 * allowing its owner and an authenticated moderator to inspect a non-public item. This read is
 * deliberately side-effect free: only a successful canvas insertion calls the authenticated
 * `/use` endpoint, so retries and moderation inspection cannot inflate popularity.
 */
export async function getSharedAssetContent(
  id: string,
  viewerId?: string,
  reviewerAccess = false
): Promise<CreatorSharedAssetContent> {
  const [asset] = await db
    .select({
      id: creatorAssets.id,
      ownerId: creatorAssets.userId,
      dataUrl: creatorAssets.dataUrl,
      width: creatorAssets.width,
      height: creatorAssets.height,
      kind: creatorAssets.kind,
      mimeType: creatorAssets.mimeType,
      byteSize: creatorAssets.byteSize,
      contentHash: creatorAssets.contentHash,
      hidden: creatorAssets.hidden,
      moderationStatus: creatorAssets.moderationStatus,
      rightsConfirmedAt: creatorAssets.rightsConfirmedAt,
    })
    .from(creatorAssets)
    .where(eq(creatorAssets.id, id))
    .limit(1);
  const ownerAccess = Boolean(viewerId && viewerId === asset?.ownerId);
  const publicAccess = Boolean(
    asset &&
    !asset.hidden &&
    asset.moderationStatus === "published" &&
    asset.rightsConfirmedAt &&
    !asset.ownerId.startsWith(QA_USER_ID_PREFIX)
  );
  if (!asset || (!ownerAccess && !reviewerAccess && !publicAccess)) {
    throw new Error("사용할 수 있는 공개 에셋을 찾지 못했습니다.");
  }
  // Re-inspect persisted bytes at the response boundary. A legacy row or direct DB mutation with
  // a disguised MIME, corrupt dimensions, or malformed VRM fragment therefore fails closed.
  const inspected = inspectCreatorAssetPayload(
    asset.dataUrl,
    asset.kind,
    asset.width,
    asset.height
  );
  assertCreatorAssetPersistedIntegrity(inspected, {
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    contentHash: asset.contentHash,
  });
  return {
    id: asset.id,
    dataUrl: inspected.dataUrl,
    width: inspected.width,
    height: inspected.height,
    kind: asset.kind,
    mimeType: inspected.mimeType,
    byteSize: inspected.byteSize,
    contentHash: inspected.sha256,
  };
}

export async function bumpAssetDownloads(id: string): Promise<void> {
  await db
    .update(creatorAssets)
    .set({ downloads: sql`${creatorAssets.downloads} + 1` })
    .where(
      and(
        eq(creatorAssets.id, id),
        eq(creatorAssets.hidden, false),
        eq(creatorAssets.moderationStatus, "published"),
        isNotNull(creatorAssets.rightsConfirmedAt),
        excludeTestUserId(creatorAssets.userId)
      )
    );
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
  const visibleEpisode = sql`${creatorWorks.seriesId} = ${creatorSeries.id}
    AND ${creatorWorks.status} = 'published'
    AND ${creatorWorks.hidden} = false`;
  return {
    episodes: sql<number>`(SELECT count(*) FROM ${creatorWorks} WHERE ${visibleEpisode})`.as("episodes"),
    views: sql<number>`(SELECT coalesce(sum(${creatorWorks.views}), 0) FROM ${creatorWorks} WHERE ${visibleEpisode})`.as(
      "views"
    ),
    likes: sql<number>`(
      SELECT count(*) FROM ${creatorWorkLikes}
      INNER JOIN ${creatorWorks} ON ${creatorWorkLikes.workId} = ${creatorWorks.id}
      WHERE ${visibleEpisode} AND ${excludeTestUserId(creatorWorkLikes.userId)}
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
    if (!ownerView) addWhere(excludeTestUserId(users.id));
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
    if (isTestUserId(row.ownerId) && row.ownerId !== viewerId) return null;
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
      AND ${creatorWorks.status} = 'published' AND ${creatorWorks.hidden} = false AND ${excludeTestUserId(creatorWorks.userId)}
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
    .where(and(eq(creatorFollows.creatorId, creatorId), excludeTestUserId(creatorFollows.followerId)));
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
      .where(and(eq(creatorFollows.followerId, creatorId), excludeTestUserId(creatorFollows.creatorId)));
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
    if (isTestUserId(user.id) && user.id !== viewerId) return null;
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
