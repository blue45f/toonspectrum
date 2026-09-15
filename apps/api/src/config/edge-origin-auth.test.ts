import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  createEdgeOriginAuthMiddleware,
  EdgeOriginAuthConfigurationError,
  EDGE_ORIGIN_AUTH_HEADER,
} from "./edge-origin-auth";

function request(
  path: string,
  secret?: string,
  method = "GET",
): Request {
  return {
    method,
    path,
    headers: secret ? { [EDGE_ORIGIN_AUTH_HEADER]: secret } : {},
  } as unknown as Request;
}

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    value: { status } as unknown as Response,
    status,
    json,
  };
}

describe("Cloudflare edge origin authentication", () => {
  const secret = "edge-origin-secret-with-at-least-thirty-two-bytes";

  it("is disabled when no shared secret is configured", () => {
    const next = vi.fn<NextFunction>();
    createEdgeOriginAuthMiddleware({})(request("/api/projects"), response().value, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows Render health probes without exposing the shared secret", () => {
    const next = vi.fn<NextFunction>();
    createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
    })(request("/api/health/ready"), response().value, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects direct non-health traffic without the exact secret", () => {
    const next = vi.fn<NextFunction>();
    const output = response();
    createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
    })(request("/api/projects", "wrong-secret"), output.value, next);
    expect(next).not.toHaveBeenCalled();
    expect(output.status).toHaveBeenCalledWith(403);
    expect(output.json).toHaveBeenCalledWith(expect.objectContaining({
      error: "forbidden",
    }));
  });

  it("accepts traffic authenticated by the Cloudflare gateway", () => {
    const next = vi.fn<NextFunction>();
    createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
    })(request("/api/projects", secret), response().value, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("fails closed for weak or padded production configuration", () => {
    expect(() => createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: "too-short",
    })).toThrow(EdgeOriginAuthConfigurationError);
    expect(() => createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: `${secret} `,
    })).toThrow(EdgeOriginAuthConfigurationError);
  });
});
