import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { creatorMarketplaceResources } from "../../db/creator-marketplace-resource.schema";

const repositorySource = readFileSync(
  new URL("./creator-marketplace.repository.ts", import.meta.url),
  "utf8"
);
const serviceSource = readFileSync(
  new URL("./creator-marketplace.service.ts", import.meta.url),
  "utf8"
);
const controllerSource = readFileSync(
  new URL("./creator-marketplace.controller.ts", import.meta.url),
  "utf8"
);
const lifecycleMigration = readFileSync(
  new URL(
    "../../db/migrations/0032_creator_marketplace_release_lifecycle.sql",
    import.meta.url
  ),
  "utf8"
);
const packageModerationMigration = readFileSync(
  new URL(
    "../../db/migrations/0034_creator_marketplace_package_moderation.sql",
    import.meta.url
  ),
  "utf8"
);

describe("creator marketplace release lifecycle boundary", () => {
  it("normalizes resource timestamps to millisecond precision and rejects old cursors", () => {
    const table = getTableConfig(creatorMarketplaceResources);
    const createdAt = table.columns.find((column) => column.name === "createdAt");
    const updatedAt = table.columns.find((column) => column.name === "updatedAt");

    expect(createdAt?.getSQLType()).toBe("timestamp (3) with time zone");
    expect(updatedAt?.getSQLType()).toBe("timestamp (3) with time zone");
    expect(lifecycleMigration).toContain(
      'ALTER COLUMN "createdAt" TYPE timestamptz(3)'
    );
    expect(lifecycleMigration).toContain(
      'ALTER COLUMN "updatedAt" TYPE timestamptz(3)'
    );
    expect(serviceSource).toContain("version: 3");
    expect(serviceSource).toContain('envelope.version !== 3');
    expect(serviceSource).toContain('scope: "public-heads"');
    expect(serviceSource).toContain('scope: "owned-heads"');
  });

  it("never falls back from an invisible head and scopes every package comparison by publisher", () => {
    const publicList = repositorySource.slice(
      repositorySource.indexOf("async list("),
      repositorySource.indexOf("async listOwnedHeads(")
    );
    const ownedHeads = repositorySource.slice(
      repositorySource.indexOf("async listOwnedHeads("),
      repositorySource.indexOf("async findHistoryAnchor(")
    );
    const publicHistory = repositorySource.slice(
      repositorySource.indexOf("async listPublicHistory("),
      repositorySource.indexOf("async findOwnedPackageHead(")
    );
    const publicHistoryAnchor = repositorySource.slice(
      repositorySource.indexOf("async findHistoryAnchor("),
      repositorySource.indexOf("async listPublicHistory(")
    );
    const ownerHistory = repositorySource.slice(
      repositorySource.indexOf("async listOwnedPackageHistory("),
      repositorySource.indexOf("async findById(")
    );
    const publicDetail = repositorySource.slice(
      repositorySource.indexOf("async findById("),
      repositorySource.indexOf("async findIdentityById(")
    );

    expect(publicList).toContain(
      'eq(creatorMarketplacePackageModeration.state, "active")'
    );
    expect(publicList).toContain('eq(users.status, "active")');
    expect(publicList).not.toContain("creatorMarketplaceResources.hidden");
    expect(publicList).toContain("isNull(creatorMarketplaceResources.delistedAt)");
    expect(publicList).toContain("newerCreatorMarketplaceRelease.publisherId");
    expect(publicList).toContain("newerCreatorMarketplaceRelease.packageId");
    expect(publicList).not.toMatch(
      /newerCreatorMarketplaceRelease\.(?:hidden|delistedAt)/u
    );
    expect(ownedHeads).not.toContain(
      "eq(creatorMarketplaceResources.hidden, false)"
    );
    for (const historySource of [publicHistory, ownerHistory]) {
      expect(historySource).toContain(
        "eq(creatorMarketplaceResources.publisherId, input.publisherId)"
      );
      expect(historySource).toContain(
        "eq(creatorMarketplaceResources.packageId, input.packageId)"
      );
      expect(historySource).toContain(
        "lt(creatorMarketplaceResources.releaseOrdinal, input.cursor)"
      );
      expect(historySource).toContain(
        "desc(creatorMarketplaceResources.releaseOrdinal)"
      );
    }
    expect(publicHistory).toContain(
      'eq(creatorMarketplacePackageModeration.state, "active")'
    );
    expect(publicHistory).toContain('eq(users.status, "active")');
    expect(publicHistory).toContain("absolutePackageHeadIsListed()");
    expect(publicHistoryAnchor).toContain('eq(users.status, "active")');
    expect(publicHistoryAnchor).toContain("absolutePackageHeadIsListed()");
    expect(publicHistory).not.toContain("creatorMarketplaceResources.hidden");
    expect(publicHistory).toContain(
      "isNull(creatorMarketplaceResources.delistedAt)"
    );
    expect(publicDetail).toContain("eq(creatorMarketplaceResources.id, id)");
    expect(publicDetail).toContain(
      "isNull(creatorMarketplaceResources.delistedAt)"
    );
    expect(publicDetail).toContain('eq(users.status, "active")');
    expect(publicDetail).toContain("absolutePackageHeadIsListed()");
    expect(publicDetail).not.toContain("releaseOrdinal");
  });

  it("serializes publish/relist with one lock and advances lifecycle audit time", () => {
    const publish = repositorySource.slice(
      repositorySource.indexOf("async publish("),
      repositorySource.indexOf("async report(")
    );
    const relist = repositorySource.slice(repositorySource.indexOf("async relistOwned("));

    expect(publish).toContain("creatorMarketplaceReleaseLockKey(");
    expect(publish).toContain("creatorMarketplacePackageModeration.state");
    expect(publish).toContain('moderation.state !== "active"');
    expect(publish).not.toContain("creatorMarketplaceResources.hidden");
    expect(publish).toContain('"moderated"');
    expect(relist).toContain("creatorMarketplaceReleaseLockKey(");
    expect(relist).toContain("pg_advisory_xact_lock");
    expect(relist).toContain("candidate.packageId");
    expect(relist).toContain("head.id !== id");
    expect(relist).toContain('moderation.state === "hidden"');
    expect(relist).toContain("delistedAt: null");
    expect(relist).not.toContain("hidden: false");
    expect(repositorySource.match(/updatedAt: sql`greatest\(/gu)).toHaveLength(3);
    expect(lifecycleMigration).toContain(
      "creator_marketplace_resource_lifecycle_timestamp_required"
    );
    expect(lifecycleMigration).toContain(
      "creator_marketplace_resource_relist_non_head"
    );
    expect(packageModerationMigration).toContain(
      "creator_marketplace_resource_relist_moderated"
    );
    expect(packageModerationMigration).toContain(
      "creator_marketplace_resource_delist_non_head"
    );
    expect(packageModerationMigration).toContain(
      "creator_marketplace_resource_hidden_legacy"
    );
    expect(packageModerationMigration).toContain(
      "creator_marketplace_package_moderated"
    );
    expect(packageModerationMigration).toContain(
      'ORDER BY release."releaseOrdinal" DESC\n    LIMIT 1\n    FOR UPDATE'
    );
    expect(lifecycleMigration).not.toMatch(
      /UPDATE\s+public\."creator_marketplace_resource"/iu
    );
  });

  it("keeps new static routes ahead of the exact-id route and all responses no-store", () => {
    const dynamicDetail = controllerSource.indexOf('@Get("/:id")');
    for (const route of [
      '@Get("/history/:id")',
      '@Get("/moderation")',
      '@Patch("/moderation/reports/:id")',
      '@Get("/mine/history")',
      '@Get("/mine/heads")',
      '@Get("/mine")',
    ]) {
      expect(controllerSource.indexOf(route)).toBeGreaterThan(-1);
      expect(controllerSource.indexOf(route)).toBeLessThan(dynamicDetail);
    }
    expect(controllerSource).toContain("@HttpCode(HttpStatus.OK)");
    expect(controllerSource).toContain(
      '@Header("Cache-Control", "no-store, max-age=0")'
    );
    expect(controllerSource).toContain(
      '@Header("Cache-Control", "private, no-store, max-age=0")'
    );
    expect(controllerSource).toContain(
      "@deprecated Use `/mine/heads` for lifecycle-aware package management."
    );
  });

  it("dismisses only locked open orphan reports and never offers hide/restore", () => {
    const orphanDismiss = repositorySource.slice(
      repositorySource.indexOf("async dismissOrphanReport("),
      repositorySource.indexOf("async deleteOwned(")
    );

    expect(orphanDismiss).toContain('.for("update")');
    expect(orphanDismiss).toContain("report.resourceId !== null");
    expect(orphanDismiss).toContain('report.status !== "open"');
    expect(orphanDismiss).toContain(
      "creatorMarketplaceResourceReports.resourceSnapshotId"
    );
    expect(orphanDismiss).toContain("isNull(creatorMarketplaceResourceReports.resourceId)");
    expect(orphanDismiss).toContain('status: "dismissed"');
    expect(orphanDismiss).not.toContain('status: "resolved"');
    expect(orphanDismiss).not.toContain("creatorMarketplaceResources.hidden");
  });
});
