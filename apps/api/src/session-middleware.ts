import type { Request, Response, NextFunction } from "express";
import { verifySessionToken } from "../../../lib/server/session";
import { isSessionAllowed } from "../../../lib/server/user-lifecycle";

// 모든 요청에서 x-user-id 헤더를 '서명 세션 토큰'으로 검증해 실제 userId로 치환한다.
// 검증 실패(위조·만료·레거시 평문 id)면 헤더를 제거해 미인증으로 처리한다.
// 이 덕분에 하위 컨트롤러는 기존처럼 x-user-id를 읽되, 그 값은 항상 '검증된' id가 된다.
export function sessionAuth(req: Request, _res: Response, next: NextFunction) {
  void authenticateRequest(req).then(next).catch(() => {
    delete req.headers["x-user-id"];
    next();
  });
}

async function authenticateRequest(req: Request) {
  const raw = req.headers["x-user-id"];
  if (typeof raw === "string" && raw) {
    const session = verifySessionToken(raw);
    if (session && (await isSessionAllowed(session.userId, session.sessionVersion))) req.headers["x-user-id"] = session.userId;
    else delete req.headers["x-user-id"];
  } else if (Array.isArray(raw)) {
    delete req.headers["x-user-id"];
  }
}
