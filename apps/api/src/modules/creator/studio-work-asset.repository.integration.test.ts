import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type {
  DrizzleStudioWorkAssetRepository,
  StudioWorkAssetWrite,
} from "./studio-work-asset.repository";
import type * as DatabaseRuntime from "../../../../../lib/db";
import type { deleteWork as DeleteCreatorWork } from "../../../../../lib/server/creator";

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
  fill: number,
): StudioWorkAssetWrite {
  const payload = Uint8Array.of(fill);
  const sha256 = createHash("sha256").update(payload).digest("hex");
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
    payload,
    sha256,
    intrinsicImage: {
      width: 1,
      height: 1,
      decodedRgbaBytes: 4,
    },
    storageObject: {
      contractVersion: "toonspectrum.supabase-object-storage.v1",
      purpose: "source",
      digest: `sha256:${sha256}`,
      objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`,
      byteLength: payload.byteLength,
      contentType: "image/png",
    },
  };
}

function generatedObject(
  purpose: "derived" | "export",
  bytes: Uint8Array,
) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    contractVersion: "toonspectrum.supabase-object-storage.v1" as const,
    purpose,
    digest: `sha256:${sha256}` as const,
    objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}` as const,
    byteLength: bytes.byteLength,
    contentType: "image/png" as const,
  };
}

describeWithDirectPostgres(
  "Studio work asset PostgreSQL batch transaction",
  () => {
    const userIds: string[] = [];
    let observerPool: Pool | undefined;
    let databaseRuntime: typeof DatabaseRuntime | undefined;
    let repository: DrizzleStudioWorkAssetRepository;
    let deleteCreatorWork: typeof DeleteCreatorWork;
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
      ({ deleteWork: deleteCreatorWork } = await import(
        "../../../../../lib/server/creator"
      ));
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
          imageWrite(workId, backgroundAssetId, 1),
          {
            ...imageWrite(workId, foregroundAssetId, 2),
            intrinsicImage: {
              width: 1,
              height: 1,
              decodedRgbaBytes: 3,
            },
          },
        ]);
      } catch (error) {
        rejection = error;
      }

      expect(findPostgresConstraintError(rejection)).toMatchObject({
        code: "23514",
        constraint: "creator_work_asset_intrinsic_image_check",
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

    it("keeps source immutable and drives shared generated references through a durable delete state", async () => {
      if (!observerPool) {
        throw new Error("PostgreSQL observer pool was not initialized");
      }
      const userId = randomUUID();
      const workId = randomUUID();
      const sourceAssetId = `source-${randomUUID()}`;
      await observerPool.query(
        'INSERT INTO "user" ("id", "name") VALUES ($1, $2)',
        [userId, "Studio work asset object reference integration"],
      );
      userIds.push(userId);
      await observerPool.query(
        `INSERT INTO "creator_work" ("id", "userId", "title")
         VALUES ($1, $2, $3)`,
        [workId, userId, "Object reference state machine"],
      );

      const sourceWrite = imageWrite(workId, sourceAssetId, 17);
      await repository.upsert(userId, sourceWrite);
      await expect(repository.getStorageReference(
        userId,
        workId,
        sourceAssetId,
        "source",
        sourceAssetId,
        "image",
      )).resolves.toMatchObject({ object: sourceWrite.storageObject });

      const object = generatedObject("derived", Uint8Array.of(8, 9, 10));
      const firstReference = {
        workId,
        sourceAssetId,
        referenceId: "preview-a",
        object,
      };
      const secondReference = {
        ...firstReference,
        referenceId: "preview-b",
      };
      await repository.registerGeneratedStorageReference(
        userId,
        firstReference,
        true,
      );
      await repository.registerGeneratedStorageReference(
        userId,
        secondReference,
        false,
      );

      await expect(
        deleteCreatorWork(userId, workId, false),
      ).rejects.toThrow(/생성 에셋 정리가 완료된 뒤/u);
      await expect(repository.getStorageReference(
        userId,
        workId,
        sourceAssetId,
        "derived",
        firstReference.referenceId,
      )).resolves.toMatchObject({ referenceId: firstReference.referenceId });

      const sharedDelete = await repository.beginGeneratedStorageReferenceDelete(
        userId,
        {
          workId,
          sourceAssetId,
          purpose: "derived",
          referenceId: firstReference.referenceId,
          expectedDigest: object.digest,
        },
      );
      expect(sharedDelete).toMatchObject({
        deleteToken: null,
        remoteDeleteRequired: false,
      });
      await expect(repository.getStorageReference(
        userId,
        workId,
        sourceAssetId,
        "derived",
        firstReference.referenceId,
      )).rejects.toMatchObject({
        name: "StudioWorkAssetStorageReferenceNotFoundError",
      });

      const lastDelete = await repository.beginGeneratedStorageReferenceDelete(
        userId,
        {
          workId,
          sourceAssetId,
          purpose: "derived",
          referenceId: secondReference.referenceId,
          expectedDigest: object.digest,
        },
      );
      expect(lastDelete.remoteDeleteRequired).toBe(true);
      expect(lastDelete.deleteToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      await expect(repository.getStorageReference(
        userId,
        workId,
        sourceAssetId,
        "derived",
        secondReference.referenceId,
      )).rejects.toMatchObject({
        name: "StudioWorkAssetStorageReferenceNotFoundError",
      });
      await repository.completeGeneratedStorageReferenceDelete(lastDelete);
      await expect(repository.findReusableStorageObject(object)).resolves.toBeNull();

      await repository.registerGeneratedStorageReference(
        userId,
        firstReference,
        true,
      );
      await expect(repository.deleteUnreferencedUpload(
        userId,
        workId,
        sourceAssetId,
        "image",
        sourceWrite.sha256,
      )).rejects.toMatchObject({ name: "StudioWorkAssetReferencedError" });
      await expect(repository.beginGeneratedStorageReferenceDelete(
        userId,
        {
          workId,
          sourceAssetId,
          purpose: "source" as never,
          referenceId: sourceAssetId,
          expectedDigest: sourceWrite.storageObject.digest,
        },
      )).rejects.toMatchObject({
        name: "StudioWorkAssetStorageReferenceConflictError",
      });

      const [sourceState] = (await observerPool.query<{
        state: string;
        deleteToken: string | null;
      }>(
        `SELECT "state", "deleteToken"
         FROM "creator_asset_storage_object"
         WHERE "purpose" = 'source' AND "digest" = $1`,
        [sourceWrite.storageObject.digest],
      )).rows;
      expect(sourceState).toEqual({ state: "active", deleteToken: null });
    });
  },
);
