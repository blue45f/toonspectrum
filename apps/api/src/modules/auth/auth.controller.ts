import { BadRequestException, Body, Controller, Get, Headers, HttpException, HttpStatus, Param, Post, Query, Req, Res } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { hashPassword, verifyPassword } from "../../../../../lib/auth-crypto";
import { resolveSignupAvatar, resolveSignupAvatarImage } from "../../../../../lib/avatar";
import { db, users } from "../../../../../lib/db";
import { getAppConfig } from "../../../../../lib/server/app-config";
import {
  buildAuthorizeUrl,
  consumeHandoff,
  createDemoUser,
  handleOAuthCallback,
  isOAuthProvider,
  issueHandoff,
  issueState,
  listAuthProviders,
  providerMode,
  verifyState,
  webAppBaseUrl,
} from "../../../../../lib/server/oauth";
import { signSession } from "../../../../../lib/server/session";
import {
  ensureUserLifecycleSchema,
  getUserAuthBlock,
  normalizeSessionVersion,
  revokeUserSessions,
} from "../../../../../lib/server/user-lifecycle";

import type { Request, Response } from "express";

interface AuthPayload {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  avatar?: unknown;
  image?: unknown;
}

type AuthRole = "admin" | "creator" | "operator" | "user";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const AuthRateLimitStore: Record<string, number[]> = {};

@Controller("auth")
export class AuthController {
  @Get("providers")
  async getProviders() {
    const config = await getAppConfig();
    return listAuthProviders({ kakao: config.authKakao, naver: config.authNaver });
  }

  // 실제 OAuth 시작 — 인가 URL로 리다이렉트(설정된 제공자만). 미설정이면 데모 폴백 안내.
  @Get("oauth/:provider/start")
  oauthStart(@Param("provider") provider: string, @Res() res: Response) {
    if (!isOAuthProvider(provider)) throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    const url = buildAuthorizeUrl(provider, issueState(provider));
    if (!url) {
      // client id/secret 미설정 → 데모 모드. 프론트가 데모 엔드포인트를 호출하도록 콜백으로 안내.
      return res.redirect(`${webAppBaseUrl()}/auth/callback#demo=${provider}`);
    }
    return res.redirect(url);
  }

  // 제공자 콜백 — code 교환 → 사용자 upsert → 1회용 핸드오프 토큰으로 프론트 복귀.
  @Get("oauth/:provider/callback")
  async oauthCallback(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response
  ) {
    const web = webAppBaseUrl();
    if (!isOAuthProvider(provider)) return res.redirect(`${web}/auth/callback#error=unsupported`);
    if (error) return res.redirect(`${web}/auth/callback#error=${encodeURIComponent(error)}`);
    if (!verifyState(provider, state)) return res.redirect(`${web}/auth/callback#error=bad_state`);
    if (!code) return res.redirect(`${web}/auth/callback#error=no_code`);
    try {
      const user = await handleOAuthCallback(provider, code);
      return res.redirect(`${web}/auth/callback#t=${issueHandoff(user)}`);
    } catch {
      return res.redirect(`${web}/auth/callback#error=oauth_failed`);
    }
  }

  // 핸드오프 토큰 → 사용자 객체(프론트가 세션 저장). 1회용.
  @Post("oauth/exchange")
  oauthExchange(@Body() body: { token?: unknown }) {
    const user = consumeHandoff(typeof body?.token === "string" ? body.token : undefined);
    if (!user) throw new HttpException({ error: "만료되었거나 잘못된 로그인 토큰이에요." }, HttpStatus.UNAUTHORIZED);
    return { ok: true, user, token: signSession(user.id, normalizeSessionVersion(user.sessionVersion)) };
  }

  // 데모 폴백 로그인 — 실제 제공자 미설정 시에만 허용. 명확히 [데모] 사용자.
  @Post("oauth/:provider/demo")
  async oauthDemo(@Param("provider") provider: string, @Req() req: Request) {
    if (!isOAuthProvider(provider)) throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    if (providerMode(provider) !== "demo") {
      throw new HttpException({ error: "이 제공자는 실제 OAuth가 설정되어 데모를 쓸 수 없어요." }, HttpStatus.CONFLICT);
    }
    enforceRateLimit(`oauth-demo:${clientIp(req)}`, 20, 10 * 60_000);
    const user = await createDemoUser(provider);
    return { ok: true, user, demo: true, token: signSession(user.id, normalizeSessionVersion(user.sessionVersion)) };
  }

  @Post("signup")
  async signup(@Body() body: AuthPayload, @Req() req: Request) {
    enforceRateLimit(`signup:${clientIp(req)}`, 5, 10 * 60_000);
    await ensureUserLifecycleSchema();

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim() || email.split("@")[0];
    const avatar = resolveSignupAvatar(body.avatar);
    const image = resolveSignupAvatarImage(body.image);

    if (!EMAIL_RE.test(email)) throw new BadRequestException({ error: "이메일 형식이 올바르지 않아요." });
    if (password.length < 6) throw new BadRequestException({ error: "비밀번호는 6자 이상이어야 해요." });

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      throw new HttpException({ error: "이미 가입된 이메일이에요." }, HttpStatus.CONFLICT);
    }

    await db.insert(users).values({ email, name, image, avatar, passwordHash: hashPassword(password) });
    return { ok: true };
  }

  @Post("login")
  async login(@Body() body: AuthPayload, @Headers("x-forwarded-for") forwardedFor: string | undefined, @Req() req: Request) {
    enforceRateLimit(`login:${forwardedFor?.split(",")[0]?.trim() || clientIp(req)}`, 10, 10 * 60_000);
    await ensureUserLifecycleSchema();

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!email || !password) throw new BadRequestException({ error: "이메일 또는 비밀번호를 확인해 주세요." });

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpException({ error: "이메일 또는 비밀번호를 확인해 주세요." }, HttpStatus.UNAUTHORIZED);
    }
    const block = getUserAuthBlock(user);
    if (block) throw new HttpException({ error: block }, HttpStatus.FORBIDDEN);

    return {
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: normalizeRole(user.role),
      },
      token: signSession(user.id, normalizeSessionVersion(user.sessionVersion)),
    };
  }

  @Post("logout")
  async logout(@Headers("x-user-id") userId?: string) {
    if (userId) await revokeUserSessions(userId);
    return { ok: true };
  }
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").toLowerCase().trim();
}

function normalizeRole(value: string | null | undefined): AuthRole {
  const role = String(value ?? "").toLowerCase();
  if (role === "admin" || role === "creator" || role === "operator") return role;
  return "user";
}

function clientIp(req: Request) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (AuthRateLimitStore[key] ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    AuthRateLimitStore[key] = recent;
    throw new HttpException({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, HttpStatus.TOO_MANY_REQUESTS);
  }
  recent.push(now);
  AuthRateLimitStore[key] = recent;
}
