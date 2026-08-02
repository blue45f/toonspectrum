import type { NextFunction, Request, Response } from "express";

export const API_RUNTIME_ROLES = [
  "full",
  "studio-live",
  "capability-worker",
] as const;

export type ApiRuntimeRole = (typeof API_RUNTIME_ROLES)[number];

type RuntimeRoleEnvironment = Partial<
  Record<"API_RUNTIME_ROLE", string | undefined>
>;

const STUDIO_LIVE_HTTP_PATHS = new Set([
  "/api/health/live",
  "/api/health/ready",
]);
const CAPABILITY_WORKER_GATEWAY_PATH =
  "/.well-known/toonspectrum/backend-capabilities/v1/execute";
const CAPABILITY_WORKER_HEALTH_PATH =
  "/.well-known/toonspectrum/backend-capabilities/v1/health";

export function resolveApiRuntimeRole(
  environment: RuntimeRoleEnvironment = process.env,
): ApiRuntimeRole {
  const value = environment.API_RUNTIME_ROLE?.trim() || "full";
  if (
    value === "full" ||
    value === "studio-live" ||
    value === "capability-worker"
  ) {
    return value;
  }
  throw new Error("API_RUNTIME_ROLE is invalid");
}

export function isApiRuntimeRolePathAllowed(
  role: ApiRuntimeRole,
  pathname: string,
  method?: string,
): boolean {
  if (role === "full") return true;
  const normalizedMethod = method?.toUpperCase();
  const isReadMethod =
    normalizedMethod === undefined
    || normalizedMethod === "GET"
    || normalizedMethod === "HEAD";
  if (role === "capability-worker") {
    return (
      (pathname === "/api/health/live" && isReadMethod)
      || (pathname === CAPABILITY_WORKER_GATEWAY_PATH
        && (normalizedMethod === undefined || normalizedMethod === "POST"))
      || (pathname === CAPABILITY_WORKER_HEALTH_PATH && isReadMethod)
    );
  }
  if (STUDIO_LIVE_HTTP_PATHS.has(pathname)) return isReadMethod;
  return (
    pathname === "/socket.io"
    || pathname.startsWith("/socket.io/")
  ) && (
    normalizedMethod === undefined
    || normalizedMethod === "GET"
    || normalizedMethod === "POST"
    || normalizedMethod === "OPTIONS"
  );
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
    if (isApiRuntimeRolePathAllowed(role, request.path, request.method)) {
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
