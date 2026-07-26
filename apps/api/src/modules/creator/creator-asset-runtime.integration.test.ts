import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL } from "../../../../../lib/server/creator-asset-image";

import type * as DatabaseRuntime from "../../../../../lib/db";
import type * as CreatorRuntime from "../../../../../lib/server/creator";

const INTEGRATION_URL = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; Creator Asset runtime concurrency cannot be skipped"
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;
const CREATOR_ASSET_SCHEMA_ADVISORY_LOCK = "toonspectrum-schema-repair-0013";
const ADVISORY_LOCK_ACQUIRE_TIMEOUT_MS = 20_000;
const ADVISORY_LOCK_RETRY_INTERVAL_MS = 100;
const POSTGRES_CONNECTION_TIMEOUT_MS = 15_000;
const POSTGRES_STATEMENT_TIMEOUT_MS = 10_000;
const POSTGRES_QUERY_TIMEOUT_MS = 12_000;
const LIFECYCLE_HOOK_TIMEOUT_MS = 60_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireSchemaAdvisoryLock(client: PoolClient): Promise<void> {
  const deadline = Date.now() + ADVISORY_LOCK_ACQUIRE_TIMEOUT_MS;
  do {
    const result = await client.query<{ acquired: boolean }>(
      `SELECT pg_catalog.pg_try_advisory_lock(
         pg_catalog.hashtextextended($1, 0)
       ) AS "acquired"`,
      [CREATOR_ASSET_SCHEMA_ADVISORY_LOCK]
    );
    if (result.rows[0]?.acquired === true) return;

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(ADVISORY_LOCK_RETRY_INTERVAL_MS, remaining));
  } while (Date.now() < deadline);

  throw new Error(
    `Creator Asset schema advisory lock was not acquired within ${ADVISORY_LOCK_ACQUIRE_TIMEOUT_MS}ms`
  );
}

function lifecycleFailure(phase: string, cause: unknown): Error {
  return new Error(`Creator Asset PostgreSQL runtime ${phase} failed`, { cause });
}

describeWithDirectPostgres("Creator Asset PostgreSQL runtime", () => {
  const userIds: string[] = [];
  let creatorRuntime: typeof CreatorRuntime;
  let databaseRuntime: typeof DatabaseRuntime | undefined;
  let observerPool: Pool | undefined;
  let advisoryClient: PoolClient | undefined;
  let advisoryLockAcquired = false;
  let previousDatabaseUrl: string | undefined;
  let databaseUrlOverridden = false;

  beforeAll(async () => {
    if (!INTEGRATION_URL) throw new Error("integration URL was not provided");
    previousDatabaseUrl = process.env.DATABASE_URL;
    databaseUrlOverridden = true;
    try {
      process.env.DATABASE_URL = INTEGRATION_URL;
      observerPool = new Pool({
        application_name: "toonspectrum-creator-asset-runtime-test",
        connectionString: INTEGRATION_URL,
        max: 4,
        connectionTimeoutMillis: POSTGRES_CONNECTION_TIMEOUT_MS,
        statement_timeout: POSTGRES_STATEMENT_TIMEOUT_MS,
        query_timeout: POSTGRES_QUERY_TIMEOUT_MS,
      });
      advisoryClient = await observerPool.connect();
      await acquireSchemaAdvisoryLock(advisoryClient);
      advisoryLockAcquired = true;
      databaseRuntime = await import("../../../../../lib/db");
      creatorRuntime = await import("../../../../../lib/server/creator");
    } catch (setupError) {
      const teardownErrors = await teardownRuntime();
      throw new AggregateError(
        [lifecycleFailure("setup", setupError), ...teardownErrors],
        "Creator Asset PostgreSQL runtime setup failed",
        { cause: setupError }
      );
    }
  }, LIFECYCLE_HOOK_TIMEOUT_MS);

  async function cleanupTrackedUsers(): Promise<void> {
    const ids = [...userIds];
    const pool = observerPool;
    if (ids.length === 0 || !pool) return;

    await pool.query('DELETE FROM "user" WHERE "id" = ANY($1::text[])', [ids]);
    const cleaned = new Set(ids);
    for (let index = userIds.length - 1; index >= 0; index -= 1) {
      if (cleaned.has(userIds[index]!)) userIds.splice(index, 1);
    }
  }

  async function teardownRuntime(): Promise<Error[]> {
    const errors: Error[] = [];
    try {
      try {
        await cleanupTrackedUsers();
      } catch (error) {
        errors.push(lifecycleFailure("tracked-user cleanup", error));
      }

      const client = advisoryClient;
      advisoryClient = undefined;
      if (client) {
        let destroyClient = !advisoryLockAcquired;
        if (advisoryLockAcquired) {
          try {
            const unlockResult = await client.query<{ unlocked: boolean }>(
              `SELECT pg_catalog.pg_advisory_unlock(
                 pg_catalog.hashtextextended($1, 0)
               ) AS "unlocked"`,
              [CREATOR_ASSET_SCHEMA_ADVISORY_LOCK]
            );
            if (unlockResult.rows[0]?.unlocked !== true) {
              throw new Error("the advisory lock was not held by its lifecycle client");
            }
          } catch (error) {
            destroyClient = true;
            errors.push(lifecycleFailure("advisory unlock", error));
          }
        }
        advisoryLockAcquired = false;
        try {
          client.release(destroyClient);
        } catch (error) {
          errors.push(lifecycleFailure("advisory client release", error));
        }
      }

      const poolClosures: { phase: string; promise: Promise<void> }[] = [];
      const pool = observerPool;
      observerPool = undefined;
      if (pool) {
        try {
          poolClosures.push({ phase: "observer pool close", promise: pool.end() });
        } catch (error) {
          errors.push(lifecycleFailure("observer pool close", error));
        }
      }

      const runtime = databaseRuntime;
      databaseRuntime = undefined;
      if (runtime) {
        try {
          poolClosures.push({ phase: "application pool close", promise: runtime.dbPool.end() });
        } catch (error) {
          errors.push(lifecycleFailure("application pool close", error));
        }
      }

      const poolResults = await Promise.allSettled(poolClosures.map(({ promise }) => promise));
      for (let index = 0; index < poolResults.length; index += 1) {
        const result = poolResults[index]!;
        if (result.status === "rejected") {
          errors.push(lifecycleFailure(poolClosures[index]!.phase, result.reason));
        }
      }
    } finally {
      if (databaseUrlOverridden) {
        try {
          if (previousDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL;
          } else {
            process.env.DATABASE_URL = previousDatabaseUrl;
          }
        } catch (error) {
          errors.push(lifecycleFailure("DATABASE_URL restore", error));
        } finally {
          databaseUrlOverridden = false;
          previousDatabaseUrl = undefined;
        }
      }
    }
    return errors;
  }

  afterEach(cleanupTrackedUsers);

  afterAll(async () => {
    const errors = await teardownRuntime();
    if (errors.length > 0) {
      throw new AggregateError(errors, "Creator Asset PostgreSQL runtime teardown failed");
    }
  }, LIFECYCLE_HOOK_TIMEOUT_MS);

  function requireObserverPool(): Pool {
    if (!observerPool) {
      throw new Error("Creator Asset PostgreSQL observer pool is not initialized");
    }
    return observerPool;
  }

  async function createUser(label: string): Promise<string> {
    const userId = randomUUID();
    await requireObserverPool().query('INSERT INTO "user" ("id", "name") VALUES ($1, $2)', [
      userId,
      `Creator Asset ${label}`,
    ]);
    userIds.push(userId);
    return userId;
  }

  it("keeps publish, catalog, reporting, moderation, and deletion atomic under concurrency", async () => {
    const [ownerId, reporterAId, reporterBId, reviewerId] = await Promise.all([
      createUser("owner"),
      createUser("reporter A"),
      createUser("reporter B"),
      createUser("reviewer"),
    ]);
    const asset = await creatorRuntime.publishAsset(ownerId, {
      name: "Concurrent reporting contract",
      description: "PostgreSQL runtime integration",
      tags: ["integration"],
      dataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
      width: 1,
      height: 1,
      previewDataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
      previewWidth: 1,
      previewHeight: 1,
      kind: "image",
      license: "cc0-1.0",
      rightsConfirmed: true,
    });

    await expect(
      creatorRuntime.publishAsset(ownerId, {
        name: "Duplicate bytes",
        dataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
        width: 1,
        height: 1,
        previewDataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
        previewWidth: 1,
        previewHeight: 1,
        kind: "image",
        license: "cc0-1.0",
        rightsConfirmed: true,
      })
    ).rejects.toThrow("같은 에셋을 이미 공유했습니다.");

    const catalog = await creatorRuntime.listSharedAssetCatalog({
      viewerId: reporterAId,
      limit: 10,
    });
    expect(catalog.items.find((item) => item.id === asset.id)).toMatchObject({
      previewAvailable: true,
      reportCount: 0,
    });
    await expect(
      creatorRuntime.getSharedAssetContent(asset.id, reporterAId)
    ).resolves.toMatchObject({
      id: asset.id,
      dataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
    });

    const reports = await Promise.all([
      creatorRuntime.reportSharedAsset(reporterAId, asset.id, {
        reason: "copyright",
        details: "report A",
      }),
      creatorRuntime.reportSharedAsset(reporterBId, asset.id, {
        reason: "misleading",
        details: "report B",
      }),
    ]);
    expect(reports.map((report) => report.reportCount).sort((a, b) => a - b)).toEqual([1, 2]);

    await expect(
      creatorRuntime.reportSharedAsset(reporterAId, asset.id, {
        reason: "spam",
      })
    ).rejects.toThrow("이미 이 에셋을 신고했습니다.");
    await expect(
      creatorRuntime.reportSharedAsset(ownerId, asset.id, {
        reason: "other",
      })
    ).rejects.toThrow("자신이 공유한 에셋은 신고할 수 없습니다.");

    await expect(
      requireObserverPool().query<{ reportCount: number }>(
        'SELECT "reportCount" FROM "creator_asset" WHERE "id" = $1',
        [asset.id]
      )
    ).resolves.toMatchObject({ rows: [{ reportCount: 2 }] });

    await expect(creatorRuntime.deleteSharedAsset(ownerId, asset.id, false)).resolves.toEqual({
      deleted: true,
    });
    await expect(
      creatorRuntime.reportSharedAsset(reviewerId, asset.id, {
        reason: "unsafe",
      })
    ).rejects.toThrow("신고할 수 있는 공개 에셋을 찾지 못했습니다.");
    const withdrawnCatalog = await creatorRuntime.listSharedAssetCatalog({
      viewerId: reporterAId,
      limit: 10,
    });
    expect(withdrawnCatalog.items.some((item) => item.id === asset.id)).toBe(false);

    await expect(
      creatorRuntime.moderateSharedAsset(reviewerId, asset.id, {
        status: "rejected",
        note: "rights review complete",
      })
    ).resolves.toEqual({ updated: true, status: "rejected" });
    await expect(
      requireObserverPool().query<{
        hidden: boolean;
        moderationStatus: string;
        openReports: number;
        resolvedReports: number;
      }>(
        `SELECT
           asset."hidden",
           asset."moderationStatus",
           count(*) FILTER (WHERE report."status" = 'open')::integer AS "openReports",
           count(*) FILTER (WHERE report."status" = 'resolved')::integer AS "resolvedReports"
         FROM "creator_asset" AS asset
         JOIN "creator_asset_report" AS report ON report."assetId" = asset."id"
         WHERE asset."id" = $1
         GROUP BY asset."id"`,
        [asset.id]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          hidden: true,
          moderationStatus: "rejected",
          openReports: 0,
          resolvedReports: 2,
        },
      ],
    });
  });

  it("serializes a first report against an owner withdrawal without orphaning evidence", async () => {
    const [ownerId, reporterId] = await Promise.all([
      createUser("withdrawal owner"),
      createUser("withdrawal reporter"),
    ]);
    const asset = await creatorRuntime.publishAsset(ownerId, {
      name: "Report versus withdrawal",
      dataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
      width: 1,
      height: 1,
      previewDataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
      previewWidth: 1,
      previewHeight: 1,
      kind: "image",
      license: "cc0-1.0",
      rightsConfirmed: true,
    });

    const [reportResult, withdrawalResult] = await Promise.allSettled([
      creatorRuntime.reportSharedAsset(reporterId, asset.id, {
        reason: "unsafe",
        details: "must remain linked if accepted",
      }),
      creatorRuntime.deleteSharedAsset(ownerId, asset.id, false),
    ]);
    expect(withdrawalResult).toMatchObject({
      status: "fulfilled",
      value: { deleted: true },
    });

    const [assetState, reportState] = await Promise.all([
      requireObserverPool().query<{
        hidden: boolean;
        moderationStatus: string;
        reportCount: number;
      }>(
        'SELECT "hidden", "moderationStatus", "reportCount" FROM "creator_asset" WHERE "id" = $1',
        [asset.id]
      ),
      requireObserverPool().query<{ count: number }>(
        'SELECT count(*)::integer AS "count" FROM "creator_asset_report" WHERE "assetId" = $1',
        [asset.id]
      ),
    ]);

    if (reportResult.status === "fulfilled") {
      expect(reportResult.value).toEqual({ reported: true, reportCount: 1 });
      expect(assetState.rows).toEqual([
        {
          hidden: true,
          moderationStatus: "under_review",
          reportCount: 1,
        },
      ]);
      expect(reportState.rows).toEqual([{ count: 1 }]);
      return;
    }

    expect(reportResult.reason).toBeInstanceOf(Error);
    expect((reportResult.reason as Error).message).toContain(
      "신고할 수 있는 공개 에셋을 찾지 못했습니다."
    );
    expect(assetState.rows).toEqual([]);
    expect(reportState.rows).toEqual([{ count: 0 }]);
  });

  it("serializes reporting against moderation and resolves only accepted evidence", async () => {
    const [ownerId, reporterId, reviewerId] = await Promise.all([
      createUser("moderation owner"),
      createUser("moderation reporter"),
      createUser("moderation reviewer"),
    ]);
    const asset = await creatorRuntime.publishAsset(ownerId, {
      name: "Report versus moderation",
      dataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
      width: 1,
      height: 1,
      previewDataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
      previewWidth: 1,
      previewHeight: 1,
      kind: "image",
      license: "cc0-1.0",
      rightsConfirmed: true,
    });

    const [reportResult, moderationResult] = await Promise.allSettled([
      creatorRuntime.reportSharedAsset(reporterId, asset.id, {
        reason: "copyright",
      }),
      creatorRuntime.moderateSharedAsset(reviewerId, asset.id, {
        status: "rejected",
        note: "concurrent rights review",
      }),
    ]);
    expect(moderationResult).toMatchObject({
      status: "fulfilled",
      value: { updated: true, status: "rejected" },
    });

    const state = await requireObserverPool().query<{
      moderationStatus: string;
      reportCount: number;
      reports: number;
      resolvedReports: number;
    }>(
      `SELECT
         asset."moderationStatus",
         asset."reportCount",
         count(report."id")::integer AS "reports",
         count(report."id") FILTER (WHERE report."status" = 'resolved')::integer
           AS "resolvedReports"
       FROM "creator_asset" AS asset
       LEFT JOIN "creator_asset_report" AS report ON report."assetId" = asset."id"
       WHERE asset."id" = $1
       GROUP BY asset."id"`,
      [asset.id]
    );

    if (reportResult.status === "fulfilled") {
      expect(reportResult.value).toEqual({ reported: true, reportCount: 1 });
      expect(state.rows).toEqual([
        {
          moderationStatus: "rejected",
          reportCount: 1,
          reports: 1,
          resolvedReports: 1,
        },
      ]);
      return;
    }

    expect((reportResult.reason as Error).message).toContain(
      "신고할 수 있는 공개 에셋을 찾지 못했습니다."
    );
    expect(state.rows).toEqual([
      {
        moderationStatus: "rejected",
        reportCount: 0,
        reports: 0,
        resolvedReports: 0,
      },
    ]);
  });

  it("serializes reporting against admin deletion without discarding accepted evidence", async () => {
    const [ownerId, reporterId, adminId] = await Promise.all([
      createUser("admin-delete owner"),
      createUser("admin-delete reporter"),
      createUser("admin-delete reviewer"),
    ]);
    const asset = await creatorRuntime.publishAsset(ownerId, {
      name: "Report versus admin deletion",
      dataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
      width: 1,
      height: 1,
      previewDataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
      previewWidth: 1,
      previewHeight: 1,
      kind: "image",
      license: "cc0-1.0",
      rightsConfirmed: true,
    });

    const [reportResult, deletionResult] = await Promise.allSettled([
      creatorRuntime.reportSharedAsset(reporterId, asset.id, {
        reason: "unsafe",
      }),
      creatorRuntime.deleteSharedAsset(adminId, asset.id, true),
    ]);
    expect(deletionResult).toMatchObject({
      status: "fulfilled",
      value: { deleted: true },
    });

    const [assetState, reportState] = await Promise.all([
      requireObserverPool().query<{
        hidden: boolean;
        moderationStatus: string;
        reportCount: number;
      }>(
        'SELECT "hidden", "moderationStatus", "reportCount" FROM "creator_asset" WHERE "id" = $1',
        [asset.id]
      ),
      requireObserverPool().query<{ count: number }>(
        'SELECT count(*)::integer AS "count" FROM "creator_asset_report" WHERE "assetId" = $1',
        [asset.id]
      ),
    ]);

    if (reportResult.status === "fulfilled") {
      expect(reportResult.value).toEqual({ reported: true, reportCount: 1 });
      expect(assetState.rows).toEqual([
        {
          hidden: true,
          moderationStatus: "rejected",
          reportCount: 1,
        },
      ]);
      expect(reportState.rows).toEqual([{ count: 1 }]);
      return;
    }

    expect((reportResult.reason as Error).message).toContain(
      "신고할 수 있는 공개 에셋을 찾지 못했습니다."
    );
    expect(assetState.rows).toEqual([]);
    expect(reportState.rows).toEqual([{ count: 0 }]);
  });

  it.each([
    {
      decision: "rejected",
      finalStatus: "rejected" as const,
      reportStatus: "resolved" as const,
    },
    {
      decision: "approved",
      finalStatus: "published" as const,
      reportStatus: "dismissed" as const,
    },
  ])(
    "preserves finalized $decision moderation audit when owner withdrawal races",
    async ({ decision, finalStatus, reportStatus }) => {
      const [ownerId, reporterId, reviewerId] = await Promise.all([
        createUser(`${decision} owner`),
        createUser(`${decision} reporter`),
        createUser(`${decision} reviewer`),
      ]);
      const asset = await creatorRuntime.publishAsset(ownerId, {
        name: `${decision} audit preservation`,
        dataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
        width: 1,
        height: 1,
        previewDataUrl: CREATOR_ASSET_FALLBACK_PREVIEW_DATA_URL,
        previewWidth: 1,
        previewHeight: 1,
        kind: "image",
        license: "cc0-1.0",
        rightsConfirmed: true,
      });
      await expect(
        creatorRuntime.reportSharedAsset(reporterId, asset.id, {
          reason: "copyright",
          details: "requires a durable moderation audit",
        })
      ).resolves.toEqual({ reported: true, reportCount: 1 });

      const finalNote = `${decision} rights decision`;
      const [moderationResult, withdrawalResult] = await Promise.allSettled([
        creatorRuntime.moderateSharedAsset(reviewerId, asset.id, {
          status: finalStatus,
          note: finalNote,
        }),
        creatorRuntime.deleteSharedAsset(ownerId, asset.id, false),
      ]);
      expect(moderationResult).toMatchObject({
        status: "fulfilled",
        value: { updated: true, status: finalStatus },
      });
      expect(withdrawalResult).toMatchObject({
        status: "fulfilled",
        value: { deleted: true },
      });

      // Whichever transaction won the first row lock, this repeat deterministically exercises
      // owner withdrawal against an already-final moderation decision.
      await expect(creatorRuntime.deleteSharedAsset(ownerId, asset.id, false)).resolves.toEqual({
        deleted: true,
      });

      const state = await requireObserverPool().query<{
        hidden: boolean;
        moderationStatus: string;
        moderationNote: string | null;
        reportCount: number;
        assetReviewedBy: string | null;
        assetReviewed: boolean;
        reportStatus: string;
        resolutionNote: string | null;
        reportReviewedBy: string | null;
        reportReviewed: boolean;
      }>(
        `SELECT
           asset."hidden",
           asset."moderationStatus",
           asset."moderationNote",
           asset."reportCount",
           asset."reviewedBy" AS "assetReviewedBy",
           (asset."reviewedAt" IS NOT NULL) AS "assetReviewed",
           report."status" AS "reportStatus",
           report."resolutionNote",
           report."reviewedBy" AS "reportReviewedBy",
           (report."reviewedAt" IS NOT NULL) AS "reportReviewed"
         FROM "creator_asset" AS asset
         JOIN "creator_asset_report" AS report ON report."assetId" = asset."id"
         WHERE asset."id" = $1`,
        [asset.id]
      );
      expect(state.rows).toEqual([
        {
          hidden: true,
          moderationStatus: finalStatus,
          moderationNote: finalNote,
          reportCount: 1,
          assetReviewedBy: reviewerId,
          assetReviewed: true,
          reportStatus,
          resolutionNote: finalNote,
          reportReviewedBy: reviewerId,
          reportReviewed: true,
        },
      ]);
    }
  );
});
