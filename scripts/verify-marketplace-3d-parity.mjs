import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import pg from "pg";

const OLD_MIGRATIONS = [
  "0021_creator_marketplace_resource.sql",
  "0022_creator_marketplace_distributed_gate_search.sql",
  "0030_creator_marketplace_immutable_releases.sql",
  "0031_creator_marketplace_moderation.sql",
  "0032_creator_marketplace_release_lifecycle.sql",
  "0033_creator_marketplace_cloud_library.sql",
  "0034_creator_marketplace_package_moderation.sql",
  "0035_creator_marketplace_3d_asset_kind.sql",
];
const KINDS = ["asset", "brush", "filter", "palette", "template", "3d-preset", "3d-asset"];
const PARITY_MIGRATION = "0037_creator_marketplace_3d_asset_parity.sql";
const HASH = "a".repeat(64);

async function run() {
  assert.equal(process.env.TOONSPECTRUM_MARKETPLACE_PARITY_DB_TEST, "1", "Explicit disposable-DB opt-in is required");
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol), "PostgreSQL is required");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Only loopback test databases are permitted");
  assert.equal(target.search, "", "Connection query overrides are not permitted");
  assert.equal(target.hash, "", "Connection fragments are not permitted");
  assert.ok(/(?:^|[_-])test(?:$|[_-])/iu.test(decodeURIComponent(target.pathname.slice(1))), "A test-scoped database name is required");
  const client = new pg.Client({ connectionString: target.href });
  await client.connect();
  let accepted = 0;
  let rejected = 0;

  async function migration(name) {
    const sql = await readFile(new URL(`../apps/api/src/db/migrations/${name}`, import.meta.url), "utf8");
    await client.query(sql);
  }

  async function library(kind) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO public.creator_marketplace_library_item
        ("id", "userId", "packageKeyHash", "publisherId", "packageId", "kind",
         "nameSnapshot", "addedFromResourceVersion", "addedFromReleaseOrdinal", "addedFromManifestHash")
       VALUES ($1, 'parity-viewer', $2, 'parity-publisher', $3, $4, 'Parity probe', '1.0.0', 1, $5)`,
      [id, randomBytes(32), `parity/${id}`, kind, HASH],
    );
    return id;
  }

  async function report(kind, schemaVersion = 3, evidencePatch = {}, columnPatch = {}) {
    const id = randomUUID();
    const snapshotId = randomUUID();
    const packageFields = schemaVersion === 1 ? {} : {
      publisherId: "parity-publisher",
      packageId: `parity/${id}`,
      packageModerationRevision: 0,
      ...(schemaVersion === 3 ? { packageReportEpoch: 1 } : {}),
    };
    const evidence = {
      schemaVersion,
      resourceId: snapshotId,
      manifestHash: HASH,
      manifestByteSize: 512,
      kind,
      license: "toonspectrum-standard",
      ...packageFields,
      ...evidencePatch,
    };
    const columns = {
      publisherId: packageFields.publisherId ?? null,
      packageId: packageFields.packageId ?? null,
      revision: packageFields.packageModerationRevision ?? null,
      epoch: packageFields.packageReportEpoch ?? null,
      ...columnPatch,
    };
    await client.query(
      `INSERT INTO public.creator_marketplace_resource_report
        ("id", "resourceId", "resourceSnapshotId", "reporterKeyHash", "reason", "evidence",
         "packagePublisherIdSnapshot", "packageIdSnapshot", "packageModerationRevision", "packageReportEpoch")
       VALUES ($1, NULL, $2, $3, 'other', $4::jsonb, $5, $6, $7, $8)`,
      [id, snapshotId, randomBytes(32), JSON.stringify(evidence), columns.publisherId, columns.packageId, columns.revision, columns.epoch],
    );
    return id;
  }

  async function mustReject(operation) {
    await assert.rejects(operation, (error) => error?.code === "23514", "Expected an actual PostgreSQL CHECK rejection");
    rejected += 1;
  }

  try {
    const tables = await client.query("SELECT count(*)::integer AS count FROM information_schema.tables WHERE table_schema = 'public'");
    assert.equal(tables.rows[0].count, 0, "Refusing a nonempty database; this verifier never resets existing schemas");
    await client.query(`
      CREATE TABLE public."user" (id text PRIMARY KEY, name text, avatar text, status text NOT NULL DEFAULT 'active');
      CREATE TABLE public.toonspectrum_schema_migration (
        id text PRIMARY KEY,
        "appliedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT toonspectrum_schema_migration_id_check CHECK (length(id) BETWEEN 1 AND 160)
      );
      INSERT INTO public."user" (id, name) VALUES ('parity-viewer', 'Parity viewer'), ('parity-publisher', 'Parity publisher');
    `);
    for (const name of OLD_MIGRATIONS) await migration(name);

    const retainedLibraryId = await library("brush");
    const retainedReportId = await report("brush");
    accepted += 2;
    await mustReject(() => library("3d-asset"));
    for (const version of [1, 2, 3]) await mustReject(() => report("3d-asset", version));
    console.log("PRE-0037: reproduced the real library and report-v1/v2/v3 3D rejection.");

    await migration(PARITY_MIGRATION);
    for (const kind of KINDS) {
      await library(kind);
      accepted += 1;
      for (const version of [1, 2, 3]) {
        await report(kind, version);
        accepted += 1;
      }
    }
    for (const license of ["cc0-1.0", "cc-by-4.0", "cc-by-nc-4.0"]) {
      await report("3d-asset", 3, { license });
      accepted += 1;
    }
    await mustReject(() => library("unknown-kind"));
    await mustReject(() => report("unknown-kind"));
    for (const patch of [
      { kind: undefined },
      { kind: null },
      { schemaVersion: 99 },
      { resourceId: randomUUID() },
      { manifestHash: "invalid" },
      { manifestByteSize: 0 },
      { manifestByteSize: 65537 },
      { license: "invented-license" },
      { publisherId: "different-publisher" },
      { packageId: "different/package" },
      { packageModerationRevision: 2 },
      { packageReportEpoch: 2 },
    ]) await mustReject(() => report("3d-asset", 3, patch));
    await mustReject(() => report("3d-asset", 3, {}, { epoch: null }));
    await mustReject(() => report("3d-asset", 2, {}, { epoch: 1 }));
    await mustReject(() => report("3d-asset", 1, {}, { epoch: 1 }));

    assert.equal((await client.query('SELECT kind FROM public.creator_marketplace_library_item WHERE id = $1', [retainedLibraryId])).rows[0].kind, "brush");
    assert.equal((await client.query('SELECT evidence FROM public.creator_marketplace_resource_report WHERE id = $1', [retainedReportId])).rows[0].evidence.kind, "brush");
    const constraints = await client.query(`
      SELECT conname, convalidated FROM pg_constraint
      WHERE conrelid IN ('public.creator_marketplace_library_item'::regclass, 'public.creator_marketplace_resource_report'::regclass)
        AND conname IN ('creator_marketplace_library_kind_check', 'creator_marketplace_resource_report_evidence_check')
    `);
    assert.equal(constraints.rowCount, 2);
    assert.ok(constraints.rows.every((row) => row.convalidated));
    console.log(`POST-0037: ${accepted} valid rows accepted; ${rejected} invalid writes rejected; old rows preserved; both constraints validated.`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("Marketplace 3D parity verification failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
