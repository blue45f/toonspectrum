import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { creatorMarketplacePublisherGateKey } from "../apps/api/src/modules/creator-marketplace/creator-marketplace-publish-gate";
import {
  CREATOR_MARKETPLACE_RUNTIME_BY_KIND,
  CreatorMarketplaceResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "../lib/creator-marketplace-resource-contract";

import {
  VITEST_VALIDATED_REMOTE_DATABASE_MARKER,
  validatePostgresIntegrationUrl,
} from "./run-postgres-integration-tests.mjs";

import type {
  CreatorMarketplaceJsonValue,
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceManifest,
} from "../lib/creator-marketplace-resource-contract";

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(canonicalizeCreatorMarketplaceJson(value))
    .digest("hex");
}

function manifestFor(
  kind: Extract<CreatorMarketplaceResourceKind, "brush" | "palette">,
  packageId: string
): CreatorMarketplaceResourceManifest {
  const definition: Record<string, CreatorMarketplaceJsonValue> =
    kind === "brush"
      ? {
          snapshot: {
            renderer: "perfect-freehand",
            presetId: "integration-ink",
            settings: { size: 7, opacity: 1 },
          },
        }
      : {
          colors: ["#111827", "#f8fafc", "#ef4444"],
        };
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: kind,
    runtime: CREATOR_MARKETPLACE_RUNTIME_BY_KIND[kind],
    definition,
  };
  return CreatorMarketplaceResourceManifestSchema.parse({
    schemaVersion: 1,
    packageId,
    name: kind === "brush" ? "통합 잉크 브러시" : "통합 누아르 팔레트",
    description: "격리 PostgreSQL 통합 검증 전용 portable JSON",
    kind,
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: ["integration", kind],
    license: "toonspectrum-standard",
    attributionText: "",
    containsAi: false,
    rightsConfirmed: true,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: `${kind}/integration`,
      kind,
      name: kind === "brush" ? "통합 잉크" : "통합 누아르",
      delivery: {
        mode: "portable-json",
        mediaType:
          kind === "brush"
            ? "application/vnd.toonspectrum.brush+json"
            : "application/vnd.toonspectrum.palette+json",
        payload,
        byteSize: creatorMarketplaceJsonByteSize(payload),
        sha256: sha256(payload),
      },
    }],
  });
}

function assertSafeTarget(): URL {
  if (process.env.TOONSPECTRUM_MARKETPLACE_DB_TEST !== "1") {
    throw new Error("Set TOONSPECTRUM_MARKETPLACE_DB_TEST=1 for the isolated DB check.");
  }
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required.");
  const runnerValidated =
    process.env.TOONSPECTRUM_MARKETPLACE_DB_RUNNER_VALIDATED === "1";
  const validatedRemoteDatabase =
    process.env[VITEST_VALIDATED_REMOTE_DATABASE_MARKER] === "true";
  const target = validatePostgresIntegrationUrl(rawUrl, {
    allowRemoteTestDatabase: validatedRemoteDatabase,
    environment: process.env,
  });
  const databaseName = String(target.databaseName ?? "");
  if (
    runnerValidated
    && process.env.TEST_DATABASE_URL?.trim() !== rawUrl.trim()
  ) {
    throw new Error(
      "The runner-validated marketplace target must match TEST_DATABASE_URL.",
    );
  }
  const url = new URL(rawUrl);
  if (
    !runnerValidated
    && !/(?:^|[_-])test(?:$|[_-])/iu.test(databaseName)
  ) {
    throw new Error("Refusing to run against a database whose name is not explicitly test-scoped.");
  }
  return url;
}

async function main() {
  const target = assertSafeTarget();
  const publisherId = `market-publisher-${randomUUID()}`;
  const otherUserId = `market-other-${randomUUID()}`;
  const packageSuffix = randomUUID();

  const [
    { dbPool },
    { DrizzleCreatorMarketplaceResourceRepository },
    { PostgresCreatorMarketplacePublishGate },
  ] = await Promise.all([
    import("../apps/api/src/db/index"),
    import("../apps/api/src/modules/creator-marketplace/creator-marketplace.repository"),
    import("../apps/api/src/modules/creator-marketplace/creator-marketplace-publish-gate.repository"),
  ]);
  const repository = new DrizzleCreatorMarketplaceResourceRepository();
  const publishGate = new PostgresCreatorMarketplacePublishGate();
  const publisherGateKey = creatorMarketplacePublisherGateKey(publisherId);
  let brushId: string | null = null;
  let paletteId: string | null = null;

  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS "user" (
        "id" text PRIMARY KEY,
        "name" text,
        "avatar" text
      )
    `);
    const migrations = await Promise.all(
      [
        "0021_creator_marketplace_resource.sql",
        "0022_creator_marketplace_distributed_gate_search.sql",
      ].map((name) =>
        readFile(new URL(`../apps/api/src/db/migrations/${name}`, import.meta.url), "utf8")
      )
    );
    for (const migration of migrations) await dbPool.query(migration);
    await dbPool.query(
      `INSERT INTO "user" ("id", "name", "avatar") VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        publisherId,
        "Marketplace Integration Publisher",
        "#334155",
        otherUserId,
        "Marketplace Integration Other",
        "#64748b",
      ]
    );

    const brushManifest = manifestFor("brush", `integration/brush/${packageSuffix}`);
    const paletteManifest = manifestFor("palette", `integration/palette/${packageSuffix}`);
    const brush = await repository.publish({
      id: randomUUID(),
      publisherId,
      manifest: brushManifest,
      manifestHash: sha256(brushManifest),
      manifestByteSize: creatorMarketplaceJsonByteSize(brushManifest),
    });
    brushId = brush.id;
    const palette = await repository.publish({
      id: randomUUID(),
      publisherId,
      manifest: paletteManifest,
      manifestHash: sha256(paletteManifest),
      manifestByteSize: creatorMarketplaceJsonByteSize(paletteManifest),
    });
    paletteId = palette.id;

    const brushRows = await repository.list({
      limit: 10,
      cursor: null,
      kind: "brush",
      publisherId,
      viewerId: publisherId,
    });
    assert.equal(brushRows.length, 1);
    assert.equal(brushRows[0]?.manifest.kind, "brush");
    assert.deepEqual(
      brushRows[0]?.manifest.entries[0]?.delivery.mode === "portable-json"
        ? brushRows[0].manifest.entries[0].delivery.payload.definition
        : null,
      brushManifest.entries[0]?.delivery.mode === "portable-json"
        ? brushManifest.entries[0].delivery.payload.definition
        : null
    );

    const firstPage = await repository.list({
      limit: 1,
      cursor: null,
      publisherId,
      viewerId: publisherId,
    });
    assert.equal(firstPage.length, 2, "repository must fetch one cursor sentinel row");
    const first = firstPage[0]!;
    const secondPage = await repository.list({
      limit: 1,
      cursor: { createdAt: first.createdAt, id: first.id },
      publisherId,
      viewerId: publisherId,
    });
    assert.equal(secondPage.length, 1);
    assert.notEqual(secondPage[0]?.id, first.id);

    const searchRows = await repository.list({
      limit: 10,
      cursor: null,
      search: "누아르",
      publisherId,
      viewerId: publisherId,
    });
    assert.equal(searchRows.length, 1);
    assert.equal(searchRows[0]?.id, palette.id);
    const tagRows = await repository.list({
      limit: 10,
      cursor: null,
      tag: "brush",
      publisherId,
      viewerId: publisherId,
    });
    assert.equal(tagRows.length, 1);
    assert.equal(tagRows[0]?.id, brush.id);

    const indexRows = await dbPool.query<{ indexname: string }>(
      `
        SELECT "indexname"
        FROM "pg_indexes"
        WHERE "schemaname" = current_schema()
          AND "tablename" = 'creator_marketplace_resource'
          AND "indexname" = ANY($1::text[])
      `,
      [[
        "idx_creator_marketplace_resource_search",
        "idx_creator_marketplace_resource_tags",
      ]]
    );
    assert.deepEqual(
      indexRows.rows.map((row) => row.indexname).sort(),
      [
        "idx_creator_marketplace_resource_search",
        "idx_creator_marketplace_resource_tags",
      ]
    );

    const concurrentAdmissions = await Promise.all([
      publishGate.acquire(publisherGateKey),
      publishGate.acquire(publisherGateKey),
    ]);
    assert.deepEqual(
      concurrentAdmissions.map((admission) => admission.status).sort(),
      ["acquired", "rate_limited"]
    );
    const acquiredAdmission = concurrentAdmissions.find(
      (admission) => admission.status === "acquired"
    );
    assert.ok(acquiredAdmission && acquiredAdmission.status === "acquired");
    assert.equal(await publishGate.release(acquiredAdmission.lease), true);

    for (let admittedCount = 1; admittedCount < 20; admittedCount += 1) {
      const admission = await publishGate.acquire(publisherGateKey);
      assert.equal(admission.status, "acquired");
      if (admission.status !== "acquired") {
        throw new Error("Publish gate rejected an admission before the hourly limit.");
      }
      assert.equal(await publishGate.release(admission.lease), true);
    }
    assert.equal((await publishGate.acquire(publisherGateKey)).status, "rate_limited");

    assert.equal(await repository.deleteOwned(otherUserId, brush.id), false);
    assert.equal(await repository.deleteOwned(publisherId, brush.id), true);
    brushId = null;
    assert.equal(await repository.deleteOwned(otherUserId, palette.id), false);
    assert.equal(await repository.deleteOwned(publisherId, palette.id), true);
    paletteId = null;

    const remaining = await repository.list({
      limit: 10,
      cursor: null,
      publisherId,
      viewerId: publisherId,
    });
    assert.equal(remaining.length, 0);
    console.log(
      `creator marketplace DB verification passed: database=${target.pathname.slice(1)} ` +
      "migrations=0021+0022 kinds=brush,palette search=trigram+tags " +
      "publish-gate=distributed-20-per-hour cursor=keyset owner-delete=verified"
    );
  } finally {
    if (brushId) await repository.deleteOwned(publisherId, brushId).catch(() => false);
    if (paletteId) await repository.deleteOwned(publisherId, paletteId).catch(() => false);
    await dbPool.query(
      `DELETE FROM "creator_marketplace_publish_gate" WHERE "keyHash" = $1::bytea`,
      [publisherGateKey]
    ).catch(() => undefined);
    await dbPool.query(`DELETE FROM "user" WHERE "id" = ANY($1::text[])`, [
      [publisherId, otherUserId],
    ]).catch(() => undefined);
    await dbPool.end();
  }
}

await main();
