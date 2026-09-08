import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CreatorAssetArtifactSetDescriptorSchema } from "../../../../web/src/shared/lib/creator-asset-platform-contract";

const integrationUrl = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !integrationUrl) {
  throw new Error("CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL for asset integrity tests");
}
const postgres = integrationUrl ? describe : describe.skip;
const digest = () => `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`;

postgres("Creator Asset platform PostgreSQL integrity", () => {
  const schema = `asset_integrity_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;
  let owner: string;

  async function migrate(connection: Pool | PoolClient, targetSchema: string, lastMigration = 44) {
    const manifest = await readFile(new URL("../../../../../scripts/production-database-migrations.manifest", import.meta.url), "utf8");
    for (const path of manifest.trim().split("\n")) {
      // 0043 provisions unrelated administrator tables, absent from this asset-only fixture.
      const number = /\/00(39|40|41|42|44)_/u.exec(path)?.[1];
      if (!number || Number(number) > lastMigration) continue;
      const migration = await readFile(new URL(`../../../../../${path}`, import.meta.url), "utf8");
      await connection.query(migration.replaceAll("public.", `"${targetSchema}".`));
    }
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: integrationUrl, max: 4, statement_timeout: 10_000 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    // Clone only prerequisite structure, never application rows. The actual forward SQL below
    // creates all asset tables, foreign keys, checks and triggers in this owned namespace.
    for (const table of ["user", "creator_work", "creator_marketplace_resource", "creator_asset_storage_object"]) {
      await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await migrate(pool, schema);
    owner = randomUUID();
    await pool.query(`INSERT INTO "${schema}"."user" (id, name) VALUES ($1, 'Asset integrity fixture')`, [owner]);
  });

  afterAll(async () => {
    try {
      await pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await pool?.end();
    }
  });

  async function client(): Promise<PoolClient> {
    const connection = await pool.connect();
    await connection.query(`SET search_path TO "${schema}", public`);
    return connection;
  }

  async function fixture(connection: PoolClient, state: "building" | "sealed" | "rejected" = "building", runState = "succeeded", lineage: { publisherId?: string; packageId?: string; entryId?: string; draftId?: string } = {}) {
    const draft = lineage.draftId ?? randomUUID();
    const run = randomUUID();
    const set = randomUUID();
    const source = digest();
    const toolchain = digest();
    const qa = randomUUID();
    if (!lineage.draftId) await connection.query(`INSERT INTO creator_marketplace_draft
      (id, "publisherId", "packageId", kind, name) VALUES ($1, $2, $3, 'asset', 'Fixture')`, [draft, lineage.publisherId ?? owner, lineage.packageId ?? draft]);
    await connection.query(`INSERT INTO creator_asset_processing_run
      (id, "draftId", "entryId", "sourceDigest", "pipelineProfile", "pipelineVersion",
       "toolchainDigest", "idempotencyKey", state, "finishedAt")
      VALUES ($1, $2, $7, $3, 'fixture', 1, $4, $5, $6,
        CASE WHEN $6='succeeded' THEN statement_timestamp() ELSE NULL END)`,
    [run, draft, source, toolchain, digest(), runState, lineage.entryId ?? "entry"]);
    await connection.query(`INSERT INTO creator_asset_artifact_set
      (id, "processingRunId", "entryKind", "sourceDigest", "profileSchemaVersion", descriptor, "descriptorHash", "toolchainDigest")
      VALUES ($1, $2, 'raster-asset', $3, 1, $4, $5, $6)`,
    [set, run, source, { schema: "toonspectrum.creator-asset-artifact-set", version: 1, id: set }, digest(), toolchain]);
    const artifacts: unknown[] = [];
    for (const [artifactId, role, purpose] of [
      ["source", "source-original", "source"], ["runtime", "runtime-default", "derived"], ["thumb", "thumbnail", "derived"],
    ]) {
      const objectDigest = artifactId === "source" ? source : digest();
      artifacts.push({ id: artifactId, role, purpose, digest: objectDigest, contentType: "image/png",
        byteLength: 1, required: true, qualityProfile: "default", deviceProfile: "universal", width: null, height: null });
      await connection.query(`INSERT INTO creator_asset_storage_object
        (purpose, digest, "contractVersion", "objectPath", "byteLength", "contentType")
        VALUES ($1, $2, 'toonspectrum.supabase-object-storage.v1', $3, 1, 'image/png')`,
      [purpose, objectDigest, `sha256/${objectDigest.slice(7, 9)}/${objectDigest.slice(7)}`]);
      await connection.query(`INSERT INTO creator_asset_artifact
        ("artifactSetId", "artifactId", role, purpose, "objectDigest", "contentType", "byteLength", "qualityProfile", "deviceProfile")
        VALUES ($1, $2, $3, $4, $5, 'image/png', 1, 'default', 'universal')`, [set, artifactId, role, purpose, objectDigest]);
    }
    await connection.query(`INSERT INTO creator_asset_qa_report
      (id, "artifactSetId", "profileId", "profileVersion", state, "blockerCount", "warningCount", report, "reportHash")
      VALUES ($1, $2, 'fixture', 1, 'passed', 0, 0, '{}', $3)`, [qa, set, digest()]);
    const descriptor = CreatorAssetArtifactSetDescriptorSchema.parse({
      schema: "toonspectrum.creator-asset-artifact-set", version: 1, id: set,
      entryKind: "raster-asset", sourceDigest: source, toolchainDigest: toolchain,
      profileId: "fixture", profileVersion: 1, artifacts,
    });
    await connection.query('UPDATE creator_asset_artifact_set SET descriptor=$2 WHERE id=$1', [set, descriptor]);
    if (state !== "building") await seal(connection, set, state);
    return { draft, run, set, source, toolchain, qa, descriptor };
  }

  function seal(connection: PoolClient, set: string, state = "sealed") {
    return connection.query(`UPDATE creator_asset_artifact_set SET state=$2,
      "sealedAt"=CASE WHEN $2='sealed' THEN statement_timestamp() ELSE NULL END WHERE id=$1`, [set, state]);
  }

  async function transaction(action: (connection: PoolClient) => Promise<void>) {
    const connection = await client();
    try {
      await connection.query("BEGIN");
      await action(connection);
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  }

  async function rejects(connection: PoolClient, sql: string, values: unknown[], constraint: string) {
    await connection.query("SAVEPOINT rejection");
    try {
      await expect(connection.query(sql, values)).rejects.toMatchObject({ constraint });
    } finally {
      await connection.query("ROLLBACK TO SAVEPOINT rejection");
    }
  }

  it.each(["sealed", "rejected"] as const)("preserves all artifacts when a %s set is reparented", async (state) => {
    await transaction(async (connection) => {
      const source = await fixture(connection, state);
      const target = await fixture(connection);
      await rejects(connection, `UPDATE creator_asset_artifact SET "artifactSetId"=$2, "artifactId"='moved' WHERE "artifactSetId"=$1 AND "artifactId"='runtime'`,
        [source.set, target.set], "creator_asset_artifact_parent_immutable");
      expect((await connection.query('SELECT count(*)::int AS count FROM creator_asset_artifact WHERE "artifactSetId"=$1', [source.set])).rows[0].count).toBe(3);
    });
  });

  it.each(["sealed", "rejected"] as const)("preserves QA update/delete/reparent evidence after %s", async (state) => {
    await transaction(async (connection) => {
      const source = await fixture(connection, state);
      const target = await fixture(connection);
      await rejects(connection, "UPDATE creator_asset_qa_report SET state='failed', \"blockerCount\"=1 WHERE id=$1", [source.qa], "creator_asset_qa_terminal_immutable");
      await rejects(connection, "DELETE FROM creator_asset_qa_report WHERE id=$1", [source.qa], "creator_asset_qa_terminal_immutable");
      await rejects(connection, 'UPDATE creator_asset_qa_report SET "artifactSetId"=$2, "profileId"=\'moved\' WHERE id=$1', [source.qa, target.set], "creator_asset_qa_parent_immutable");
    });
  });

  it("allows building evidence edits and deletes, and refuses a seal without QA", async () => {
    await transaction(async (connection) => {
      const source = await fixture(connection);
      await connection.query('UPDATE creator_asset_artifact SET width=10, height=20 WHERE "artifactSetId"=$1', [source.set]);
      await connection.query("UPDATE creator_asset_qa_report SET state='warning', \"warningCount\"=1 WHERE id=$1", [source.qa]);
      await connection.query("DELETE FROM creator_asset_qa_report WHERE id=$1", [source.qa]);
      await rejects(connection, "UPDATE creator_asset_artifact_set SET state='sealed', \"sealedAt\"=statement_timestamp() WHERE id=$1", [source.set], "creator_asset_artifact_set_seal_qa");
    });
  });

  it.each(["sealed", "rejected"])("rejects directly inserting a %s set without the building lifecycle", async (state) => {
    await transaction(async (connection) => {
      const source = await fixture(connection);
      await connection.query('DELETE FROM creator_asset_qa_report WHERE "artifactSetId"=$1', [source.set]);
      await connection.query('DELETE FROM creator_asset_artifact WHERE "artifactSetId"=$1', [source.set]);
      await connection.query('DELETE FROM creator_asset_artifact_set WHERE id=$1', [source.set]);
      await rejects(connection, `INSERT INTO creator_asset_artifact_set
        (id, "processingRunId", "entryKind", "sourceDigest", "profileSchemaVersion", descriptor,
         "descriptorHash", "toolchainDigest", state, "sealedAt")
        VALUES ($1, $2, 'raster-asset', $3, 1, $4, $5, $6, $7,
          CASE WHEN $7='sealed' THEN statement_timestamp() ELSE NULL END)`,
      [source.set, source.run, source.source,
        { schema: "toonspectrum.creator-asset-artifact-set", version: 1, id: source.set }, digest(), digest(), state],
      "creator_asset_artifact_set_initial_state");
    });
  });

  it.each(["state='failed'", "state='running'", '"sourceDigest"=\'sha256:' + "f".repeat(64) + "'", '"entryId"=\'other-entry\''])
  ("freezes referenced successful processing: %s", async (change) => {
    await transaction(async (connection) => {
      const source = await fixture(connection, "sealed");
      await rejects(connection, `UPDATE creator_asset_processing_run SET ${change} WHERE id=$1`, [source.run], "creator_asset_processing_run_terminal_immutable");
    });
  });

  it("allows processing completion before sealing and complete optional dimensions", async () => {
    await transaction(async (connection) => {
      const source = await fixture(connection, "building", "running");
      await rejects(connection, "UPDATE creator_asset_artifact_set SET state='sealed', \"sealedAt\"=statement_timestamp() WHERE id=$1", [source.set], "creator_asset_artifact_set_seal_processing");
      await connection.query('UPDATE creator_asset_artifact SET width=1, height=65536 WHERE "artifactSetId"=$1', [source.set]);
      await connection.query('UPDATE creator_asset_artifact SET width=NULL, height=NULL WHERE "artifactSetId"=$1', [source.set]);
      await connection.query("UPDATE creator_asset_processing_run SET state='succeeded', \"finishedAt\"=statement_timestamp() WHERE id=$1", [source.run]);
      await seal(connection, source.set);
    });
  });

  async function grant(connection: PoolClient, minimum: number | null = null, maximum: number | null = null, policy = "package-head", target: { packageId?: string; publisherId?: string; releaseId?: string; subjectType?: "user" | "organization"; subjectId?: string; validFrom?: string; validUntil?: string | null; existingWorkSurvives?: boolean; revokedAt?: string | null } = {}) {
    const id = randomUUID();
    await connection.query(`INSERT INTO creator_marketplace_entitlement_grant
      (id, "subjectType", "subjectId", "publisherId", "packageId", "releasePolicy", "minimumOrdinal", "maximumOrdinal", "releaseId",
       "grantType", scope, "validFrom", "validUntil", "existingWorkSurvives", "revokedAt", "sourceEventId")
      VALUES ($1, $9, $2, $6, $7, $3, $4, $5, $8, 'purchase', 'personal',
        coalesce($10::timestamptz, statement_timestamp()), $11, $12, $13, $1)`,
    [id, target.subjectId ?? owner, policy, minimum, maximum, target.publisherId ?? owner, target.packageId ?? 'fixture', target.releaseId ?? null,
      target.subjectType ?? "user", target.validFrom ?? null, target.validUntil ?? null, target.existingWorkSurvives ?? false, target.revokedAt ?? null]);
    return id;
  }

  async function release(connection: PoolClient, ordinal = 1, bind = true, entryIds = ["entry"]) {
    const source = await fixture(connection, "sealed");
    const id = randomUUID();
    const license = randomUUID();
    await connection.query(`INSERT INTO creator_marketplace_resource
      (id, "publisherId", "packageId", name, kind, "resourceVersion", "minimumStudioVersion",
       license, "provenanceOrigin", manifest, "manifestHash", "manifestByteSize", "releaseOrdinal")
      VALUES ($1, $2, $6, 'Fixture', 'asset', '1.0.0', '0.1.0', 'cc0-1.0', 'original', $3, $4, 100, $5)`,
    [id, owner, { schemaVersion: 1, packageId: source.draft, kind: "asset", resourceVersion: "1.0.0",
      minimumStudioVersion: "0.1.0", license: "cc0-1.0", provenance: { origin: "original" }, entries: entryIds.map((entryId) => ({ id: entryId })) }, digest().slice(7), ordinal, source.draft]);
    await connection.query(`INSERT INTO creator_asset_license_snapshot
      (id, "licenseCode", "policyVersion", capabilities, "legalTextDigest", "capturedAt", "reviewState", "reviewedBy")
      VALUES ($1, 'cc0-1.0', 1, '{}', $2, statement_timestamp(), 'pending', NULL)`, [license, digest()]);
    await connection.query(`UPDATE creator_asset_license_snapshot SET "reviewState"='approved', "reviewedBy"=$2 WHERE id=$1`, [license, owner]);
    if (bind) await connection.query(`INSERT INTO creator_marketplace_release_artifact_binding
      ("releaseId", "entryId", "artifactSetId", "licenseSnapshotId", "publicPreviewArtifactId", "bindingHash")
      VALUES ($1, 'entry', $2, $3, 'thumb', $4)`, [id, source.set, license, digest()]);
    return { ...source, id, license, packageId: source.draft };
  }

  async function workBinding(connection: PoolClient, selected: Awaited<ReturnType<typeof release>>, overrides: { releaseId?: string; entryId?: string; license?: string; entitlement?: string | null; digest?: string; insertedAt?: string; workOwner?: string } = {}) {
    const work = randomUUID();
    const target = (await connection.query<{ publisherId: string; packageId: string }>(
      'SELECT "publisherId", "packageId" FROM creator_marketplace_resource WHERE id=$1',
      [overrides.releaseId ?? selected.id],
    )).rows[0]!;
    const entitlement = overrides.entitlement !== undefined ? overrides.entitlement
      : await grant(connection, null, null, "package-head", target);
    await connection.query('INSERT INTO creator_work (id, "userId", title) VALUES ($1, $2, \'Fixture\')', [work, overrides.workOwner ?? owner]);
    await connection.query(`INSERT INTO creator_work_catalog_asset_binding
      ("workId", "attachmentId", "assetType", "releaseId", "entryId", "artifactSetId", "selectedArtifactId",
       "expectedContentDigest", "licenseSnapshotId", "entitlementGrantId", "useReceiptId", "qualityProfile", "insertedAt")
      VALUES ($1, 'attachment', 'raster', $2, $3, $4, 'source', $5, $6, $7, $1, 'source', coalesce($8::timestamptz, statement_timestamp()))`,
    [work, overrides.releaseId ?? selected.id, overrides.entryId ?? "entry", selected.set, overrides.digest ?? selected.source,
      overrides.license ?? selected.license, entitlement, overrides.insertedAt ?? null]);
    return { work, entitlement };
  }

  it.each(["other-user", "organization", "revoked", "future", "expired", "expired-survivable"] as const)("rejects new work acquisition with a %s entitlement", async (kind) => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const entitlement = await grant(connection, null, null, "package-head", {
        packageId: selected.packageId,
        subjectId: kind === "other-user" ? randomUUID() : owner,
        subjectType: kind === "organization" ? "organization" : "user",
        validFrom: kind === "future" ? "2999-01-01T00:00:00Z" : "2000-01-01T00:00:00Z",
        validUntil: kind.startsWith("expired") ? "2001-01-01T00:00:00Z" : null,
        revokedAt: kind === "revoked" ? "2000-01-01T00:00:00Z" : null,
        existingWorkSurvives: kind === "expired-survivable",
      });
      await expect(workBinding(connection, selected, { entitlement, insertedAt: "2000-06-01T00:00:00Z" }))
        .rejects.toMatchObject({ constraint: "creator_work_catalog_asset_binding_entitlement_authorization" });
    });
  });

  it("uses server acquisition time for a valid owner grant and preserves publisher grant-free insertion", async () => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const before = (await connection.query<{ now: Date }>('SELECT statement_timestamp() AS now')).rows[0]!.now;
      const accepted = await workBinding(connection, selected, { insertedAt: "2000-06-01T00:00:00Z" });
      const row = (await connection.query<{ insertedAt: Date }>('SELECT "insertedAt" FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows[0]!;
      expect(row.insertedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect((await workBinding(connection, selected, { entitlement: null })).entitlement).toBeNull();
    });
  });

  it("requires a verified grant for another user's CC0 release instead of trusting a free access claim", async () => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const reader = randomUUID();
      await connection.query('INSERT INTO "user" (id,name) VALUES ($1,\'Reader\')', [reader]);
      await expect(workBinding(connection, selected, { entitlement: null, workOwner: reader }))
        .rejects.toMatchObject({ constraint: "creator_work_catalog_asset_binding_entitlement_authorization" });
    });
  });

  it.each(["insertedAt", "insertedBy", "entitlementGrantId"] as const)("preserves acquisition proof and nullable attribution: %s", async (field) => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const accepted = await workBinding(connection, selected);
      const value = field === "insertedAt" ? "2000-01-01T00:00:00Z" : field === "insertedBy" ? owner : null;
      if (field === "insertedBy") {
        await connection.query('UPDATE creator_work_catalog_asset_binding SET "insertedBy"=$2 WHERE "workId"=$1', [accepted.work, owner]);
        expect((await connection.query('SELECT "insertedBy" FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows[0]?.insertedBy).toBe(owner);
        await connection.query('UPDATE creator_work_catalog_asset_binding SET "insertedBy"=NULL WHERE "workId"=$1', [accepted.work]);
        expect((await connection.query('SELECT "insertedBy" FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows[0]?.insertedBy).toBeNull();
        return;
      }
      await rejects(connection, `UPDATE creator_work_catalog_asset_binding SET "${field}"=$2 WHERE "workId"=$1`,
        [accepted.work, value], "creator_work_catalog_asset_binding_entitlement_evidence");
    });
  });

  it("keeps another owner's binding when its attributed author is deleted", async () => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const accepted = await workBinding(connection, selected);
      const author = randomUUID();
      await connection.query('INSERT INTO "user" (id,name) VALUES ($1,\'Departing contributor\')', [author]);
      await connection.query('UPDATE creator_work_catalog_asset_binding SET "insertedBy"=$2 WHERE "workId"=$1', [accepted.work, author]);
      const before = (await connection.query('SELECT * FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows[0];
      await connection.query('DELETE FROM "user" WHERE id=$1', [author]);
      const remaining = (await connection.query('SELECT * FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows;
      expect(remaining).toEqual([{ ...before, insertedBy: null }]);
      expect((await connection.query('SELECT "userId" FROM creator_work WHERE id=$1', [accepted.work])).rows[0]?.userId).toBe(owner);
    });
  });

  it("preserves revoked reference metadata but reauthorizes work, attachment, release and grant changes", async () => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const accepted = await workBinding(connection, selected);
      await connection.query('UPDATE creator_marketplace_entitlement_grant SET "revokedAt"=statement_timestamp() WHERE id=$1', [accepted.entitlement]);
      const evidence = async () => (await connection.query('SELECT "insertedAt","insertedBy","entitlementGrantId","releaseId" FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows[0];
      const before = await evidence();
      await connection.query('UPDATE creator_work_catalog_asset_binding SET state=\'revoked-warning\',"qualityProfile"=\'mobile\',"lastResolvedAt"=statement_timestamp() WHERE "workId"=$1', [accepted.work]);
      expect(await evidence()).toEqual(before);
      const work = randomUUID();
      await connection.query('INSERT INTO creator_work (id,"userId",title) VALUES ($1,$2,\'Other work\')', [work, owner]);
      for (const [field, value] of [["workId", work], ["attachmentId", "another-attachment"]]) {
        await rejects(connection, `UPDATE creator_work_catalog_asset_binding SET "${field}"=$2 WHERE "workId"=$1`, [accepted.work, value],
          "creator_work_catalog_asset_binding_entitlement_authorization");
      }
      const unrelated = await release(connection);
      await rejects(connection, 'UPDATE creator_work_catalog_asset_binding SET "releaseId"=$2 WHERE "workId"=$1', [accepted.work, unrelated.id],
        "creator_work_catalog_asset_binding_entitlement_release");
      const future = await grant(connection, null, null, "package-head", { packageId: selected.packageId, validFrom: "2999-01-01T00:00:00Z" });
      await rejects(connection, 'UPDATE creator_work_catalog_asset_binding SET "entitlementGrantId"=$2 WHERE "workId"=$1', [accepted.work, future],
        "creator_work_catalog_asset_binding_entitlement_authorization");
    });
  });

  it.each((["valid", "revoked", "expired", "other-owner"] as const).flatMap((status) =>
    ["entry, artifact set and license", "selected artifact and digest", "use receipt", "asset type"].map((change) => ({ status, change })),
  ))("reauthorizes $change replacement with a $status grant", async ({ status, change: requestedChange }) => {
    await transaction(async (connection) => {
      const selected = await release(connection, 1, true, ["entry", "other-entry"]);
      const alternate = await fixture(connection, "sealed", "succeeded", {
        packageId: selected.packageId, entryId: "other-entry", draftId: selected.draft,
      });
      const license = randomUUID();
      await connection.query(`INSERT INTO creator_asset_license_snapshot
        (id, "licenseCode", "policyVersion", capabilities, "legalTextDigest", "capturedAt", "reviewState")
        VALUES ($1, 'cc0-1.0', 1, '{}', $2, statement_timestamp(), 'pending')`, [license, digest()]);
      await connection.query('UPDATE creator_asset_license_snapshot SET "reviewState"=\'approved\', "reviewedBy"=$2 WHERE id=$1', [license, owner]);
      await connection.query(`INSERT INTO creator_marketplace_release_artifact_binding
        ("releaseId", "entryId", "artifactSetId", "licenseSnapshotId", "publicPreviewArtifactId", "bindingHash")
        VALUES ($1, 'other-entry', $2, $3, 'thumb', $4)`, [selected.id, alternate.set, license, digest()]);
      const artifact = (await connection.query<{ objectDigest: string }>(
        'SELECT "objectDigest" FROM creator_asset_artifact WHERE "artifactSetId"=$1 AND "artifactId"=\'runtime\'', [selected.set],
      )).rows[0]!;
      const changes: Array<{ name: string; sql: string; values: unknown[] }> = [
        { name: "entry, artifact set and license", sql: '"entryId"=\'other-entry\', "artifactSetId"=$2, "licenseSnapshotId"=$3, "expectedContentDigest"=$4', values: [alternate.set, license, alternate.source] },
        { name: "selected artifact and digest", sql: '"selectedArtifactId"=\'runtime\', "expectedContentDigest"=$2', values: [artifact.objectDigest] },
        { name: "use receipt", sql: '"useReceiptId"=$2', values: [randomUUID()] },
        { name: "asset type", sql: '"assetType"=\'vector\'', values: [] },
      ];
      for (const change of changes.filter((candidate) => candidate.name === requestedChange)) {
        const expiry = status === "expired"
          ? (await connection.query<{ until: Date }>("SELECT clock_timestamp() + interval '1 second' AS until")).rows[0]!.until
          : null;
        const expiringGrant = expiry ? await grant(connection, null, null, "package-head", {
          packageId: selected.packageId, validFrom: "2000-01-01T00:00:00Z", validUntil: expiry.toISOString(), existingWorkSurvives: true,
        }) : undefined;
        const accepted = await workBinding(connection, selected, { entitlement: expiringGrant });
        if (status === "revoked") {
          await connection.query('UPDATE creator_marketplace_entitlement_grant SET "revokedAt"=statement_timestamp() WHERE id=$1', [accepted.entitlement]);
        } else if (status === "expired") {
          // Cross the real database clock boundary; entitlement facts remain immutable.
          await connection.query("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM $1::timestamptz - clock_timestamp())) + 0.005)", [expiry]);
          expect((await connection.query<{ expired: boolean }>(
            'SELECT "validUntil" < statement_timestamp() AS expired FROM creator_marketplace_entitlement_grant WHERE id=$1', [accepted.entitlement],
          )).rows[0]?.expired).toBe(true);
        } else if (status === "other-owner") {
          const nextOwner = randomUUID();
          await connection.query('INSERT INTO "user" (id,name) VALUES ($1,\'New owner\')', [nextOwner]);
          await connection.query('UPDATE creator_work SET "userId"=$2 WHERE id=$1', [accepted.work, nextOwner]);
        }
        const snapshot = async () => (await connection.query('SELECT * FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows[0];
        const before = await snapshot();
        const sql = `UPDATE creator_work_catalog_asset_binding SET ${change.sql} WHERE "workId"=$1 RETURNING *`;
        if (status === "valid") {
          const updated = (await connection.query(sql, [accepted.work, ...change.values])).rows[0];
          expect(updated, change.name).toMatchObject({ workId: before.workId, attachmentId: before.attachmentId, releaseId: before.releaseId,
            entitlementGrantId: before.entitlementGrantId, insertedAt: before.insertedAt });
          expect(updated, change.name).not.toEqual(before);
        } else {
          await rejects(connection, sql, [accepted.work, ...change.values], "creator_work_catalog_asset_binding_entitlement_authorization");
          expect(await snapshot(), change.name).toEqual(before);
          // Revoked/expired historical references still accept resolution and warning metadata.
          await connection.query(`UPDATE creator_work_catalog_asset_binding
            SET state='revoked-warning', "qualityProfile"='mobile', "lastResolvedAt"=statement_timestamp() WHERE "workId"=$1`, [accepted.work]);
          expect(await snapshot()).toMatchObject({ ...before, state: "revoked-warning", qualityProfile: "mobile", lastResolvedAt: expect.any(Date) });
        }
      }
    });
  });

  it.each([true, false])("preserves expired historical receipts without granting new use (survival=%s)", async (survives) => {
    const legacy = `asset_authorization_${randomUUID().replaceAll("-", "")}`;
    const connection = await client();
    try {
      await connection.query(`CREATE SCHEMA "${legacy}"`);
      for (const table of ["user", "creator_work", "creator_marketplace_resource", "creator_asset_storage_object"]) {
        await connection.query(`CREATE TABLE "${legacy}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
      }
      await migrate(connection, legacy, 42);
      await connection.query(`SET search_path TO "${legacy}", public`);
      await connection.query('INSERT INTO "user" (id,name) VALUES ($1,\'Historical owner\')', [owner]);
      const selected = await release(connection);
      const entitlement = await grant(connection, null, null, "package-head", { packageId: selected.packageId,
        validFrom: "2000-01-01T00:00:00Z", validUntil: "2001-01-01T00:00:00Z", existingWorkSurvives: survives });
      const accepted = await workBinding(connection, selected, { entitlement, insertedAt: "2000-06-01T00:00:00Z" });
      const snapshot = async () => (await connection.query('SELECT * FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows[0];
      const before = await snapshot();
      const migration = await readFile(new URL("../../../../../apps/api/src/db/migrations/0044_creator_work_entitlement_authorization.sql", import.meta.url), "utf8");
      await connection.query(migration.replaceAll("public.", `"${legacy}".`));
      expect(await snapshot()).toEqual(before);
      await connection.query('UPDATE creator_work_catalog_asset_binding SET "qualityProfile"=\'mobile\',state=\'revoked-warning\' WHERE "workId"=$1', [accepted.work]);
      expect(await snapshot()).toEqual({ ...before, qualityProfile: "mobile", state: "revoked-warning" });
      await expect(workBinding(connection, selected, { entitlement, insertedAt: "2000-06-01T00:00:00Z" }))
        .rejects.toMatchObject({ constraint: "creator_work_catalog_asset_binding_entitlement_authorization" });
    } finally {
      await connection.query("ROLLBACK");
      await connection.query(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);
      connection.release();
    }
  });

  it.each(["binding-first", "revocation-first"] as const)("serializes entitlement revocation and acquisition: %s", async (order) => {
    const first = await client(); const second = await client();
    try {
      const selected = await release(first);
      const entitlement = await grant(first, null, null, "package-head", { packageId: selected.packageId });
      const reference = await workBinding(first, selected, { entitlement: null });
      const bind = (connection: PoolClient) => connection.query('UPDATE creator_work_catalog_asset_binding SET "entitlementGrantId"=$2 WHERE "workId"=$1', [reference.work, entitlement]);
      const revoke = (connection: PoolClient) => connection.query('UPDATE creator_marketplace_entitlement_grant SET "revokedAt"=statement_timestamp() WHERE id=$1', [entitlement]);
      const backend = (await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!;
      await first.query("BEGIN");
      await (order === "binding-first" ? bind(first) : revoke(first));
      const pending = (order === "binding-first" ? revoke(second) : bind(second))
        .then(() => ({ accepted: true }), (error: { constraint?: string }) => ({ accepted: false, constraint: error.constraint }));
      await expect.poll(async () => (await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [backend.pid])).rows[0]?.wait_event_type).toBe("Lock");
      await first.query("COMMIT");
      expect(await pending).toEqual(order === "binding-first" ? { accepted: true }
        : { accepted: false, constraint: "creator_work_catalog_asset_binding_entitlement_authorization" });
    } finally { await first.query("ROLLBACK"); first.release(); second.release(); }
  });

  it.each(["release", "entry", "license"] as const)("rejects a mismatched release-entry %s attachment", async (field) => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const unrelated = await release(connection);
      const overrides = field === "release" ? { releaseId: unrelated.id }
        : field === "entry" ? { entryId: "other-entry" } : { license: unrelated.license };
      await expect(workBinding(connection, selected, overrides)).rejects.toMatchObject({ constraint: "creator_work_catalog_asset_binding_release_entry_fkey" });
    });
  });

  it("keeps attached grants immutable while permitting work deletion", async () => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const { work, entitlement } = await workBinding(connection, selected);
      await rejects(connection, 'DELETE FROM creator_marketplace_entitlement_grant WHERE id=$1', [entitlement], "creator_marketplace_entitlement_delete_immutable");
      expect((await connection.query('SELECT "entitlementGrantId" FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [work])).rows[0].entitlementGrantId).toBe(entitlement);
      await connection.query('DELETE FROM creator_work WHERE id=$1', [work]);
      expect((await connection.query('SELECT id FROM creator_marketplace_entitlement_grant WHERE id=$1', [entitlement])).rowCount).toBe(1);
      expect((await connection.query('SELECT "workId" FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [work])).rowCount).toBe(0);
    });
  });

  it("preserves grants through deletion attempts and allows exactly one revocation", async () => {
    await transaction(async (connection) => {
      const id = await grant(connection);
      await rejects(connection, "DELETE FROM creator_marketplace_entitlement_grant WHERE id=$1", [id], "creator_marketplace_entitlement_delete_immutable");
      await connection.query('UPDATE creator_marketplace_entitlement_grant SET "revokedAt"=statement_timestamp() WHERE id=$1', [id]);
      await rejects(connection, 'UPDATE creator_marketplace_entitlement_grant SET "revokedAt"=statement_timestamp() WHERE id=$1', [id], "creator_marketplace_entitlement_revocation");
    });
  });

  it.each([[null, 2], [1, null], [null, null]])("rejects nullable range ordinals %s/%s", async (minimum, maximum) => {
    await transaction(async (connection) => {
      await expect(grant(connection, minimum, maximum, "range")).rejects.toMatchObject({ constraint: "creator_marketplace_entitlement_policy_check" });
    });
  });

  it("accepts bounded complete range entitlements", async () => {
    await transaction(async (connection) => {
      await grant(connection, 1, 1, "range");
      await grant(connection, 1, 2_147_483_647, "range");
    });
  });

  it.each(["publisher", "package", "exact", "below-range", "above-range"])(
    "rejects unrelated entitlement %s evidence without creating a work binding", async (mismatch) => {
      await transaction(async (connection) => {
        const selected = await release(connection, 2);
        const unrelated = await release(connection);
        let publisherId = owner;
        if (mismatch === "publisher") {
          publisherId = randomUUID();
          await connection.query('INSERT INTO "user" (id, name) VALUES ($1, \'Other publisher\')', [publisherId]);
        }
        const policy = mismatch === "exact" ? "exact" : mismatch.endsWith("range") ? "range" : "package-head";
        const entitlement = await grant(connection,
          mismatch === "below-range" ? 3 : mismatch === "above-range" ? 1 : null,
          mismatch === "below-range" ? 4 : mismatch === "above-range" ? 1 : null,
          policy, { publisherId, packageId: mismatch === "package" ? unrelated.packageId : selected.packageId,
            releaseId: mismatch === "exact" ? unrelated.id : undefined });
        await connection.query("SAVEPOINT invalid_binding");
        await expect(workBinding(connection, selected, { entitlement })).rejects.toMatchObject({
          constraint: "creator_work_catalog_asset_binding_entitlement_release",
        });
        await connection.query("ROLLBACK TO SAVEPOINT invalid_binding");
        expect((await connection.query('SELECT count(*)::int AS count FROM creator_work_catalog_asset_binding WHERE "releaseId"=$1', [selected.id])).rows[0].count).toBe(0);
      });
    },
  );

  it.each(["exact", "range-min", "range-max", "package-head", "no-grant"])(
    "preserves valid %s release bindings", async (policy) => {
      await transaction(async (connection) => {
        const selected = await release(connection, 2);
        const entitlement = policy === "no-grant" ? null : await grant(connection,
          policy.startsWith("range") ? policy === "range-min" ? 2 : 1 : null,
          policy.startsWith("range") ? policy === "range-max" ? 2 : 3 : null,
          policy.startsWith("range") ? "range" : policy,
          { packageId: selected.packageId, releaseId: policy === "exact" ? selected.id : undefined });
        const bound = await workBinding(connection, selected, { entitlement });
        expect((await connection.query('SELECT "entitlementGrantId" FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [bound.work])).rows[0].entitlementGrantId).toBe(entitlement);
        const unrelated = await grant(connection);
        await rejects(connection, 'UPDATE creator_work_catalog_asset_binding SET "entitlementGrantId"=$2 WHERE "workId"=$1',
          [bound.work, unrelated], "creator_work_catalog_asset_binding_entitlement_release");
      });
    },
  );

  it.each(["sourceDigest", "toolchainDigest", "pipelineProfile", "pipelineVersion"])(
    "refuses a seal whose completed processing %s differs from the descriptor", async (field) => {
      await transaction(async (connection) => {
        const source = await fixture(connection, "building", "running");
        const value = field === "pipelineVersion" ? 2 : field === "pipelineProfile" ? "other-profile" : digest();
        await connection.query(`UPDATE creator_asset_processing_run SET "${field}"=$2, state='succeeded', "finishedAt"=statement_timestamp() WHERE id=$1`, [source.run, value]);
        await rejects(connection, 'UPDATE creator_asset_artifact_set SET state=\'sealed\', "sealedAt"=statement_timestamp() WHERE id=$1',
          [source.set], "creator_asset_artifact_set_seal_lineage");
        expect((await connection.query('SELECT state FROM creator_asset_artifact_set WHERE id=$1', [source.set])).rows[0].state).toBe("building");
      });
    },
  );

  it.each(["entryKind", "sourceDigest", "toolchainDigest", "profileId", "profileVersion", "missing", "string-version"])(
    "refuses mismatched or incomplete descriptor lineage: %s", async (field) => {
      await transaction(async (connection) => {
        const source = await fixture(connection);
        const descriptor: Record<string, unknown> = { ...source.descriptor };
        if (field === "missing") delete descriptor.sourceDigest;
        else if (field === "string-version") descriptor.profileVersion = "1";
        else descriptor[field] = field === "profileVersion" ? 2 : field === "entryKind" ? "vector-asset" : "unrelated";
        await connection.query('UPDATE creator_asset_artifact_set SET descriptor=$2 WHERE id=$1', [source.set, descriptor]);
        await rejects(connection, 'UPDATE creator_asset_artifact_set SET state=\'sealed\', "sealedAt"=statement_timestamp() WHERE id=$1',
          [source.set], "creator_asset_artifact_set_seal_lineage");
      });
    },
  );

  async function changeDraft(connection: PoolClient, draft: string, state: string, set: string | null, license: string | null, published: string | null = null) {
    return connection.query(`UPDATE creator_marketplace_draft SET state=$2, "artifactSetId"=$3,
      "licenseSnapshotId"=$4, "publishedReleaseId"=$5, "currentRevision"="currentRevision"+1,
      "updatedAt"=greatest(statement_timestamp(), "updatedAt"+interval '1 microsecond') WHERE id=$1`,
    [draft, state, set, license, published]);
  }

  it.each(["artifactSetId", "licenseSnapshotId"])("rejects dangling nullable draft %s pointers", async (field) => {
    await transaction(async (connection) => {
      const draft = randomUUID();
      await rejects(connection, `INSERT INTO creator_marketplace_draft (id, "publisherId", "packageId", kind, name, "${field}")
        VALUES ($1, $2, $1, 'asset', 'Invalid evidence', 'missing-evidence')`, [draft, owner],
      `creator_marketplace_draft_${field === "artifactSetId" ? "artifact_set" : "license_snapshot"}_fkey`);
    });
  });

  it("keeps nullable editing drafts usable and prevents deleting their referenced evidence", async () => {
    await transaction(async (connection) => {
      const source = await fixture(connection);
      const license = randomUUID();
      await connection.query(`INSERT INTO creator_asset_license_snapshot
        (id, "licenseCode", "policyVersion", capabilities, "legalTextDigest", "capturedAt", "reviewState")
        VALUES ($1, 'cc0-1.0', 1, '{}', $2, statement_timestamp(), 'pending')`, [license, digest()]);
      await changeDraft(connection, source.draft, "editing", source.set, license);
      await connection.query('DELETE FROM creator_asset_qa_report WHERE "artifactSetId"=$1', [source.set]);
      await connection.query('DELETE FROM creator_asset_artifact WHERE "artifactSetId"=$1', [source.set]);
      await rejects(connection, 'DELETE FROM creator_asset_artifact_set WHERE id=$1', [source.set], "creator_marketplace_draft_artifact_set_fkey");
      await rejects(connection, 'DELETE FROM creator_asset_license_snapshot WHERE id=$1', [license], "creator_marketplace_draft_license_snapshot_fkey");
      await changeDraft(connection, source.draft, "editing", null, null);
      await connection.query('DELETE FROM creator_asset_artifact_set WHERE id=$1', [source.set]);
      await connection.query('DELETE FROM creator_asset_license_snapshot WHERE id=$1', [license]);
    });
  });

  it.each(["missing", "building", "other-draft", "rejected-license"])("rejects invalid %s evidence before review", async (kind) => {
    await transaction(async (connection) => {
      const source = await fixture(connection, kind === "building" ? "building" : "sealed");
      const selected = await release(connection);
      const license = randomUUID();
      await connection.query(`INSERT INTO creator_asset_license_snapshot
        (id, "licenseCode", "policyVersion", capabilities, "legalTextDigest", "capturedAt", "reviewState")
        VALUES ($1, 'cc0-1.0', 1, '{}', $2, statement_timestamp(), 'pending')`, [license, digest()]);
      await connection.query(`UPDATE creator_asset_license_snapshot SET "reviewState"='rejected', "reviewedBy"=$2 WHERE id=$1`, [license, owner]);
      await changeDraft(connection, source.draft, "processing", null, null);
      await connection.query("SAVEPOINT review");
      await expect(changeDraft(connection, source.draft, "ready-to-submit", kind === "missing" ? null : kind === "other-draft" ? selected.set : source.set,
        kind === "missing" ? null : kind === "rejected-license" ? license : selected.license)).rejects.toMatchObject({ constraint: "creator_marketplace_draft_review_evidence" });
      await connection.query("ROLLBACK TO SAVEPOINT review");
      expect((await connection.query('SELECT state FROM creator_marketplace_draft WHERE id=$1', [source.draft])).rows[0].state).toBe("processing");
    });
  });

  it("allows pending rights review, requires approval and publishes only the reviewed release evidence", async () => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      const pending = randomUUID();
      await connection.query(`INSERT INTO creator_asset_license_snapshot
        (id, "licenseCode", "policyVersion", capabilities, "legalTextDigest", "capturedAt", "reviewState")
        VALUES ($1, 'cc0-1.0', 1, '{}', $2, statement_timestamp(), 'pending')`, [pending, digest()]);
      await changeDraft(connection, selected.draft, "processing", null, null);
      await changeDraft(connection, selected.draft, "ready-to-submit", selected.set, pending);
      await changeDraft(connection, selected.draft, "in-review", selected.set, pending);
      await connection.query("SAVEPOINT approval");
      await expect(changeDraft(connection, selected.draft, "approved", selected.set, pending)).rejects.toMatchObject({ constraint: "creator_marketplace_draft_review_evidence" });
      await connection.query("ROLLBACK TO SAVEPOINT approval");
      await changeDraft(connection, selected.draft, "approved", selected.set, selected.license);
      await changeDraft(connection, selected.draft, "publishing", selected.set, selected.license);
      const unrelated = await release(connection);
      await connection.query("SAVEPOINT publication");
      await expect(changeDraft(connection, selected.draft, "published", selected.set, selected.license, unrelated.id)).rejects.toMatchObject({ constraint: "creator_marketplace_draft_publication_evidence" });
      await connection.query("ROLLBACK TO SAVEPOINT publication");
      await connection.query("SAVEPOINT publication_license");
      await expect(changeDraft(connection, selected.draft, "published", selected.set, unrelated.license, selected.id)).rejects.toMatchObject({ constraint: "creator_marketplace_draft_publication_evidence" });
      await connection.query("ROLLBACK TO SAVEPOINT publication_license");
      await changeDraft(connection, selected.draft, "published", selected.set, selected.license, selected.id);
      expect((await connection.query('SELECT "publishedReleaseId" FROM creator_marketplace_draft WHERE id=$1', [selected.draft])).rows[0].publishedReleaseId).toBe(selected.id);
    });
  });

  it.each(["ready-to-submit", "in-review", "approved", "publishing", "published"])(
    "does not bypass evidence validation through direct %s draft insertion", async (state) => {
      await transaction(async (connection) => {
        const selected = await release(connection);
        const draft = randomUUID();
        await rejects(connection, `INSERT INTO creator_marketplace_draft (id, "publisherId", "packageId", kind, name, state, "publishedReleaseId")
          VALUES ($1, $2, $1, 'asset', 'Missing review evidence', $3, $4)`,
        [draft, owner, state, state === "published" ? selected.id : null], "creator_marketplace_draft_review_evidence");
      });
    },
  );

  it.each(["lineage", "entitlement", "dangling", "review", "publication"] as const)(
    "aborts 0041 atomically on existing invalid %s evidence without rewriting it", async (kind) => {
      const legacy = `asset_legacy_${randomUUID().replaceAll("-", "")}`;
      const connection = await client();
      try {
        await connection.query(`CREATE SCHEMA "${legacy}"`);
        for (const table of ["user", "creator_work", "creator_marketplace_resource", "creator_asset_storage_object"]) {
          await connection.query(`CREATE TABLE "${legacy}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
        }
        await migrate(connection, legacy, 40);
        await connection.query(`SET search_path TO "${legacy}", public`);
        await connection.query('INSERT INTO "user" (id, name) VALUES ($1, \'Migration fixture\')', [owner]);
        const selected = await release(connection);
        if (kind === "lineage") {
          const source = await fixture(connection);
          await connection.query('UPDATE creator_asset_artifact_set SET descriptor=descriptor-\'sourceDigest\' WHERE id=$1', [source.set]);
          await seal(connection, source.set);
        } else if (kind === "entitlement") {
          const unrelated = await grant(connection);
          await workBinding(connection, selected, { entitlement: unrelated });
        } else if (kind === "dangling") {
          await changeDraft(connection, selected.draft, "editing", "missing-evidence", null);
        } else {
          await changeDraft(connection, selected.draft, "processing", null, null);
          await changeDraft(connection, selected.draft, "ready-to-submit", null, null);
          if (kind === "publication") {
            await changeDraft(connection, selected.draft, "in-review", selected.set, selected.license);
            await changeDraft(connection, selected.draft, "approved", selected.set, selected.license);
            await changeDraft(connection, selected.draft, "publishing", selected.set, selected.license);
            const unrelated = await release(connection);
            await changeDraft(connection, selected.draft, "published", selected.set, selected.license, unrelated.id);
          }
        }
        const snapshot = async () => {
          const rows: Record<string, unknown[]> = {};
          for (const table of ["creator_marketplace_draft", "creator_asset_artifact_set", "creator_work_catalog_asset_binding", "creator_marketplace_entitlement_grant"]) {
            rows[table] = (await connection.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows;
          }
          return rows;
        };
        const before = await snapshot();
        const sql = await readFile(new URL("../../../../../apps/api/src/db/migrations/0041_creator_asset_evidence_lineage.sql", import.meta.url), "utf8");
        const constraint = {
          lineage: "creator_asset_artifact_set_seal_lineage", entitlement: "creator_work_catalog_asset_binding_entitlement_release",
          dangling: "creator_marketplace_draft_artifact_set_fkey", review: "creator_marketplace_draft_review_evidence",
          publication: "creator_marketplace_draft_publication_evidence",
        }[kind];
        await expect(connection.query(sql.replaceAll("public.", `"${legacy}".`))).rejects.toMatchObject({ constraint });
        await connection.query("ROLLBACK");
        expect(await snapshot()).toEqual(before);
        expect((await connection.query('SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid=$1::regclass AND conname=\'creator_marketplace_draft_artifact_set_fkey\'',
          [`"${legacy}".creator_marketplace_draft`])).rows[0].count).toBe(0);
      } finally {
        await connection.query("ROLLBACK");
        await connection.query(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);
        connection.release();
      }
    },
  );

  it.each([[null, 2], [1, null]])("rejects nullable artifact dimension pairs %s/%s", async (width, height) => {
    await transaction(async (connection) => {
      const source = await fixture(connection);
      await rejects(connection, 'UPDATE creator_asset_artifact SET width=$2, height=$3 WHERE "artifactSetId"=$1', [source.set, width, height], "creator_asset_artifact_dimensions_check");
    });
  });

  it("serializes concurrent QA mutation behind sealing and rejects the stale edit", async () => {
    const first = await client();
    const second = await client();
    try {
      const source = await fixture(first);
      const backend = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!;
      await first.query("BEGIN");
      await seal(first, source.set);
      const mutation = second.query("UPDATE creator_asset_qa_report SET state='failed', \"blockerCount\"=1 WHERE id=$1", [source.qa]);
      const outcome = mutation.then(() => ({ accepted: true }), (error: { constraint?: string }) => ({ accepted: false, constraint: error.constraint }));
      await expect.poll(async () => (await pool.query(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [backend.pid],
      )).rows[0]?.wait_event_type).toBe("Lock");
      await first.query("COMMIT");
      expect(await outcome).toEqual({ accepted: false, constraint: "creator_asset_qa_terminal_immutable" });
    } finally {
      await first.query("ROLLBACK");
      first.release();
      second.release();
    }
  });
  it.each(["entry", "publisher", "package"] as const)("rejects release bindings from another processing %s", async (kind) => {
    await transaction(async (connection) => {
      const selected = await release(connection, 1, false);
      const publisher = randomUUID();
      await connection.query('INSERT INTO "user" (id,name) VALUES ($1,\'Other publisher\')', [publisher]);
      const source = kind === "entry" ? selected : await fixture(connection, "sealed", "succeeded", {
        publisherId: kind === "publisher" ? publisher : owner,
        packageId: kind === "package" ? randomUUID() : selected.packageId,
        entryId: kind === "entry" ? "another-entry" : "entry",
      });
      await rejects(connection, `INSERT INTO creator_marketplace_release_artifact_binding
        ("releaseId","entryId","artifactSetId","licenseSnapshotId","publicPreviewArtifactId","bindingHash")
        VALUES ($1,$5,$2,$3,'thumb',$4)`, [selected.id, source.set, selected.license, digest(), kind === "entry" ? "another-entry" : "entry"],
      "creator_marketplace_release_binding_lineage");
    });
  });

  it.each(["approved", "rejected"])("rejects direct %s license insertion before pending review", async (state) => {
    await transaction(async (connection) => {
      await rejects(connection, `INSERT INTO creator_asset_license_snapshot
        (id,"licenseCode","policyVersion",capabilities,"legalTextDigest","capturedAt","reviewState","reviewedBy")
        VALUES ($1,'cc0-1.0',1,'{}',$2,statement_timestamp(),$3,$4)`, [randomUUID(), digest(), state, owner],
      "creator_asset_license_snapshot_initial_state");
    });
  });

  it("rejects an arbitrary work content pin while accepting the selected object's digest", async () => {
    await transaction(async (connection) => {
      const selected = await release(connection);
      await connection.query("SAVEPOINT wrong_digest");
      await expect(workBinding(connection, selected, { digest: digest() })).rejects.toMatchObject({ constraint: "creator_work_catalog_asset_binding_content_digest" });
      await connection.query("ROLLBACK TO SAVEPOINT wrong_digest");
      const accepted = await workBinding(connection, selected);
      expect((await connection.query('SELECT "expectedContentDigest" FROM creator_work_catalog_asset_binding WHERE "workId"=$1', [accepted.work])).rows[0].expectedContentDigest).toBe(selected.source);
    });
  });

  async function rightsEvidence(connection: PoolClient, source: string) {
    const license = randomUUID();
    const evidence = randomUUID();
    await connection.query(`INSERT INTO creator_asset_license_snapshot
      (id,"licenseCode","policyVersion",capabilities,"legalTextDigest","capturedAt")
      VALUES ($1,'cc0-1.0',1,'{}',$2,statement_timestamp())`, [license, digest()]);
    await connection.query(`INSERT INTO creator_asset_rights_evidence
      (id,"licenseSnapshotId","evidenceType","objectDigest","submittedBy") VALUES ($1,$2,'creator-attestation',$3,$4)`,
    [evidence, license, source, owner]);
    return { license, evidence };
  }

  it.each(["approved", "rejected"])("keeps %s rights evidence immutable, including reparent and late insertion", async (state) => {
    await transaction(async (connection) => {
      const source = await fixture(connection);
      const original = await rightsEvidence(connection, source.source);
      const target = await rightsEvidence(connection, source.source);
      await connection.query('UPDATE creator_asset_license_snapshot SET "reviewState"=$2,"reviewedBy"=$3 WHERE id=$1', [original.license, state, owner]);
      for (const sql of [
        'UPDATE creator_asset_rights_evidence SET visibility=\'publisher-and-reviewer\' WHERE id=$1',
        'DELETE FROM creator_asset_rights_evidence WHERE id=$1',
      ]) await rejects(connection, sql, [original.evidence], "creator_asset_rights_evidence_terminal_immutable");
      await rejects(connection, 'UPDATE creator_asset_rights_evidence SET "licenseSnapshotId"=$2 WHERE id=$1',
        [original.evidence, target.license], "creator_asset_rights_evidence_terminal_immutable");
      await rejects(connection, 'UPDATE creator_asset_rights_evidence SET "licenseSnapshotId"=$2 WHERE id=$1',
        [target.evidence, original.license], "creator_asset_rights_evidence_terminal_immutable");
      await rejects(connection, `INSERT INTO creator_asset_rights_evidence
        (id,"licenseSnapshotId","evidenceType","objectDigest") VALUES ($1,$2,'contract',$3)`,
      [randomUUID(), original.license, source.source], "creator_asset_rights_evidence_terminal_immutable");
      expect((await connection.query('SELECT "licenseSnapshotId" FROM creator_asset_rights_evidence WHERE id=$1', [original.evidence])).rows[0].licenseSnapshotId).toBe(original.license);
    });
  });

  it("allows pending evidence correction before the one terminal review", async () => {
    await transaction(async (connection) => {
      const source = await fixture(connection);
      const evidence = await rightsEvidence(connection, source.source);
      await connection.query('UPDATE creator_asset_rights_evidence SET visibility=\'publisher-and-reviewer\' WHERE id=$1', [evidence.evidence]);
      await connection.query('DELETE FROM creator_asset_rights_evidence WHERE id=$1', [evidence.evidence]);
      await connection.query('UPDATE creator_asset_license_snapshot SET "reviewState"=\'approved\',"reviewedBy"=$2 WHERE id=$1', [evidence.license, owner]);
      expect((await connection.query('SELECT "reviewState" FROM creator_asset_license_snapshot WHERE id=$1', [evidence.license])).rows[0].reviewState).toBe("approved");
    });
  });

  const deleteObject = `UPDATE creator_asset_storage_object SET state='deleting',"deleteToken"=$2 WHERE digest=$1 AND purpose='derived'`;

  it.each(["building", "sealed"] as const)("keeps referenced %s artifact bytes active during storage cleanup", async (state) => {
    await transaction(async (connection) => {
      const source = await fixture(connection, state);
      const object = source.descriptor.artifacts.find((artifact) => artifact.id === "runtime")!;
      await rejects(connection, deleteObject, [object.digest, randomUUID()], "creator_asset_storage_object_artifact_retention");
      expect((await connection.query('SELECT state FROM creator_asset_storage_object WHERE digest=$1', [object.digest])).rows[0].state).toBe("active");
    });
  });

  it.each(["deleting", "deleted"])("rejects attaching bytes already %s and permits cleanup after removing building references", async (state) => {
    await transaction(async (connection) => {
      const source = await fixture(connection);
      const original = (await connection.query('DELETE FROM creator_asset_artifact WHERE "artifactSetId"=$1 AND "artifactId"=\'runtime\' RETURNING *', [source.set])).rows[0];
      await connection.query(deleteObject, [original.objectDigest, randomUUID()]);
      if (state === "deleted") await connection.query('UPDATE creator_asset_storage_object SET state=\'deleted\',"deleteToken"=NULL,"deletedAt"=statement_timestamp() WHERE digest=$1', [original.objectDigest]);
      await rejects(connection, 'INSERT INTO creator_asset_artifact SELECT (jsonb_populate_record(NULL::creator_asset_artifact,$1::jsonb)).*',
        [JSON.stringify(original)], "creator_asset_artifact_storage_active");
    });
  });

  it.each(["active", "owner-delisted", "moderation-hold", "rights-suspended", "security-blocked", "revoked"])("retains %s availability instead of erasing its durable state", async (state) => {
    await transaction(async (connection) => {
      const source = await release(connection);
      await connection.query('INSERT INTO creator_marketplace_release_availability ("releaseId",state,"reasonCode") VALUES ($1,$2,$3)',
        [source.id, state, state === "active" ? null : "review-result"]);
      await rejects(connection, 'DELETE FROM creator_marketplace_release_availability WHERE "releaseId"=$1', [source.id], "creator_marketplace_release_availability_delete_immutable");
      expect((await connection.query('SELECT state FROM creator_marketplace_release_availability WHERE "releaseId"=$1', [source.id])).rows[0].state).toBe(state);
    });
  });

  it.each(["artifact-first", "cleanup-first"])("serializes active storage admission against cleanup: %s", async (order) => {
    const first = await client(); const second = await client();
    try {
      const source = await fixture(first);
      const original = (await first.query('DELETE FROM creator_asset_artifact WHERE "artifactSetId"=$1 AND "artifactId"=\'runtime\' RETURNING *', [source.set])).rows[0];
      const insert = (connection: PoolClient) => connection.query('INSERT INTO creator_asset_artifact SELECT (jsonb_populate_record(NULL::creator_asset_artifact,$1::jsonb)).*', [JSON.stringify(original)]);
      const remove = (connection: PoolClient) => connection.query(deleteObject, [original.objectDigest, randomUUID()]);
      const backend = (await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!;
      await first.query("BEGIN");
      await (order === "artifact-first" ? insert(first) : remove(first));
      const pending = (order === "artifact-first" ? remove(second) : insert(second))
        .then(() => ({ accepted: true }), (error: { constraint?: string }) => ({ accepted: false, constraint: error.constraint }));
      await expect.poll(async () => (await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [backend.pid])).rows[0]?.wait_event_type).toBe("Lock");
      await first.query("COMMIT");
      expect(await pending).toEqual({ accepted: false, constraint: order === "artifact-first"
        ? "creator_asset_storage_object_artifact_retention" : "creator_asset_artifact_storage_active" });
    } finally { await first.query("ROLLBACK"); first.release(); second.release(); }
  });

  it.each(["release-lineage", "work-pin", "inactive-storage", "valid"] as const)("validates 0042 historical %s without rewriting evidence", async (kind) => {
    const legacy = `asset_retention_${randomUUID().replaceAll("-", "")}`;
    const connection = await client();
    try {
      await connection.query(`CREATE SCHEMA "${legacy}"`);
      for (const table of ["user", "creator_work", "creator_marketplace_resource", "creator_asset_storage_object"]) {
        await connection.query(`CREATE TABLE "${legacy}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
      }
      await migrate(connection, legacy, 41);
      await connection.query(`SET search_path TO "${legacy}", public`);
      await connection.query('INSERT INTO "user" (id,name) VALUES ($1,\'Migration fixture\')', [owner]);
      const selected = await release(connection, 1, kind !== "release-lineage");
      if (kind === "release-lineage") {
        const unrelated = await fixture(connection, "sealed");
        await connection.query(`INSERT INTO creator_marketplace_release_artifact_binding
          ("releaseId","entryId","artifactSetId","licenseSnapshotId","publicPreviewArtifactId","bindingHash")
          VALUES ($1,'entry',$2,$3,'thumb',$4)`, [selected.id, unrelated.set, selected.license, digest()]);
      } else if (kind === "work-pin") {
        await workBinding(connection, selected, { digest: digest() });
      } else if (kind === "inactive-storage") {
        await connection.query(deleteObject, [selected.descriptor.artifacts.find((artifact) => artifact.id === "runtime")!.digest, randomUUID()]);
      }
      const snapshot = async () => {
        const rows: Record<string, unknown[]> = {};
        for (const table of ["creator_marketplace_release_artifact_binding", "creator_work_catalog_asset_binding", "creator_asset_license_snapshot", "creator_asset_storage_object"]) {
          rows[table] = (await connection.query(`SELECT * FROM "${table}" ORDER BY 1,2`)).rows;
        }
        return rows;
      };
      const before = await snapshot();
      const sql = (await readFile(new URL("../../../../../apps/api/src/db/migrations/0042_creator_asset_publication_retention.sql", import.meta.url), "utf8"))
        .replaceAll("public.", `"${legacy}".`);
      if (kind === "valid") {
        await connection.query(sql);
      } else {
        const constraint = { "release-lineage": "creator_marketplace_release_binding_lineage",
          "work-pin": "creator_work_catalog_asset_binding_content_digest", "inactive-storage": "creator_asset_artifact_storage_active" }[kind];
        await expect(connection.query(sql)).rejects.toMatchObject({ constraint });
        await connection.query("ROLLBACK");
      }
      expect(await snapshot()).toEqual(before);
      const triggers = (await connection.query(`SELECT count(*)::int AS count FROM pg_trigger
        WHERE tgrelid=$1::regclass AND tgname='creator_asset_license_snapshot_insert'`, [`"${legacy}".creator_asset_license_snapshot`])).rows[0].count;
      expect(triggers).toBe(kind === "valid" ? 1 : 0);
    } finally {
      await connection.query("ROLLBACK");
      await connection.query(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);
      connection.release();
    }
  });

  it.each(["review-first", "evidence-first"])("serializes review with rights evidence: %s", async (order) => {
    const first = await client(); const second = await client();
    try {
      const source = await fixture(first);
      const evidence = await rightsEvidence(first, source.source);
      const approve = (connection: PoolClient) => connection.query('UPDATE creator_asset_license_snapshot SET "reviewState"=\'approved\',"reviewedBy"=$2 WHERE id=$1', [evidence.license, owner]);
      const edit = (connection: PoolClient) => connection.query('UPDATE creator_asset_rights_evidence SET visibility=\'publisher-and-reviewer\' WHERE id=$1', [evidence.evidence]);
      const backend = (await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!;
      await first.query("BEGIN");
      await (order === "review-first" ? approve(first) : edit(first));
      const pending = (order === "review-first" ? edit(second) : approve(second))
        .then(() => ({ accepted: true }), (error: { constraint?: string }) => ({ accepted: false, constraint: error.constraint }));
      await expect.poll(async () => (await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [backend.pid])).rows[0]?.wait_event_type).toBe("Lock");
      await first.query("COMMIT");
      expect(await pending).toEqual(order === "review-first"
        ? { accepted: false, constraint: "creator_asset_rights_evidence_terminal_immutable" } : { accepted: true });
      expect((await first.query('SELECT "reviewState" FROM creator_asset_license_snapshot WHERE id=$1', [evidence.license])).rows[0].reviewState).toBe("approved");
    } finally { await first.query("ROLLBACK"); first.release(); second.release(); }
  });

  it("preserves least-privilege runtime cleanup without exposing artifact evidence", async () => {
    await transaction(async (connection) => {
      const role = `asset_cleanup_${randomUUID().replaceAll("-", "")}`;
      const retained = await fixture(connection, "sealed");
      const detached = await fixture(connection);
      const retainedDigest = retained.descriptor.artifacts.find((artifact) => artifact.id === "runtime")!.digest;
      const detachedDigest = detached.descriptor.artifacts.find((artifact) => artifact.id === "runtime")!.digest;
      await connection.query('DELETE FROM creator_asset_artifact WHERE "artifactSetId"=$1 AND "artifactId"=\'runtime\'', [detached.set]);
      await connection.query(`CREATE ROLE "${role}" NOLOGIN`);
      await connection.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
      await connection.query(`GRANT SELECT ON creator_asset_storage_object TO "${role}"`);
      await connection.query(`GRANT UPDATE ("state","deleteToken","updatedAt","deletedAt") ON creator_asset_storage_object TO "${role}"`);
      await connection.query(`SET LOCAL ROLE "${role}"`);
      await connection.query("SAVEPOINT private_catalog");
      await expect(connection.query('SELECT * FROM creator_asset_artifact')).rejects.toMatchObject({ code: "42501" });
      await connection.query("ROLLBACK TO SAVEPOINT private_catalog");
      await rejects(connection, deleteObject, [retainedDigest, randomUUID()], "creator_asset_storage_object_artifact_retention");
      await connection.query(deleteObject, [detachedDigest, randomUUID()]);
      expect((await connection.query('SELECT state FROM creator_asset_storage_object WHERE digest=$1', [detachedDigest])).rows[0].state).toBe("deleting");
      expect((await connection.query('SELECT has_function_privilege(current_user,$1,\'EXECUTE\') AS allowed',
        [`"${schema}".enforce_creator_asset_storage_artifact_retention()`])).rows[0].allowed).toBe(false);
      await connection.query("RESET ROLE");
    });
  });

});
