import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(resolve(
  root,
  "apps/api/src/db/migrations/0033_creator_marketplace_cloud_library.sql",
), "utf8");
const packageModerationMigration = readFileSync(resolve(
  root,
  "apps/api/src/db/migrations/0034_creator_marketplace_package_moderation.sql",
), "utf8");
const schema = readFileSync(resolve(
  root,
  "apps/api/src/db/creator-marketplace-library.schema.ts",
), "utf8");
const repository = readFileSync(resolve(
  root,
  "apps/api/src/modules/creator-marketplace/creator-marketplace-library.repository.ts",
), "utf8");

describe("creator marketplace cloud library source boundaries", () => {
  it("kind continuity trigger가 direct concurrent first insert도 동일 release lock으로 직렬화한다", () => {
    const functionStart = migration.indexOf(
      "enforce_creator_marketplace_package_kind_continuity()",
    );
    const functionEnd = migration.indexOf("$package_kind_continuity$;", functionStart);
    const source = migration.slice(functionStart, functionEnd);
    const lock = source.indexOf("pg_advisory_xact_lock");
    const namespace = source.indexOf(
      "toonspectrum:creator-marketplace-release:v1:",
    );
    const firstKindRead = source.indexOf('SELECT release."kind"');

    expect(lock).toBeGreaterThan(-1);
    expect(namespace).toBeGreaterThan(lock);
    expect(firstKindRead).toBeGreaterThan(namespace);
    expect(source).toContain(
      "creator_marketplace_resource_package_kind_continuity",
    );
  });

  it("nullable pointer는 FK cleanup 전 insert에서 모두 live pointer로 강제한다", () => {
    expect(migration).toContain(
      'NEW."publisherId" IS NULL OR NEW."addedFromReleaseId" IS NULL',
    );
    expect(migration).toContain('NEW."lastConfirmedReleaseId" IS NULL OR NOT EXISTS');
    expect(migration).toContain('"lastConfirmedReleaseId" IS NULL\n        AND "lastConfirmedResourceVersion" IS NULL');
    expect(schema).toContain("${table.lastConfirmedReleaseId} is null");
    expect(schema.match(/onDelete: "set null"/gu)).toHaveLength(3);
  });

  it("ON CONFLICT idempotency 뒤 raw publisher/package/kind를 fail-closed 비교한다", () => {
    const conflict = repository.indexOf(".onConflictDoNothing({");
    const lockedRead = repository.indexOf('.for("update")', conflict);
    const rawValidation = repository.indexOf("assertRawPackageIdentity", lockedRead);
    expect(conflict).toBeGreaterThan(-1);
    expect(lockedRead).toBeGreaterThan(conflict);
    expect(rawValidation).toBeGreaterThan(lockedRead);
    expect(repository).toContain("row.publisherId !== release.publisherId");
    expect(repository).toContain("row.packageId !== release.packageId");
    expect(repository).toContain("row.kind !== release.kind");
    expect(migration).toContain(
      "creator_marketplace_library_package_identity_integrity",
    );
  });

  it("acquire/confirm은 package lock을 account/library row보다 먼저 잡고 historical acquire를 거절한다", () => {
    const acquire = repository.slice(
      repository.indexOf("async acquire"),
      repository.indexOf("async confirmStudioInstall"),
    );
    const confirm = repository.slice(
      repository.indexOf("async confirmStudioInstall"),
      repository.indexOf("async setArchived"),
    );
    for (const mutation of [acquire, confirm]) {
      expect(mutation.indexOf("pg_advisory_xact_lock")).toBeGreaterThan(-1);
      expect(mutation.indexOf("pg_advisory_xact_lock")).toBeLessThan(
        mutation.indexOf('.for("update")'),
      );
    }
    expect(acquire).toContain(
      ".orderBy(desc(creatorMarketplaceResources.releaseOrdinal))",
    );
    expect(acquire).toContain("release.id !== releaseId");
    expect(acquire).toContain('AcquisitionRejectedError("superseded")');
    expect(acquire).toContain(".orderBy(asc(users.id))");
    expect(acquire.indexOf(".orderBy(asc(users.id))")).toBeLessThan(
      acquire.indexOf('.for("update")', acquire.indexOf("lockedAccounts")),
    );
    expect(migration).toContain(
      'IF NEW."lastConfirmedReleaseOrdinal" IS NULL AND NOT EXISTS',
    );
    expect(migration).toContain(
      "creator_marketplace_library_acquisition_current_head",
    );
    expect(migration).toContain(
      'WHERE account."id" = NEW."userId" OR account."id" = NEW."publisherId"',
    );
    expect(migration).toContain('ORDER BY account."id"\n    FOR UPDATE');
  });

  it("confirmation은 archive를 변경하지 않고 absolute head를 lifecycle 포함 조회한다", () => {
    const confirmation = repository.slice(
      repository.indexOf("async confirmStudioInstall"),
      repository.indexOf("async setArchived"),
    );
    expect(confirmation).not.toContain("archivedAt:");
    expect(repository).toContain(".selectDistinctOn(");
    const headQuery = repository.slice(repository.indexOf(".selectDistinctOn("));
    expect(headQuery).not.toContain("eq(creatorMarketplaceResources.hidden, false)");
    expect(headQuery).not.toContain("isNull(creatorMarketplaceResources.delistedAt)");
  });

  it("confirmation은 exact release·absolute head·publisher 가용성을 잠근 뒤 exact replay만 보존한다", () => {
    const confirmation = repository.slice(
      repository.indexOf("async confirmStudioInstall"),
      repository.indexOf("async setArchived"),
    );
    expect(confirmation).toContain("eq(users.id, anchor.publisherId)");
    expect(confirmation).toContain(".orderBy(asc(users.id))");
    expect(confirmation).toContain("publisher?.status !== \"active\"");
    expect(confirmation).toContain(
      "release.delistedAt !== null || head.delistedAt !== null",
    );
    expect(confirmation).toContain(
      "stored.lastConfirmedReleaseOrdinal === release.releaseOrdinal",
    );
    expect(confirmation).toContain(
      "stored.lastConfirmedManifestHash === release.manifestHash",
    );
    expect(packageModerationMigration).toContain(
      "creator marketplace library membership requires an active publisher",
    );
    expect(packageModerationMigration).toContain(
      "creator marketplace library membership requires a listed package head",
    );
    expect(packageModerationMigration).toContain('release."delistedAt" IS NULL');
    expect(packageModerationMigration).toContain("exact_release_listed");
    expect(packageModerationMigration).toContain("publisher_status IS DISTINCT FROM 'active'");
  });

  it("acquisition preflight keeps exact release delist separate from the absolute head", () => {
    const target = repository.slice(
      repository.indexOf("async resolveAcquisitionTarget"),
      repository.indexOf("async acquire"),
    );
    expect(target).toContain(
      "requestReleaseDelistedAt: creatorMarketplaceResources.delistedAt",
    );
    expect(target).toContain("currentHeadDelistedAt: head.delistedAt");
    expect(target).toContain("publisherStatus: users.status");
  });

  it("private ACL과 soft/hard account deletion cleanup을 고정한다", () => {
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public."creator_marketplace_library_item" FROM PUBLIC',
    );
    expect(migration).toContain(
      "cleanup_creator_marketplace_library_on_user_delete",
    );
    expect(migration).toContain(
      "cleanup_creator_marketplace_library_on_user_delete()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = pg_catalog, public",
    );
    expect(migration).toContain('WHERE "userId" = NEW."id"');
    expect(migration).toContain(
      '"userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      'IF NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt" THEN',
    );
    expect(migration).toContain("FK SET NULL pointer cleanup must remain possible");
    expect(migration).toContain('NEW."addedAt" := statement_timestamp()');
  });
});
