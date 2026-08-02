import { describe, expect, it } from "vitest";

import {
  createAuthRateLimitSubjectFingerprint,
  LocalAuthRateLimiter,
} from "./auth-rate-limit";

describe("auth rate-limit identity", () => {
  it("uses the complete deterministic SHA-256 digest and scopes it by action", () => {
    const login = createAuthRateLimitSubjectFingerprint("login", "198.51.100.7");

    expect(login).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(
      createAuthRateLimitSubjectFingerprint("login", "198.51.100.7"),
    ).toBe(login);
    expect(
      createAuthRateLimitSubjectFingerprint("signup", "198.51.100.7"),
    ).not.toBe(login);
    expect(
      createAuthRateLimitSubjectFingerprint("login", "198.51.100.8"),
    ).not.toBe(login);
    expect(login).not.toContain("198.51.100.7");
  });
});

describe("LocalAuthRateLimiter", () => {
  it("enforces a fixed window without retaining rejected attempts", () => {
    let now = 1_000;
    const limiter = new LocalAuthRateLimiter({ now: () => now });

    expect(limiter.consume("login:client-a", 2, 100)).toEqual({
      status: "accepted",
      remainingTtlMs: 100,
    });
    now = 1_025;
    expect(limiter.consume("login:client-a", 2, 100)).toEqual({
      status: "accepted",
      remainingTtlMs: 75,
    });
    now = 1_050;
    expect(limiter.consume("login:client-a", 2, 100)).toEqual({
      status: "rate-limited",
      remainingTtlMs: 50,
    });
    now = 1_101;
    expect(limiter.consume("login:client-a", 2, 100)).toEqual({
      status: "accepted",
      remainingTtlMs: 100,
    });
    expect(limiter.identityCount).toBe(1);
  });

  it("sweeps expired identities and fails closed while every bounded slot is active", () => {
    let now = 0;
    const limiter = new LocalAuthRateLimiter({
      maximumIdentities: 2,
      sweepIntervalMs: 1_000,
      now: () => now,
    });

    expect(limiter.consume("login:client-a", 1, 100).status).toBe("accepted");
    expect(limiter.consume("login:client-b", 1, 100).status).toBe("accepted");
    expect(limiter.identityCount).toBe(2);
    expect(limiter.consume("login:client-c", 1, 100)).toEqual({
      status: "saturated",
      remainingTtlMs: 0,
    });
    expect(limiter.identityCount).toBe(2);

    now = 101;
    expect(limiter.consume("login:client-c", 1, 100).status).toBe("accepted");
    expect(limiter.identityCount).toBe(1);
  });

  it("does not reset an active fixed-window bucket during a sweep", () => {
    let now = 0;
    const limiter = new LocalAuthRateLimiter({
      maximumIdentities: 4,
      sweepIntervalMs: 50,
      now: () => now,
    });

    expect(limiter.consume("login:client-a", 2, 100).status).toBe("accepted");
    expect(limiter.consume("login:client-a", 2, 100).status).toBe("accepted");

    now = 51;
    expect(limiter.consume("login:client-b", 2, 100).status).toBe("accepted");
    expect(limiter.consume("login:client-a", 2, 100).status).toBe(
      "rate-limited",
    );
  });

  it("rejects invalid bounds instead of creating an unbounded store", () => {
    expect(
      () => new LocalAuthRateLimiter({ maximumIdentities: 0 }),
    ).toThrow(RangeError);

    const limiter = new LocalAuthRateLimiter();
    expect(() => limiter.consume("login:client", 0, 100)).toThrow(RangeError);
    expect(() => limiter.consume("login:client", 1, 0)).toThrow(RangeError);
  });
});
