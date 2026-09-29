import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  assertSeedTargetAllowed,
  isLocalSeedTarget,
  normalizePgConnectionStringForTls,
  observePgPoolIdleErrors,
  REMOTE_SEED_OVERRIDE_ENV,
} from "./pg-connection";

describe("normalizePgConnectionStringForTls", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "rewrites legacy %s aliases to explicit full verification",
    (sslmode) => {
      const result = new URL(
        normalizePgConnectionStringForTls(
          `postgresql://artist:secret@example.net/toonstudio?sslmode=${sslmode}&channel_binding=require`
        )
      );

      expect(result.searchParams.get("sslmode")).toBe("verify-full");
      expect(result.searchParams.get("channel_binding")).toBe("require");
      expect(result.username).toBe("artist");
      expect(result.password).toBe("secret");
      expect(result.pathname).toBe("/toonstudio");
    }
  );

  it("keeps verify-full idempotent", () => {
    const input =
      "postgresql://artist:secret@example.net/toonstudio?sslmode=verify-full";

    expect(normalizePgConnectionStringForTls(input)).toBe(input);
  });

  it("adds verify-full for Neon URLs that omit sslmode", () => {
    const result = new URL(
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@ep-example.us-east-1.aws.neon.tech/toonstudio"
      )
    );

    expect(result.searchParams.get("sslmode")).toBe("verify-full");
  });

  it("does not force TLS query parameters onto loopback development URLs", () => {
    const input = "postgresql://postgres:postgres@127.0.0.1:55432/toonstudio";

    expect(normalizePgConnectionStringForTls(input)).toBe(input);
  });

  it("preserves an explicit no-verify mode for non-Neon compatibility endpoints", () => {
    const input = "postgresql://artist:secret@example.net/toonstudio?sslmode=no-verify";

    expect(normalizePgConnectionStringForTls(input)).toBe(input);
  });

  it("rejects TLS disablement for Neon", () => {
    expect(() =>
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@ep-example.neon.tech/toonstudio?sslmode=disable"
      )
    ).toThrow("must not disable TLS");
  });

  it("rejects duplicate sslmode parameters instead of choosing one", () => {
    expect(() =>
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@example.net/toonstudio?sslmode=require&sslmode=disable"
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
    "postgresql://artist:secret@example.net/toonstudio?sslmode=verify-full";

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
        // secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- synthetic redaction fixture
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
        // secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- synthetic percent-encoding fixture
        "postgresql://artist:p%40ss@example.net/toonstudio?sslmode=verify-full",
      logger,
    });

    pool.emit(
      "error",
      new Error("dial postgresql://artist:p@ss@example.net/toonstudio failed")
    );

    const logged = logger.error.mock.calls[0]?.[0] ?? "";
    expect(logged).toContain("postgresql://[REDACTED]@example.net/toonstudio");
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

describe("isLocalSeedTarget", () => {
  it.each([
    "postgresql://webdex:webdex@127.0.0.1:5432/webdex",
    "postgresql://webdex:webdex@localhost:5432/webdex",
    "postgresql://webdex:webdex@0.0.0.0:5432/webdex",
    "postgresql://webdex:webdex@[::1]:5432/webdex",
    "postgresql://webdex:webdex@wd-pg:5432/webdex",
    "postgresql://webdex:webdex@postgres:5432/webdex",
    "postgresql://webdex:webdex@studio.localhost:5432/webdex",
  ])("allows local/QA target %s", (url) => {
    expect(isLocalSeedTarget(url)).toBe(true);
  });

  it("blocks the production Supabase host that the old Neon blocklist let through", () => {
    expect(
      isLocalSeedTarget("postgresql://app:pw@db.ybsgfhofuvkhywbpytnl.supabase.co:5432/postgres")
    ).toBe(false);
  });

  it("blocks a managed transaction pooler host", () => {
    expect(
      isLocalSeedTarget("postgresql://app:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres")
    ).toBe(false);
  });

  it("blocks a legacy Neon host", () => {
    expect(
      isLocalSeedTarget("postgresql://app:pw@ep-example.us-east-1.aws.neon.tech/neondb")
    ).toBe(false);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
    ["unparsable", "not-a-url"],
  ])("fails closed for %s", (_label, value) => {
    expect(isLocalSeedTarget(value as string | undefined | null)).toBe(false);
  });
});

describe("assertSeedTargetAllowed", () => {
  it("allows a local target without any override", () => {
    expect(
      assertSeedTargetAllowed("postgresql://webdex:webdex@127.0.0.1:5432/webdex", {})
    ).toEqual({ allowed: true });
  });

  it("denies the production Supabase host and explains why", () => {
    const verdict = assertSeedTargetAllowed(
      "postgresql://app:pw@db.ybsgfhofuvkhywbpytnl.supabase.co:5432/postgres",
      {}
    );

    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error("unreachable");
    expect(verdict.reason).toContain("Supabase");
    expect(verdict.reason).toContain(REMOTE_SEED_OVERRIDE_ENV);
  });

  it("denies when DATABASE_URL is missing entirely", () => {
    const verdict = assertSeedTargetAllowed("", {});

    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error("unreachable");
    expect(verdict.reason).toContain("DATABASE_URL");
  });

  it("requires the override to be exactly \"1\"", () => {
    const url = "postgresql://app:pw@db.ybsgfhofuvkhywbpytnl.supabase.co:5432/postgres";

    expect(assertSeedTargetAllowed(url, { [REMOTE_SEED_OVERRIDE_ENV]: "0" }).allowed).toBe(false);
    expect(assertSeedTargetAllowed(url, { [REMOTE_SEED_OVERRIDE_ENV]: "true" }).allowed).toBe(false);
    expect(assertSeedTargetAllowed(url, { [REMOTE_SEED_OVERRIDE_ENV]: "1" }).allowed).toBe(true);
  });
});
