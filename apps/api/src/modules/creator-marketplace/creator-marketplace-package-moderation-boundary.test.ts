import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  creatorMarketplacePackageModeration,
  creatorMarketplacePackageModerationDecisions,
} from "../../db/creator-marketplace-package-moderation.schema";

const migration = readFileSync(
  new URL(
    "../../db/migrations/0034_creator_marketplace_package_moderation.sql",
    import.meta.url,
  ),
  "utf8",
);
const resourceRepository = readFileSync(
  new URL("./creator-marketplace.repository.ts", import.meta.url),
  "utf8",
);
const libraryRepository = readFileSync(
  new URL("./creator-marketplace-library.repository.ts", import.meta.url),
  "utf8",
);

describe("creator marketplace package moderation cutover", () => {
  it("models one state row and append-only package decisions", () => {
    const state = getTableConfig(creatorMarketplacePackageModeration);
    const decisions = getTableConfig(creatorMarketplacePackageModerationDecisions);

    expect(state.name).toBe("creator_marketplace_package_moderation");
    expect(state.columns.map((column) => column.name)).toEqual([
      "publisherId",
      "packageId",
      "state",
      "revision",
      "currentDecisionId",
      "hiddenAt",
      "updatedAt",
    ]);
    expect(state.primaryKeys).toHaveLength(1);
    expect(decisions.columns.map((column) => column.name)).toEqual([
      "id",
      "publisherIdSnapshot",
      "packageIdSnapshot",
      "revision",
      "action",
      "actorKind",
      "reviewerId",
      "note",
      "sourceResourceSnapshotId",
      "sourceReportId",
      "createdAt",
    ]);
    expect(migration).toContain("package moderation decisions are append-only");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).toContain(
      "creator_marketplace_package_moderation_decision_coupling",
    );
  });

  it("allows reviewer/source FK cleanup without revalidating an old decision as current", () => {
    const decisionConstraint = migration.slice(
      migration.indexOf(
        "CREATE CONSTRAINT TRIGGER creator_marketplace_package_decision_coupling_from_decision",
      ),
      migration.indexOf(
        "CREATE CONSTRAINT TRIGGER creator_marketplace_package_decision_coupling_from_state",
      ),
    );
    expect(decisionConstraint).toContain(
      'AFTER INSERT ON public."creator_marketplace_package_moderation_decision"',
    );
    expect(decisionConstraint).not.toContain("OR UPDATE");
    expect(migration).toContain(
      'OLD."reviewerId" IS NOT NULL AND NEW."reviewerId" IS NULL',
    );
    expect(migration).toContain(
      'OLD."sourceReportId" IS NOT NULL AND NEW."sourceReportId" IS NULL',
    );
    expect(migration).toContain(
      "creator_marketplace_package_moderation_decision_reviewer_required",
    );
  });

  it("keeps v1/v2 evidence bytes and scopes v3 uniqueness to revision plus head epoch", () => {
    const reportBackfill = migration.slice(
      migration.indexOf('ALTER TABLE public."creator_marketplace_resource_report"'),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_report_immutability",
      ),
    );
    expect(reportBackfill).not.toMatch(/SET\s+"evidence"/iu);
    expect(reportBackfill).toContain(
      "creator_marketplace_resource_report_release_reporter_v1_unique",
    );
    expect(reportBackfill).toContain(
      "creator_marketplace_resource_report_package_reporter_v2_unique",
    );
    expect(reportBackfill).toContain(
      "creator_marketplace_resource_report_package_epoch_reporter_v3_unique",
    );
    expect(reportBackfill).toContain('"packageModerationRevision"');
    expect(reportBackfill).toContain('"packageReportEpoch"');
    expect(reportBackfill).toContain(
      `WHERE "evidence"->>'schemaVersion' = '2'`,
    );
    expect(reportBackfill).toContain(
      `WHERE "evidence"->>'schemaVersion' = '3'`,
    );
    const v3IndexStart = reportBackfill.indexOf(
      'CREATE UNIQUE INDEX "creator_marketplace_resource_report_package_epoch_reporter_v3_unique"',
    );
    const v3Index = reportBackfill.slice(
      v3IndexStart,
      reportBackfill.indexOf(
        'ALTER TABLE public."creator_marketplace_resource_report"\n  DROP CONSTRAINT',
        v3IndexStart,
      ),
    );
    expect(v3Index).toContain('"packageModerationRevision"');
    expect(v3Index).toContain('"packageReportEpoch"');
    expect(migration).toContain(
      "new creator marketplace reports require package epoch evidence v3",
    );
    expect(migration).toContain(
      'package_report_epoch IS DISTINCT FROM NEW."packageReportEpoch"',
    );
  });

  it("removes release.hidden from every runtime authority and locks package first", () => {
    expect(resourceRepository).not.toContain("creatorMarketplaceResources.hidden");
    for (const method of [
      "async publish(",
      "async report(",
      "async moderate(",
      "async deleteOwned(",
      "async relistOwned(",
    ]) {
      const start = resourceRepository.indexOf(method);
      expect(start).toBeGreaterThan(-1);
      const next = resourceRepository.indexOf("\n  async ", start + method.length);
      const source = resourceRepository.slice(start, next < 0 ? undefined : next);
      expect(source).toContain("creatorMarketplaceReleaseLockKey(");
      expect(source).toContain("creatorMarketplacePackageModeration");
    }
    expect(migration).toContain("creator_marketplace_resource_hidden_legacy");
    expect(migration).toContain(
      'CREATE INDEX "idx_creator_marketplace_resource_search"',
    );
    expect(migration).toContain('WHERE "delistedAt" IS NULL');
    expect(migration).not.toContain(
      'WHERE "hidden" = false AND "delistedAt" IS NULL',
    );
  });

  it("uses package state for cloud availability and blocks hidden acquire/advance", () => {
    expect(libraryRepository).not.toContain("creatorMarketplaceResources.hidden");
    expect(libraryRepository).toContain("creatorMarketplacePackageModeration.state");
    expect(libraryRepository).toContain('moderation.state !== "active"');
    expect(libraryRepository).toContain('moderation.state === "hidden"');
    expect(migration).toContain("enforce_creator_marketplace_library_insert");
    expect(migration).toContain(
      "enforce_creator_marketplace_library_package_update",
    );
    expect(migration).toContain("creator_marketplace_library_package_moderated");
    expect(migration).not.toContain('release."hidden" = false');
  });
});
