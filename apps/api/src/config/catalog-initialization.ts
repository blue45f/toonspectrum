import type { NextFunction, Request, Response } from "express";

// Keep this list deliberately small. Unknown routes (including fortune, reviews and
// background-capability routes) retain catalog initialization before their handler.
const CATALOG_INDEPENDENT_READS = new Set([
  "/api/config",
  "/api/cover",
  "/api/health",
  "/api/health/live",
  "/api/health/ready",
]);

export function requiresCatalogInitialization(method: string, pathname: string): boolean {
  const verb = method.toUpperCase();
  if (verb === "OPTIONS") return false;
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  return !(verb === "GET" || verb === "HEAD") || !CATALOG_INDEPENDENT_READS.has(path);
}

export function createCatalogInitializationMiddleware(initialize: () => Promise<void>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!requiresCatalogInitialization(req.method, req.path)) {
      next();
      return;
    }
    // Catch synchronous exceptions as well as failed asynchronous initialization.
    void Promise.resolve().then(initialize).then(() => next(), next);
  };
}
