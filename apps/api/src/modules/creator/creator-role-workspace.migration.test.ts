import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../db/migrations/0066_creator_role_workspace_personalization.sql",
    import.meta.url,
  ),
  "utf8",
);
const manifest = readFileSync(
  new URL("../../../../../scripts/production-database-migrations.manifest", import.meta.url),
  "utf8",
);

describe("creator role workspace production migration", () => {
  it("creates revisioned project preferences with privacy-safe defaults", () => {
    expect(migration).toContain('"creator_role_workspace_preference"');
    expect(migration).toContain('PRIMARY KEY ("userId", "projectKey")');
    expect(migration).toContain('"revision" BETWEEN 0 AND 2147483647');
    expect(migration).toContain("'false'::jsonb");
    expect(migration).toContain('"idx_user_creator_role_primary_public"');
    expect(migration).toContain('"idx_user_creator_role_specialties_gin"');
  });

  it("is registered after the series lifecycle migration", () => {
    expect(manifest).toContain(
      "apps/api/src/db/migrations/0065_creator_series_lifecycle.sql\n"
      + "apps/api/src/db/migrations/0066_creator_role_workspace_personalization.sql\n",
    );
  });
});
