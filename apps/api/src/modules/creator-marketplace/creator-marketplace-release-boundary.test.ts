import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { creatorMarketplaceResources } from "../../db/creator-marketplace-resource.schema";

const repositorySource = readFileSync(
  new URL("./creator-marketplace.repository.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../db/migrations/0030_creator_marketplace_immutable_releases.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Creator Marketplace immutable release persistence boundary", () => {
  it("stores immutable ordinal and rejects duplicate ordinal/equal-precedence builds", () => {
    const table = getTableConfig(creatorMarketplaceResources);

    expect(table.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "releaseOrdinal",
        "delistedAt",
        "semverContractVersion",
      ]),
    );
    expect(table.indexes.map((entry) => entry.config.name)).toEqual(
      expect.arrayContaining([
        "creator_marketplace_resource_publisher_package_ordinal_unique",
        "creator_marketplace_resource_publisher_package_precedence_uniq",
      ]),
    );
    expect(table.checks.map((entry) => entry.name)).toContain(
      "creator_marketplace_resource_release_ordinal_check",
    );
    expect(migration).toContain("equal-precedence release equivocation");
    expect(migration).toContain("creator_marketplace_resource_immutable_release");
    expect(migration).toContain("creator marketplace release is a SemVer downgrade");
    expect(migration).toContain('SET "semverContractVersion" = 1');
    expect(migration).toContain('NEW."semverContractVersion" <> 2');
    expect(migration).toContain("left_identifier::numeric = right_identifier::numeric");
  });

  it("serializes release admission before reading the head and inserting a new row", () => {
    const publish = repositorySource.indexOf("async publish(");
    const transaction = repositorySource.indexOf("db.transaction", publish);
    const advisoryLock = repositorySource.indexOf("pg_advisory_xact_lock", transaction);
    const latestRead = repositorySource.indexOf("const [latest]", advisoryLock);
    const admission = repositorySource.indexOf(
      "admitCreatorMarketplaceRelease",
      latestRead,
    );
    const insert = repositorySource.indexOf(
      ".insert(creatorMarketplaceResources)",
      admission,
    );

    expect(publish).toBeGreaterThanOrEqual(0);
    expect(transaction).toBeGreaterThan(publish);
    expect(advisoryLock).toBeGreaterThan(transaction);
    expect(latestRead).toBeGreaterThan(advisoryLock);
    expect(admission).toBeGreaterThan(latestRead);
    expect(insert).toBeGreaterThan(admission);
    expect(repositorySource.slice(insert, insert + 1_400)).toContain(
      "releaseOrdinal: admission.releaseOrdinal",
    );
  });

  it("lists only the ordinal head while exact-id detail keeps listed historical rows addressable", () => {
    const list = repositorySource.indexOf("async list(");
    const detail = repositorySource.indexOf("async findById(", list);
    const identity = repositorySource.indexOf("async findIdentityById(", detail);
    const listSource = repositorySource.slice(list, detail);
    const detailSource = repositorySource.slice(detail, identity);

    expect(listSource).toContain("newerCreatorMarketplaceRelease.releaseOrdinal");
    expect(listSource).toContain("notExists(");
    expect(listSource).toContain("isNull(creatorMarketplaceResources.delistedAt)");
    expect(detailSource).toContain("eq(creatorMarketplaceResources.id, id)");
    expect(detailSource).not.toContain("releaseOrdinal");
    expect(detailSource).toContain("isNull(creatorMarketplaceResources.delistedAt)");
  });

  it("owner DELETE는 row를 지우지 않고 별도 delistedAt만 기록한다", () => {
    const deletion = repositorySource.slice(
      repositorySource.indexOf("async deleteOwned("),
    );

    expect(deletion).toContain(".update(creatorMarketplaceResources)");
    expect(deletion).toContain(
      ".orderBy(desc(creatorMarketplaceResources.releaseOrdinal))",
    );
    expect(deletion).toContain("if (!head || head.id !== id) return false");
    expect(deletion).toContain("delistedAt: sql`clock_timestamp()`");
    expect(deletion).not.toContain(".delete(creatorMarketplaceResources)");
  });
});
