import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  creatorMarketplaceResourceReportGates,
  creatorMarketplaceResourceReports,
} from "../../db/creator-marketplace-report.schema";

const repositorySource = readFileSync(
  new URL("./creator-marketplace.repository.ts", import.meta.url),
  "utf8"
);
const controllerSource = readFileSync(
  new URL("./creator-marketplace.controller.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../../db/migrations/0031_creator_marketplace_moderation.sql",
    import.meta.url
  ),
  "utf8"
);
const packageMigration = readFileSync(
  new URL(
    "../../db/migrations/0034_creator_marketplace_package_moderation.sql",
    import.meta.url
  ),
  "utf8"
);

describe("Creator Marketplace moderation persistence boundary", () => {
  it("stores constrained immutable evidence with release/reporter uniqueness", () => {
    const reportTable = getTableConfig(creatorMarketplaceResourceReports);

    expect(reportTable.name).toBe("creator_marketplace_resource_report");
    expect(reportTable.columns.map((column) => column.name)).toEqual([
      "id",
      "resourceId",
      "resourceSnapshotId",
      "packagePublisherIdSnapshot",
      "packageIdSnapshot",
      "packageModerationRevision",
      "packageReportEpoch",
      "reporterId",
      "reporterKeyHash",
      "reason",
      "details",
      "evidence",
      "status",
      "resolutionNote",
      "reviewedBy",
      "reviewedAt",
      "createdAt",
    ]);
    expect(reportTable.indexes.map((entry) => entry.config.name)).toEqual(
      expect.arrayContaining([
        "creator_marketplace_resource_report_release_reporter_v1_unique",
        "creator_marketplace_resource_report_package_reporter_v2_unique",
        "creator_marketplace_resource_report_package_epoch_reporter_v3_unique",
      ])
    );
    expect(reportTable.checks.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "creator_marketplace_resource_report_reason_check",
        "creator_marketplace_resource_report_status_check",
        "creator_marketplace_resource_report_evidence_check",
        "creator_marketplace_resource_report_resolution_state_check",
      ])
    );
    expect(migration).toContain("creator marketplace report evidence is immutable");
    expect(migration).toContain("creator marketplace moderation reviewer is required");
    expect(migration).toContain(
      "creator_marketplace_resource_report_reviewer_required"
    );
    expect(migration).toContain("creator marketplace moderation decision is immutable");
    expect(migration).toContain("ON DELETE SET NULL");
  });

  it("uses a digest-only daily database admission gate with bounded cleanup", () => {
    const gateTable = getTableConfig(creatorMarketplaceResourceReportGates);

    expect(gateTable.name).toBe("creator_marketplace_resource_report_gate");
    expect(gateTable.columns.map((column) => column.name)).toEqual([
      "keyHash",
      "windowStartedAt",
      "requestCount",
      "expiresAt",
      "createdAt",
      "updatedAt",
    ]);
    expect(gateTable.columns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(["reporterId", "userId", "ipAddress"])
    );
    expect(repositorySource).toContain('date_bin(\n              interval \'1 day\'');
    expect(repositorySource).toContain('ON CONFLICT ("keyHash") DO UPDATE');
    expect(repositorySource).toContain('"requestCount"');
    expect(repositorySource).toContain("FOR UPDATE SKIP LOCKED");
    expect(repositorySource).not.toContain("toonspectrum:creator-marketplace:report:v1");
  });

  it("serializes report, moderation, and owner-delisting on package authority first", () => {
    const reportStart = repositorySource.indexOf("async report(");
    const moderationStart = repositorySource.indexOf("async moderate(");
    const deletionStart = repositorySource.indexOf("async deleteOwned(");
    const relistStart = repositorySource.indexOf("async relistOwned(");
    const reportSource = repositorySource.slice(reportStart, moderationStart);
    const moderationSource = repositorySource.slice(moderationStart, deletionStart);
    const deletionSource = repositorySource.slice(deletionStart, relistStart);

    expect(reportSource).toContain('.for("update")');
    expect(reportSource.indexOf('.for("update")')).toBeLessThan(
      reportSource.indexOf("creator_marketplace_resource_report_gate")
    );
    expect(reportSource.indexOf('.for("update")')).toBeLessThan(
      reportSource.indexOf(".insert(creatorMarketplaceResourceReports)")
    );
    expect(reportSource).toContain("reportEpoch: creatorMarketplaceResources.releaseOrdinal");
    expect(reportSource).toContain("packageReportEpoch: currentHead.reportEpoch");
    expect(reportSource.indexOf("packageReportEpoch: currentHead.reportEpoch")).toBeLessThan(
      reportSource.indexOf(".insert(creatorMarketplaceResourceReports)")
    );
    expect(moderationSource).toContain('.for("update")');
    expect(moderationSource).toContain("creatorMarketplaceReleaseLockKey(");
    expect(moderationSource).toContain("creatorMarketplacePackageModerationDecisions");
    expect(moderationSource).toContain("packagePublisherIdSnapshot");
    expect(moderationSource).toContain("const [currentHead]");
    expect(moderationSource).toContain(
      ".orderBy(desc(creatorMarketplaceResources.releaseOrdinal))"
    );
    expect(moderationSource).toContain("delisted: currentHead.delistedAt !== null");
    expect(moderationSource).not.toContain("creatorMarketplaceResources.hidden");
    expect(moderationSource).not.toContain(".set({\n            delistedAt:");
    expect(deletionSource).toContain("delistedAt: sql`clock_timestamp()`");
    expect(deletionSource).not.toContain("hidden:");
    expect(migration).toContain("creator_marketplace_resource_lifecycle_update");
    expect(packageMigration).toContain(
      "creator_marketplace_package_moderation_decision_coupling"
    );
  });

  it("prevents edge caches from serving a release after an admin hide", () => {
    const noStoreHeaders = controllerSource.match(
      /@Header\("Cache-Control", "no-store, max-age=0"\)/gu
    );

    expect(noStoreHeaders).toHaveLength(4);
    expect(controllerSource).not.toContain("stale-while-revalidate");
    expect(repositorySource).toContain(
      'eq(creatorMarketplacePackageModeration.state, "active")'
    );
    expect(repositorySource).not.toContain("creatorMarketplaceResources.hidden");
  });

  it("projects moderation availability from the absolute head and publisher, not the reported row", () => {
    const queueStart = repositorySource.indexOf("async listModeration(");
    const queueEnd = repositorySource.indexOf("async moderate(", queueStart);
    const queueSource = repositorySource.slice(queueStart, queueEnd);

    expect(queueSource).toContain("currentResourceDelistedAt: creatorMarketplaceResources.delistedAt");
    expect(queueSource).toContain('select "moderationHead"."delistedAt"');
    expect(queueSource).toContain('order by "moderationHead"."releaseOrdinal" desc');
    expect(queueSource).toContain(
      "currentPackagePublisherStatus: creatorMarketplacePublishers.status",
    );
    expect(queueSource).toContain("creatorMarketplacePublishers.id");
  });
});
