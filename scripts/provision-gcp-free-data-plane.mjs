#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const PROJECT_ID = "toonstudio-cloud-20260915";
const FIRESTORE_LOCATION = "asia-northeast3";
const RTDB_INSTANCE = "toonstudio-cloud-20260915-default-rtdb";
const RTDB_LOCATION = "asia-southeast1";
const DATASET_ID = "toonspectrum_analytics";
const APPLY_CONFIRMATION = "APPLY-TOONSPECTRUM-GCP-FREE-DATA";
const FIREBASE_CONFIG = resolve(
  REPOSITORY_ROOT,
  "deploy/gcp-free-data/firebase.json",
);
const BIGQUERY_SCHEMAS = resolve(
  REPOSITORY_ROOT,
  "deploy/gcp-free-data/bigquery",
);

function fail(message, cause) {
  throw new Error(message, cause ? { cause } : undefined);
}

export function parseGcpFreeDataPlaneArguments(argv) {
  const modes = argv.filter((argument) =>
    ["--plan", "--check", "--apply"].includes(argument));
  if (argv.length !== 1 || modes.length !== 1) {
    fail("Use exactly one of --plan, --check, or --apply");
  }
  return modes[0].slice(2);
}

function run(command, args, { allowFailure = false, cwd = REPOSITORY_ROOT } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) fail(`Unable to execute ${command}`, result.error);
  if (result.status !== 0 && !allowFailure) {
    fail(
      `${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function runJson(command, args, options) {
  const result = run(command, args, options);
  if (!result.ok) return null;
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`${command} returned invalid JSON`, error);
  }
}

function assertBillingDisabled() {
  const result = run("gcloud", [
    "billing",
    "projects",
    "describe",
    PROJECT_ID,
    "--format=value(billingEnabled)",
  ]);
  if (result.stdout.trim().toLowerCase() !== "false") {
    fail("GCP billing must remain disabled for the free data plane");
  }
}

function firestoreDatabase({ allowFailure = false } = {}) {
  return runJson("gcloud", [
    "firestore",
    "databases",
    "describe",
    "--database=(default)",
    `--project=${PROJECT_ID}`,
    "--format=json",
  ], { allowFailure });
}

function realtimeDatabaseInstances() {
  const result = runJson("firebase", [
    "database:instances:list",
    "--project",
    PROJECT_ID,
    "--json",
  ]);
  return Array.isArray(result?.result) ? result.result : [];
}

function bigQueryResource(resource, { allowFailure = false } = {}) {
  return runJson("bq", [
    `--project_id=${PROJECT_ID}`,
    "show",
    "--format=prettyjson",
    resource,
  ], { allowFailure });
}

function assertFirestore(database) {
  if (!database
    || database.locationId !== FIRESTORE_LOCATION
    || database.type !== "FIRESTORE_NATIVE"
    || database.freeTier !== true
    || database.deleteProtectionState !== "DELETE_PROTECTION_ENABLED") {
    fail("Firestore free database does not match the guarded Seoul contract");
  }
}

function assertRealtimeDatabase(instances) {
  const database = instances.find((entry) => entry.name === RTDB_INSTANCE);
  if (!database
    || database.location !== RTDB_LOCATION
    || database.type !== "DEFAULT_DATABASE"
    || database.state !== "ACTIVE") {
    fail("Firebase Realtime Database does not match the guarded presence contract");
  }
}

function assertDataset(dataset) {
  if (!dataset
    || dataset.location !== FIRESTORE_LOCATION
    || dataset.defaultTableExpirationMs !== "2592000000") {
    fail("BigQuery sandbox dataset does not match the 30-day guarded contract");
  }
}

function assertPartitionedTable(table, field, clusteringFields) {
  const actualClustering = table?.clustering?.fields ?? [];
  if (!table
    || table.timePartitioning?.type !== "DAY"
    || table.timePartitioning?.field !== field
    || table.timePartitioning?.requirePartitionFilter !== true
    || JSON.stringify(actualClustering) !== JSON.stringify(clusteringFields)) {
    fail(`BigQuery table ${table?.id ?? "unknown"} violates the guarded layout`);
  }
}

export function checkGcpFreeDataPlane() {
  assertBillingDisabled();
  assertFirestore(firestoreDatabase());
  assertRealtimeDatabase(realtimeDatabaseInstances());
  const dataset = `${PROJECT_ID}:${DATASET_ID}`;
  assertDataset(bigQueryResource(dataset));
  assertPartitionedTable(
    bigQueryResource(`${dataset}.analytics_event`),
    "event_timestamp",
    ["event_name", "provider_id"],
  );
  assertPartitionedTable(
    bigQueryResource(`${dataset}.provider_quota_snapshot`),
    "observed_at",
    ["provider_id", "shard_id"],
  );
  return Object.freeze({
    projectId: PROJECT_ID,
    billingEnabled: false,
    firestoreLocation: FIRESTORE_LOCATION,
    realtimeDatabaseLocation: RTDB_LOCATION,
    bigQueryDataset: DATASET_ID,
  });
}

function ensureFirestore() {
  const database = firestoreDatabase({ allowFailure: true });
  if (database) return;
  run("gcloud", [
    "firestore",
    "databases",
    "create",
    "--database=(default)",
    `--location=${FIRESTORE_LOCATION}`,
    "--type=firestore-native",
    "--edition=standard",
    "--delete-protection",
    `--project=${PROJECT_ID}`,
    "--quiet",
  ]);
}

function ensureFirebaseProject() {
  const projects = runJson("firebase", ["projects:list", "--json"]);
  const entries = Array.isArray(projects?.result) ? projects.result : [];
  if (entries.some((entry) => entry.projectId === PROJECT_ID)) return;
  run("firebase", [
    "projects:addfirebase",
    PROJECT_ID,
    "--non-interactive",
    "--json",
  ]);
}

function requireRealtimeDatabase() {
  const exists = realtimeDatabaseInstances().some((entry) =>
    entry.name === RTDB_INSTANCE);
  if (!exists) {
    fail(
      "The first Spark Realtime Database must be created interactively with firebase init database",
    );
  }
}

function ensureDataset() {
  const dataset = `${PROJECT_ID}:${DATASET_ID}`;
  if (bigQueryResource(dataset, { allowFailure: true })) return;
  run("bq", [
    `--project_id=${PROJECT_ID}`,
    `--location=${FIRESTORE_LOCATION}`,
    "mk",
    "--dataset",
    "--description=ToonSpectrum append-only analytics and provider quota telemetry; sandbox guarded",
    "--default_table_expiration=2592000",
    dataset,
  ]);
}

function ensureTable(tableId, schemaFile, partitionField, clusteringFields) {
  const resource = `${PROJECT_ID}:${DATASET_ID}.${tableId}`;
  if (bigQueryResource(resource, { allowFailure: true })) return;
  run("bq", [
    `--project_id=${PROJECT_ID}`,
    "mk",
    "--table",
    "--time_partitioning_type=DAY",
    `--time_partitioning_field=${partitionField}`,
    "--require_partition_filter=true",
    `--clustering_fields=${clusteringFields.join(",")}`,
    resource,
    resolve(BIGQUERY_SCHEMAS, schemaFile),
  ]);
}

function deployDenyAllRules() {
  run("firebase", [
    "deploy",
    "--only",
    "database,firestore:rules,firestore:indexes",
    "--config",
    FIREBASE_CONFIG,
    "--project",
    PROJECT_ID,
    "--non-interactive",
    "--json",
  ]);
}

export function applyGcpFreeDataPlane(environment = process.env) {
  if (
    environment.TOONSPECTRUM_GCP_FREE_DATA_CONFIRMATION
    !== APPLY_CONFIRMATION
  ) {
    fail(
      `Apply requires TOONSPECTRUM_GCP_FREE_DATA_CONFIRMATION=${APPLY_CONFIRMATION}`,
    );
  }
  assertBillingDisabled();
  run("gcloud", [
    "services",
    "enable",
    "firestore.googleapis.com",
    "bigquery.googleapis.com",
    "firebase.googleapis.com",
    "firebasedatabase.googleapis.com",
    `--project=${PROJECT_ID}`,
    "--quiet",
  ]);
  ensureFirestore();
  ensureFirebaseProject();
  requireRealtimeDatabase();
  ensureDataset();
  ensureTable(
    "analytics_event",
    "analytics_event.schema.json",
    "event_timestamp",
    ["event_name", "provider_id"],
  );
  ensureTable(
    "provider_quota_snapshot",
    "provider_quota_snapshot.schema.json",
    "observed_at",
    ["provider_id", "shard_id"],
  );
  deployDenyAllRules();
  return checkGcpFreeDataPlane();
}

function planText() {
  return [
    `Project: ${PROJECT_ID} (billing must remain disabled)`,
    `Firestore: (default), ${FIRESTORE_LOCATION}, free tier, delete protected`,
    `Realtime Database: ${RTDB_INSTANCE}, ${RTDB_LOCATION}, deny-all rules`,
    `BigQuery: ${DATASET_ID}, ${FIRESTORE_LOCATION}, 30-day dataset expiration`,
    "Tables: analytics_event, provider_quota_snapshot; partition filters required",
  ].join("\n");
}

function runCli() {
  const mode = parseGcpFreeDataPlaneArguments(process.argv.slice(2));
  if (mode === "plan") {
    process.stdout.write(`${planText()}\n`);
    return;
  }
  const result = mode === "apply"
    ? applyGcpFreeDataPlane()
    : checkGcpFreeDataPlane();
  process.stdout.write(
    `GCP free data plane ${mode} passed: ${JSON.stringify(result)}\n`,
  );
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
