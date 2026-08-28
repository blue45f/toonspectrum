// 챌린지 — 시드 보장/목록/상세와 참여 가능 검증.
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";

import { creatorChallenges, creatorWorks, db } from "../../db";

import {
  challengeStateOf,
  SEED_CHALLENGES,
  seedChallengeWindow,
  type CreatorChallengeState,
} from "./community-contract";
import { ensureCreatorCommunitySchema } from "./community-schema";
import { excludeTestUserId, safeDate } from "./shared";
import { listWorks } from "./works";

import type { CreatorWorkSummary } from "./works-contract";

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
export async function assertJoinableChallenge(challengeId: string): Promise<{ id: string; title: string }> {
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

