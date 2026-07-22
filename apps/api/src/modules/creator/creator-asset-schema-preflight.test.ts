import { describe, expect, it, vi } from "vitest";

import {
  CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS,
  CREATOR_ASSET_REPORT_CANONICAL_CHECK_DEFINITIONS,
  CREATOR_ASSET_SCHEMA_PREFLIGHT,
  creatorAssetSchemaPreflightProvider,
  preflightCreatorAssetSchema,
} from "./creator-asset-schema-preflight";

function completeSchema(overrides: Record<string, unknown> = {}) {
  return {
    assetTable: "creator_asset",
    reportTable: "creator_asset_report",
    assetColumnCount: 30,
    reportColumnCount: 10,
    assetConstraintCount: 10,
    reportConstraintCount: 3,
    assetCheckDefinitions: { ...CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS },
    reportCheckDefinitions: { ...CREATOR_ASSET_REPORT_CANONICAL_CHECK_DEFINITIONS },
    validIndexCount: 8,
    ownerHashUnique: true,
    assetDefaults: {
      description: "''::text",
      tags: "'[]'::jsonb",
      kind: "'image'::text",
      license: "'toonspectrum-standard'::text",
      attributionText: "''::text",
      containsAi: "false",
      moderationStatus: "'under_review'::text",
      moderationNote: "''::text",
      reportCount: "0",
      hidden: "false",
      downloads: "0",
    },
    reportDefaults: {
      details: "''::text",
      status: "'open'::text",
      resolutionNote: "''::text",
      createdAt: "CURRENT_TIMESTAMP",
    },
    moderationDefault: "'under_review'::text",
    reportStatusDefault: "'open'::text",
    assetPrimaryKeyReady: true,
    reportPrimaryKeyReady: true,
    assetOwnerCascadeReady: true,
    reportAssetCascadeReady: true,
    reportReporterCascadeReady: true,
    ...overrides,
  };
}

describe("Creator Asset schema preflight", () => {
  it("accepts a fully migrated schema with no unsafe legacy publication", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [completeSchema()] })
      .mockResolvedValueOnce({ rows: [{ unsafe: false }] });

    await expect(preflightCreatorAssetSchema({ query } as never)).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toEqual([
      expect.arrayContaining(["rightsConfirmedAt", "moderationStatus", "previewDataUrl"]),
      expect.arrayContaining(["assetId", "reporterId", "status"]),
      expect.arrayContaining(["creator_asset_published_rights_check"]),
      expect.arrayContaining(["creator_asset_report_asset_reporter_unique"]),
      expect.arrayContaining(["creator_asset_owner_hash_unique"]),
      expect.arrayContaining([
        "creator_asset_report_asset_reporter_unique",
        "idx_creator_asset_report_queue",
      ]),
    ]);
    expect(query.mock.calls[0]?.[0].match(/constraint_record\.conkey/gu)?.length).toBeGreaterThanOrEqual(5);
    expect(query.mock.calls[0]?.[0].match(/constraint_record\.confkey/gu)).toHaveLength(3);
    expect(query.mock.calls[0]?.[0]).toContain("constraint_record.contype = 'c'");
    expect(query.mock.calls[0]?.[0]).toContain("expected_constraint.column_names");
    expect(query.mock.calls[0]?.[0]).toContain("index_record.indkey::smallint[]");
    expect(query.mock.calls[0]?.[0]).toContain("index_record.indoption::smallint[]");
    expect(query.mock.calls[0]?.[0]).toContain("index_record.indnkeyatts");
    expect(query.mock.calls[0]?.[0]).toContain("index_record.indnatts");
    expect(query.mock.calls[0]?.[0]).toContain("index_record.indnullsnotdistinct");
    expect(query.mock.calls[0]?.[0]).toContain("access_method.amname = 'btree'");
    expect(query.mock.calls[0]?.[0]).toContain("contenthashisnotnull");
    expect(query.mock.calls[0]?.[0]).toContain("pg_get_constraintdef(constraint_record.oid, true)");
    expect(query.mock.calls[0]?.[0]).not.toMatch(/pg_get_constraintdef[^\n]*LIKE/iu);
    expect(query.mock.calls[1]?.[0]).toContain('"rightsConfirmedAt" IS NULL');
  });

  it.each([
    ["asset table", { assetTable: null }],
    ["report table", { reportTable: null }],
    ["asset columns", { assetColumnCount: 29 }],
    ["report columns", { reportColumnCount: 9 }],
    ["asset constraints", { assetConstraintCount: 9 }],
    ["report constraints", { reportConstraintCount: 2 }],
    ["asset check definitions", { assetCheckDefinitions: {} }],
    ["report check definitions", { reportCheckDefinitions: {} }],
    ["indexes", { validIndexCount: 7 }],
    ["owner hash uniqueness", { ownerHashUnique: false }],
    ["asset defaults", { assetDefaults: {} }],
    ["report defaults", { reportDefaults: {} }],
    ["moderation default", { moderationDefault: "'published'::text" }],
    ["report status default", { reportStatusDefault: null }],
    ["asset primary key", { assetPrimaryKeyReady: false }],
    ["report primary key", { reportPrimaryKeyReady: false }],
    ["asset owner cascade", { assetOwnerCascadeReady: false }],
    ["report asset cascade", { reportAssetCascadeReady: false }],
    ["report reporter cascade", { reportReporterCascadeReady: false }],
  ])("fails closed when the %s contract is incomplete", async (_case, override) => {
    const query = vi.fn().mockResolvedValue({ rows: [completeSchema(override)] });

    await expect(preflightCreatorAssetSchema({ query } as never)).rejects.toThrow(
      /apply migration 0013_creator_asset_marketplace\.sql/u
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "OR true",
      {
        ...CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS,
        creator_asset_license_check: `${CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS.creator_asset_license_check} OR true`,
      },
    ],
    [
      "OR 1=1",
      {
        ...CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS,
        creator_asset_report_count_check: "CHECK (\"reportCount\" >= 0 OR 1 = 1)",
      },
    ],
    [
      "wider range",
      {
        ...CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS,
        creator_asset_byte_size_check: "CHECK (\"byteSize\" IS NULL OR (\"byteSize\" >= 1 AND \"byteSize\" <= 9999999))",
      },
    ],
    [
      "unsafe integer multiplication",
      {
        ...CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS,
        creator_asset_dimensions_check:
          CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS.creator_asset_dimensions_check?.replaceAll(
            "::bigint",
            "::integer"
          ),
      },
    ],
  ])("rejects a structurally present same-name asset CHECK weakened with %s", async (_case, definitions) => {
    const query = vi.fn().mockResolvedValue({
      rows: [completeSchema({ assetCheckDefinitions: definitions })],
    });

    await expect(preflightCreatorAssetSchema({ query } as never)).rejects.toThrow(
      /0013_creator_asset_marketplace\.sql/u
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it("rejects legacy published rows that have no explicit rights confirmation", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [completeSchema()] })
      .mockResolvedValueOnce({ rows: [{ unsafe: true }] });

    await expect(preflightCreatorAssetSchema({ query } as never)).rejects.toThrow(
      /rights quarantine is incomplete/u
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the rights audit returns no result", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [completeSchema()] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(preflightCreatorAssetSchema({ query } as never)).rejects.toThrow(
      /rights quarantine is incomplete/u
    );
  });

  it("exports an eager Nest provider token for CreatorModule boot", () => {
    expect(creatorAssetSchemaPreflightProvider.provide).toBe(CREATOR_ASSET_SCHEMA_PREFLIGHT);
    expect(creatorAssetSchemaPreflightProvider.useFactory).toEqual(expect.any(Function));
  });
});
