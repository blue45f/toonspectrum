import { timingSafeEqual } from "node:crypto";

import {
  BACKEND_CAPABILITY_GATEWAY_PATH,
  BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER,
} from "./backend-capability-gateway-contract";
import {
  BACKEND_GATEWAY_HARD_MAX_BODY_BYTES,
  BACKEND_REMOTE_PROVIDER_IDS,
  type BackendCapabilityPolicy,
  type BackendRemoteProviderId,
} from "./backend-capability-policy";

import type { NextFunction, Request, Response } from "express";

interface WorkerHttpAdmission {
  readonly providerId: BackendRemoteProviderId;
  readonly maximumBodyBytes: number;
  rawBodyBytes: number | null;
}

const admissions = new WeakMap<Request, WorkerHttpAdmission>();

function singleHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.length === 1 ? value[0].trim() : "";
  return typeof value === "string" ? value.trim() : "";
}

export function backendCapabilityTokensEqual(
  actual: string,
  expected: string,
): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.byteLength === expectedBytes.byteLength
    && timingSafeEqual(actualBytes, expectedBytes);
}

function admittedProvider(
  policy: BackendCapabilityPolicy,
  token: string,
): WorkerHttpAdmission | null {
  if (!policy.enabled || !token) return null;
  const matches = BACKEND_REMOTE_PROVIDER_IDS.filter((providerId) => {
    const provider = policy.providers[providerId];
    return provider.enabled
      && typeof provider.authToken === "string"
      && provider.placementRoles.has("container-worker")
      && provider.supportedCapabilities.has("async-job")
      && backendCapabilityTokensEqual(token, provider.authToken);
  });
  if (matches.length !== 1) return null;
  const providerId = matches[0];
  if (!providerId) return null;
  return {
    providerId,
    maximumBodyBytes: Math.min(
      BACKEND_GATEWAY_HARD_MAX_BODY_BYTES,
      policy.providers[providerId].maxPayloadBytes,
    ),
    rawBodyBytes: null,
  };
}

function reject(
  response: Response,
  status: 401 | 413,
  message: string,
): void {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.status(status).json({
    statusCode: status,
    error: status === 401 ? "Unauthorized" : "Payload Too Large",
    message,
  });
}

/** Rejects unauthenticated or declared-over-budget worker requests before JSON parsing. */
export function createBackendCapabilityWorkerPreBodyAdmission(
  policy: BackendCapabilityPolicy,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    if (request.path !== BACKEND_CAPABILITY_GATEWAY_PATH) {
      next();
      return;
    }
    const admission = admittedProvider(
      policy,
      singleHeader(request.headers[BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]),
    );
    if (!admission) {
      reject(response, 401, "Invalid gateway token");
      return;
    }
    const declaredLength = singleHeader(request.headers["content-length"]);
    if (
      declaredLength
      && (!/^\d+$/u.test(declaredLength)
        || Number(declaredLength) > admission.maximumBodyBytes)
    ) {
      reject(response, 413, "Gateway payload exceeds the provider budget");
      return;
    }
    admissions.set(request, admission);
    next();
  };
}

/** Express JSON parser hook that records and enforces the exact transport bytes. */
export function verifyBackendCapabilityWorkerRawBody(
  request: Request,
  _response: Response,
  buffer: Buffer,
): void {
  if (request.path !== BACKEND_CAPABILITY_GATEWAY_PATH) return;
  const admission = admissions.get(request);
  if (!admission) {
    const error = new Error("Gateway admission is missing") as Error & {
      status?: number;
      statusCode?: number;
    };
    error.status = 401;
    error.statusCode = 401;
    throw error;
  }
  admission.rawBodyBytes = buffer.byteLength;
  if (buffer.byteLength > admission.maximumBodyBytes) {
    const error = new Error("Gateway payload exceeds the provider budget") as Error & {
      status?: number;
      statusCode?: number;
    };
    error.status = 413;
    error.statusCode = 413;
    throw error;
  }
}

export function backendCapabilityWorkerParserLimitBytes(
  policy: BackendCapabilityPolicy,
): number {
  const limits = BACKEND_REMOTE_PROVIDER_IDS
    .map((providerId) => policy.providers[providerId])
    .filter((provider) =>
      provider.enabled
      && provider.placementRoles.has("container-worker")
      && provider.supportedCapabilities.has("async-job"))
    .map((provider) => provider.maxPayloadBytes);
  return Math.min(
    BACKEND_GATEWAY_HARD_MAX_BODY_BYTES,
    Math.max(1_024, ...limits),
  );
}

export function getBackendCapabilityWorkerHttpAdmission(
  request: Request,
): Readonly<WorkerHttpAdmission> | null {
  const admission = admissions.get(request);
  return admission ? { ...admission } : null;
}
