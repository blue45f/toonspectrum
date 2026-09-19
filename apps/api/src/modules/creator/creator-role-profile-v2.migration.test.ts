import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../db/migrations/0076_creator_role_profile_v2.sql", import.meta.url),
  "utf8",
);
const manifest = readFileSync(
  new URL("../../../../../scripts/production-database-migrations.manifest", import.meta.url),
  "utf8",
);

describe("creator role profile v2 production migration", () => {
  it("drops the v1-only profile CHECK before rewriting rows to version 2", () => {
    const dropConstraint = migration.indexOf(
      'DROP CONSTRAINT IF EXISTS "user_creator_role_profile_object_check"',
    );
    const rewrite = migration.indexOf('UPDATE public."user"');
    const addConstraint = migration.indexOf(
      'ADD CONSTRAINT "user_creator_role_profile_object_check"',
    );

    expect(dropConstraint).toBeGreaterThan(-1);
    expect(rewrite).toBeGreaterThan(dropConstraint);
    expect(addConstraint).toBeGreaterThan(rewrite);
    expect(migration).toContain(
      'VALIDATE CONSTRAINT "user_creator_role_profile_object_check"',
    );
  });

  it("keeps the expand window compatible with the previous runtime", () => {
    expect(migration).toContain("'roleVisibility', CASE");
    expect(migration).toContain('"roleVisibility":false');
    expect(migration).toContain('("creatorRoleProfile" ->> \'version\') = \'1\'');
    expect(migration).toContain('("creatorRoleProfile" ->> \'version\') = \'2\'');
    expect(migration).toContain(
      'jsonb_typeof("creatorRoleProfile" -> \'roleVisibility\') = \'boolean\'',
    );
  });

  it("remains ordered between the wallet policy and membership operations migrations", () => {
    expect(manifest).toContain(
      "apps/api/src/db/migrations/0075_membership_wallet_policy.sql\n"
      + "apps/api/src/db/migrations/0076_creator_role_profile_v2.sql\n"
      + "apps/api/src/db/migrations/0077_membership_operations.sql\n",
    );
  });
});
