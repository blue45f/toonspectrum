import { describe, expect, it, vi } from "vitest";

import {
  API_SECURITY_HEADERS,
  PRODUCTION_TRANSPORT_SECURITY_HEADER,
  applyApiSecurityHeaders,
  createApiSecurityHeadersMiddleware,
  resolveApiSecurityHeaders,
} from "./security-headers";

describe("API security headers", () => {
  it("keeps the API document surface closed by default", () => {
    expect(API_SECURITY_HEADERS["Content-Security-Policy"]).toBe(
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    );
    expect(API_SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(API_SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(API_SECURITY_HEADERS["Referrer-Policy"]).toBe("no-referrer");
  });

  it("adds HSTS only in production", () => {
    expect(resolveApiSecurityHeaders({ NODE_ENV: "development" })).not.toHaveProperty(
      "Strict-Transport-Security",
    );
    expect(resolveApiSecurityHeaders({ NODE_ENV: "production" })).toMatchObject({
      "Strict-Transport-Security": PRODUCTION_TRANSPORT_SECURITY_HEADER,
    });
  });

  it("applies every header before delegating to the next middleware", () => {
    const calls: Array<readonly [string, string]> = [];
    const response = {
      setHeader(name: string, value: string) {
        calls.push([name, value]);
      },
    };
    const next = vi.fn();

    createApiSecurityHeadersMiddleware({ NODE_ENV: "production" })(
      {} as never,
      response as never,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(calls).toEqual(
      expect.arrayContaining([
        ["X-Content-Type-Options", "nosniff"],
        ["Strict-Transport-Security", PRODUCTION_TRANSPORT_SECURITY_HEADER],
      ]),
    );
  });

  it("also exposes an explicit helper for serverless response tests", () => {
    const setHeader = vi.fn();
    applyApiSecurityHeaders({ setHeader } as never, { NODE_ENV: "test" });
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      API_SECURITY_HEADERS["Content-Security-Policy"],
    );
    expect(setHeader).not.toHaveBeenCalledWith(
      "Strict-Transport-Security",
      expect.anything(),
    );
  });
});
