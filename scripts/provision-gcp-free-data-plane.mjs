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

function runJson(command, args, { missingPattern } = {}) {
  const result = run(command, args, { allowFailure: Boolean(missingPattern) });
  if (!result.ok) {
    if (missingPattern?.test(`${result.stderr}\n${result.stdout}`)) return null;
    fail(`${command} 기존 자원을 확인하지 못했습니다. 조회 권한과 API 상태를 확인한 뒤 --check로 다시 검증하세요.`);
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail(`${command} 자원 조회 응답이 객체가 아닙니다. --check로 조회 계약을 확인하세요.`);
    }
    return parsed;
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

function firestoreDatabase({ allowMissing = false } = {}) {
  return runJson("gcloud", [
    "firestore",
    "databases",
    "describe",
    "--database=(default)",
    `--project=${PROJECT_ID}`,
    "--format=json",
  ], { missingPattern: allowMissing ? /\bNOT_FOUND\b/u : undefined });
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

function bigQueryResource(resource, { allowMissing = false } = {}) {
  return runJson("bq", [
    `--project_id=${PROJECT_ID}`,
    "show",
    "--format=prettyjson",
    resource,
  ], { missingPattern: allowMissing ? /\bNot found: (?:Dataset|Table)\b/iu : undefined });
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

function ensureFirestore(database) {
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

function ensureDataset(existing) {
  const dataset = `${PROJECT_ID}:${DATASET_ID}`;
  if (existing) return;
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

function ensureTable(tableId, schemaFile, partitionField, clusteringFields, existing) {
  const resource = `${PROJECT_ID}:${DATASET_ID}.${tableId}`;
  if (existing) return;
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

function deployNewFirestoreRules() {
  run("firebase", [
    "deploy",
    "--only",
    "firestore:rules,firestore:indexes",
    "--config",
    FIREBASE_CONFIG,
    "--project",
    PROJECT_ID,
    "--non-interactive",
    "--json",
  ]);
}

function preflightExistingResources() {
  // API 활성화·자원 생성·규칙 배포보다 먼저 기존 자원의 전체 검증 계약을 확인한다.
  // 조회 실패는 명시적 NOT_FOUND인 경우에만 부재로 인정한다.
  const firestore = firestoreDatabase({ allowMissing: true });
  if (firestore) assertFirestore(firestore);
  const instances = realtimeDatabaseInstances();
  if (!instances.some((entry) => entry.name === RTDB_INSTANCE)) {
    fail("최초 Spark Realtime Database는 firebase init database로 만든 뒤 --check로 확인하세요.");
  }
  assertRealtimeDatabase(instances);
  const resource = `${PROJECT_ID}:${DATASET_ID}`;
  const dataset = bigQueryResource(resource, { allowMissing: true });
  if (dataset) assertDataset(dataset);
  const analytics = bigQueryResource(`${resource}.analytics_event`, { allowMissing: true });
  if (analytics) assertPartitionedTable(analytics, "event_timestamp", ["event_name", "provider_id"]);
  const quota = bigQueryResource(`${resource}.provider_quota_snapshot`, { allowMissing: true });
  if (quota) assertPartitionedTable(quota, "observed_at", ["provider_id", "shard_id"]);
  return { firestore, dataset, analytics, quota };
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
  const existing = preflightExistingResources();
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
  ensureFirestore(existing.firestore);
  ensureFirebaseProject();
  ensureDataset(existing.dataset);
  ensureTable(
    "analytics_event",
    "analytics_event.schema.json",
    "event_timestamp",
    ["event_name", "provider_id"],
    existing.analytics,
  );
  ensureTable(
    "provider_quota_snapshot",
    "provider_quota_snapshot.schema.json",
    "observed_at",
    ["provider_id", "shard_id"],
    existing.quota,
  );
  // 기존 Firestore/RTDB는 다른 사용처의 custom rules를 덮어쓰지 않는다.
  // RTDB는 별도 대화형 생성이 필수이므로 여기서는 항상 기존 규칙을 보존한다.
  if (!existing.firestore) deployNewFirestoreRules();
  return {
    ...checkGcpFreeDataPlane(),
    existingSecurityRulesPreserved: true,
    firestoreRulesDeployed: !existing.firestore,
  };
}

function planText() {
  return [
    `Project: ${PROJECT_ID} (billing must remain disabled)`,
    `Firestore: (default), ${FIRESTORE_LOCATION}, free tier, delete protected`,
    `Realtime Database: ${RTDB_INSTANCE}, ${RTDB_LOCATION}, existing rules preserved`,
    "기존 Firestore/RTDB 규칙은 보존하며 보안 규칙 자체의 검증 완료를 의미하지 않습니다.",
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
