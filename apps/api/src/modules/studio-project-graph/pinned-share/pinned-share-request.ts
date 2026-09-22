import { createHash } from "node:crypto";
import { ForbiddenException, HttpException } from "@nestjs/common";
import type { Request } from "express";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonspectrum/contracts/security/csrf";

import { isAllowedCsrfOrigin, isSameRequestOrigin } from "../../../csrf-middleware";
import { LocalAuthRateLimiter } from "../../auth/auth-rate-limit";

const limiter = new LocalAuthRateLimiter({ maximumIdentities: 10_000 });
export function requirePinnedShareBrowserOrigin(req: Request): void {
  const proof = req.headers[TOONSPECTRUM_CSRF_HEADER], origin = req.headers.origin;
  const metadata = !origin && req.headers["sec-fetch-site"] === "same-origin"
    && ["cors", "same-origin"].includes(String(req.headers["sec-fetch-mode"]));
  if (proof !== TOONSPECTRUM_CSRF_HEADER_VALUE || !(metadata || typeof origin === "string"
    && (isSameRequestOrigin(origin, req) || isAllowedCsrfOrigin(origin)))) throw new ForbiddenException("공유 요청의 출처를 확인할 수 없습니다.");
}
/** Bounded process-local admission; durable per-share feedback quotas are enforced in PostgreSQL. */
export function limitPinnedShareRequest(req: Request, kind: "read" | "image" | "comment", accessKey = "") {
  const source = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  const limit = kind === "image" ? 40 : kind === "comment" ? 20 : 120;
  const key = (value: string) => createHash("sha256").update(`pinned-share:${kind}:${value}`).digest("hex");
  const subjects = [key(`address:${source}`), ...(accessKey ? [key(`access:${accessKey}`)] : [])];
  for (const subject of subjects) if (limiter.consume(subject, limit, 60_000).status !== "accepted")
    throw new HttpException({ code: "studio_pinned_share_rate_limited", message: "잠시 후 다시 시도해 주세요." }, 429);
}
