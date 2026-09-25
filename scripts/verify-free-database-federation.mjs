#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { FREE_DATABASE_FEDERATION_ROOT, readFreeDatabaseFederation } from "./free-database-federation.mjs";

const REQUIRED_MANIFESTS = [
  "deploy/federated-data-plane/cockroachdb/ledger.sql",
  "deploy/federated-data-plane/tidb/authority-schema.sql",
  "deploy/federated-data-plane/tidb/instances.json",
  "deploy/federated-data-plane/d1/edge-index.sql",
  "deploy/federated-data-plane/d1/analytics-buffer.sql",
  "deploy/federated-data-plane/turso/public-catalog.sql",
  "deploy/federated-data-plane/cosmos/containers.json",
  "deploy/federated-data-plane/dynamodb/audit-events.template.json",
  "deploy/federated-data-plane/mongodb/ai-jobs.validator.json",
  "deploy/federated-data-plane/supabase/private-federation.sql",
  "deploy/federated-data-plane/supabase/rollback-private-federation.sql",
  "deploy/gcp-free-data/firebase.json",
  "deploy/gcp-free-data/firestore.rules",
  "deploy/gcp-free-data/database.rules.json",
  "deploy/gcp-free-data/bigquery/analytics_event.schema.json",
  "deploy/gcp-free-data/bigquery/provider_quota_snapshot.schema.json",
  "docs/operations/federated-free-database-data-plane.md",
];

function verifyManifests(root = FREE_DATABASE_FEDERATION_ROOT) {
  const missing = REQUIRED_MANIFESTS.filter((path) => !existsSync(resolve(root, path)));
  if (missing.length > 0) {
    throw new Error(`Missing federated data-plane manifests: ${missing.join(", ")}`);
  }
  for (const path of REQUIRED_MANIFESTS) {
    const source = readFileSync(resolve(root, path), "utf8");
    if (/BEGIN PRIVATE KEY|(?:password|secret|token)\s*[:=]\s*["']?[^\s${}]+/iu.test(source)) {
      throw new Error(`Credential-like value found in ${path}`);
    }
  }
}

try {
  const policy = readFreeDatabaseFederation();
  verifyManifests();
  const provisioned = Object.entries(policy.providers)
    .filter(([, provider]) => provider.provisioning === "provisioned")
    .map(([providerId]) => providerId)
    .sort();
  process.stdout.write(
    `Free database federation verified: ${Object.keys(policy.providers).length} providers, ${Object.keys(policy.shards).length} shards, ${Object.keys(policy.routes).length} routes; provisioned=${provisioned.join(",")}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
