import { z } from "zod";

import { resolveUpstashCoordinationConfig } from "../../infrastructure/upstash-coordination/upstash-coordination.config";

/**
 * Distributed enforcement is now the default whenever Upstash coordination is
 * enabled in the process environment.  This keeps auth request limiting aligned
 * with deployment-wide capacity controls while preserving an explicit local-mode
 * override for controlled single-instance fallback.
 */
const DistributedRateLimitEnabledSchema = z.enum(["true", "false"]);

export interface AuthRateLimitConfig {
  readonly distributed: boolean;
}

export type AuthRateLimitEnvironment = Partial<
  Record<"AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED", string | undefined>
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

export function resolveAuthRateLimitConfig(
  environment: AuthRateLimitEnvironment,
): AuthRateLimitConfig {
  const upstashEnabled = resolveUpstashCoordinationConfig(environment) !== null;

  const enabled = environment.AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED;

  if (enabled === undefined || enabled === "") {
    return { distributed: upstashEnabled };
  }

  if (enabled === "false") {
    return { distributed: false };
  }

  if (
    DistributedRateLimitEnabledSchema.safeParse(enabled).success === false ||
    enabled !== "true"
  ) {
    throw new AuthRateLimitConfigurationError();
  }

  if (!upstashEnabled) {
    throw new AuthRateLimitConfigurationError();
  }

  return { distributed: true };
}
