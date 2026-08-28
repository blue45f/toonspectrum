// 연재 시리즈 — 목록/상세/생성/수정/삭제와 회차 부여 헬퍼.
import { and, desc, eq, sql } from "drizzle-orm";

import { creatorSeries, creatorWorkLikes, creatorWorks, db, users } from "../../db";

import {
  MAX_SERIES_TITLE,
  nextEpisodeNumber,
  parseSeriesSort,
  parseSeriesStatus,
  validateSeriesInput,
  type CreatorSeriesInput,
  type CreatorSeriesSort,
  type CreatorSeriesStatus,
} from "./community-contract";
import { ensureCreatorCommunitySchema } from "./community-schema";
import {
  clampText,
  cleanTags,
  excludeTestUserId,
  isTestUserId,
  MAX_DESCRIPTION,
  normalizeMultiline,
  parseTagValue,
  safeDate,
} from "./shared";
import { listWorks } from "./works";

import type { CreatorAuthor, CreatorWorkSummary } from "./works-contract";
import type { SQL } from "drizzle-orm";

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
export async function getOwnedSeriesOrThrow(seriesId: string, userId: string): Promise<{ id: string; title: string }> {
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
export async function nextEpisodeNoOf(seriesId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${creatorWorks.episodeNo})` })
    .from(creatorWorks)
    .where(eq(creatorWorks.seriesId, seriesId));
  return nextEpisodeNumber([row?.max]);
}

// 회차 추가/연결 시 시리즈 갱신일 bump — recent 정렬("최신 회차 갱신") 근거.
export async function touchSeries(seriesId: string): Promise<void> {
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

