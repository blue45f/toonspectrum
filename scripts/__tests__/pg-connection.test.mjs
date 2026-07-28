import { describe, expect, it } from "vitest";

import { normalizePgConnectionStringForTls } from "../pg-connection.mjs";

describe("maintenance-script PostgreSQL TLS normalization", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "preserves current full verification when sslmode=%s is supplied",
    (sslmode) => {
      const result = new URL(
        normalizePgConnectionStringForTls(
          `postgresql://artist:secret@example.net/toonspectrum?sslmode=${sslmode}`
        )
      );

      expect(result.searchParams.get("sslmode")).toBe("verify-full");
    }
  );

  it("adds full verification to Neon URLs without an sslmode", () => {
    const result = new URL(
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@ep-example.neon.tech/toonspectrum"
      )
    );

    expect(result.searchParams.get("sslmode")).toBe("verify-full");
  });

  it("leaves loopback development URLs unchanged", () => {
    const input = "postgresql://postgres:postgres@127.0.0.1:55432/toonspectrum";

    expect(normalizePgConnectionStringForTls(input)).toBe(input);
  });

  it("rejects duplicate modes and Neon TLS disablement", () => {
    expect(() =>
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@example.net/toonspectrum?sslmode=require&sslmode=disable"
      )
    ).toThrow("must not repeat sslmode");
    expect(() =>
      normalizePgConnectionStringForTls(
        "postgresql://artist:secret@ep-example.neon.tech/toonspectrum?sslmode=disable"
      )
    ).toThrow("must not disable TLS");
  });
});
