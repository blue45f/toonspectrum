import { describe, expect, it, vi } from "vitest";

import { createCatalogInitializationMiddleware, requiresCatalogInitialization } from "./catalog-initialization";

import type { Request, Response } from "express";

 describe("serverless catalog request barrier", () => {
  it.each(["/api/config", "/api/cover", "/api/health", "/api/health/live", "/api/health/ready", "/API/CONFIG/"])(
    "does not load the catalog for a cheap read: %s", (path) => {
      expect(requiresCatalogInitialization("GET", path)).toBe(false);
      expect(requiresCatalogInitialization("HEAD", path)).toBe(false);
      expect(requiresCatalogInitialization("POST", path)).toBe(true);
    },
  );
  it.each(["/api/search", "/api/titles/one", "/api/fortune", "/api/reviews", "/api/future-route"])(
    "preserves initialization for known consumers and unknown routes: %s", (path) => {
      expect(requiresCatalogInitialization("GET", path)).toBe(true);
    },
  );
  it("skips CORS preflight", () => {
    expect(requiresCatalogInitialization("OPTIONS", "/api/search")).toBe(false);
  });
  it("waits for initialization before entering the handler", async () => {
    let complete!: () => void;
    const initialize = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const next = vi.fn();
    createCatalogInitializationMiddleware(initialize)({ method: "GET", path: "/api/home" } as Request, {} as Response, next);
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
    complete();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });
  it("forwards initialization failure to Express", async () => {
    const error = new Error("initialization failed");
    const next = vi.fn();
    createCatalogInitializationMiddleware(() => { throw error; })({ method: "GET", path: "/api/home" } as Request, {} as Response, next);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledExactlyOnceWith(error);
  });
});
