#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { validatePostgresIntegrationUrl } from "./run-postgres-integration-tests.mjs";

// Only a newly provisioned disposable loopback database. Never inherit DATABASE_URL or .env.
const value = process.env.TEST_DATABASE_URL?.trim();
assert(value, "TEST_DATABASE_URL must identify a fresh disposable review test database");
validatePostgresIntegrationUrl(value, { environment: { NODE_ENV: "test" } });
const url = new URL(value);
assert(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname), "Review schema preparation is loopback-only");
assert(/(?:^|[_-])(?:test|integration)(?:$|[_-])/u.test(url.pathname.slice(1)), "The database name must identify a disposable test target");
const pool = new pg.Pool({ connectionString: value, application_name: "studio-review-test-schema" });
try {
  const tables = await pool.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'");
  assert.equal(tables.rows[0].count, 0, "Schema preparation requires an empty test database; existing data is never reset");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  const { stdout, stderr } = await promisify(execFile)("pnpm", ["db:push"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, DATABASE_URL: value, NODE_ENV: "test" },
    maxBuffer: 8 * 1024 * 1024,
  });
  // Drizzle can log an SQL error while exiting zero. Require its positive completion receipt.
  assert(/Changes applied/u.test(stdout) && !/\berror:/iu.test(stdout + stderr), "Drizzle did not confirm a successful test schema application");
  for (const migration of ["0064_studio_project_graph_v3.sql", "0077_membership_operations.sql", "0082_studio_review_policy.sql", "0083_studio_review_vote_epoch.sql", "0086_production_operation_policy.sql", "0087_studio_pinned_review_share.sql", "0088_studio_review_delivery.sql"]) {
    await pool.query(await readFile(new URL(`../apps/api/src/db/migrations/${migration}`, import.meta.url), "utf8"));
  }
  const triggers = await pool.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'studio_%'");
  for (const required of ["studio_revision_immutable_update", "studio_revision_topology_revision", "studio_revision_topology_parent", "studio_artifact_revision_pointer_check", "studio_review_snapshot_check", "studio_review_reviewer_check", "studio_review_comment_anchor_check", "studio_review_policy_guard_trigger", "studio_review_policy_event_guard_trigger", "studio_review_group_approval_check", "studio_pinned_review_share_immutable_update", "studio_pinned_review_feedback_immutable_update", "studio_review_delivery_guard_update", "studio_review_delivery_event_immutable_update"]) {
    assert(triggers.rows.some((row) => row.tgname === required), `Missing database invariant: ${required}`);
  }
  console.log(`Prepared fresh review test schema with ${triggers.rows.length} Studio invariant triggers.`);
} finally { await pool.end(); }
