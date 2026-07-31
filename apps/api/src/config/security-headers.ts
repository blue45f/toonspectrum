import type { NextFunction, Request, Response } from "express";

type SecurityHeadersEnvironment = Readonly<{
  readonly NODE_ENV?: string | undefined;
}>;

/**
 * API responses are JSON, binary assets, or explicit downloads—not HTML documents.  Keep their
 * policy deliberately narrow so an unexpected error page cannot load script, style, or a frame.
 * The SPA gets its broader, Studio-aware policy from Vercel's static header configuration.
 */
export const API_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Frame-Options": "DENY",
});

export const PRODUCTION_TRANSPORT_SECURITY_HEADER =
  "max-age=63072000; includeSubDomains";

export function resolveApiSecurityHeaders(
  environment: SecurityHeadersEnvironment = process.env,
): Readonly<Record<string, string>> {
  if (environment.NODE_ENV !== "production") return API_SECURITY_HEADERS;
  return {
    ...API_SECURITY_HEADERS,
    "Strict-Transport-Security": PRODUCTION_TRANSPORT_SECURITY_HEADER,
  };
}

export function applyApiSecurityHeaders(
  response: Pick<Response, "setHeader">,
  environment: SecurityHeadersEnvironment = process.env,
): void {
  for (const [name, value] of Object.entries(
    resolveApiSecurityHeaders(environment),
  )) {
    response.setHeader(name, value);
  }
}

/** Apply once before CORS and routing so preflight, failures, and successful API responses agree. */
export function createApiSecurityHeadersMiddleware(
  environment: SecurityHeadersEnvironment = process.env,
) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    applyApiSecurityHeaders(response, environment);
    next();
  };
}
