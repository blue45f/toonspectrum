import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import {
  AccountMergeError,
  confirmAccountMerge,
  issueAccountMergeToken,
  previewAccountMerge,
} from "../../server/account-merge";
import {
  hashPassword,
  isPasswordVerificationInputBounded,
  passwordPolicyError,
  verifyPassword,
} from "../../server/password";
import {
  resolveSignupAvatar,
  resolveSignupAvatarImage,
} from "../../../../web/src/shared/lib/avatar";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { accounts, db, sessions, users } from "../../db";
import { StudioRealtimeRevocationService } from "../../infrastructure/studio-realtime-revocation/studio-realtime-revocation.client";
import {
  UPSTASH_COORDINATION_PORT,
  type UpstashCoordinationPort,
} from "../../infrastructure/upstash-coordination/upstash-coordination.port";
import { normalizePersistedAuthRole } from "../../server/admin-roles";
import {
  AuthEmailConfigurationError,
  AuthEmailDeliveryError,
  isAuthEmailDeliveryConfigured,
  sendAuthEmail,
} from "../../server/auth-email";
import {
  consumeAuthOneTimeToken,
  issueAuthOneTimeToken,
  revokeAuthOneTimeTokens,
} from "../../server/auth-one-time-token";
import {
  oauthPkceVerifierCookieName,
  oauthStateCookieName,
  resolveOAuthPkceVerifierCookieClearOptions,
  resolveOAuthPkceVerifierCookieOptions,
  resolveOAuthPkceVerifierCookieValue,
  resolveOAuthStateCookieClearOptions,
  resolveOAuthStateCookieOptions,
  resolveOAuthStateCookieValue,
} from "../../oauth-state-cookie";
import { getAppConfig } from "../../server/app-config";
import {
  buildAuthorizeUrl,
  consumeHandoff,
  createDemoUser,
  createPkceCodeChallenge,
  GoogleAuthConfigurationError,
  GoogleAuthCredentialError,
  handleGoogleIdToken,
  handleOAuthCallback,
  isAuthorizationCodeFlowConfigured,
  isOAuthProvider,
  isValidPkceVerifier,
  issuePkceVerifier,
  issueState,
  listAuthProviders,
  OAuthAccountBlockedError,
  OAuthAccountLinkRequiredError,
  OAuthIdentityAlreadyLinkedError,
  OAuthProviderAlreadyLinkedError,
  providerMode,
  readOAuthStateContext,
  verifyBrowserBoundState,
  webAppBaseUrl,
  type OAuthProviderId,
} from "../../server/oauth";
import {
  invalidateSessionUser,
  signSession,
  verifySessionToken,
} from "../../server/session";
import {
  ensureUserLifecycleSchema,
  getUserAuthBlock,
  normalizeSessionVersion,
  revokeUserSessions,
} from "../../server/user-lifecycle";
import {
  AUTH_SESSION_COOKIE_NAME,
  resolveSessionCookieValue,
  resolveSessionCookieClearOptions,
  resolveSessionCookieOptions,
} from "../../session-cookie";

import { AuthClientIpPolicy, resolveAuthClientIp } from "./auth-client-ip";
import { isAllowedAuthRequestOrigin } from "./auth-origin";
import {
  AUTH_RATE_LIMIT_POLICIES,
  AUTH_RATE_LIMIT_WINDOW_MS,
  createAuthRateLimitSubjectFingerprint,
  LocalAuthRateLimiter,
  type AuthRateLimitAction,
  type AuthRateLimitSubjectKind,
} from "./auth-rate-limit";
import {
  AuthRateLimitDependencyError,
  type AuthRateLimitConfig,
} from "./auth-rate-limit.config";
import { resolveAuthSessionUser } from "./auth-session-profile";
import { GoogleIdTokenDto, type AuthSessionResponse } from "./auth.dto";
import { AUTH_CLIENT_IP_POLICY, AUTH_RATE_LIMIT_CONFIG } from "./auth.tokens";

import type { Request, Response } from "express";

interface AuthPayload {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  avatar?: unknown;
  image?: unknown;
  token?: unknown;
}

type AuthResponseUser = ReturnType<typeof authResponseUser>;
type AuthCompletionResponse = Readonly<{
  ok: true;
  user: AuthResponseUser;
  demo?: true;
}>;

export function isValidSignupEmail(email: string): boolean {
  // Bound the address before any validation and avoid overlapping regexp
  // quantifiers on an attacker-controlled domain containing many dots.
  if (email.length > 254 || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}
const AUTH_RATE_LIMIT_LOCAL_LIMITER = new LocalAuthRateLimiter();
const OAUTH_AUTHORIZATION_CODE_MAX_LENGTH = 8_192;

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly rateLimitDistributed: boolean;
  private readonly clientIpPolicy: AuthClientIpPolicy;
  private readonly coordination: UpstashCoordinationPort | null;

  constructor(
    @Inject(AUTH_RATE_LIMIT_CONFIG)
    rateLimitConfig: AuthRateLimitConfig,
    @Inject(AUTH_CLIENT_IP_POLICY)
    clientIpPolicy: AuthClientIpPolicy,
    @Inject(UPSTASH_COORDINATION_PORT)
    coordination: UpstashCoordinationPort | null,
    @Inject(StudioRealtimeRevocationService)
    private readonly realtimeRevocation: StudioRealtimeRevocationService =
      new StudioRealtimeRevocationService({ enabled: false }),
  ) {
    if (rateLimitConfig.distributed && !coordination) {
      throw new AuthRateLimitDependencyError();
    }
    this.rateLimitDistributed = rateLimitConfig.distributed;
    this.clientIpPolicy = clientIpPolicy;
    this.coordination = coordination;
  }

  private assertAuthEmailDeliveryConfigured(): void {
    if (!isAuthEmailDeliveryConfigured()) {
      throw new ServiceUnavailableException({
        error: "이메일 인증 서비스 설정이 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  private async deliverAuthChallenge(
    purpose: "verify-email" | "reset-password",
    userId: string,
    email: string,
  ): Promise<void> {
    const rawToken = await issueAuthOneTimeToken(purpose, userId);
    try {
      await sendAuthEmail({ purpose, to: email, token: rawToken });
      this.logger.log({ event: "auth.email.sent", purpose });
    } catch (error: unknown) {
      await revokeAuthOneTimeTokens(purpose, userId).catch(() => undefined);
      this.logger.error({
        event: "auth.email.failed",
        purpose,
        reasonCode: error instanceof AuthEmailConfigurationError
          ? "configuration"
          : error instanceof AuthEmailDeliveryError
            ? `provider-${error.status ?? "network"}`
            : "unexpected",
      });
      throw new ServiceUnavailableException({
        error: "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  @Get("providers")
  async getProviders() {
    const config = await getAppConfig();
    return listAuthProviders({
      kakao: config.authKakao,
      naver: config.authNaver,
    });
  }

  /**
   * Browser session truth source. `sessionAuth` has already verified the
   * HttpOnly cookie (or the temporary legacy header) and replaced x-user-id
   * with the canonical user id before this controller runs.
   */
  @Get("session")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async getSession(
    @Headers("x-user-id") userId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    if (!userId) {
      clearAuthSessionCookie(response);
      return { authenticated: false, user: null };
    }

    const user = await resolveAuthSessionUser(userId);
    if (!user) {
      clearAuthSessionCookie(response);
      return { authenticated: false, user: null };
    }
    return { authenticated: true, user };
  }

  // 실제 OAuth 시작 — 인가 URL로 리다이렉트(설정된 제공자만).
  @Get("oauth/:provider/start")
  oauthStart(@Param("provider") provider: string, @Res() res: Response) {
    if (!isOAuthProvider(provider))
      throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    if (providerMode(provider) === "demo") {
      // 카카오·네이버의 명시적 데모 제공자만 체험 흐름으로 보낸다.
      return res.redirect(`${webAppBaseUrl()}/auth/callback#demo=${provider}`);
    }
    // Google의 기본 GIS 흐름은 client ID만 사용한다. 레거시 redirect 경로가
    // 설정되지 않은 경우 state secret을 읽기 전에 안전하게 거부한다.
    if (!isAuthorizationCodeFlowConfigured(provider)) {
      throw new ServiceUnavailableException({
        error: "이 로그인 제공자의 리다이렉트 로그인이 설정되지 않았어요.",
      });
    }
    const state = issueState(provider);
    const pkceVerifier = provider === "github" ? issuePkceVerifier() : undefined;
    const url = buildAuthorizeUrl(provider, state, {
      ...(pkceVerifier
        ? { pkceCodeChallenge: createPkceCodeChallenge(pkceVerifier) }
        : {}),
    });
    if (!url) {
      throw new ServiceUnavailableException({
        error: "이 로그인 제공자의 리다이렉트 로그인이 설정되지 않았어요.",
      });
    }
    applyOAuthStateCookie(res, provider, state);
    if (pkceVerifier) {
      applyOAuthPkceVerifierCookie(res, provider, pkceVerifier);
    }
    return res.redirect(url);
  }

  @Get("oauth/:provider/link/start")
  async oauthLinkStart(
    @Param("provider") provider: string,
    @Headers("x-user-id") userId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (!userId) {
      throw new UnauthorizedException({
        error: "계정을 연결하려면 다시 로그인해 주세요.",
      });
    }
    if (!isOAuthProvider(provider)) {
      throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    }
    await this.enforceRateLimit("account-link", request, userId);
    const sessionUser = await resolveAuthSessionUser(userId);
    if (!sessionUser) {
      throw new UnauthorizedException({
        error: "계정을 연결하려면 다시 로그인해 주세요.",
      });
    }
    if (!isAuthorizationCodeFlowConfigured(provider)) {
      throw new ServiceUnavailableException({
        error: "이 제공자의 계정 연결이 아직 설정되지 않았어요.",
      });
    }

    const state = issueState(provider, { purpose: "link", userId });
    const pkceVerifier = provider === "github" ? issuePkceVerifier() : undefined;
    const url = buildAuthorizeUrl(provider, state, {
      ...(pkceVerifier
        ? { pkceCodeChallenge: createPkceCodeChallenge(pkceVerifier) }
        : {}),
    });
    if (!url) {
      throw new ServiceUnavailableException({
        error: "이 제공자의 계정 연결을 시작하지 못했어요.",
      });
    }
    applyOAuthStateCookie(response, provider, state);
    if (pkceVerifier) {
      applyOAuthPkceVerifierCookie(response, provider, pkceVerifier);
    }
    return response.redirect(url);
  }

  // 제공자 콜백 — code 교환 → 사용자 upsert → HttpOnly 세션 쿠키 발급 후 프론트 복귀.
  // 여러 프로세스 인스턴스 사이에는 프로세스 로컬 Map이 공유되지 않으므로, 이 경로는
  // 핸드오프 토큰을 사용하지 않는다. URL fragment에는 PII나 세션 자격 증명을 넣지 않는다.
  @Get("oauth/:provider/callback")
  async oauthCallback(
    @Param("provider") provider: string,
    @Query("code") code: unknown,
    @Query("state") state: unknown,
    @Query("error") error: unknown,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    const web = webAppBaseUrl();
    if (!isOAuthProvider(provider))
      return res.redirect(`${web}/auth/callback#error=unsupported`);

    const browserState = resolveOAuthStateCookieValue(
      request.headers.cookie,
      provider,
    );
    const browserPkceVerifier = provider === "github"
      ? resolveOAuthPkceVerifierCookieValue(request.headers.cookie, provider)
      : null;

    if (!isAuthorizationCodeFlowConfigured(provider)) {
      clearOAuthStateCookie(res, provider);
      if (provider === "github") clearOAuthPkceVerifierCookie(res, provider);
      return res.redirect(`${web}/auth/callback#error=oauth_unavailable`);
    }

    const stateContext = readOAuthStateContext(provider, state);
    if (
      typeof state !== "string"
      || !stateContext
      || !verifyBrowserBoundState(provider, state, browserState)
    ) {
      const isRepeatedLoginCallback = stateContext?.purpose === "login"
        && error === undefined
        && typeof code === "string"
        && code.length > 0
        && code.length <= OAUTH_AUTHORIZATION_CODE_MAX_LENGTH;
      const existingSession = isRepeatedLoginCallback
        ? verifySessionToken(resolveSessionCookieValue(request.headers.cookie))
        : null;
      if (existingSession) {
        this.logger.log({
          event: "auth.oauth.duplicate_callback_recovered",
          provider,
        });
        return res.redirect(`${web}/auth/callback#session=1`);
      }
      return res.redirect(`${web}/auth/callback#error=bad_state`);
    }

    // Consume browser-bound material only after the callback proves it owns the
    // current flow. A stale callback must not erase a newer tab's valid state.
    clearOAuthStateCookie(res, provider);
    if (provider === "github") clearOAuthPkceVerifierCookie(res, provider);
    let linkToUserId: string | undefined;
    if (stateContext.purpose === "link") {
      const principal = verifySessionToken(
        resolveSessionCookieValue(request.headers.cookie),
      );
      if (!principal || principal.userId !== stateContext.userId) {
        return res.redirect(`${web}/auth/callback#error=bad_state`);
      }
      const [linkingUser] = await db
        .select({
          id: users.id,
          status: users.status,
          sessionVersion: users.sessionVersion,
        })
        .from(users)
        .where(eq(users.id, principal.userId))
        .limit(1);
      if (
        !linkingUser
        || getUserAuthBlock(linkingUser)
        || normalizeSessionVersion(linkingUser.sessionVersion)
          !== principal.sessionVersion
      ) {
        return res.redirect(`${web}/auth/callback#error=bad_state`);
      }
      linkToUserId = linkingUser.id;
    }
    if (provider === "github" && !isValidPkceVerifier(browserPkceVerifier)) {
      return res.redirect(`${web}/auth/callback#error=bad_state`);
    }
    if (error !== undefined) {
      const errorCode = typeof error === "string"
        && /^[A-Za-z0-9._-]{1,80}$/u.test(error)
        ? error
        : "provider_error";
      return res.redirect(
        `${web}/auth/callback#error=${encodeURIComponent(errorCode)}`,
      );
    }
    if (
      typeof code !== "string"
      || code.length === 0
      || code.length > OAUTH_AUTHORIZATION_CODE_MAX_LENGTH
    ) {
      return res.redirect(`${web}/auth/callback#error=no_code`);
    }
    try {
      const user = linkToUserId
        ? await handleOAuthCallback(
            provider,
            code,
            state,
            browserPkceVerifier ?? undefined,
            { linkToUserId },
          )
        : await handleOAuthCallback(
            provider,
            code,
            state,
            browserPkceVerifier ?? undefined,
          );
      const token = signSession(
        user.id,
        normalizeSessionVersion(user.sessionVersion),
      );
      applyAuthSessionCookie(res, token);
      return linkToUserId
        ? res.redirect(`${web}/auth/callback#linked=${provider}`)
        : res.redirect(`${web}/auth/callback#session=1`);
    } catch (caught: unknown) {
      if (caught instanceof OAuthAccountLinkRequiredError) {
        return res.redirect(`${web}/auth/callback#error=account_link_required`);
      }
      if (caught instanceof OAuthAccountBlockedError) {
        return res.redirect(`${web}/auth/callback#error=account_blocked`);
      }
      if (caught instanceof OAuthIdentityAlreadyLinkedError) {
        return res.redirect(`${web}/auth/callback#error=identity_already_linked`);
      }
      if (caught instanceof OAuthProviderAlreadyLinkedError) {
        return res.redirect(`${web}/auth/callback#error=provider_already_linked`);
      }
      this.logOAuthFailure(
        "authorization-code",
        provider,
        "authorization-code-processing-failed",
      );
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
  ): Promise<AuthCompletionResponse> {
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
      if (err instanceof OAuthAccountLinkRequiredError) {
        throw new HttpException(
          {
            code: "ACCOUNT_LINK_REQUIRED",
            error: "이미 같은 이메일로 가입된 계정이 있어요. 기존 계정으로 로그인한 뒤 Google 계정을 연결해 주세요.",
          },
          HttpStatus.CONFLICT,
        );
      }
      // DB·외부 라이브러리의 내부 오류 메시지나 자격 증명 세부정보는 응답에 노출하지 않는다.
      this.logOAuthFailure(
        "google-id-token",
        "google",
        "google-id-token-persistence-failed",
      );
      throw new ServiceUnavailableException({
        error: "Google 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
    const token = signSession(user.id, normalizeSessionVersion(user.sessionVersion));
    applyAuthSessionCookie(response, token);
    return {
      ok: true,
      user: authResponseUser(user),
    };
  }

  @Post("oauth/google/link")
  async linkGoogleAccount(
    @Body(new ZodValidationPipe(GoogleIdTokenDto)) body: GoogleIdTokenDto,
    @Headers("x-user-id") userId: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Req() request: Request,
  ) {
    if (!userId) {
      throw new UnauthorizedException({
        error: "Google 계정을 연결하려면 다시 로그인해 주세요.",
      });
    }
    if (!isAllowedAuthRequestOrigin(origin)) {
      throw new ForbiddenException({
        error: "허용되지 않은 사이트에서 보낸 계정 연결 요청이에요.",
      });
    }
    await this.enforceRateLimit("account-link", request, userId);
    if (!await resolveAuthSessionUser(userId)) {
      throw new UnauthorizedException({
        error: "Google 계정을 연결하려면 다시 로그인해 주세요.",
      });
    }
    try {
      await handleGoogleIdToken(body.idToken, { linkToUserId: userId });
    } catch (error: unknown) {
      if (error instanceof GoogleAuthConfigurationError) {
        throw new ServiceUnavailableException({
          error: "Google 계정 연결이 아직 설정되지 않았어요.",
        });
      }
      if (error instanceof GoogleAuthCredentialError) {
        throw new UnauthorizedException({
          error: "Google 인증 정보가 만료되었거나 올바르지 않아요.",
        });
      }
      if (error instanceof OAuthAccountBlockedError) {
        throw new ForbiddenException({ error: error.publicMessage });
      }
      if (error instanceof OAuthIdentityAlreadyLinkedError) {
        throw new HttpException(
          { code: "IDENTITY_ALREADY_LINKED", error: "이 Google 계정은 다른 회원에게 연결되어 있어요." },
          HttpStatus.CONFLICT,
        );
      }
      if (error instanceof OAuthProviderAlreadyLinkedError) {
        throw new HttpException(
          { code: "PROVIDER_ALREADY_LINKED", error: "이미 다른 Google 계정이 연결되어 있어요." },
          HttpStatus.CONFLICT,
        );
      }
      this.logOAuthFailure(
        "google-id-token",
        "google",
        "google-id-token-persistence-failed",
      );
      throw new ServiceUnavailableException({
        error: "Google 계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
    this.logger.log({ event: "auth.account.linked", provider: "google" });
    return { ok: true, provider: "google" as const };
  }

  /**
   * Keep production OAuth failures diagnosable without logging authorization
   * codes, ID tokens, provider payloads, email addresses, or database details.
   */
  private logOAuthFailure(
    flow: "authorization-code" | "google-id-token",
    provider: string,
    reasonCode:
      | "authorization-code-processing-failed"
      | "google-id-token-persistence-failed",
  ): void {
    this.logger.error({
      event: "auth.oauth.failure",
      flow,
      provider: provider.slice(0, 24),
      reasonCode,
    });
  }

  // 핸드오프 토큰 → HttpOnly 쿠키 세션 + 공개 사용자 객체. 핸드오프는 1회용이다.
  @Post("oauth/exchange")
  oauthExchange(
    @Body() body: { token?: unknown },
    @Res({ passthrough: true }) response: Response,
  ): AuthCompletionResponse {
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
      user: authResponseUser(user),
    };
  }

  // 데모 폴백 로그인 — 실제 제공자 미설정 시에만 허용. 명확히 [데모] 사용자.
  @Post("oauth/:provider/demo")
  async oauthDemo(
    @Param("provider") provider: string,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthCompletionResponse> {
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
      user: authResponseUser(user),
      demo: true,
    };
  }

  @Post("signup")
  async signup(
    @Body() body: AuthPayload,
    @Req() req: Request,
  ) {
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    await this.enforceRateLimit("signup", req, email || undefined);
    await ensureUserLifecycleSchema();
    this.assertAuthEmailDeliveryConfigured();

    if (!isValidSignupEmail(email)) {
      throw new BadRequestException({
        error: "이메일 형식이 올바르지 않아요.",
      });
    }
    const policyError = passwordPolicyError(password);
    if (policyError) {
      throw new BadRequestException({ error: policyError });
    }

    const requestedName = String(body.name ?? "").trim().slice(0, 80);
    const name = requestedName || email.split("@")[0].slice(0, 80);
    const passwordHash = await hashPassword(password);
    const [inserted] = await db
      .insert(users)
      .values({
        email,
        emailVerified: null,
        name,
        image: resolveSignupAvatarImage(body.image),
        avatar: resolveSignupAvatar(body.avatar),
        passwordHash,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email });

    if (inserted?.email) {
      await this.deliverAuthChallenge("verify-email", inserted.id, inserted.email);
    } else {
      const [existing] = await db
        .select({
          id: users.id,
          email: users.email,
          emailVerified: users.emailVerified,
          passwordHash: users.passwordHash,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (
        existing?.email
        && existing.passwordHash
        && existing.emailVerified === null
        && existing.status === "active"
      ) {
        await this.deliverAuthChallenge(
          "verify-email",
          existing.id,
          existing.email,
        );
      }
    }

    return {
      ok: true,
      verificationRequired: true,
      message: "가입 확인 메일을 확인해 주세요.",
    };
  }

  @Post("login")
  async login(
    @Body() body: AuthPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthCompletionResponse> {
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    await this.enforceRateLimit("login", req, email || undefined);
    await ensureUserLifecycleSchema();

    if (!email || !isPasswordVerificationInputBounded(password)) {
      throw new BadRequestException({
        error: "이메일 또는 비밀번호를 확인해 주세요.",
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const credential = await verifyPassword(password, user?.passwordHash);
    if (!user || !credential.valid) {
      throw new HttpException(
        { error: "이메일 또는 비밀번호를 확인해 주세요." },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const block = getUserAuthBlock(user);
    if (block) throw new HttpException({ error: block }, HttpStatus.FORBIDDEN);
    if (!user.emailVerified) {
      throw new HttpException(
        {
          code: "EMAIL_VERIFICATION_REQUIRED",
          error: "이메일 인증을 완료한 뒤 로그인해 주세요.",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (credential.needsRehash && user.passwordHash) {
      const upgradedHash = await hashPassword(password);
      await db
        .update(users)
        .set({ passwordHash: upgradedHash })
        .where(and(
          eq(users.id, user.id),
          eq(users.passwordHash, user.passwordHash),
        ));
    }

    const token = signSession(user.id, normalizeSessionVersion(user.sessionVersion));
    applyAuthSessionCookie(response, token);
    return { ok: true, user: authResponseUser(user) };
  }

  @Post("email/verify")
  async verifyEmail(
    @Body() body: AuthPayload,
    @Req() req: Request,
  ) {
    const rawToken = typeof body.token === "string" ? body.token.trim() : "";
    await this.enforceRateLimit(
      "email-verify",
      req,
      rawToken || undefined,
      "token",
    );
    const verifiedUserId = await consumeAuthOneTimeToken(
      "verify-email",
      rawToken,
      async (transaction, userId) => {
        const [updated] = await transaction
          .update(users)
          .set({ emailVerified: new Date() })
          .where(and(eq(users.id, userId), eq(users.status, "active")))
          .returning({ id: users.id });
        return updated?.id ?? null;
      },
    );
    if (!verifiedUserId) {
      throw new BadRequestException({
        error: "만료되었거나 이미 사용된 인증 링크예요.",
      });
    }
    invalidateSessionUser(verifiedUserId);
    this.logger.log({ event: "auth.email.verified" });
    return { ok: true };
  }

  @Post("email/verification/resend")
  async resendEmailVerification(
    @Body() body: AuthPayload,
    @Req() req: Request,
  ) {
    const email = normalizeEmail(body.email);
    await this.enforceRateLimit(
      "email-verification-resend",
      req,
      email || undefined,
    );
    this.assertAuthEmailDeliveryConfigured();
    if (isValidSignupEmail(email)) {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          emailVerified: users.emailVerified,
          passwordHash: users.passwordHash,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (
        user?.email
        && user.passwordHash
        && user.emailVerified === null
        && user.status === "active"
      ) {
        await this.deliverAuthChallenge("verify-email", user.id, user.email);
      }
    }
    return genericEmailDispatchResponse();
  }

  @Post("password/reset/request")
  async requestPasswordReset(
    @Body() body: AuthPayload,
    @Req() req: Request,
  ) {
    const email = normalizeEmail(body.email);
    await this.enforceRateLimit(
      "password-reset-request",
      req,
      email || undefined,
    );
    this.assertAuthEmailDeliveryConfigured();
    if (isValidSignupEmail(email)) {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          emailVerified: users.emailVerified,
          passwordHash: users.passwordHash,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (
        user?.email
        && user.passwordHash
        && user.emailVerified
        && user.status === "active"
      ) {
        await this.deliverAuthChallenge("reset-password", user.id, user.email);
      }
    }
    return genericEmailDispatchResponse();
  }

  @Post("password/reset/confirm")
  async confirmPasswordReset(
    @Body() body: AuthPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rawToken = typeof body.token === "string" ? body.token.trim() : "";
    const password = String(body.password ?? "");
    await this.enforceRateLimit(
      "password-reset-confirm",
      req,
      rawToken || undefined,
      "token",
    );
    const policyError = passwordPolicyError(password);
    if (policyError) throw new BadRequestException({ error: policyError });
    const passwordHash = await hashPassword(password);
    const reset = await consumeAuthOneTimeToken(
      "reset-password",
      rawToken,
      async (transaction, userId) => {
        const [updated] = await transaction
          .update(users)
          .set({
            passwordHash,
            emailVerified: new Date(),
            sessionVersion: sql<number>`${users.sessionVersion} + 1`,
          })
          .where(and(eq(users.id, userId), eq(users.status, "active")))
          .returning({
            id: users.id,
            sessionVersion: users.sessionVersion,
          });
        if (!updated) return null;
        await transaction.delete(sessions).where(eq(sessions.userId, userId));
        return updated;
      },
    );
    if (!reset) {
      throw new BadRequestException({
        error: "만료되었거나 이미 사용된 비밀번호 재설정 링크예요.",
      });
    }
    invalidateSessionUser(reset.id);
    clearAuthSessionCookie(response);
    await this.realtimeRevocation
      .revokeSessionVersion(reset.id, reset.sessionVersion)
      .catch(() => this.logger.error({
        event: "auth.password-reset.realtime-revocation-failed",
      }));
    this.logger.log({ event: "auth.password-reset.completed" });
    return { ok: true };
  }

  @Get("accounts")
  async getLinkedAccounts(
    @Headers("x-user-id") userId: string | undefined,
  ) {
    if (!userId) {
      throw new UnauthorizedException({ error: "로그인이 필요해요." });
    }
    const [user] = await db
      .select({
        passwordHash: users.passwordHash,
        emailVerified: users.emailVerified,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || getUserAuthBlock(user)) {
      throw new UnauthorizedException({ error: "다시 로그인해 주세요." });
    }
    const linked = await db
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const providers = [...new Set(
      linked
        .map((entry) => entry.provider)
        .filter((provider): provider is OAuthProviderId => isOAuthProvider(provider)),
    )];
    return {
      password: Boolean(user.passwordHash),
      emailVerified: Boolean(user.emailVerified),
      providers,
      loginMethodCount: providers.length + (user.passwordHash ? 1 : 0),
    };
  }

  @Delete("accounts/:provider")
  async unlinkAccount(
    @Param("provider") provider: string,
    @Headers("x-user-id") userId: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!userId) {
      throw new UnauthorizedException({ error: "로그인이 필요해요." });
    }
    if (!isOAuthProvider(provider)) {
      throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    }
    await this.enforceRateLimit("account-unlink", request, userId);
    const result = await db.transaction(async (transaction) => {
      const [user] = await transaction
        .select({
          passwordHash: users.passwordHash,
          status: users.status,
          sessionVersion: users.sessionVersion,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user || getUserAuthBlock(user)) {
        throw new UnauthorizedException({ error: "다시 로그인해 주세요." });
      }
      const links = await transaction
        .select({ provider: accounts.provider })
        .from(accounts)
        .where(eq(accounts.userId, userId));
      if (!links.some((entry) => entry.provider === provider)) {
        return { changed: false, sessionVersion: user.sessionVersion };
      }
      const methodCount = links.length + (user.passwordHash ? 1 : 0);
      if (methodCount <= 1) {
        throw new HttpException(
          {
            code: "LAST_LOGIN_METHOD",
            error: "마지막 로그인 수단은 해제할 수 없어요. 다른 로그인 수단을 먼저 연결해 주세요.",
          },
          HttpStatus.CONFLICT,
        );
      }
      await transaction
        .delete(accounts)
        .where(and(
          eq(accounts.userId, userId),
          eq(accounts.provider, provider),
        ));
      const [updated] = await transaction
        .update(users)
        .set({ sessionVersion: sql<number>`${users.sessionVersion} + 1` })
        .where(eq(users.id, userId))
        .returning({ sessionVersion: users.sessionVersion });
      await transaction.delete(sessions).where(eq(sessions.userId, userId));
      return {
        changed: true,
        sessionVersion: normalizeSessionVersion(updated?.sessionVersion),
      };
    });

    if (result.changed) {
      invalidateSessionUser(userId);
      clearAuthSessionCookie(response);
      await this.realtimeRevocation
        .revokeSessionVersion(userId, result.sessionVersion)
        .catch(() => this.logger.error({
          event: "auth.account-unlink.realtime-revocation-failed",
          provider,
        }));
      this.logger.log({ event: "auth.account.unlinked", provider });
    }
    return {
      ok: true,
      provider,
      reauthenticationRequired: result.changed,
    };
  }

  @Post("account-merge/code")
  async issueAccountMergeCode(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Req() request: Request,
  ) {
    if (!userId) {
      throw new UnauthorizedException({ error: "로그인이 필요해요." });
    }
    if (!isAllowedAuthRequestOrigin(origin)) {
      throw new ForbiddenException({
        error: "허용되지 않은 사이트에서 보낸 계정 통합 요청이에요.",
      });
    }
    await this.enforceRateLimit("account-merge", request, userId);
    try {
      const issued = await issueAccountMergeToken(userId);
      this.logger.log({ event: "auth.account-merge.code-issued" });
      return { ok: true, ...issued };
    } catch (error: unknown) {
      this.throwAccountMergeError(error, "code");
    }
  }

  @Post("account-merge/preview")
  async previewAccountMergeRequest(
    @Body() body: { token?: unknown },
    @Headers("x-user-id") userId: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Req() request: Request,
  ) {
    if (!userId) {
      throw new UnauthorizedException({ error: "로그인이 필요해요." });
    }
    if (!isAllowedAuthRequestOrigin(origin)) {
      throw new ForbiddenException({
        error: "허용되지 않은 사이트에서 보낸 계정 통합 요청이에요.",
      });
    }
    await this.enforceRateLimit("account-merge", request, userId);
    try {
      const preview = await previewAccountMerge(
        userId,
        typeof body?.token === "string" ? body.token.trim() : "",
      );
      return {
        ok: true,
        source: {
          name: preview.source.name,
          email: preview.source.email,
          providers: preview.source.providers,
        },
        target: {
          name: preview.target.name,
          email: preview.target.email,
          providers: preview.target.providers,
        },
        affectedRecordCount: preview.affectedRecordCount,
        expiresAt: preview.expiresAt,
        warnings: preview.warnings,
      };
    } catch (error: unknown) {
      this.throwAccountMergeError(error, "preview");
    }
  }

  @Post("account-merge/confirm")
  async confirmAccountMergeRequest(
    @Body() body: { token?: unknown },
    @Headers("x-user-id") userId: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!userId) {
      throw new UnauthorizedException({ error: "로그인이 필요해요." });
    }
    if (!isAllowedAuthRequestOrigin(origin)) {
      throw new ForbiddenException({
        error: "허용되지 않은 사이트에서 보낸 계정 통합 요청이에요.",
      });
    }
    await this.enforceRateLimit("account-merge", request, userId);
    try {
      const merged = await confirmAccountMerge(
        userId,
        typeof body?.token === "string" ? body.token.trim() : "",
      );
      invalidateSessionUser(merged.sourceUserId);
      invalidateSessionUser(merged.targetUserId);
      const revocations = await Promise.allSettled([
        this.realtimeRevocation.revokeSessionVersion(
          merged.sourceUserId,
          merged.sourceSessionVersion,
        ),
        this.realtimeRevocation.revokeSessionVersion(
          merged.targetUserId,
          merged.targetSessionVersion,
        ),
      ]);
      if (revocations.some((entry) => entry.status === "rejected")) {
        this.logger.error({
          event: "auth.account-merge.realtime-revocation-failed",
        });
      }

      applyAuthSessionCookie(
        response,
        signSession(merged.targetUserId, merged.targetSessionVersion),
      );
      this.logger.log({
        event: "auth.account-merge.completed",
        transferredRecordCount: merged.transferredRecordCount,
      });
      return {
        ok: true,
        transferredRecordCount: merged.transferredRecordCount,
        providers: merged.providers,
      };
    } catch (error: unknown) {
      this.throwAccountMergeError(error, "confirm");
    }
  }

  @Post("logout")
  async logout(
    @Headers("x-user-id") userId: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const signedCookiePrincipal = verifySessionToken(
      resolveSessionCookieValue(request.headers.cookie),
    );
    const actorId = userId ?? signedCookiePrincipal?.userId;
    if (!actorId) {
      clearAuthSessionCookie(response);
      return { ok: true };
    }
    try {
      const revoked = await revokeUserSessions(actorId);
      if (!revoked.ok || revoked.sessionVersion === null) {
        throw new Error("session revocation did not advance");
      }
      await this.realtimeRevocation.revokeSessionVersion(
        actorId,
        revoked.sessionVersion,
      );
      clearAuthSessionCookie(response);
      return { ok: true };
    } catch {
      // Keep the signed cookie on a failed durable revocation. Even if its DB
      // session version has already advanced, the next /logout request may
      // safely recover its actor id solely to retry closing realtime sockets.
      throw new ServiceUnavailableException({
        error: "로그아웃 세션 정리를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  private throwAccountMergeError(
    error: unknown,
    phase: "code" | "preview" | "confirm",
  ): never {
    if (error instanceof AccountMergeError) {
      throw new HttpException(
        { code: error.code, error: error.publicMessage },
        error.status,
      );
    }
    this.logger.error({
      event: "auth.account-merge.failure",
      phase,
      reasonCode: "unexpected",
    });
    throw new ServiceUnavailableException({
      error: "계정 통합을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
    });
  }

  private async enforceRateLimit(
    action: AuthRateLimitAction,
    req: Request,
    secondarySubject?: string,
    secondaryKind: Exclude<AuthRateLimitSubjectKind, "ip"> = "account",
  ): Promise<void> {
    const policy = AUTH_RATE_LIMIT_POLICIES[action];
    const sourceIp = resolveAuthClientIp(req, this.clientIpPolicy);
    const subjects: Array<{
      kind: AuthRateLimitSubjectKind;
      value: string;
    }> = [{ kind: "ip", value: sourceIp }];
    if (secondarySubject?.trim()) {
      subjects.push({ kind: secondaryKind, value: secondarySubject.trim() });
    }

    for (const subject of subjects) {
      const fingerprint = createAuthRateLimitSubjectFingerprint(
        action,
        subject.value,
        subject.kind,
      );
      if (!this.rateLimitDistributed) {
        const decision = AUTH_RATE_LIMIT_LOCAL_LIMITER.consume(
          fingerprint,
          policy.limit,
          AUTH_RATE_LIMIT_WINDOW_MS,
        );
        if (decision.status === "rate-limited") throw authRateLimitExceeded();
        if (decision.status === "saturated") {
          throw new ServiceUnavailableException({
            error: "인증 요청 한도 검증 용량이 일시적으로 부족합니다.",
          });
        }
        continue;
      }

      if (!this.coordination) {
        throw new ServiceUnavailableException({
          error: "인증 요청 한도 검증 인프라가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
      try {
        const decision = await this.coordination.consumeRateLimit({
          scope: "auth",
          subjectFingerprint: fingerprint,
          maximumRequests: policy.limit,
          windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
        });
        if (!decision.accepted) throw authRateLimitExceeded();
      } catch (error: unknown) {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException({
          error: "인증 요청 한도 검증 인프라가 일시적으로 응답하지 않습니다.",
        });
      }
    }
  }
}

function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim();
}

function genericEmailDispatchResponse() {
  return {
    ok: true,
    message: "해당 이메일로 처리할 수 있는 계정이 있다면 안내 메일을 보냈어요.",
  } as const;
}

function applyOAuthStateCookie(
  response: Response,
  provider: OAuthProviderId,
  state: string,
): void {
  response.cookie(
    oauthStateCookieName(provider),
    state,
    {
      ...resolveOAuthStateCookieOptions(provider),
      httpOnly: true,
      secure: true,
    },
  );
}

function applyOAuthPkceVerifierCookie(
  response: Response,
  provider: OAuthProviderId,
  verifier: string,
): void {
  response.cookie(
    oauthPkceVerifierCookieName(provider),
    verifier,
    {
      ...resolveOAuthPkceVerifierCookieOptions(provider),
      httpOnly: true,
      secure: true,
    },
  );
}

function clearOAuthStateCookie(
  response: Response,
  provider: OAuthProviderId,
): void {
  response.clearCookie(
    oauthStateCookieName(provider),
    resolveOAuthStateCookieClearOptions(provider),
  );
}

function clearOAuthPkceVerifierCookie(
  response: Response,
  provider: OAuthProviderId,
): void {
  response.clearCookie(
    oauthPkceVerifierCookieName(provider),
    resolveOAuthPkceVerifierCookieClearOptions(provider),
  );
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

export function authResponseUser(user: {
  readonly id: string;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly image?: string | null;
  readonly role?: string | null;
}) {
  const email = user.email ?? null;
  return {
    id: user.id,
    name: user.name ?? null,
    email,
    image: user.image ?? null,
    role: normalizePersistedAuthRole(user.role),
  };
}

function authRateLimitExceeded(): HttpException {
  return new HttpException(
    { error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
