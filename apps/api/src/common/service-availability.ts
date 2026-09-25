import { createHash } from "node:crypto";

import {
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { isDatabaseAvailabilityError } from "./database-availability";

export const DEFAULT_SERVICE_RETRY_AFTER_SECONDS = 60;

export type PublicServiceErrorCode =
  | "CAPABILITY_UNAVAILABLE"
  | "DATABASE_UNAVAILABLE"
  | "SCHEMA_NOT_READY"
  | "SERVICE_NOT_READY";

export interface PublicServiceUnavailableBody {
  readonly statusCode: 503;
  readonly status: "degraded";
  readonly code: PublicServiceErrorCode;
  readonly capability: string;
  readonly retryable: true;
  readonly retryAfterSeconds: number;
  readonly incidentId: string;
  readonly message: "This feature is temporarily unavailable";
}

function errorCode(error: unknown): string {
  const direct = (error as { readonly code?: unknown } | null)?.code;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const cause = (error as { readonly cause?: unknown } | null)?.cause;
  const nested = (cause as { readonly code?: unknown } | null)?.code;
  return typeof nested === "string" && nested.trim()
    ? nested.trim()
    : "unknown";
}

function safeCapability(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(normalized)
    ? normalized
    : "service.unknown";
}

function boundedRetryAfter(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_SERVICE_RETRY_AFTER_SECONDS;
  return Math.min(3_600, Math.max(1, Math.trunc(value!)));
}

export function databaseIncidentId(
  capability: string,
  error?: unknown,
): string {
  const fingerprint = JSON.stringify([
    safeCapability(capability),
    errorCode(error),
  ]);
  return `db-${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
}

export function serviceUnavailableBody(
  capability: string,
  options: {
    readonly code?: PublicServiceErrorCode;
    readonly retryAfterSeconds?: number;
    readonly incidentId?: string;
    readonly error?: unknown;
  } = {},
): PublicServiceUnavailableBody {
  const safe = safeCapability(capability);
  return {
    statusCode: 503,
    status: "degraded",
    code: options.code ?? "CAPABILITY_UNAVAILABLE",
    capability: safe,
    retryable: true,
    retryAfterSeconds: boundedRetryAfter(options.retryAfterSeconds),
    incidentId:
      options.incidentId?.trim()
      || databaseIncidentId(safe, options.error),
    message: "This feature is temporarily unavailable",
  };
}

export function capabilityUnavailableException(
  capability: string,
  options: {
    readonly code?: PublicServiceErrorCode;
    readonly retryAfterSeconds?: number;
    readonly incidentId?: string;
    readonly error?: unknown;
  } = {},
): ServiceUnavailableException {
  return new ServiceUnavailableException(
    serviceUnavailableBody(capability, options),
  );
}

export function rethrowIfDatabaseCapabilityUnavailable(
  error: unknown,
  capability: string,
): void {
  if (error instanceof HttpException) throw error;
  if (!isDatabaseAvailabilityError(error)) return;
  throw capabilityUnavailableException(capability, {
    code: "DATABASE_UNAVAILABLE",
    error,
  });
}

export async function withDatabaseCapability<T>(
  capability: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    rethrowIfDatabaseCapabilityUnavailable(error, capability);
    throw error;
  }
}

export function requireDatabaseCapability(
  ready: boolean,
  capability: string,
): asserts ready {
  if (ready) return;
  throw capabilityUnavailableException(capability, {
    code: "SCHEMA_NOT_READY",
  });
}
