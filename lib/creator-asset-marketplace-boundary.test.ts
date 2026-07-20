import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  new URL("./db/migrations/0013_creator_asset_marketplace.sql", import.meta.url),
  "utf8"
);
const serverSource = readFileSync(new URL("./server/creator.ts", import.meta.url), "utf8");

describe("creator asset marketplace persistence boundary", () => {
  it("quarantines legacy rows and makes explicit rights a database invariant for publication", () => {
    expect(migrationSource).toMatch(
      /UPDATE "creator_asset"[\s\S]*?SET "moderationStatus" = 'under_review'[\s\S]*?WHERE "rightsConfirmedAt" IS NULL/u
    );
    expect(migrationSource).toContain("creator_asset_published_rights_check");
    expect(migrationSource).toMatch(
      /CHECK \("moderationStatus" <> 'published' OR "rightsConfirmedAt" IS NOT NULL\)/u
    );

    expect(serverSource).toContain("creator_asset_published_rights_check");
    expect(serverSource).toContain("isNotNull(creatorAssets.rightsConfirmedAt)");
  });

  it("keeps reported assets and their moderation evidence instead of cascading a hard delete", () => {
    expect(serverSource).toMatch(
      /select\(\{[\s\S]*?reportCount: creatorAssets\.reportCount[\s\S]*?\.for\("update"\)/u
    );
    expect(serverSource).toMatch(
      /if \(existing\.reportCount > 0\)[\s\S]*?hidden: true[\s\S]*?return \{ deleted: true \}/u
    );
  });
});
