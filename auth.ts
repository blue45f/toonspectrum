import NextAuth, { type NextAuthConfig } from "next-auth";
import type {} from "next-auth/jwt";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import Kakao from "next-auth/providers/kakao";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db, users, accounts, sessions, verificationTokens } from "./lib/db";
import { verifyPassword } from "./lib/auth-crypto";
import { rateLimit, clientIp } from "./lib/rate-limit";

// 세션에 user.id 노출
declare module "next-auth" {
  interface Session {
    user: { id: string; role: AuthUserRole } & DefaultUserShape;
  }
  interface User {
    role?: AuthUserRole;
  }
}

type AuthUserRole = "admin" | "creator" | "operator" | "user";

declare module "next-auth/jwt" {
  interface JWT {
    role?: AuthUserRole;
  }
}

type DefaultUserShape = { name?: string | null; email?: string | null; image?: string | null };

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "이메일",
    credentials: { email: {}, password: {} },
  authorize: async (creds, request) => {
      // 크리덴셜 스터핑 완화 — IP당 10분에 10회
      if (!rateLimit(`login:${clientIp(request as Request)}`, 10, 10 * 60_000)) return null;
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!u || !verifyPassword(password, u.passwordHash)) return null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        avatar: u.avatar,
        role: normalizeUserRole(u.role),
      };
    },
  }),
];

function normalizeUserRole(value: string | null | undefined): AuthUserRole {
  const role = String(value ?? "").toLowerCase();
  if (role === "admin" || role === "creator" || role === "operator") return role;
  return "user";
}

function normalizeAdminEmailList(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function resolveRoleByUserId(userId: string): Promise<AuthUserRole> {
  if (!userId) return "user";
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const envRoles = normalizeAdminEmailList();
  const roleFromDb = normalizeUserRole(row?.role);
  const email = String(row?.email ?? "").toLowerCase();
  if (envRoles.has(email) && roleFromDb === "user") {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
    return "admin";
  }
  return roleFromDb;
}

// OAuth 는 키가 있을 때만 활성 (없으면 앱 안 깨짐)
if (process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET) {
  providers.push(Kakao({ clientId: process.env.AUTH_KAKAO_ID, clientSecret: process.env.AUTH_KAKAO_SECRET }));
}
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers,
  trustHost: true,
  // 프로덕션에선 AUTH_SECRET 미주입 시 undefined → NextAuth가 부팅 단계에서 실패(fail-fast).
  // 공개 상수로 폴백하면 세션 위조가 가능하므로, 폴백은 비프로덕션 개발 편의에서만 허용.
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "dev-only-secret-not-for-production"),
    callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (user?.role) token.role = user.role;
      if (token.id && !token.role) {
        token.role = await resolveRoleByUserId(String(token.id));
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) session.user.id = String(token.id);
      session.user.role = token?.role ?? "user";
      return session;
    },
  },
});

// 활성화된 소셜 provider id 목록 (UI에서 버튼 표시용)
export const enabledOAuth: ("kakao" | "google")[] = [
  process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET ? "kakao" : null,
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? "google" : null,
].filter((x): x is "kakao" | "google" => x !== null);
