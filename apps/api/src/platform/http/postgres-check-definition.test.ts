import { describe, expect, it } from "vitest";

import {
  fingerprintPostgresCheckDefinition,
  matchesPostgresCheckDefinition,
} from "./postgres-check-definition";

const CANONICAL_ENUM = `CHECK (
  "license" = ANY (
    ARRAY[
      'toonspectrum-standard'::text,
      'cc0-1.0'::text,
      'cc-by-4.0'::text,
      'cc-by-nc-4.0'::text
    ]::text[]
  )
)`;

describe("PostgreSQL CHECK definition fingerprint", () => {
  it("accepts harmless pretty-print, identifier quote, and implicit literal-cast differences", () => {
    expect(matchesPostgresCheckDefinition(
      `CHECK (((license = ANY(ARRAY[
        'toonspectrum-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0'
      ]))))`,
      CANONICAL_ENUM
    )).toBe(true);
  });

  it.each([
    [`${CANONICAL_ENUM.slice(0, -1)} OR true)`, "OR true"],
    [`${CANONICAL_ENUM.slice(0, -1)} OR 1 = 1)`, "OR 1=1"],
    [CANONICAL_ENUM.replace("cc-by-nc-4.0", "commercial-anything"), "wider enum"],
    [CANONICAL_ENUM.replace("cc0-1.0'::text,", ""), "narrower enum"],
    [CANONICAL_ENUM.replace("cc0-1.0", "CC0-1.0"), "case-changed enum"],
    [CANONICAL_ENUM.replace("cc0-1.0", "cc0 -1.0"), "whitespace-changed enum"],
  ])("rejects a same-name semantic weakening: %s", (actual) => {
    expect(matchesPostgresCheckDefinition(actual, CANONICAL_ENUM)).toBe(false);
  });

  it("preserves boolean grouping instead of sorting or flattening tokens", () => {
    const canonical = `CHECK ((a IS NULL AND b IS NULL) OR (a IS NOT NULL AND b IS NOT NULL))`;
    const regrouped = `CHECK (a IS NULL AND (b IS NULL OR a IS NOT NULL) AND b IS NOT NULL)`;
    expect(matchesPostgresCheckDefinition(regrouped, canonical)).toBe(false);
  });

  it("accepts harmless same-operator association without reordering operands", () => {
    expect(matchesPostgresCheckDefinition(
      "CHECK ((a >= 1 AND a <= 10) AND b IS NOT NULL)",
      "CHECK (a >= 1 AND a <= 10 AND b IS NOT NULL)"
    )).toBe(true);
  });

  it("preserves expression casts that prevent integer multiplication overflow", () => {
    const canonical = `CHECK (
      width >= 1 AND width <= 4096
      AND height >= 1 AND height <= 4096
      AND width::bigint * height::bigint <= 16777216
    )`;
    const unsafeIntegerMath = canonical.replaceAll("::bigint", "::integer");
    expect(matchesPostgresCheckDefinition(unsafeIntegerMath, canonical)).toBe(false);
    expect(matchesPostgresCheckDefinition(
      canonical.replace(
        "width::bigint * height::bigint",
        "((width)::bigint * (height)::bigint)"
      ),
      canonical
    )).toBe(true);
  });

  it("rejects malformed, missing, and oversized catalog definitions", () => {
    expect(fingerprintPostgresCheckDefinition(null)).toBeNull();
    expect(fingerprintPostgresCheckDefinition("CHECK ()")).toBeNull();
    expect(fingerprintPostgresCheckDefinition(`CHECK (${"x".repeat(40_000)})`)).toBeNull();
  });
});
