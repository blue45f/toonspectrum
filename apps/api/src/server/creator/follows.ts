// 팔로우/공개 프로필 — 토글, 통계, 창작 활동 요약.
import { and, eq, sql } from "drizzle-orm";

import { creatorFollows, creatorSeries, creatorWorks, db, users } from "../../db";

import { validateFollowPair } from "./community-contract";
import { ensureCreatorCommunitySchema } from "./community-schema";
import { excludeTestUserId, isTestUserId, safeDate } from "./shared";

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
