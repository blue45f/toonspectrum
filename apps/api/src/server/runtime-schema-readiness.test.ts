import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  rows: [] as Record<string, unknown>[],
}));

vi.mock("../db", async (importOriginal) => ({
  ...await importOriginal<typeof import("../db")>(),
  dbClient: { execute: doubles.execute },
  db: { select: doubles.select },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("WEBDEX_CATALOG_FORCE_DB", "0");
  doubles.rows = [];
  doubles.execute.mockImplementation(async (query: string | { sql: string }) => {
    const text = typeof query === "string" ? query : query.sql;
    if (/\b(?:CREATE|ALTER|DROP)\b/iu.test(text)) {
      throw new Error("permission denied for schema public");
    }
    return { rows: [] };
  });
  doubles.select.mockImplementation(() => {
    const selection = {
      from: () => selection,
      where: () => selection,
      orderBy: () => selection,
      limit: async () => doubles.rows,
    };
    return selection;
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("runtime readiness with a migrated DML-only database", () => {
  it("loads saved application settings without requiring schema ownership", async () => {
    doubles.rows = [{ value: { showCovers: false, showSynopsis: false } }];
    const { getAppConfig } = await import("./app-config");
    await expect(getAppConfig()).resolves.toMatchObject({ showCovers: false, showSynopsis: false });
    expect(doubles.select).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent settings initialization and retries after database recovery", async () => {
    const { getAppConfig } = await import("./app-config");
    doubles.execute.mockRejectedValueOnce(new Error("connection unavailable"));
    await getAppConfig();
    expect(doubles.select).not.toHaveBeenCalled();
    doubles.rows = [{ value: { showPricing: false } }];
    const configs = await Promise.all([getAppConfig(), getAppConfig(), getAppConfig()]);
    expect(configs.every((config) => config.showPricing === false)).toBe(true);
    expect(doubles.execute).toHaveBeenCalledTimes(2);
    await getAppConfig();
    expect(doubles.execute).toHaveBeenCalledTimes(2);
  });

  it("accepts the existing community schema without running DDL", async () => {
    const { ensureCommunityTables } = await import("./community");
    await expect(ensureCommunityTables()).resolves.toBeUndefined();
    const queries = doubles.execute.mock.calls.map(([query]) => String(query));
    for (const table of ["review_reply", "fan_post", "fan_post_reply", "community_cafe", "community_cafe_member"]) {
      expect(queries.some((query) => query.includes(`FROM "${table}"`) && /WHERE FALSE/u.test(query))).toBe(true);
    }
  });

  it("shares community initialization and does not cache missing-column failures", async () => {
    const { ensureCommunityTables } = await import("./community");
    const missingColumn = new Error('column "deletedAt" does not exist');
    doubles.execute.mockRejectedValueOnce(missingColumn);
    const first = await Promise.allSettled([ensureCommunityTables(), ensureCommunityTables()]);
    expect(first).toEqual([{ status: "rejected", reason: missingColumn }, { status: "rejected", reason: missingColumn }]);
    expect(doubles.execute).toHaveBeenCalledOnce();
    await expect(ensureCommunityTables()).resolves.toBeUndefined();
    const completedCount = doubles.execute.mock.calls.length;
    await ensureCommunityTables();
    expect(doubles.execute).toHaveBeenCalledTimes(completedCount);
  });

  it("checks ingest history in file mode without loading the legacy snapshot table", async () => {
    const { ensureCatalogIngestSchema } = await import("./catalog-ingest");
    await expect(ensureCatalogIngestSchema()).resolves.toBeUndefined();
    expect(doubles.execute).toHaveBeenCalledOnce();
    expect(doubles.execute.mock.calls[0]?.[0]).toContain('FROM "catalog_ingest_run"');
  });

  it("validates both catalog tables in explicit database mode", async () => {
    vi.stubEnv("WEBDEX_CATALOG_FORCE_DB", "1");
    const { ensureCatalogIngestSchema } = await import("./catalog-ingest");
    await expect(ensureCatalogIngestSchema()).resolves.toBeUndefined();
    expect(doubles.execute).toHaveBeenCalledTimes(2);
    expect(doubles.execute.mock.calls[1]?.[0]).toContain('FROM "catalog_snapshot"');
  });

  it("retries failed catalog checks while retaining a successful history check", async () => {
    vi.stubEnv("WEBDEX_CATALOG_FORCE_DB", "1");
    const { ensureCatalogIngestSchema } = await import("./catalog-ingest");
    doubles.execute.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("snapshot unavailable"));
    await expect(ensureCatalogIngestSchema()).rejects.toThrow("snapshot unavailable");
    await Promise.all([ensureCatalogIngestSchema(), ensureCatalogIngestSchema()]);
    expect(doubles.execute).toHaveBeenCalledTimes(3);
  });

  it("reads the real legacy snapshot identity through a non-owner connection", async () => {
    doubles.rows = [{ id: "snapshot-from-migrated-database" }];
    const { getCurrentSnapshotIdFromDb } = await import("./catalog-ingest");
    await expect(getCurrentSnapshotIdFromDb()).resolves.toBe("snapshot-from-migrated-database");
    expect(doubles.execute).toHaveBeenCalledOnce();
  });
});
