import { randomUUID } from "node:crypto";

import { HttpException, ServiceUnavailableException } from "@nestjs/common";

import { isDatabaseAvailabilityError } from "./database-availability";

export const DEFAULT_SERVICE_RETRY_AFTER_SECONDS = 30;
export const CAPABILITY_UNAVAILABLE_CODE = "CAPABILITY_UNAVAILABLE";
export const DATABASE_UNAVAILABLE_CODE = "DATABASE_UNAVAILABLE";

const CAPABILITY_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,80}$/u;
const activeIncidents = new Map<string, string>();

export interface CapabilityUnavailableOptions {
  readonly code?: string;
  readonly retryAfterSeconds?: number;
  readonly retryable?: boolean;
  readonly status?: "degraded" | "unavailable" | "not_ready";
  readonly legacyError?: string;
}

function safeCapabilityName(capability: string): string {
  const normalized = capability.trim();
  return CAPABILITY_NAME_PATTERN.test(normalized)
    ? normalized
    : "service.unknown";
}

function safeErrorCode(code: string | undefined): string {
  const normalized = code?.trim().toUpperCase();
  return normalized && ERROR_CODE_PATTERN.test(normalized)
    ? normalized
    : CAPABILITY_UNAVAILABLE_CODE;
}

function safeRetryAfterSeconds(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_SERVICE_RETRY_AFTER_SECONDS;
  return Math.min(3_600, Math.max(1, Math.trunc(value ?? DEFAULT_SERVICE_RETRY_AFTER_SECONDS)));
}

export function capabilityIncidentId(capability: string): string {
  const safeCapability = safeCapabilityName(capability);
  const current = activeIncidents.get(safeCapability);
  if (current) return current;
  const created = `inc_${randomUUID()}`;
  activeIncidents.set(safeCapability, created);
  return created;
}

export function clearCapabilityIncident(capability: string): void {
  activeIncidents.delete(safeCapabilityName(capability));
}

export function capabilityUnavailableException(
  capability: string,
  options: CapabilityUnavailableOptions = {},
): ServiceUnavailableException {
  const safeCapability = safeCapabilityName(capability);
  const retryAfterSeconds = safeRetryAfterSeconds(options.retryAfterSeconds);
  const legacyError = options.legacyError?.trim();
  return new ServiceUnavailableException({
    statusCode: 503,
    code: safeErrorCode(options.code),
    status: options.status ?? "degraded",
    capability: safeCapability,
    retryable: options.retryable ?? true,
    retryAfterSeconds,
    incidentId: capabilityIncidentId(safeCapability),
    ...(legacyError && /^[a-z][a-z0-9_-]{2,80}$/u.test(legacyError)
      ? { error: legacyError }
      : {}),
    message: "This feature is temporarily unavailable",
  });
}

export function databaseCapabilityUnavailableException(
  error: unknown,
  capability: string,
  options: Omit<CapabilityUnavailableOptions, "code"> = {},
): ServiceUnavailableException | null {
  if (error instanceof HttpException) {
    return error.getStatus() >= 500
      ? (error as ServiceUnavailableException)
      : null;
  }
  if (!isDatabaseAvailabilityError(error)) return null;
  return capabilityUnavailableException(capability, {
    ...options,
    code: DATABASE_UNAVAILABLE_CODE,
  });
}

export async function withDatabaseCapability<T>(
  capability: string,
  action: () => Promise<T>,
  options: Omit<CapabilityUnavailableOptions, "code"> = {},
): Promise<T> {
  try {
    const result = await action();
    clearCapabilityIncident(capability);
    return result;
  } catch (error) {
    rethrowDatabaseCapabilityError(error, capability, options);
  }
}

export function rethrowIfDatabaseCapabilityUnavailable(
  error: unknown,
  capability: string,
  options: Omit<CapabilityUnavailableOptions, "code"> = {},
): void {
  const unavailable = databaseCapabilityUnavailableException(error, capability, options);
  if (unavailable) throw unavailable;
}

export function rethrowDatabaseCapabilityError(
  error: unknown,
  capability: string,
  options: Omit<CapabilityUnavailableOptions, "code"> = {},
): never {
  const unavailable = databaseCapabilityUnavailableException(error, capability, options);
  if (unavailable) throw unavailable;
  throw error;
}
