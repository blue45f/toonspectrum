import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

  beforeAll(async () => {
    pool = new Pool({ connectionString: integrationUrl, max: 4, statement_timeout: 10_000 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    // Clone only prerequisite structure, never application rows. The actual forward SQL below
    // creates all asset tables, foreign keys, checks and triggers in this owned namespace.
    for (const table of ["user", "creator_work", "creator_marketplace_resource", "creator_asset_storage_object"]) {
      await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    const manifest = await readFile(new URL("../../../../../scripts/production-database-migrations.manifest", import.meta.url), "utf8");
    for (const path of manifest.trim().split("\n").filter((path) => /\/00(?:39|40)_/u.test(path))) {
      const migration = await readFile(new URL(`../../../../../${path}`, import.meta.url), "utf8");
      await pool.query(migration.replaceAll("public.", `"${schema}".`));
    }
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

  async function fixture(connection: PoolClient, state: "building" | "sealed" | "rejected" = "building", runState = "succeeded") {
    const draft = randomUUID();
    const run = randomUUID();
    const set = randomUUID();
    const source = digest();
    const qa = randomUUID();
    await connection.query(`INSERT INTO creator_marketplace_draft
      (id, "publisherId", "packageId", kind, name) VALUES ($1, $2, $1, 'asset', 'Fixture')`, [draft, owner]);
    await connection.query(`INSERT INTO creator_asset_processing_run
      (id, "draftId", "entryId", "sourceDigest", "pipelineProfile", "pipelineVersion",
       "toolchainDigest", "idempotencyKey", state, "finishedAt")
      VALUES ($1, $2, 'entry', $3, 'fixture', 1, $4, $5, $6,
        CASE WHEN $6='succeeded' THEN statement_timestamp() ELSE NULL END)`,
    [run, draft, source, digest(), digest(), runState]);
    await connection.query(`INSERT INTO creator_asset_artifact_set
      (id, "processingRunId", "entryKind", "sourceDigest", "profileSchemaVersion", descriptor, "descriptorHash", "toolchainDigest")
      VALUES ($1, $2, 'raster-asset', $3, 1, $4, $5, $6)`,
    [set, run, source, { schema: "toonspectrum.creator-asset-artifact-set", version: 1, id: set }, digest(), digest()]);
    for (const [artifactId, role, purpose] of [
      ["source", "source-original", "source"], ["runtime", "runtime-default", "derived"], ["thumb", "thumbnail", "derived"],
    ]) {
      const objectDigest = artifactId === "source" ? source : digest();
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
    if (state !== "building") await seal(connection, set, state);
    return { draft, run, set, source, qa };
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

  async function grant(connection: PoolClient, minimum: number | null = null, maximum: number | null = null, policy = "package-head") {
    const id = randomUUID();
    await connection.query(`INSERT INTO creator_marketplace_entitlement_grant
      (id, "subjectType", "subjectId", "publisherId", "packageId", "releasePolicy", "minimumOrdinal", "maximumOrdinal",
       "grantType", scope, "validFrom", "sourceEventId")
      VALUES ($1, 'user', $2, $2, 'fixture', $3, $4, $5, 'purchase', 'personal', statement_timestamp(), $1)`, [id, owner, policy, minimum, maximum]);
    return id;
  }

  async function release(connection: PoolClient) {
    const source = await fixture(connection, "sealed");
    const id = randomUUID();
    const license = randomUUID();
    await connection.query(`INSERT INTO creator_marketplace_resource
      (id, "publisherId", "packageId", name, kind, "resourceVersion", "minimumStudioVersion",
       license, "provenanceOrigin", manifest, "manifestHash", "manifestByteSize")
      VALUES ($1, $2, $1, 'Fixture', 'asset', '1.0.0', '0.1.0', 'cc0-1.0', 'original', $3, $4, 100)`,
    [id, owner, { schemaVersion: 1, packageId: id, kind: "asset", resourceVersion: "1.0.0",
      minimumStudioVersion: "0.1.0", license: "cc0-1.0", provenance: { origin: "original" }, entries: [{ id: "entry" }] }, digest().slice(7)]);
    await connection.query(`INSERT INTO creator_asset_license_snapshot
      (id, "licenseCode", "policyVersion", capabilities, "legalTextDigest", "capturedAt", "reviewState", "reviewedBy")
      VALUES ($1, 'cc0-1.0', 1, '{}', $2, statement_timestamp(), 'approved', $3)`, [license, digest(), owner]);
    await connection.query(`INSERT INTO creator_marketplace_release_artifact_binding
      ("releaseId", "entryId", "artifactSetId", "licenseSnapshotId", "publicPreviewArtifactId", "bindingHash")
      VALUES ($1, 'entry', $2, $3, 'thumb', $4)`, [id, source.set, license, digest()]);
    return { ...source, id, license };
  }

  async function workBinding(connection: PoolClient, selected: Awaited<ReturnType<typeof release>>, overrides: { releaseId?: string; entryId?: string; license?: string } = {}) {
    const work = randomUUID();
    const entitlement = await grant(connection);
    await connection.query('INSERT INTO creator_work (id, "userId", title) VALUES ($1, $2, \'Fixture\')', [work, owner]);
    await connection.query(`INSERT INTO creator_work_catalog_asset_binding
      ("workId", "attachmentId", "assetType", "releaseId", "entryId", "artifactSetId", "selectedArtifactId",
       "expectedContentDigest", "licenseSnapshotId", "entitlementGrantId", "useReceiptId", "qualityProfile")
      VALUES ($1, 'attachment', 'raster', $2, $3, $4, 'source', $5, $6, $7, $1, 'source')`,
    [work, overrides.releaseId ?? selected.id, overrides.entryId ?? "entry", selected.set, selected.source,
      overrides.license ?? selected.license, entitlement]);
    return { work, entitlement };
  }

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
});
