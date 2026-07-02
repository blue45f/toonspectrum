import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
  X509Certificate,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";

import { and, eq } from "drizzle-orm";

import { accounts, db, users } from "../db";

import { ensureOAuthTables, type OAuthUser } from "./oauth";
import {
  getUserAuthBlock,
  normalizeSessionVersion,
  revokeUserSessions,
} from "./user-lifecycle";

// ── 토스 로그인(앱인토스) 서버 간 연동 — mTLS 필수 ──
// 흐름: 클라이언트 appLogin() → authorizationCode → (서버) generate-token → login-me → userKey upsert.
// userKey 는 앱별 고유·평문 식별자라 신원 매칭에 사용한다. PII(name/phone/email) 는 암호화라 식별엔 불필요.
// BaseURL: https://apps-in-toss-api.toss.im (파트너 서버 → 앱인토스 서버, mTLS 클라이언트 인증서 요구).
const TOSS_API_HOST = "apps-in-toss-api.toss.im";
const GENERATE_TOKEN_PATH =
  "/api-partner/v1/apps-in-toss/user/oauth2/generate-token";
const LOGIN_ME_PATH = "/api-partner/v1/apps-in-toss/user/oauth2/login-me";

// PEM 로드 — env 내용(Vercel) 우선, 없으면 파일 경로(로컬 개발). 인증서 내용은 절대 로그로 내보내지 않는다.
function readPem(contentEnv: string, pathEnv: string): string | null {
  const content = process.env[contentEnv];
  if (content && content.trim())
    return content.includes("\\n") ? content.replace(/\\n/g, "\n") : content;
  const path = process.env[pathEnv];
  if (path && path.trim()) {
    try {
      return readFileSync(path.trim(), "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

function mtlsCreds(): { cert: string; key: string } | null {
  const cert = readPem("TOSS_MTLS_CERT", "TOSS_MTLS_CERT_PATH");
  const key = readPem("TOSS_MTLS_KEY", "TOSS_MTLS_KEY_PATH");
  if (!cert || !key) return null;

  try {
    const certificate = new X509Certificate(cert);
    const privateKey = createPrivateKey(key);
    const certPublicKey = certificate.publicKey.export({
      type: "spki",
      format: "der",
    });
    const keyPublicKey = createPublicKey(privateKey).export({
      type: "spki",
      format: "der",
    });
    const now = Date.now();
    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);

    if (!certPublicKey.equals(keyPublicKey)) return null;
    if (
      !Number.isFinite(validFrom) ||
      !Number.isFinite(validTo) ||
      now < validFrom ||
      now >= validTo
    )
      return null;
    return { cert, key };
  } catch {
    // 값이 존재해도 PEM 파싱 실패·인증서/키 불일치면 구성 완료로 취급하지 않는다.
    return null;
  }
}

/** 토스 로그인 mTLS 자격(인증서·키)이 구성됐는지. 미구성이면 엔드포인트가 503 게이트로 사용한다. */
export function isTossLoginConfigured(): boolean {
  return mtlsCreds() != null;
}

interface TossResponse {
  status: number;
  body: {
    resultType?: string;
    success?: Record<string, unknown>;
    error?: unknown;
  } | null;
}

export type TossLoginExchangeErrorCode =
  | "invalid-authorization"
  | "upstream-unavailable"
  | "user-blocked"
  | "unlink-not-configured"
  | "unlink-unauthorized";

/** 컨트롤러가 안전한 HTTP 상태/메시지로 변환할 수 있는 토스 로그인 단계 오류. */
export class TossLoginExchangeError extends Error {
  constructor(
    readonly code: TossLoginExchangeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TossLoginExchangeError";
  }
}

function tossErrorCode(body: TossResponse["body"]): string | null {
  if (typeof body?.error === "string") return body.error;
  if (
    body?.error &&
    typeof body.error === "object" &&
    "errorCode" in body.error
  ) {
    const errorCode = (body.error as { errorCode?: unknown }).errorCode;
    return typeof errorCode === "string" ? errorCode : null;
  }
  return null;
}

function tossErrorReason(body: TossResponse["body"]): string | null {
  if (body?.error && typeof body.error === "object" && "reason" in body.error) {
    const reason = (body.error as { reason?: unknown }).reason;
    return typeof reason === "string" ? reason : null;
  }
  return null;
}

/** 토스는 invalid_grant를 HTTP 200 + resultType=FAIL의 중첩 reason으로도 반환한다. */
export function isInvalidTossAuthorizationResponse(
  body: TossResponse["body"],
): boolean {
  const code = tossErrorCode(body);
  const reason = tossErrorReason(body);
  return (
    code?.toLowerCase() === "invalid_grant" ||
    /\binvalid_grant\b/i.test(reason ?? "")
  );
}

// mTLS https 요청 — 전역 fetch 는 클라이언트 인증서를 실을 수 없어 node:https 로 직접 호출한다.
function tossRequest(
  path: string,
  opts: { method: "GET" | "POST"; body?: unknown; accessToken?: string },
): Promise<TossResponse> {
  const creds = mtlsCreds();
  if (!creds) return Promise.reject(new Error("toss mTLS not configured"));
  const data = opts.body != null ? JSON.stringify(opts.body) : undefined;
  return new Promise<TossResponse>((resolve, reject) => {
    const req = httpsRequest(
      {
        host: TOSS_API_HOST,
        path,
        method: opts.method,
        cert: creds.cert,
        key: creds.key,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(opts.accessToken
            ? { Authorization: `Bearer ${opts.accessToken}` }
            : {}),
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
        timeout: 12_000,
      },
      (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (chunks += c));
        res.on("end", () => {
          let parsed: TossResponse["body"] = null;
          try {
            parsed = chunks ? JSON.parse(chunks) : null;
          } catch {
            // 비 JSON 응답은 파싱 실패 → 위 초기값 null 유지.
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("toss request timeout")));
    if (data) req.write(data);
    req.end();
  });
}

// 1. 인가코드 → AccessToken(유효 1시간).
async function generateAccessToken(
  authorizationCode: string,
  referrer: string,
): Promise<string> {
  let response: TossResponse;
  try {
    response = await tossRequest(GENERATE_TOKEN_PATH, {
      method: "POST",
      body: { authorizationCode, referrer },
    });
  } catch (cause) {
    throw new TossLoginExchangeError(
      "upstream-unavailable",
      "토스 토큰 서버에 연결하지 못했어요.",
      { cause },
    );
  }
  const { status, body } = response;
  const accessToken =
    typeof body?.success?.accessToken === "string"
      ? (body.success.accessToken as string)
      : null;
  if (status !== 200 || body?.resultType !== "SUCCESS" || !accessToken) {
    if (isInvalidTossAuthorizationResponse(body)) {
      throw new TossLoginExchangeError(
        "invalid-authorization",
        "토스 인가 코드가 만료되었거나 이미 사용됐어요.",
      );
    }
    throw new TossLoginExchangeError(
      "upstream-unavailable",
      `토스 토큰 발급에 실패했어요. (${status})`,
    );
  }
  return accessToken;
}

// login-me 응답의 userKey 필드는 scope 항목 표기(`user_key`)와 카멜 표기(`userKey`)가 혼재할 수
// 있어 둘 다 받되, 문자열/유한수만 신뢰한다(객체가 오면 "[object Object]" 식별자 오염 방지).
function extractUserKey(success: Record<string, unknown> | undefined): string | null {
  const raw = success?.userKey ?? success?.user_key;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

// 2. AccessToken → userKey(앱별 고유·평문). PII 는 암호화라 식별엔 쓰지 않는다.
async function fetchUserKey(accessToken: string): Promise<string> {
  let response: TossResponse;
  try {
    response = await tossRequest(LOGIN_ME_PATH, { method: "GET", accessToken });
  } catch (cause) {
    throw new TossLoginExchangeError(
      "upstream-unavailable",
      "토스 사용자 정보 서버에 연결하지 못했어요.",
      { cause },
    );
  }
  const { status, body } = response;
  const userKey = extractUserKey(body?.success);
  if (status !== 200 || body?.resultType !== "SUCCESS" || userKey == null) {
    throw new TossLoginExchangeError(
      "upstream-unavailable",
      `토스 사용자 정보를 확인하지 못했어요. (${status})`,
    );
  }
  return userKey;
}

const AVATAR_COLORS = [
  "#ff5a36",
  "#9b7bff",
  "#5a8cff",
  "#22b8a6",
  "#ff6b9d",
  "#f4a52a",
];
function avatarFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function normalizeRole(value: string | null | undefined): string {
  const role = String(value ?? "").toLowerCase();
  return ["admin", "creator", "operator"].includes(role) ? role : "user";
}

// 3. userKey → user/account upsert (provider="toss"). lib/server/oauth.ts 의 upsertOAuthUser 패턴을 미러.
async function upsertTossUser(userKey: string): Promise<OAuthUser> {
  await ensureOAuthTables();
  const email = `toss_${userKey}@toss.local`;
  const name = "토스 사용자";

  const [linked] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, "toss"),
        eq(accounts.providerAccountId, userKey),
      ),
    )
    .limit(1);

  let userId = linked?.userId;
  if (!userId) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (byEmail) {
      userId = byEmail.id;
    } else {
      userId = randomUUID();
      await db
        .insert(users)
        .values({
          id: userId,
          email,
          name,
          image: null,
          avatar: avatarFor(email),
          role: "user",
        });
    }
    await db
      .insert(accounts)
      .values({
        userId,
        type: "oauth",
        provider: "toss",
        providerAccountId: userKey,
      });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const block = getUserAuthBlock(user);
  if (block) throw new TossLoginExchangeError("user-blocked", block);
  return {
    id: userId,
    name: user?.name ?? name,
    email: user?.email ?? email,
    image: user?.image ?? null,
    role: normalizeRole(user?.role),
    sessionVersion: normalizeSessionVersion(user?.sessionVersion),
  };
}

/** 토스 로그인 전체 흐름: 인가코드 → AccessToken → userKey → user/account upsert → OAuthUser. */
export async function handleTossLogin(
  authorizationCode: string,
  referrer: string,
): Promise<OAuthUser> {
  const accessToken = await generateAccessToken(authorizationCode, referrer);
  const userKey = await fetchUserKey(accessToken);
  return upsertTossUser(userKey);
}

/** 연결 해제 콜백 Basic Auth를 검증하고 토스 계정 연결 및 기존 세션을 멱등 해제한다. */
export async function handleTossUnlink(
  userKey: string,
  authorization: string | undefined,
): Promise<{ ok: true }> {
  const username = (
    process.env.TOSS_UNLINK_USERNAME ?? process.env.APPS_IN_TOSS_UNLINK_USERNAME
  )?.trim();
  const password = (
    process.env.TOSS_UNLINK_PASSWORD ?? process.env.APPS_IN_TOSS_UNLINK_PASSWORD
  )?.trim();
  if (!username || !password) {
    throw new TossLoginExchangeError(
      "unlink-not-configured",
      "토스 로그인 연결 해제 콜백 인증이 설정되지 않았어요.",
    );
  }

  const encoded = authorization?.startsWith("Basic ")
    ? authorization.slice(6).trim()
    : "";
  const actual = Buffer.from(encoded, "base64").toString("utf8");
  const expectedBytes = Buffer.from(`${username}:${password}`);
  const actualBytes = Buffer.from(actual);
  if (
    expectedBytes.length !== actualBytes.length ||
    !timingSafeEqual(expectedBytes, actualBytes)
  ) {
    throw new TossLoginExchangeError(
      "unlink-unauthorized",
      "콜백 인증에 실패했어요.",
    );
  }

  await ensureOAuthTables();
  const [linked] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, "toss"),
        eq(accounts.providerAccountId, userKey),
      ),
    )
    .limit(1);
  if (linked?.userId) {
    await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.provider, "toss"),
          eq(accounts.providerAccountId, userKey),
        ),
      );
    await revokeUserSessions(linked.userId);
  }
  return { ok: true };
}
