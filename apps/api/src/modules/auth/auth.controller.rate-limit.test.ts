import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { createAuthRateLimitSubjectFingerprint } from "./auth-rate-limit";
import { AuthRateLimitDependencyError } from "./auth-rate-limit.config";
import { AuthController } from "./auth.controller";

import type { AuthRateLimitAction } from "./auth-rate-limit";
import type { UpstashCoordinationPort } from "../../infrastructure/upstash-coordination/upstash-coordination.port";
import type { Request } from "express";

function coordination(
  result: { readonly accepted: boolean } | Error,
): {
  readonly port: UpstashCoordinationPort;
  readonly consumeProviderBudget: ReturnType<typeof vi.fn>;
  readonly consumeRateLimit: ReturnType<typeof vi.fn>;
} {
  const consumeRateLimit = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return {
      accepted: result.accepted,
      requestCount: result.accepted ? 1 : 10,
      remainingTtlMs: 600_000,
    };
  });
  const consumeProviderBudget = vi.fn();
  return {
    port: {
      consumeProviderBudget,
      consumeRateLimit,
    } as unknown as UpstashCoordinationPort,
    consumeProviderBudget,
    consumeRateLimit,
  };
}

function controller(port: UpstashCoordinationPort | null): AuthController {
  return new AuthController(
    { distributed: true },
    { mode: "direct" },
    port,
  );
}

function enforceRateLimit(
  instance: AuthController,
  action: AuthRateLimitAction,
  remoteAddress = "198.51.100.7",
): Promise<void> {
  return (
    instance as unknown as {
      enforceRateLimit(
        requestedAction: AuthRateLimitAction,
        request: Request,
      ): Promise<void>;
    }
  ).enforceRateLimit(action, {
    headers: {},
    socket: { remoteAddress },
  } as Request);
}

describe("AuthController distributed rate limiting", () => {
  it("uses the dedicated bounded counter with a full pre-hashed subject", async () => {
    const mock = coordination({ accepted: true });

    await expect(enforceRateLimit(controller(mock.port), "login")).resolves.toBeUndefined();

    expect(mock.consumeRateLimit).toHaveBeenCalledOnce();
    expect(mock.consumeRateLimit).toHaveBeenCalledWith({
      scope: "auth",
      subjectFingerprint: createAuthRateLimitSubjectFingerprint(
        "login",
        "198.51.100.7",
      ),
      maximumRequests: 10,
      windowMs: 600_000,
    });
    expect(mock.consumeProviderBudget).not.toHaveBeenCalled();
    expect(JSON.stringify(mock.consumeRateLimit.mock.calls)).not.toContain(
      "198.51.100.7",
    );
  });

  it("returns 429 only for a valid rejected limiter decision", async () => {
    const mock = coordination({ accepted: false });

    const error = await enforceRateLimit(controller(mock.port), "login").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });

  it("fails application construction when distributed coordination is missing", () => {
    expect(() => controller(null)).toThrow(AuthRateLimitDependencyError);
  });

  it("fails closed with 503 when distributed coordination is uncertain", async () => {
    const unavailable = coordination(new Error("remote token must stay private"));

    const error = await enforceRateLimit(
      controller(unavailable.port),
      "login",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain(
      "remote token",
    );
  });
});
