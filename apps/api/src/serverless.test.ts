import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertVercelServerlessRuntimeRole,
  rewriteQueryPathToUrl,
  getServerlessApp,
} from "./serverless";

const nestFactoryCreate = vi.hoisted(() => vi.fn());
const validateEnv = vi.hoisted(() => vi.fn());

vi.mock("@nestjs/core", () => ({
  NestFactory: {
    create: nestFactoryCreate,
  },
}));
vi.mock("./app.module", () => ({
  AppModule: class AppModule {},
}));
vi.mock("./config/env", () => ({
  validateEnv,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vercel serverless runtime boundary", () => {
  it("accepts only the general API role resolved for Vercel", () => {
    expect(() => assertVercelServerlessRuntimeRole({})).not.toThrow();
    expect(() =>
      assertVercelServerlessRuntimeRole({
        API_RUNTIME_ROLE: "full",
      }),
    ).not.toThrow();
    expect(() =>
      assertVercelServerlessRuntimeRole({
        API_RUNTIME_ROLE: "studio-live",
      }),
    ).toThrow(
      "Vercel serverless bootstrap requires API_RUNTIME_ROLE=full",
    );
    expect(() =>
      assertVercelServerlessRuntimeRole({
        API_RUNTIME_ROLE: "unknown",
      }),
    ).toThrow("API_RUNTIME_ROLE is invalid");
  });

  it("rejects a studio-live cold start before creating the Nest application", async () => {
    vi.stubEnv("API_RUNTIME_ROLE", "studio-live");

    await expect(getServerlessApp()).rejects.toThrow(
      "Vercel serverless bootstrap requires API_RUNTIME_ROLE=full",
    );
    expect(validateEnv).not.toHaveBeenCalled();
    expect(nestFactoryCreate).not.toHaveBeenCalled();
  });

  it("rewrites Vercel rewrite path query into express req.url", () => {
    const req = {
      query: { path: "health%2Flive", foo: "bar" },
      url: "/api/index?path=health%2Flive&foo=bar",
    } as {
      query: Record<string, unknown>;
      url: string;
    };

    rewriteQueryPathToUrl(req as never);

    expect(req.url).toBe("/api/health/live?foo=bar");
    expect(req.query.path).toBeUndefined();
  });

  it("rewrites array-form path query segments into a slash path", () => {
    const req = {
      query: { path: ["health", "ready"], foo: "bar" },
      url: "/api/index?path=health&path=ready&foo=bar",
    } as {
      query: Record<string, unknown>;
      url: string;
    };

    rewriteQueryPathToUrl(req as never);

    expect(req.url).toBe("/api/health/ready?foo=bar");
    expect(req.query.path).toBeUndefined();
  });

  it("preserves requests without rewrite path as-is", () => {
    const req = {
      query: { foo: "bar" },
      url: "/api/cover?foo=bar",
    } as {
      query: Record<string, unknown>;
      url: string;
    };

    rewriteQueryPathToUrl(req as never);

    expect(req.url).toBe("/api/cover?foo=bar");
    expect(req.query.foo).toBe("bar");
  });

  it("keeps leading slash path values unchanged", () => {
    const req = {
      query: { path: "/health/live", foo: "bar" },
      url: "/api/index?path=%2Fhealth%2Flive&foo=bar",
    } as {
      query: Record<string, unknown>;
      url: string;
    };

    rewriteQueryPathToUrl(req as never);

    expect(req.url).toBe("/api/health/live?foo=bar");
  });
});
