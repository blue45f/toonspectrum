import { timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const EDGE_ORIGIN_AUTH_HEADER = "x-toonspectrum-origin-secret";
const MINIMUM_SECRET_BYTES = 32;

export type EdgeOriginAuthEnvironment = Partial<
  Record<"CLOUDFLARE_EDGE_ORIGIN_SECRET", string | undefined>
>;

export class EdgeOriginAuthConfigurationError extends Error {
  constructor() {
    super("Cloudflare edge origin authentication configuration is invalid.");
    this.name = "EdgeOriginAuthConfigurationError";
  }
}

function configuredSecret(
  environment: EdgeOriginAuthEnvironment,
): Buffer | null {
  const raw = environment.CLOUDFLARE_EDGE_ORIGIN_SECRET;
  if (raw === undefined || raw === "") return null;
  const normalized = raw.trim();
  const bytes = Buffer.from(normalized, "utf8");
  if (
    raw !== normalized
    || bytes.byteLength < MINIMUM_SECRET_BYTES
  ) {
    throw new EdgeOriginAuthConfigurationError();
  }
  return bytes;
}

function isHealthProbe(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return request.path === "/api/health"
    || request.path === "/api/health/live"
    || request.path === "/api/health/ready";
}

function suppliedSecret(request: Request): Buffer | null {
  const value = request.headers[EDGE_ORIGIN_AUTH_HEADER];
  if (typeof value !== "string") return null;
  return Buffer.from(value, "utf8");
}

export function createEdgeOriginAuthMiddleware(
  environment: EdgeOriginAuthEnvironment = process.env,
) {
  const expected = configuredSecret(environment);
  return (request: Request, response: Response, next: NextFunction): void => {
    if (expected === null || isHealthProbe(request)) {
      next();
      return;
    }

    const supplied = suppliedSecret(request);
    const accepted = supplied !== null
      && supplied.byteLength === expected.byteLength
      && timingSafeEqual(supplied, expected);
    if (!accepted) {
      response.status(403).json({
        statusCode: 403,
        error: "forbidden",
        message: "Trusted edge origin is required",
      });
      return;
    }

    next();
  };
}
