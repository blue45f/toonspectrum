import {
  verifySessionToken,
  type VerifiedSessionToken,
} from "./server/session";
import { isSessionAllowed } from "./server/user-lifecycle";
import { resolveSessionCookieValue } from "./session-cookie";

import type { Request, Response, NextFunction } from "express";

export type SessionAuthenticationSource = "header" | "cookie";

// Request headers are caller-controlled, so the verified credential source is
// kept out-of-band. Downstream security middleware can distinguish an
// unforgeable bearer-style header from ambient cookie authentication without
// trusting another request header.
const authenticationSources = new WeakMap<Request, SessionAuthenticationSource>();
const authenticationPrincipals = new WeakMap<Request, VerifiedSessionToken>();

export function getSessionAuthenticationSource(
  req: Request,
): SessionAuthenticationSource | null {
  return authenticationSources.get(req) ?? null;
}

export function getSessionAuthenticationPrincipal(
  req: Request,
): VerifiedSessionToken | null {
  const principal = authenticationPrincipals.get(req);
  return principal ? { ...principal } : null;
}

// 모든 요청에서 x-user-id 헤더를 '서명 세션 토큰'으로 검증해 실제 userId로 치환한다.
// 검증 실패(위조·만료·레거시 평문 id)면 헤더를 제거해 미인증으로 처리한다.
// 이 덕분에 하위 컨트롤러는 기존처럼 x-user-id를 읽되, 그 값은 항상 '검증된' id가 된다.
export function sessionAuth(req: Request, _res: Response, next: NextFunction) {
  authenticationSources.delete(req);
  authenticationPrincipals.delete(req);
  void authenticateRequest(req).then(() => next()).catch((error: unknown) => {
    delete req.headers["x-user-id"];
    authenticationSources.delete(req);
    authenticationPrincipals.delete(req);
    // Invalid credentials resolve normally and remain anonymous. Dependency or
    // configuration failures must reach Nest's exception boundary; converting
    // them to anonymous would make /auth/session clear a still-valid cookie.
    next(error);
  });
}

async function authenticateRequest(req: Request) {
  const raw = req.headers["x-user-id"];
  if (typeof raw === "string" && raw) {
    const session = verifySessionToken(raw);
    if (session && (await isSessionAllowed(session.userId, session.sessionVersion))) {
      req.headers["x-user-id"] = session.userId;
      authenticationSources.set(req, "header");
      authenticationPrincipals.set(req, { ...session });
      return;
    }
    delete req.headers["x-user-id"];
  }

  if (Array.isArray(raw)) {
    delete req.headers["x-user-id"];
    authenticationPrincipals.delete(req);
    return;
  }

  const cookieToken = resolveSessionCookieValue(req.headers.cookie);
  if (!cookieToken) return;

  const session = verifySessionToken(cookieToken);
  if (session && (await isSessionAllowed(session.userId, session.sessionVersion))) {
    req.headers["x-user-id"] = session.userId;
    authenticationSources.set(req, "cookie");
    authenticationPrincipals.set(req, { ...session });
  } else delete req.headers["x-user-id"];
}
