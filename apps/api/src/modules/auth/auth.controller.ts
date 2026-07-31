import { createHash } from "node:crypto";

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";

import { hashPassword, verifyPassword } from "../../../../../lib/auth-crypto";
import {
  resolveSignupAvatar,
  resolveSignupAvatarImage,
} from "../../../../../lib/avatar";
import { db, users } from "../../../../../lib/db";
import { getAppConfig } from "../../../../../lib/server/app-config";
import {
  buildAuthorizeUrl,
  consumeHandoff,
  createDemoUser,
  GoogleAuthConfigurationError,
  GoogleAuthCredentialError,
  handleGoogleIdToken,
  handleOAuthCallback,
  isOAuthProvider,
  issueHandoff,
  issueState,
  listAuthProviders,
  OAuthAccountBlockedError,
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
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import {
  UPSTASH_COORDINATION_PORT,
  type UpstashCoordinationPort,
} from "../../infrastructure/upstash-coordination/upstash-coordination.port";
import {
  AUTH_SESSION_COOKIE_NAME,
  resolveSessionCookieClearOptions,
  resolveSessionCookieOptions,
} from "../../session-cookie";

import { AuthClientIpPolicy, resolveAuthClientIp } from "./auth-client-ip";
import { isAllowedAuthRequestOrigin } from "./auth-origin";
import { GoogleIdTokenDto } from "./auth.dto";
import { AUTH_CLIENT_IP_POLICY, AUTH_RATE_LIMIT_CONFIG } from "./auth.tokens";

import type { AuthRateLimitConfig } from "./auth-rate-limit.config";
import type { Request, Response } from "express";

interface AuthPayload {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  avatar?: unknown;
  image?: unknown;
}

type AuthRole = "admin" | "creator" | "operator" | "user";
type AuthRateLimitAction =
  | "oauth-google-idtoken"
  | "oauth-demo"
  | "signup"
  | "login";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const AUTH_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const AUTH_RATE_LIMIT_DISTRIBUTED_EXPIRY_GRACE_MS = 120_000;
const AUTH_RATE_LIMIT_MAX_COST = 1_000_000;
const UNKNOWN_AUTH_CLIENT_IP = "unknown";

const AUTH_RATE_LIMIT_POLICIES: Record<
  AuthRateLimitAction,
  { readonly limit: number; readonly costUnits: number }
> = {
  "oauth-google-idtoken": { limit: 30, costUnits: 0 },
  "oauth-demo": { limit: 20, costUnits: 0 },
  signup: { limit: 5, costUnits: 0 },
  login: { limit: 10, costUnits: 0 },
};

const AUTH_RATE_LIMIT_LOCAL_STORE: Record<string, number[]> = {};
const AUTH_RATE_LIMIT_OPERATION_NONCE: { value: number } = { value: 0 };

@Controller("auth")
export class AuthController {
  private readonly rateLimitDistributed: boolean;
  private readonly clientIpPolicy: AuthClientIpPolicy;
  private readonly coordination: UpstashCoordinationPort | null;

  constructor(
    @Inject(AUTH_RATE_LIMIT_CONFIG)
    rateLimitConfig: AuthRateLimitConfig,
    @Inject(AUTH_CLIENT_IP_POLICY)
    clientIpPolicy: AuthClientIpPolicy,
    @Optional()
    @Inject(UPSTASH_COORDINATION_PORT)
    coordination?: UpstashCoordinationPort | null,
  ) {
    this.rateLimitDistributed = rateLimitConfig.distributed;
    this.clientIpPolicy = clientIpPolicy;
    this.coordination = coordination ?? null;
  }

  @Get("providers")
  async getProviders() {
    const config = await getAppConfig();
    return listAuthProviders({
      kakao: config.authKakao,
      naver: config.authNaver,
    });
  }

  // 실제 OAuth 시작 — 인가 URL로 리다이렉트(설정된 제공자만).
  @Get("oauth/:provider/start")
  oauthStart(@Param("provider") provider: string, @Res() res: Response) {
    if (!isOAuthProvider(provider))
      throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    const url = buildAuthorizeUrl(provider, issueState(provider));
    if (!url) {
      if (providerMode(provider) !== "demo") {
        throw new ServiceUnavailableException({
          error: "이 로그인 제공자의 서버 설정이 완료되지 않았어요.",
        });
      }
      // 카카오·네이버의 명시적 데모 제공자만 체험 흐름으로 보낸다.
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
    @Res() res: Response,
  ) {
    const web = webAppBaseUrl();
    if (!isOAuthProvider(provider))
      return res.redirect(`${web}/auth/callback#error=unsupported`);
    if (error)
      return res.redirect(
        `${web}/auth/callback#error=${encodeURIComponent(error)}`,
      );
    if (!verifyState(provider, state))
      return res.redirect(`${web}/auth/callback#error=bad_state`);
    if (!code) return res.redirect(`${web}/auth/callback#error=no_code`);
    try {
      const user = await handleOAuthCallback(provider, code);
      return res.redirect(`${web}/auth/callback#t=${issueHandoff(user)}`);
    } catch {
      return res.redirect(`${web}/auth/callback#error=oauth_failed`);
    }
  }

  // GIS(Google Identity Services) ID 토큰 로그인 — 프론트 GIS 버튼이 받은 ID 토큰을 서버 검증.
  // 인가-코드/리다이렉트 없이 직접 세션을 발급한다(서명·aud·iss·exp 는 google-auth-library 가 검증).
  @Post("oauth/google/id-token")
  async oauthGoogleIdToken(
    @Body(new ZodValidationPipe(GoogleIdTokenDto)) body: GoogleIdTokenDto,
    @Headers("origin") origin: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!isAllowedAuthRequestOrigin(origin)) {
      throw new ForbiddenException({
        error: "허용되지 않은 사이트에서 보낸 로그인 요청이에요.",
      });
    }
    await this.enforceRateLimit("oauth-google-idtoken", req);
    let user;
    try {
      user = await handleGoogleIdToken(body.idToken);
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      if (err instanceof GoogleAuthConfigurationError) {
        throw new ServiceUnavailableException({
          error: "Google 로그인이 아직 설정되지 않았어요.",
        });
      }
      if (err instanceof GoogleAuthCredentialError) {
        throw new UnauthorizedException({
          error: "Google 로그인 정보가 만료되었거나 올바르지 않아요. 다시 시도해 주세요.",
        });
      }
      if (err instanceof OAuthAccountBlockedError) {
        throw new ForbiddenException({ error: err.publicMessage });
      }
      // DB·외부 라이브러리의 내부 오류 메시지나 자격 증명 세부정보는 응답에 노출하지 않는다.
      throw new ServiceUnavailableException({
        error: "Google 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
    const token = signSession(user.id, normalizeSessionVersion(user.sessionVersion));
    applyAuthSessionCookie(response, token);
    return {
      ok: true,
      user,
      token,
    };
  }

  // 핸드오프 토큰 → 사용자 객체(프론트가 세션 저장). 1회용.
  @Post("oauth/exchange")
  oauthExchange(
    @Body() body: { token?: unknown },
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = consumeHandoff(
      typeof body?.token === "string" ? body.token : undefined,
    );
    if (!user)
      throw new HttpException(
        { error: "만료되었거나 잘못된 로그인 토큰이에요." },
        HttpStatus.UNAUTHORIZED,
      );
    const token = signSession(user.id, normalizeSessionVersion(user.sessionVersion));
    applyAuthSessionCookie(response, token);
    return {
      ok: true,
      user,
      token,
    };
  }

  // 데모 폴백 로그인 — 실제 제공자 미설정 시에만 허용. 명확히 [데모] 사용자.
  @Post("oauth/:provider/demo")
  async oauthDemo(
    @Param("provider") provider: string,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!isOAuthProvider(provider))
      throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    const mode = providerMode(provider);
    if (mode === "disabled") {
      throw new ServiceUnavailableException({
        error: "이 로그인 제공자의 설정이 완료되지 않았어요.",
      });
    }
    if (mode !== "demo") {
      throw new HttpException(
        { error: "이 제공자는 실제 OAuth가 설정되어 데모를 쓸 수 없어요." },
        HttpStatus.CONFLICT,
      );
    }
    await this.enforceRateLimit("oauth-demo", req);
    const user = await createDemoUser(provider);
    const token = signSession(user.id, normalizeSessionVersion(user.sessionVersion));
    applyAuthSessionCookie(response, token);
    return {
      ok: true,
      user,
      demo: true,
      token,
    };
  }

  @Post("signup")
  async signup(
    @Body() body: AuthPayload,
    @Req() req: Request,
  ) {
    await this.enforceRateLimit("signup", req);
    await ensureUserLifecycleSchema();

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim() || email.split("@")[0];
    const avatar = resolveSignupAvatar(body.avatar);
    const image = resolveSignupAvatarImage(body.image);

    if (!EMAIL_RE.test(email))
      throw new BadRequestException({
        error: "이메일 형식이 올바르지 않아요.",
      });
    if (password.length < 6)
      throw new BadRequestException({
        error: "비밀번호는 6자 이상이어야 해요.",
      });

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      throw new HttpException(
        { error: "이미 가입된 이메일이에요." },
        HttpStatus.CONFLICT,
      );
    }

    await db
      .insert(users)
      .values({
        email,
        name,
        image,
        avatar,
        passwordHash: hashPassword(password),
      });
    return { ok: true };
  }

  @Post("login")
  async login(
    @Body() body: AuthPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.enforceRateLimit("login", req);
    await ensureUserLifecycleSchema();

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!email || !password)
      throw new BadRequestException({
        error: "이메일 또는 비밀번호를 확인해 주세요.",
      });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpException(
        { error: "이메일 또는 비밀번호를 확인해 주세요." },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const block = getUserAuthBlock(user);
    if (block) throw new HttpException({ error: block }, HttpStatus.FORBIDDEN);

    const token = signSession(user.id, normalizeSessionVersion(user.sessionVersion));
    applyAuthSessionCookie(response, token);

    return {
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: normalizeRole(user.role),
      },
      token,
    };
  }

  @Post("logout")
  async logout(
    @Headers("x-user-id") userId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (userId) await revokeUserSessions(userId);
    clearAuthSessionCookie(response);
    return { ok: true };
  }

  private async enforceRateLimit(
    action: AuthRateLimitAction,
    req: Request,
  ): Promise<void> {
    const policy = AUTH_RATE_LIMIT_POLICIES[action];
    const sourceIp = resolveAuthClientIp(req, this.clientIpPolicy);
    const identity = `${action}:${sourceIp}`;

    if (!this.rateLimitDistributed) {
      await enforceLocalRateLimit(identity, policy.limit, AUTH_RATE_LIMIT_WINDOW_MS);
      return;
    }

    if (!this.coordination) {
      throw new ServiceUnavailableException({
        error: "인증 요청 한도 검증 인프라가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    try {
      await enforceDistributedRateLimit(
        this.coordination,
        action,
        sourceIp,
        policy,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        error: "인증 요청 한도 검증 인프라가 일시적으로 응답하지 않습니다.",
      });
    }
  }
}

function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim();
}

function applyAuthSessionCookie(response: Response, token: string): void {
  response.cookie(
    AUTH_SESSION_COOKIE_NAME,
    token,
    resolveSessionCookieOptions(),
  );
}

function clearAuthSessionCookie(response: Response): void {
  response.clearCookie(
    AUTH_SESSION_COOKIE_NAME,
    resolveSessionCookieClearOptions(),
  );
}

function normalizeRole(value: string | null | undefined): AuthRole {
  const role = String(value ?? "").toLowerCase();
  if (role === "admin" || role === "creator" || role === "operator")
    return role;
  return "user";
}

function createAuthRateLimitProviderId(
  action: AuthRateLimitAction,
  sourceIp: string,
  nowMs: number,
): string {
  const bucketId = Math.floor(nowMs / AUTH_RATE_LIMIT_WINDOW_MS);
  const safeIp = sourceIp === UNKNOWN_AUTH_CLIENT_IP ? "unknown" : sourceIp;
  const ipDigest = createHash("sha256")
    .update(safeIp)
    .digest("hex")
    .slice(0, 8);
  return `auth-${action}-${bucketId}-${ipDigest}`;
}

function nextAuthRateLimitOperationId(action: AuthRateLimitAction): string {
  AUTH_RATE_LIMIT_OPERATION_NONCE.value += 1;
  return `${action}-${Date.now().toString(36)}-${AUTH_RATE_LIMIT_OPERATION_NONCE.value.toString(36)}`;
}

async function enforceLocalRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = Date.now();
  const recent = (AUTH_RATE_LIMIT_LOCAL_STORE[key] ?? []).filter(
    (timestamp) => now - timestamp < windowMs,
  );
  if (recent.length >= limit) {
    AUTH_RATE_LIMIT_LOCAL_STORE[key] = recent;
    throw new HttpException(
      { error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  recent.push(now);
  AUTH_RATE_LIMIT_LOCAL_STORE[key] = recent;
}

async function enforceDistributedRateLimit(
  coordination: UpstashCoordinationPort,
  action: AuthRateLimitAction,
  sourceIp: string,
  policy: { readonly limit: number; readonly costUnits: number },
): Promise<void> {
  const nowMs = Date.now();
  const providerId = createAuthRateLimitProviderId(action, sourceIp, nowMs);

  const budget = await coordination.consumeProviderBudget({
    providerId,
    operationId: nextAuthRateLimitOperationId(action),
    requestUnits: 1,
    costUnits: policy.costUnits,
    maximumRequestUnits: policy.limit,
    maximumCostUnits: Math.max(policy.limit, AUTH_RATE_LIMIT_MAX_COST),
    expiryGraceMs: AUTH_RATE_LIMIT_DISTRIBUTED_EXPIRY_GRACE_MS,
  });
  if (!budget.accepted) {
    throw new HttpException(
      { error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
