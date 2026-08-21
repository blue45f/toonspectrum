import { eq } from "drizzle-orm";

import { db, users } from "../../db";
import {
  isWhitelistedAdminEmail,
  resolveEffectiveAdminRole,
} from "../../server/admin-emails";
import { invalidateSessionUser } from "../../server/session";
import {
  ensureUserLifecycleSchema,
  getUserAuthBlock,
} from "../../server/user-lifecycle";

export type AuthSessionRole = "admin" | "creator" | "operator" | "user";

export interface AuthSessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: AuthSessionRole;
}

const DEMO_SESSION_USERS: Readonly<Record<string, Omit<AuthSessionUser, "id">>> = {
  "demo-google": {
    name: "구글 데모 사용자",
    email: "demo.google@webdex.local",
    image: null,
    role: "user",
  },
  "demo-kakao": {
    name: "카카오 데모 사용자",
    email: "demo.kakao@webdex.local",
    image: null,
    role: "user",
  },
  "demo-naver": {
    name: "네이버 데모 사용자",
    email: "demo.naver@webdex.local",
    image: null,
    role: "user",
  },
};

/**
 * Resolves the public user projection for an already verified session id.
 *
 * The session middleware remains the credential boundary. This second lookup
 * deliberately returns only profile fields that the browser may hydrate and
 * rechecks lifecycle status to close the small suspend/delete race between
 * middleware authentication and controller execution.
 *
 * ADMIN_EMAILS 화이트리스트 계정은 DB role 이 user 여도 세션에 admin 으로 노출하고,
 * 한 번 조회되면 DB 도 admin 으로 지연 승격한다(메뉴 링크·게이트가 role 만으로도 동작).
 */
export async function resolveAuthSessionUser(
  userId: string,
): Promise<AuthSessionUser | null> {
  const demo = DEMO_SESSION_USERS[userId];
  if (demo) return { id: userId, ...demo };

  await ensureUserLifecycleSchema();
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || getUserAuthBlock(user)) return null;

  const dbRole = normalizeAuthSessionRole(user.role);
  const role = resolveEffectiveAdminRole(dbRole, user.email) as AuthSessionRole;

  // 화이트리스트 지연 승격 — 다음 요청부터 DB role 자체가 admin 이라 세션·API 가 일치한다.
  if (role === "admin" && dbRole !== "admin" && isWhitelistedAdminEmail(user.email)) {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
    invalidateSessionUser(user.id);
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role,
  };
}

export function normalizeAuthSessionRole(
  value: string | null | undefined,
): AuthSessionRole {
  const role = String(value ?? "").toLowerCase();
  if (role === "admin" || role === "creator" || role === "operator") {
    return role;
  }
  return "user";
}
