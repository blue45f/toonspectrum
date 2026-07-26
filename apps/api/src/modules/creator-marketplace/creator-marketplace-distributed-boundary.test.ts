import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { creatorMarketplaceResources } from "../../../../../lib/db/creator-marketplace-resource.schema";
import { creatorMarketplacePublishGates } from "../../../../../lib/db/schema";

const migration = readFileSync(
  new URL(
    "../../../../../lib/db/migrations/0022_creator_marketplace_distributed_gate_search.sql",
    import.meta.url
  ),
  "utf8"
);
const repositorySource = readFileSync(
  new URL("./creator-marketplace.repository.ts", import.meta.url),
  "utf8"
);
const controllerSource = readFileSync(
  new URL("./creator-marketplace.controller.ts", import.meta.url),
  "utf8"
);

describe("creator marketplace distributed persistence boundary", () => {
  it("models one privacy-minimal bounded gate row per publisher digest", () => {
    const table = getTableConfig(creatorMarketplacePublishGates);

    expect(table.name).toBe("creator_marketplace_publish_gate");
    expect(table.columns.map((column) => column.name)).toEqual([
      "keyHash",
      "windowStartedAt",
      "requestCount",
      "leaseTokenHash",
      "leaseFence",
      "leaseExpiresAt",
      "expiresAt",
      "createdAt",
      "updatedAt",
    ]);
    expect(table.columns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(["userId", "publisherId", "ipAddress"])
    );
    expect(table.indexes.map((entry) => entry.config.name)).toContain(
      "idx_creator_marketplace_publish_gate_expires"
    );
    expect(table.checks.map((entry) => entry.name).sort()).toEqual([
      "creator_marketplace_publish_gate_key_hash_check",
      "creator_marketplace_publish_gate_lease_fence_check",
      "creator_marketplace_publish_gate_lease_state_check",
      "creator_marketplace_publish_gate_request_count_check",
      "creator_marketplace_publish_gate_retention_check",
      "creator_marketplace_publish_gate_timestamps_check",
      "creator_marketplace_publish_gate_window_check",
    ]);
  });

  it("ships an idempotent canonical gate migration with fixed retention and fencing", () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "creator_marketplace_publish_gate"'
    );
    expect(migration).toContain('octet_length("keyHash") = 32');
    expect(migration).toContain('"requestCount" BETWEEN 1 AND 20');
    expect(migration).toContain('"leaseFence" >= 1');
    expect(migration).toContain('octet_length("leaseTokenHash") = 32');
    expect(migration).toContain(
      '"expiresAt" = "windowStartedAt" + interval \'2 hours\''
    );
    expect(migration).toContain(
      'DROP CONSTRAINT IF EXISTS "creator_marketplace_publish_gate_lease_state_check"'
    );
    expect(migration).toContain(
      'DROP INDEX IF EXISTS "idx_creator_marketplace_publish_gate_expires"'
    );
    expect(migration).not.toMatch(
      /"(?:userId|publisherId|ipAddress|requestBody|manifest)"/u
    );
  });

  it("indexes the bounded title, summary, tag, and package-id projection for substring search", () => {
    const table = getTableConfig(creatorMarketplaceResources);
    const searchColumn = table.columns.find(
      (column) => column.name === "searchText"
    );

    expect(searchColumn).toBeDefined();
    expect(searchColumn?.generated).toMatchObject({
      type: "always",
      mode: "stored",
    });
    expect(table.indexes.map((entry) => entry.config.name)).toEqual(
      expect.arrayContaining([
        "idx_creator_marketplace_resource_search",
        "idx_creator_marketplace_resource_tags",
      ])
    );
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "searchText" text');
    for (const field of ["name", "description", "tags", "packageId"]) {
      expect(migration).toContain(`"${field}"`);
    }
    expect(migration).toContain('USING gin ("searchText" gin_trgm_ops)');
    expect(migration).toContain('USING gin ("tags" jsonb_path_ops)');
    expect(repositorySource).toContain("creatorMarketplaceResources.searchText");
    expect(repositorySource).not.toContain("ilike(");
  });

  it("keeps anonymous public search ungated instead of persisting a spoofable identity", () => {
    expect(controllerSource).toContain("sound privacy-preserving actor");
    expect(controllerSource).toContain("Volumetric protection belongs at the trusted edge");
    expect(controllerSource).not.toMatch(/@Headers\("(?:x-forwarded-for|x-real-ip)"/u);
  });
});
