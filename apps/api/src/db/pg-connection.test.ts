import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  normalizePgConnectionStringForTls,
  observePgPoolIdleErrors,
} from "./pg-connection";

describe("normalizePgConnectionStringForTls", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "rewrites legacy %s aliases to explicit full verification",
    (sslmode) => {
      const result = new URL(
        normalizePgConnectionStringForTls(
          `postgresql://artist:secret@example.net/toonspectrum?sslmode=${sslmode}&channel_binding=require`
        )
      );

      expect(result.searchParams.get("sslmode")).toBe("verify-full");
      expect(result.searchParams.get("channel_binding")).toBe("require");
      expect(result.username).toBe("artist");
      expect(result.password).toBe("secret");
      expect(result.pathname).toBe("/toonspectrum");
    }
  );

  it("keeps verify-full idempotent", () => {
    const input =
      "postgresql://artist:secret@example.net/toonspectrum?sslmode=verify-full";

    expect(normalizePgConnectionStringForTls(input)).toBe(input);
  });

  it("adds verify-full for Neon URLs that omit sslmode", () => {
    const result = new URL(
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@ep-example.us-east-1.aws.neon.tech/toonspectrum"
      )
    );

    expect(result.searchParams.get("sslmode")).toBe("verify-full");
  });

  it("does not force TLS query parameters onto loopback development URLs", () => {
    const input = "postgresql://postgres:postgres@127.0.0.1:55432/toonspectrum";

    expect(normalizePgConnectionStringForTls(input)).toBe(input);
  });

  it("preserves an explicit no-verify mode for non-Neon compatibility endpoints", () => {
    const input = "postgresql://artist:secret@example.net/toonspectrum?sslmode=no-verify";

    expect(normalizePgConnectionStringForTls(input)).toBe(input);
  });

  it("rejects TLS disablement for Neon", () => {
    expect(() =>
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@ep-example.neon.tech/toonspectrum?sslmode=disable"
      )
    ).toThrow("must not disable TLS");
  });

  it("rejects duplicate sslmode parameters instead of choosing one", () => {
    expect(() =>
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@example.net/toonspectrum?sslmode=require&sslmode=disable"
      )
    ).toThrow("must not repeat sslmode");
  });

  it("rejects non-PostgreSQL connection protocols", () => {
    expect(() => normalizePgConnectionStringForTls("https://example.net/database")).toThrow(
      "postgres or postgresql"
    );
  });
});

describe("observePgPoolIdleErrors", () => {
  const connectionString =
    "postgresql://artist:secret@example.net/toonspectrum?sslmode=verify-full";

  it("handles and logs an idle-client error instead of letting EventEmitter throw", () => {
    const pool = new EventEmitter();
    const logger = { error: vi.fn() };
    observePgPoolIdleErrors(pool, { connectionString, logger });
    const error = Object.assign(new Error("Connection terminated unexpectedly"), {
      code: "ECONNRESET",
    });

    expect(() => pool.emit("error", error)).not.toThrow();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      "PostgreSQL pool emitted an idle-client error (code=ECONNRESET): Connection terminated unexpectedly"
    );
  });

  it("bounds log fields and redacts connection credentials", () => {
    const pool = new EventEmitter();
    const logger = { error: vi.fn() };
    observePgPoolIdleErrors(pool, { connectionString, logger });
    const tail = "TAIL_MUST_NOT_ESCAPE";
    const error = Object.assign(
      new Error(
        `${connectionString}\npassword=secret postgresql://other:other-secret@example.net/db ${"x".repeat(700)}${tail}`
      ),
      { code: `secret-${"C".repeat(100)}` }
    );

    pool.emit("error", error);

    const logged = logger.error.mock.calls[0]?.[0] ?? "";
    expect(logged).not.toContain("artist:secret");
    expect(logged).not.toContain("password=secret");
    expect(logged).not.toContain("other:other-secret");
    expect(logged).not.toContain(connectionString);
    expect(logged).not.toContain(tail);
    expect(logged).not.toContain("\n");
    expect(logged).toContain("[REDACTED]");
  });

  it("redacts decoded at-signs in percent-encoded passwords without leaking a suffix", () => {
    const pool = new EventEmitter();
    const logger = { error: vi.fn() };
    observePgPoolIdleErrors(pool, {
      connectionString:
        "postgresql://artist:p%40ss@example.net/toonspectrum?sslmode=verify-full",
      logger,
    });

    pool.emit(
      "error",
      new Error("dial postgresql://artist:p@ss@example.net/toonspectrum failed")
    );

    const logged = logger.error.mock.calls[0]?.[0] ?? "";
    expect(logged).toContain("postgresql://[REDACTED]@example.net/toonspectrum");
    expect(logged).not.toContain("artist");
    expect(logged).not.toContain("p@ss");
    expect(logged).not.toContain("@ss@");
  });

  it("does not intercept or hide active query rejections", async () => {
    const queryError = new Error("statement failed");
    const pool = Object.assign(new EventEmitter(), {
      query: vi.fn().mockRejectedValue(queryError),
    });
    const logger = { error: vi.fn() };
    observePgPoolIdleErrors(pool, { connectionString, logger });

    await expect(pool.query("SELECT broken_query")).rejects.toBe(queryError);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
