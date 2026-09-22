import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "0089_creator_series_spatial_showcase.sql";
const migration = readFileSync(
  new URL(`../../db/migrations/${migrationName}`, import.meta.url),
  "utf8",
);
const manifest = readFileSync(
  new URL("../../../../../scripts/production-database-migrations.manifest", import.meta.url),
  "utf8",
);

describe("creator series spatial showcase migration", () => {
  it("adds an explicit opt-in with a privacy-safe default and no implicit backfill", () => {
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "showcaseEnabled" boolean NOT NULL DEFAULT false',
    );
    expect(migration).not.toContain("DEFAULT true");
    expect(migration).not.toMatch(/\bUPDATE\s+public\.creator_series\b/iu);
  });

  it("is part of the reviewed production migration manifest", () => {
    expect(manifest).toContain(`apps/api/src/db/migrations/${migrationName}`);
  });
});
