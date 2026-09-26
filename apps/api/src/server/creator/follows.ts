// 팔로우/공개 프로필 — 토글, 통계, 창작 활동 요약.
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
  publicCreatorRoleProfile,
  type CreatorCollaborationStatus,
  type CreatorRoleId,
  type CreatorSpecialtyId,
  type PublicCreatorRoleProfile,
} from "@toonspectrum/core/creator-role";
import { creatorFollows, creatorSeries, creatorWorks, db, users } from "../../platform/database";
import { withDatabaseCapability } from "../../platform/http/service-availability";

import { validateFollowPair } from "./community-contract";
import { requireCreatorCommunitySchema } from "./community-schema";
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
  creatorRoleProfile: PublicCreatorRoleProfile | null;
}

export interface CreatorDirectoryQuery {
  readonly q?: string;
  readonly role?: CreatorRoleId;
  readonly specialty?: CreatorSpecialtyId;
  readonly collaborationStatus?: CreatorCollaborationStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreatorDirectoryEntry {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly bio: string;
  readonly createdAt: string | null;
  readonly creatorRoleProfile: PublicCreatorRoleProfile;
}

export interface CreatorDirectoryResult {
  readonly items: readonly CreatorDirectoryEntry[];
  readonly nextOffset: number | null;
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
  return withDatabaseCapability("creator.follows.write", async () => {
    const pair = validateFollowPair(followerId, creatorId);
    if (pair.error || !pair.followerId || !pair.creatorId) {
      throw new Error(pair.error ?? "팔로우할 수 없습니다.");
    }
    await requireCreatorCommunitySchema("creator.follows.write");
    const [target] = await db.select({ id: users.id }).from(users)
      .where(eq(users.id, pair.creatorId)).limit(1);
    if (!target) throw new Error("팔로우할 회원을 찾을 수 없습니다.");

    const [existing] = await db
      .select({ creatorId: creatorFollows.creatorId })
      .from(creatorFollows)
      .where(and(
        eq(creatorFollows.followerId, pair.followerId),
        eq(creatorFollows.creatorId, pair.creatorId),
      ))
      .limit(1);
    let following: boolean;
    if (existing) {
      await db.delete(creatorFollows).where(and(
        eq(creatorFollows.followerId, pair.followerId),
        eq(creatorFollows.creatorId, pair.creatorId),
      ));
      following = false;
    } else {
      await db.insert(creatorFollows)
        .values({ followerId: pair.followerId, creatorId: pair.creatorId, createdAt: new Date() })
        .onConflictDoNothing();
      following = true;
    }
    return { following, followers: await countFollowers(pair.creatorId) };
  });
}

// ── 팔로우 통계(팔로워/팔로잉 수 + 뷰어의 팔로우 여부) ────────────────
export async function getFollowStats(
  creatorId: string,
  viewerId?: string,
): Promise<CreatorFollowStats> {
  return withDatabaseCapability("creator.follows.read", async () => {
    await requireCreatorCommunitySchema("creator.follows.read");
    const followers = await countFollowers(creatorId);
    const [followingRow] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(creatorFollows)
      .where(and(
        eq(creatorFollows.followerId, creatorId),
        excludeTestUserId(creatorFollows.creatorId),
      ));
    let isFollowing = false;
    if (viewerId && viewerId !== creatorId) {
      const [mine] = await db
        .select({ creatorId: creatorFollows.creatorId })
        .from(creatorFollows)
        .where(and(
          eq(creatorFollows.followerId, viewerId),
          eq(creatorFollows.creatorId, creatorId),
        ))
        .limit(1);
      isFollowing = Boolean(mine);
    }
    return {
      followers,
      following: Number(followingRow?.count ?? 0),
      isFollowing,
    };
  });
}

export async function searchCreatorDirectory(
  query: CreatorDirectoryQuery,
): Promise<CreatorDirectoryResult> {
  return withDatabaseCapability("creator.directory.read", async () => {
    const q = query.q?.trim();
    const limit = Math.min(50, Math.max(1, query.limit ?? 24));
    const offset = Math.min(10_000, Math.max(0, query.offset ?? 0));
    const visibility = users.creatorRoleProfile;
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        bio: users.bio,
        createdAt: users.createdAt,
        creatorRoleProfile: users.creatorRoleProfile,
      })
      .from(users)
      .where(and(
        eq(users.status, "active"),
        excludeTestUserId(users.id),
        or(
          sql<boolean>`(${visibility} -> 'visibility' ->> 'roles')::boolean = true`,
          sql<boolean>`(${visibility} -> 'visibility' ->> 'specialties')::boolean = true`,
          sql<boolean>`(${visibility} -> 'visibility' ->> 'experienceLevel')::boolean = true`,
          sql<boolean>`(${visibility} -> 'visibility' ->> 'collaborationStatus')::boolean = true`,
        ),
        q ? or(ilike(users.name, `%${q}%`), ilike(users.bio, `%${q}%`)) : undefined,
        query.role ? and(
          sql<boolean>`(${visibility} -> 'visibility' ->> 'roles')::boolean = true`,
          sql<boolean>`(
            ${visibility} ->> 'primaryRole' = ${query.role}
            OR ${visibility} -> 'secondaryRoles' @> ${JSON.stringify([query.role])}::jsonb
          )`,
        ) : undefined,
        query.specialty ? and(
          sql<boolean>`(${visibility} -> 'visibility' ->> 'specialties')::boolean = true`,
          sql<boolean>`${visibility} -> 'specialties' @> ${JSON.stringify([query.specialty])}::jsonb`,
        ) : undefined,
        query.collaborationStatus ? and(
          sql<boolean>`(${visibility} -> 'visibility' ->> 'collaborationStatus')::boolean = true`,
          sql<boolean>`${visibility} ->> 'collaborationStatus' = ${query.collaborationStatus}`,
        ) : undefined,
      ))
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(limit + 1)
      .offset(offset);
    const items = rows.slice(0, limit).flatMap((row) => {
      const creatorRoleProfile = publicCreatorRoleProfile(row.creatorRoleProfile);
      return creatorRoleProfile ? [{
        id: row.id,
        name: row.name ?? "익명",
        avatar: row.avatar ?? "#7c5cfc",
        bio: row.bio ?? "",
        createdAt: row.createdAt ? safeDate(row.createdAt) : null,
        creatorRoleProfile,
      }] : [];
    });
    return {
      items,
      nextOffset: rows.length > limit ? offset + limit : null,
    };
  });
}
// ── 공개 프로필 — 회원 기본 정보 + 팔로우 통계 + 창작 활동 수 ─────────
export async function getCreatorPublicProfile(
  userId: string,
  viewerId?: string,
): Promise<CreatorPublicProfile | null> {
  return withDatabaseCapability("creator.profile.read", async () => {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        bio: users.bio,
        createdAt: users.createdAt,
        creatorRoleProfile: users.creatorRoleProfile,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return null;
    if (isTestUserId(user.id) && user.id !== viewerId) return null;

    const stats = await getFollowStats(userId, viewerId);
    const [workRow] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(creatorWorks)
      .where(and(
        eq(creatorWorks.userId, userId),
        eq(creatorWorks.status, "published"),
        eq(creatorWorks.hidden, false),
      ));
    await requireCreatorCommunitySchema("creator.profile.read");
    const [seriesRow] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(creatorSeries)
      .where(and(
        eq(creatorSeries.userId, userId),
        eq(creatorSeries.hidden, false),
      ));
    return {
      id: user.id,
      name: user.name ?? "익명",
      avatar: user.avatar ?? "#7c5cfc",
      bio: user.bio ?? "",
      createdAt: user.createdAt ? safeDate(user.createdAt) : null,
      followers: stats.followers,
      following: stats.following,
      isFollowing: stats.isFollowing,
      works: Number(workRow?.count ?? 0),
      series: Number(seriesRow?.count ?? 0),
      creatorRoleProfile: publicCreatorRoleProfile(user.creatorRoleProfile),
    };
  });
}
