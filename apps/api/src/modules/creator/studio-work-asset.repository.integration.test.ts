import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type {
  DrizzleStudioWorkAssetRepository,
  StudioWorkAssetWrite,
} from "./studio-work-asset.repository";
import type * as DatabaseRuntime from "../../../../../lib/db";

const INTEGRATION_URL =
  process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; Studio work asset batch rollback cannot be skipped",
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;

interface PostgresConstraintError {
  readonly code?: string;
  readonly constraint?: string;
}

function findPostgresConstraintError(
  error: unknown,
): PostgresConstraintError | undefined {
  const visited = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null) {
    if (visited.has(current)) return undefined;
    visited.add(current);
    const candidate = current as PostgresConstraintError & {
      readonly cause?: unknown;
    };
    if (candidate.code === "23514" && candidate.constraint) {
      return candidate;
    }
    current = candidate.cause;
  }
  return undefined;
}

function imageWrite(
  workId: string,
  assetId: string,
  sha256: string,
  fill: number,
): StudioWorkAssetWrite {
  return {
    workId,
    assetId,
    elementType: "image",
    mimeType: "image/png",
    descriptor: {
      version: 1,
      element: {
        id: assetId,
        type: "image",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
    },
    payload: Uint8Array.of(fill),
    sha256,
    intrinsicImage: {
      width: 1,
      height: 1,
      decodedRgbaBytes: 4,
    },
  };
}

describeWithDirectPostgres(
  "Studio work asset PostgreSQL batch transaction",
  () => {
    const userIds: string[] = [];
    let observerPool: Pool | undefined;
    let databaseRuntime: typeof DatabaseRuntime | undefined;
    let repository: DrizzleStudioWorkAssetRepository;
    let previousDatabaseUrl: string | undefined;

    beforeAll(async () => {
      if (!INTEGRATION_URL) {
        throw new Error("integration URL was not provided");
      }
      previousDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = INTEGRATION_URL;
      observerPool = new Pool({
        application_name: "toonspectrum-studio-work-asset-batch-test",
        connectionString: INTEGRATION_URL,
        max: 2,
      });
      databaseRuntime = await import("../../../../../lib/db");
      const repositoryRuntime = await import("./studio-work-asset.repository");
      repository = new repositoryRuntime.DrizzleStudioWorkAssetRepository();
    });

    async function cleanupTrackedUsers(): Promise<void> {
      const ids = userIds.splice(0);
      if (ids.length === 0 || !observerPool) return;
      await observerPool.query(
        'DELETE FROM "user" WHERE "id" = ANY($1::text[])',
        [ids],
      );
    }

    afterEach(cleanupTrackedUsers);

    afterAll(async () => {
      await cleanupTrackedUsers();
      await Promise.all([
        observerPool?.end(),
        databaseRuntime?.dbPool.end(),
      ]);
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    });

    it("rolls back the valid first row when the second row violates a DB constraint", async () => {
      if (!observerPool) {
        throw new Error("PostgreSQL observer pool was not initialized");
      }
      const userId = randomUUID();
      const workId = randomUUID();
      const backgroundAssetId = `layer-background-${randomUUID()}`;
      const foregroundAssetId = `layer-foreground-${randomUUID()}`;
      await observerPool.query(
        'INSERT INTO "user" ("id", "name") VALUES ($1, $2)',
        [userId, "Studio work asset batch rollback integration"],
      );
      userIds.push(userId);
      await observerPool.query(
        `INSERT INTO "creator_work" ("id", "userId", "title")
         VALUES ($1, $2, $3)`,
        [workId, userId, "Layer-lift batch rollback"],
      );

      let rejection: unknown;
      try {
        await repository.upsertBatch(userId, [
          imageWrite(
            workId,
            backgroundAssetId,
            "a".repeat(64),
            1,
          ),
          imageWrite(
            workId,
            foregroundAssetId,
            "not-a-valid-sha256",
            2,
          ),
        ]);
      } catch (error) {
        rejection = error;
      }

      expect(findPostgresConstraintError(rejection)).toMatchObject({
        code: "23514",
        constraint: "creator_work_asset_sha256_check",
      });
      const stored = await observerPool.query<{ assetId: string }>(
        `SELECT "assetId"
         FROM "creator_work_asset"
         WHERE "workId" = $1
           AND "assetId" = ANY($2::text[])
         ORDER BY "assetId"`,
        [workId, [backgroundAssetId, foregroundAssetId]],
      );
      expect(stored.rows).toEqual([]);
    });
  },
);
