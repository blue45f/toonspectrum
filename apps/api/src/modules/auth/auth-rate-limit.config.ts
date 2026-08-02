import { z } from "zod";

import { resolveUpstashCoordinationConfig } from "../../infrastructure/upstash-coordination/upstash-coordination.config";

const DistributedRateLimitEnabledSchema = z.enum(["true", "false"]);
const AuthRateLimitModeSchema = z.enum([
  "distributed",
  "single-instance-local",
]);

export interface AuthRateLimitConfig {
  readonly distributed: boolean;
}

export type AuthRateLimitEnvironment = Partial<
  Record<
    | "NODE_ENV"
    | "AUTH_RATE_LIMIT_MODE"
    | "AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED",
    string | undefined
  >
  & Record<
    | "UPSTASH_COORDINATION_ENABLED"
    | "UPSTASH_COORDINATION_REST_URL"
    | "UPSTASH_COORDINATION_REST_TOKEN"
    | "UPSTASH_COORDINATION_KEY_HASH_SECRET"
    | "UPSTASH_COORDINATION_NAMESPACE"
    | "UPSTASH_COORDINATION_TIMEOUT_MS"
    | "UPSTASH_COORDINATION_MAX_REQUEST_BYTES"
    | "UPSTASH_COORDINATION_MAX_RESPONSE_BYTES",
    string | undefined
  >
>;

export class AuthRateLimitConfigurationError extends Error {
  constructor() {
    super("Auth distributed rate-limit configuration is invalid.");
    this.name = "AuthRateLimitConfigurationError";
  }
}

export class AuthRateLimitDependencyError extends Error {
  constructor() {
    super("Auth distributed rate-limit coordination is unavailable.");
    this.name = "AuthRateLimitDependencyError";
  }
}

export function resolveAuthRateLimitConfig(
  environment: AuthRateLimitEnvironment,
): AuthRateLimitConfig {
  const upstashEnabled = resolveUpstashCoordinationConfig(environment) !== null;
  const configuredMode = environment.AUTH_RATE_LIMIT_MODE?.trim() || undefined;
  const legacyEnabled =
    environment.AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED?.trim() || undefined;
  const parsedMode = configuredMode
    ? AuthRateLimitModeSchema.safeParse(configuredMode)
    : null;
  const parsedLegacy = legacyEnabled
    ? DistributedRateLimitEnabledSchema.safeParse(legacyEnabled)
    : null;
  if (parsedMode?.success === false || parsedLegacy?.success === false) {
    throw new AuthRateLimitConfigurationError();
  }

  const legacyMode = parsedLegacy?.success
    ? parsedLegacy.data === "true"
      ? "distributed"
      : "single-instance-local"
    : undefined;
  if (parsedMode?.success && legacyMode && parsedMode.data !== legacyMode) {
    throw new AuthRateLimitConfigurationError();
  }

  // Production must make the topology/risk decision explicit. Merely omitting Upstash must never
  // turn a horizontally-scaled authentication boundary into process-local counters.
  const mode = parsedMode?.success
    ? parsedMode.data
    : environment.NODE_ENV === "production"
      ? undefined
      : legacyMode ?? (upstashEnabled ? "distributed" : "single-instance-local");
  if (!mode) {
    throw new AuthRateLimitConfigurationError();
  }

  if (mode === "distributed" && !upstashEnabled) {
    throw new AuthRateLimitConfigurationError();
  }

  return { distributed: mode === "distributed" };
}
