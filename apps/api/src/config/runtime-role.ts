import type { NextFunction, Request, Response } from "express";

export const API_RUNTIME_ROLES = ["full", "studio-live"] as const;

export type ApiRuntimeRole = (typeof API_RUNTIME_ROLES)[number];

type RuntimeRoleEnvironment = Partial<
  Record<"API_RUNTIME_ROLE", string | undefined>
>;

const STUDIO_LIVE_HTTP_PATHS = new Set([
  "/api/health/live",
  "/api/health/ready",
]);

export function resolveApiRuntimeRole(
  environment: RuntimeRoleEnvironment = process.env,
): ApiRuntimeRole {
  const value = environment.API_RUNTIME_ROLE?.trim() || "full";
  if (value === "full" || value === "studio-live") return value;
  throw new Error("API_RUNTIME_ROLE is invalid");
}

export function isApiRuntimeRolePathAllowed(
  role: ApiRuntimeRole,
  pathname: string,
): boolean {
  if (role === "full") return true;
  if (STUDIO_LIVE_HTTP_PATHS.has(pathname)) return true;
  return pathname === "/socket.io" || pathname.startsWith("/socket.io/");
}

/**
 * A long-running Socket.IO host shares the same Nest graph so it can use the canonical session,
 * ACL, CRDT and lock repositories. This guard keeps that implementation reuse from accidentally
 * publishing the general HTTP API on a second origin.
 */
export function createApiRuntimeRoleGuard(
  environment: RuntimeRoleEnvironment = process.env,
): (request: Request, response: Response, next: NextFunction) => void {
  const role = resolveApiRuntimeRole(environment);
  return (request, response, next) => {
    if (isApiRuntimeRolePathAllowed(role, request.path)) {
      next();
      return;
    }
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.status(404).json({
      statusCode: 404,
      error: "Not Found",
      message: "Route is not available on this runtime role",
    });
  };
}
