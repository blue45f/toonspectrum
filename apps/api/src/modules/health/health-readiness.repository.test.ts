import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  HEALTH_READINESS_QUERY_TIMEOUT_MS,
  PostgresHealthReadinessRepository,
  REQUIRED_DATABASE_MIGRATIONS,
  REQUIRED_DATABASE_RELATIONS,
} from "./health-readiness.repository";

function completeSchemaCatalog() {
  return {
    relationNames: [...REQUIRED_DATABASE_RELATIONS],
    authUserColumnsReady: true,
    authUserConstraintsReady: true,
    authUserStatusIndexReady: true,
    authAccountColumnsReady: true,
    authAccountConstraintsReady: true,
    authAccountUserIndexReady: true,
    authRuntimeDmlReady: true,
    marketplaceResourceAclReady: true,
    marketplaceCloudLibraryAclReady: true,
    marketplaceCloudLibraryTriggerReady: true,
    marketplacePackageModerationAclReady: true,
    marketplacePackageModerationTriggerReady: true,
    marketplacePublishGateAclReady: true,
    marketplaceReportAclReady: true,
    marketplaceReportGateAclReady: true,
    marketplaceResourceLifecycleTriggerReady: true,
    marketplaceResourceTimestampPrecisionReady: true,
    marketplaceSearchGenerated: true,
    marketplaceSearchIndexReady: true,
    marketplaceTagIndexReady: true,
    commentActivityReanchorReady: true,
    commentMutationReanchorReady: true,
    commentMutationMessageNullable: true,
    trigramExtensionReady: true,
  };
}

describe("PostgresHealthReadinessRepository", () => {
  it("uses a bounded SELECT 1 database probe", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ready: 1 }] });
    const repository = new PostgresHealthReadinessRepository({ query } as never);

    await expect(repository.isDatabaseReachable()).resolves.toBe(true);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toMatchObject({
      query_timeout: HEALTH_READINESS_QUERY_TIMEOUT_MS,
      text: expect.stringMatching(/SELECT 1::integer AS "ready"/u),
    });
  });

  it("requires every product relation, structural cutover, and migration marker", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [completeSchemaCatalog()] })
      .mockResolvedValueOnce({
        rows: [{ migrationIds: [...REQUIRED_DATABASE_MIGRATIONS] }],
      });
    const repository = new PostgresHealthReadinessRepository({ query } as never);

    await expect(repository.isSchemaReady()).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toMatchObject({
      query_timeout: HEALTH_READINESS_QUERY_TIMEOUT_MS,
      text: expect.stringContaining("relation.relname::text"),
      values: [[...REQUIRED_DATABASE_RELATIONS]],
    });
    const catalogQuery = String(query.mock.calls[0]?.[0]?.text);
    expect(catalogQuery).toContain(
      "to_regclass('public.creator_marketplace_resource')",
    );
    expect(catalogQuery).toContain(
      "index_namespace.nspname = 'public'",
    );
    expect(catalogQuery).toContain(
      "table_namespace.nspname = 'public'",
    );
    expect(catalogQuery).toContain(
      "index_method.amname = 'gin'",
    );
    expect(catalogQuery).toContain(
      "operator_class.opcname = 'gin_trgm_ops'",
    );
    expect(catalogQuery).toContain(
      "operator_class.opcname = 'jsonb_path_ops'",
    );
    expect(catalogQuery).toContain(
      "indexed_attribute.attname = 'searchText'",
    );
    expect(catalogQuery).toContain(
      "indexed_attribute.attname = 'tags'",
    );
    expect(catalogQuery).not.toContain("creator_work_series_idx");
    expect(catalogQuery).not.toContain("creator_work_challenge_idx");
    expect(catalogQuery).not.toContain("creator_series_user_idx");
    expect(catalogQuery).toContain(
      ") = '\"delistedAt\" IS NULL'",
    );
    expect(catalogQuery).toContain(
      "owning_extension.extname = 'pg_trgm'",
    );
    expect(catalogQuery).toContain("to_regclass('public.\"user\"')");
    expect(catalogQuery).toContain("to_regclass('public.account')");
    expect(catalogQuery).toContain("idx_user_status_created");
    expect(catalogQuery).toContain("idx_account_user");
    expect(catalogQuery).toContain("user_status_check");
    expect(catalogQuery).toContain("user_session_version_check");
    expect(catalogQuery).toContain("authRuntimeDmlReady");
    expect(catalogQuery).toContain("marketplaceResourceAclReady");
    expect(catalogQuery).toContain("marketplaceCloudLibraryAclReady");
    expect(catalogQuery).toContain("marketplaceCloudLibraryTriggerReady");
    expect(catalogQuery).toContain("marketplacePackageModerationAclReady");
    expect(catalogQuery).toContain("marketplacePackageModerationTriggerReady");
    expect(catalogQuery).toContain("marketplacePublishGateAclReady");
    expect(catalogQuery).toContain("marketplaceReportAclReady");
    expect(catalogQuery).toContain("marketplaceReportGateAclReady");
    expect(catalogQuery).toContain(
      "marketplaceResourceLifecycleTriggerReady",
    );
    expect(catalogQuery).toContain(
      "marketplaceResourceTimestampPrecisionReady",
    );
    expect(catalogQuery).toContain("timestamp(3) with time zone");
    expect(catalogQuery).toContain(
      "creator_marketplace_resource_relist_non_head",
    );
    expect(catalogQuery).toContain(
      "creator_marketplace_resource_delist_non_head",
    );
    expect(catalogQuery).toContain(
      "creator_marketplace_resource_lifecycle_timestamp_required",
    );
    expect(catalogQuery).toContain(
      "creator_marketplace_package_moderated",
    );
    expect(catalogQuery).toContain("packageReportEpoch");
    expect(catalogQuery).toContain(
      "creator_marketplace_resource_report_package_epoch_reporter_v3_unique",
    );
    expect(catalogQuery).toContain("package_report_epoch");
    expect(catalogQuery).toContain(
      "creator_marketplace_library_package_available",
    );
    expect(catalogQuery).toContain("exact_release_listed");
    expect(catalogQuery).toContain("public.creator_marketplace_resource");
    expect(catalogQuery).toContain("public.creator_marketplace_publish_gate");
    expect(catalogQuery).toContain("SELECT, INSERT, UPDATE, DELETE");
    expect(catalogQuery).toContain("has_any_column_privilege");
    expect(catalogQuery).toContain("WITH GRANT OPTION");
    expect(catalogQuery).toContain("0::oid");
    expect(catalogQuery).toContain("public_column_privilege");
    expect(catalogQuery).toContain("public_table_privilege");
    expect(query.mock.calls[1]?.[0]).toMatchObject({
      query_timeout: HEALTH_READINESS_QUERY_TIMEOUT_MS,
      values: [[...REQUIRED_DATABASE_MIGRATIONS]],
    });
  });

  it("fails closed before the ledger query when one relation is absent", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          ...completeSchemaCatalog(),
          relationNames: REQUIRED_DATABASE_RELATIONS.slice(1),
        },
      ],
    });
    const repository = new PostgresHealthReadinessRepository({ query } as never);

    await expect(repository.isSchemaReady()).resolves.toBe(false);
    expect(query).toHaveBeenCalledOnce();
  });

  it("requires a valid ready v3 report index with exact ordered keys and predicate", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        ...completeSchemaCatalog(),
        marketplacePackageModerationTriggerReady: false,
      }],
    });
    const repository = new PostgresHealthReadinessRepository({ query } as never);

    await expect(repository.isSchemaReady()).resolves.toBe(false);
    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0]?.text);
    const boundaryStart = sql.indexOf(
      "FROM pg_catalog.pg_class AS report_epoch_index",
    );
    const boundaryEnd = sql.indexOf(
      "FROM pg_catalog.pg_trigger AS report_insert_trigger",
      boundaryStart,
    );
    expect(boundaryStart).toBeGreaterThan(-1);
    expect(boundaryEnd).toBeGreaterThan(boundaryStart);
    const boundary = sql.slice(boundaryStart, boundaryEnd);
    const compactBoundary = boundary.replace(/\s+/gu, " ");

    expect(compactBoundary).toContain(
      "report_epoch_index_definition.indisvalid",
    );
    expect(compactBoundary).toContain(
      "pg_catalog.current_setting('max_identifier_length')::integer",
    );
    expect(compactBoundary).toContain(
      "report_epoch_index_definition.indisready",
    );
    expect(compactBoundary).toContain(
      "report_epoch_index_definition.indnkeyatts = 5",
    );
    expect(compactBoundary).toContain(
      "report_epoch_index_definition.indnatts = 5",
    );
    expect(compactBoundary).toContain(
      "report_epoch_index_definition.indexprs IS NULL",
    );
    expect(compactBoundary).toContain(
      ") = ARRAY[ 'packagePublisherIdSnapshot', 'packageIdSnapshot', " +
        "'packageModerationRevision', 'packageReportEpoch', 'reporterKeyHash' ]::text[]",
    );
    expect(compactBoundary).toContain(
      "report_epoch_index_definition.indrelid, true ) = " +
        "'(evidence ->> ''schemaVersion''::text) = ''3''::text'",
    );
    expect(boundary).not.toContain("pg_get_indexdef");
    expect(boundary).not.toContain("LIKE '%schemaVersion%3%'");
  });

  it.each([
    "authUserColumnsReady",
    "authUserConstraintsReady",
    "authUserStatusIndexReady",
    "authAccountColumnsReady",
    "authAccountConstraintsReady",
    "authAccountUserIndexReady",
    "authRuntimeDmlReady",
    "marketplaceResourceAclReady",
    "marketplaceCloudLibraryAclReady",
    "marketplaceCloudLibraryTriggerReady",
    "marketplacePackageModerationAclReady",
    "marketplacePackageModerationTriggerReady",
    "marketplacePublishGateAclReady",
    "marketplaceReportAclReady",
    "marketplaceReportGateAclReady",
    "marketplaceResourceLifecycleTriggerReady",
    "marketplaceResourceTimestampPrecisionReady",
    "marketplaceSearchGenerated",
    "marketplaceSearchIndexReady",
    "marketplaceTagIndexReady",
    "commentActivityReanchorReady",
    "commentMutationReanchorReady",
    "commentMutationMessageNullable",
    "trigramExtensionReady",
  ] as const)("fails closed when %s is missing", async (key) => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ...completeSchemaCatalog(), [key]: false }],
    });
    const repository = new PostgresHealthReadinessRepository({ query } as never);

    await expect(repository.isSchemaReady()).resolves.toBe(false);
    expect(query).toHaveBeenCalledOnce();
  });

  it("fails closed when the durable cutover marker is absent", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [completeSchemaCatalog()] })
      .mockResolvedValueOnce({ rows: [{ migrationIds: [] }] });
    const repository = new PostgresHealthReadinessRepository({ query } as never);

    await expect(repository.isSchemaReady()).resolves.toBe(false);
  });

  it("keeps the required relation inventory unique and deterministic", () => {
    const sorted = [...REQUIRED_DATABASE_RELATIONS].sort();
    expect(REQUIRED_DATABASE_RELATIONS).toEqual(sorted);
    expect(new Set(REQUIRED_DATABASE_RELATIONS).size).toBe(
      REQUIRED_DATABASE_RELATIONS.length,
    );
    expect(REQUIRED_DATABASE_RELATIONS).toEqual(
      expect.arrayContaining([
        "user",
        "creator_work",
        "creator_work_raster_asset",
        "creator_work_crdt_raster_checkpoint_job",
        "creator_work_team_comment_thread",
        "studio_ai_request_gate",
        "creator_marketplace_resource",
        "creator_marketplace_library_item",
        "creator_marketplace_package_moderation",
        "creator_marketplace_package_moderation_decision",
        "creator_marketplace_resource_report",
        "creator_marketplace_resource_report_gate",
        "socket_io_attachments",
      ]),
    );
  });

  it("tracks every relation declared across the current Drizzle schema", () => {
    // db/schema.ts 는 db/schema/ 도메인 모듈들의 배럴이다 — pgTable 선언은 그 디렉터리에 있다.
    const schemaDir = new URL("../../db/schema/", import.meta.url);
    const schemaFiles = [
      ...readdirSync(schemaDir)
        .filter((name) => name.endsWith(".ts"))
        .sort()
        .map((name) => `../../db/schema/${name}`),
      "../../db/creator-asset-object-storage.schema.ts",
      "../../db/creator-marketplace-report.schema.ts",
      "../../db/creator-marketplace-library.schema.ts",
      "../../db/creator-marketplace-package-moderation.schema.ts",
      "../../db/creator-marketplace-resource.schema.ts",
      "../../db/studio-crdt-raster-checkpoint.schema.ts",
      "../../db/studio-raster-asset.schema.ts",
    ];
    const declaredRelations = schemaFiles
      .flatMap((path) => [
        ...readFileSync(new URL(path, import.meta.url), "utf8").matchAll(
          /\bpgTable\(\s*"([^"]+)"/gu,
        ),
      ])
      .map((match) => match[1]!)
      .sort();

    expect(REQUIRED_DATABASE_RELATIONS).toEqual(declaredRelations);
  });
});
