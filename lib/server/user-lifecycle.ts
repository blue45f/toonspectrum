import { eq, sql } from "drizzle-orm";

import { accounts, db, dbClient, sessions, users } from "../db";

import { getSessionUserCached, invalidateSessionUser } from "./session";

export type UserAccountStatus = "active" | "suspended" | "deleted";

export interface UserLifecycleRow {
  id: string;
  status?: string | null;
  sessionVersion?: number | null;
  suspendedAt?: Date | null;
  suspensionReason?: string | null;
  deletedAt?: Date | null;
}

let lifecycleSchemaReady: Promise<void> | null = null;

async function assertUserLifecycleSchema(): Promise<void> {
  // Runtime connections intentionally have DML-only privileges. Resolve every
  // authentication/lifecycle column without reading user data so a missing or
  // stale schema fails closed, while all DDL remains owned by migrations.
  await dbClient.execute(`
    SELECT
      "id",
      "name",
      "email",
      "emailVerified",
      "image",
      "role",
      "status",
      "sessionVersion",
      "suspendedAt",
      "suspensionReason",
      "deletedAt",
      "passwordHash",
      "avatar",
      "bio",
      "createdAt"
    FROM "user"
    WHERE FALSE
  `);
}

export async function ensureUserLifecycleSchema(): Promise<void> {
  const pending = lifecycleSchemaReady ??= assertUserLifecycleSchema();

  try {
    await pending;
  } catch (error) {
    if (lifecycleSchemaReady === pending) lifecycleSchemaReady = null;
    throw error;
  }
}

export function normalizeUserAccountStatus(value: unknown): UserAccountStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "suspended" || normalized === "deleted") return normalized;
  return "active";
}

export function normalizeSessionVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

export function getUserAuthBlock(row: { status?: string | null } | null | undefined): string | null {
  if (!row) return "사용자 정보를 확인할 수 없습니다.";
  const status = normalizeUserAccountStatus(row.status);
  if (status === "deleted") return "탈퇴한 계정입니다.";
  if (status === "suspended") return "정지된 계정입니다. 운영팀에 문의해 주세요.";
  return null;
}

export async function isSessionAllowed(userId: string, sessionVersion: number): Promise<boolean> {
  if (userId.startsWith("demo-") && sessionVersion === 1) return true;
  await ensureUserLifecycleSchema();
  const cacheKey = `${userId}:session:${normalizeSessionVersion(sessionVersion)}`;
  const row = await getSessionUserCached(cacheKey, async () => {
    const [user] = await db
      .select({
        id: users.id,
        status: users.status,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user ?? null;
  });
  if (!row) return false;
  if (normalizeUserAccountStatus(row.status) !== "active") return false;
  return normalizeSessionVersion(row.sessionVersion) === normalizeSessionVersion(sessionVersion);
}

export async function revokeUserSessions(userId: string): Promise<{ ok: boolean; sessionVersion: number | null }> {
  if (!userId) return { ok: false, sessionVersion: null };
  if (userId.startsWith("demo-")) {
    invalidateSessionUser(userId);
    return { ok: true, sessionVersion: 1 };
  }
  await ensureUserLifecycleSchema();
  const [row] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ sessionVersion: users.sessionVersion });
  try {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  } catch {
    // sessions 테이블은 현재 서명 토큰 경로에선 보조 호환용이다. 삭제 실패가 로그아웃 자체를 막지 않게 한다.
  }
  invalidateSessionUser(userId);
  return { ok: Boolean(row), sessionVersion: row?.sessionVersion ?? null };
}

export async function softDeleteUserAccount(
  userId: string,
  reason: string = ""
): Promise<UserLifecycleRow | null> {
  if (!userId) return null;
  await ensureUserLifecycleSchema();
  const now = new Date();
  const deletedEmail = `deleted+${userId}.${Date.now()}@deleted.local`.slice(0, 240);
  const [row] = await db
    .update(users)
    .set({
      status: "deleted",
      deletedAt: now,
      suspendedAt: null,
      suspensionReason: reason.trim().slice(0, 300) || null,
      sessionVersion: sql`${users.sessionVersion} + 1`,
      role: "user",
      email: deletedEmail,
      passwordHash: null,
      name: "탈퇴한 사용자",
      image: null,
      avatar: "#5b5751",
      bio: null,
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      status: users.status,
      sessionVersion: users.sessionVersion,
      suspendedAt: users.suspendedAt,
      suspensionReason: users.suspensionReason,
      deletedAt: users.deletedAt,
    });
  if (!row) return null;

  await Promise.allSettled([
    db.delete(accounts).where(eq(accounts.userId, userId)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
  ]);
  invalidateSessionUser(userId);
  return row;
}

export async function setUserLifecycleStatus(
  userId: string,
  status: UserAccountStatus,
  reason: string = ""
): Promise<UserLifecycleRow | null> {
  if (status === "deleted") return softDeleteUserAccount(userId, reason);
  await ensureUserLifecycleSchema();
  const now = new Date();
  const patch =
    status === "suspended"
      ? {
          status,
          suspendedAt: now,
          suspensionReason: reason.trim().slice(0, 300) || null,
          sessionVersion: sql`${users.sessionVersion} + 1`,
        }
      : {
          status,
          suspendedAt: null,
          suspensionReason: null,
          sessionVersion: sql`${users.sessionVersion} + 1`,
        };

  const [row] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      status: users.status,
      sessionVersion: users.sessionVersion,
      suspendedAt: users.suspendedAt,
      suspensionReason: users.suspensionReason,
      deletedAt: users.deletedAt,
    });
  if (!row) return null;
  try {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  } catch {
    /* ignore */
  }
  invalidateSessionUser(userId);
  return row;
}
