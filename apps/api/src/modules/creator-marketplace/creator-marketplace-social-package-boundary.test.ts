import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const repository = readFileSync(
  resolve(
    root,
    "apps/api/src/modules/creator-marketplace/creator-marketplace-social.repository.ts",
  ),
  "utf8",
);
const migration = readFileSync(
  resolve(
    root,
    "apps/api/src/db/migrations/0036_creator_marketplace_social.sql",
  ),
  "utf8",
);

describe("creator marketplace social package boundary", () => {
  it("reads comments, reviews and viewer review identity across immutable releases", () => {
    expect(repository).toContain('comment_resource."publisherId" = $1');
    expect(repository).toContain('comment_resource."packageId" = $2');
    expect(repository).toContain('review_resource."publisherId" = $1');
    expect(repository).toContain('review_resource."packageId" = $2');
    expect(repository).not.toContain('WHERE review."resourceId" = $1\n            AND review."deletedAt" IS NULL');
  });

  it("keeps replies attached to the parent release while allowing replies from a newer release page", () => {
    expect(repository).toContain("let targetResourceId = resourceId");
    expect(repository).toContain("targetResourceId = row.resourceId");
    expect(repository).toContain('[id, targetResourceId, parentId, userId, input.content]');
    expect(migration).toContain("creator marketplace reply must stay in one resource");
  });

  it("serializes one review per account/package before insert or update", () => {
    const lock = repository.indexOf("pg_advisory_xact_lock");
    const packageLookup = repository.indexOf('review_resource."publisherId" = $1', lock);
    const update = repository.indexOf('UPDATE public."creator_marketplace_review"', packageLookup);
    const insert = repository.indexOf('INSERT INTO public."creator_marketplace_review"', packageLookup);
    expect(lock).toBeGreaterThan(-1);
    expect(packageLookup).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(packageLookup);
    expect(insert).toBeGreaterThan(packageLookup);
  });

  it("extends established incremental-production runtime roles to social DML", () => {
    expect(migration).toContain("creator_marketplace_social_runtime_acl");
    expect(migration).toContain("has_schema_privilege(role.rolname, 'public', 'CREATE')");
    expect(migration).toContain("public.creator_marketplace_publish_gate");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ",
    );
    for (const relation of [
      "creator_marketplace_comment",
      "creator_marketplace_comment_like",
      "creator_marketplace_review",
      "creator_marketplace_review_helpful",
    ]) {
      expect(migration).toContain(`public.${relation}`);
    }
  });
});
