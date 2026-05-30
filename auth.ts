import NextAuth, { type NextAuthConfig } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import Kakao from "next-auth/providers/kakao";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db, users, accounts, sessions, verificationTokens } from "@/lib/db";
import { verifyPassword } from "@/lib/auth-crypto";

// 세션에 user.id 노출
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultUserShape;
  }
}
type DefaultUserShape = { name?: string | null; email?: string | null; image?: string | null };

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "이메일",
    credentials: { email: {}, password: {} },
    authorize: async (creds) => {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!u || !verifyPassword(password, u.passwordHash)) return null;
      return { id: u.id, name: u.name, email: u.email, image: u.image, avatar: u.avatar };
    },
  }),
];

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
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token?.id) session.user.id = String(token.id);
      return session;
    },
  },
});

// 활성화된 소셜 provider id 목록 (UI에서 버튼 표시용)
export const enabledOAuth: ("kakao" | "google")[] = [
  process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET ? "kakao" : null,
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? "google" : null,
].filter((x): x is "kakao" | "google" => x !== null);
