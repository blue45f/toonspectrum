import { readFileSync } from "node:fs";

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
    expect(catalogQuery).toContain(
      ") = 'hidden = false'",
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
    expect(catalogQuery).toContain("SELECT, INSERT, UPDATE, DELETE");
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

  it.each([
    "authUserColumnsReady",
    "authUserConstraintsReady",
    "authUserStatusIndexReady",
    "authAccountColumnsReady",
    "authAccountConstraintsReady",
    "authAccountUserIndexReady",
    "authRuntimeDmlReady",
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
        "socket_io_attachments",
      ]),
    );
  });

  it("tracks every relation declared across the current Drizzle schema", () => {
    const schemaFiles = [
      "../../../../../lib/db/schema.ts",
      "../../../../../lib/db/creator-asset-object-storage.schema.ts",
      "../../../../../lib/db/creator-marketplace-resource.schema.ts",
      "../../../../../lib/db/studio-crdt-raster-checkpoint.schema.ts",
      "../../../../../lib/db/studio-raster-asset.schema.ts",
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
