import { Injectable } from "@nestjs/common";
import { tap } from "rxjs";

import { getCatalogState } from "../../../../../packages/core/src/server/catalog-store";

import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";

// These endpoints only expose public catalog read models. Deliberately exclude
// config, reviews, title details, marketplace visibility, random and POST routes.
const PUBLIC_CATALOG_PATHS = new Set([
  "/api/home", "/api/calendar", "/api/insights", "/api/ranking",
  "/api/explore", "/api/tags", "/api/authors",
]);
const NO_STORE = "no-store, max-age=0";

type CacheEnvironment = Partial<Record<
  "CATALOG_PUBLIC_CACHE_SECONDS" | "KMAS_PRV_KEY" | "KMAS_MERGE_ON_ACCESS",
  string | undefined
>>;

export function catalogPublicCacheSeconds(environment: CacheEnvironment): number {
  // Request-time KMAS enrichment mutates the read model; do not edge-cache it.
  if (environment.KMAS_PRV_KEY?.trim() && environment.KMAS_MERGE_ON_ACCESS !== "0") return 0;
  const raw = environment.CATALOG_PUBLIC_CACHE_SECONDS?.trim();
  if (!raw) return 30;
  const seconds = Number(raw);
  return Number.isInteger(seconds) && seconds >= 0 && seconds <= 300 ? seconds : 0;
}

@Injectable()
export class CatalogPublicCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (!PUBLIC_CATALOG_PATHS.has(req.path.replace(/\/+$/, "").toLowerCase())) return next.handle();

    // Preserve existing Origin/Accept-Encoding variation. Credentialed requests
    // must not reuse an anonymous response or populate a shared cache variant.
    res.vary("Cookie");
    res.vary("Authorization");
    res.vary("X-User-Id");
    const noStore = () => {
      if (res.headersSent) return;
      res.setHeader("Cache-Control", NO_STORE);
      res.removeHeader("CDN-Cache-Control");
      res.removeHeader("Vercel-CDN-Cache-Control");
    };
    noStore();

    return next.handle().pipe(tap({
      next: () => {
        const seconds = catalogPublicCacheSeconds(process.env);
        const credentialed = ["cookie", "authorization", "x-user-id", "range"]
          .some((header) => req.headers[header] !== undefined);
        if (
          !seconds || credentialed || res.headersSent || res.statusCode !== 200
          || (req.method !== "GET" && req.method !== "HEAD")
          || res.getHeader("Set-Cookie") !== undefined
          || getCatalogState().titleCount === 0
        ) return;
        // No SWR: the CDN TTL is 30s by default. Home fragments have their own
        // 30s TTL, so their combined age can reach 60s (documented in the runbook).
        res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${seconds}`);
      },
      error: noStore,
    }));
  }
}
