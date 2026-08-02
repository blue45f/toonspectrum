import { eq } from "drizzle-orm";

import { db, users } from "../../../../../lib/db";
import {
  ensureUserLifecycleSchema,
  getUserAuthBlock,
} from "../../../../../lib/server/user-lifecycle";

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
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: normalizeAuthSessionRole(user.role),
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
