import { describe, expect, it } from "vitest";

import { normalizePgConnectionStringForTls } from "./pg-connection";

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
