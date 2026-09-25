import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FREE_DATABASE_FEDERATION_ROOT = fileURLToPath(new URL("../", import.meta.url));

export const FREE_DATABASE_FEDERATION_VERSION =
  "toonspectrum.free-database-federation.v1";

const OPERATIONS = new Set(["read", "write"]);
const CONSISTENCY = new Set(["authoritative", "replicated", "derived", "ephemeral"]);
const BILLING_BOUNDARIES = new Set(["hard-stop-free", "free-allowance-with-app-cap"]);
const TRAFFIC_DISTRIBUTIONS = new Set(["headroom", "weighted-rendezvous"]);
const PROVISIONING = new Set([
  "provisioned",
  "connected",
  "externally-managed",
  "external-auth-required",
  "planned",
]);
const PERIODS = new Set([
  "second",
  "day",
  "month",
  "instant",
  "maximum",
  "rolling-7-days",
  "total",
]);
const WRITE_MODES = new Set([
  "single-authority",
  "partition-key-authority",
  "hash-sharded-authority",
  "append-only-authority",
  "ephemeral-authority",
  "derived-replica",
]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function metricIdentifier(value) {
  return typeof value === "string" && /^[a-z][A-Za-z0-9]*$/u.test(value);
}

function ratio(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1;
}

function uniqueStrings(value, path, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path} must be a non-empty string array`);
    return [];
  }
  const valid = value.filter(
    (entry) => typeof entry === "string" && entry.trim() === entry && entry.length > 0,
  );
  if (valid.length !== value.length || new Set(valid).size !== valid.length) {
    issues.push(`${path} must contain unique, non-empty, trimmed strings`);
  }
  return valid;
}

export function validateFreeDatabaseFederation(policy) { // NOSONAR javascript:S3776
  const issues = [];
  if (!record(policy)) return ["federation root must be an object"];
  if (policy.version !== FREE_DATABASE_FEDERATION_VERSION) {
    issues.push(`version must be ${FREE_DATABASE_FEDERATION_VERSION}`);
  }
  if (policy.mode !== "maximum-free-traffic") {
    issues.push("mode must be maximum-free-traffic");
  }
  if (policy.automaticPaidOverflow !== false) {
    issues.push("automaticPaidOverflow must remain false");
  }
  if (policy.automaticAuthoritativeWriteFailover !== false) {
    issues.push("automaticAuthoritativeWriteFailover must remain false");
  }
  if (policy.synchronousCrossProviderWrites !== false) {
    issues.push("synchronousCrossProviderWrites must remain false");
  }
  if (
    !Number.isInteger(policy.quotaSnapshotMaxAgeSeconds)
    || policy.quotaSnapshotMaxAgeSeconds < 60
    || policy.quotaSnapshotMaxAgeSeconds > 3_600
  ) {
    issues.push("quotaSnapshotMaxAgeSeconds must be an integer between 60 and 3600");
  }
  if (typeof policy.verifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(policy.verifiedAt)) {
    issues.push("verifiedAt must use YYYY-MM-DD");
  }

  const providers = record(policy.providers) ? policy.providers : {};
  if (Object.keys(providers).length < 10) {
    issues.push("providers must contain at least ten independent free services");
  }
  for (const [providerId, provider] of Object.entries(providers)) {
    const path = `providers.${providerId}`;
    if (!identifier(providerId)) issues.push(`provider id is invalid: ${providerId}`);
    if (!record(provider)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    if (typeof provider.engine !== "string" || provider.engine.length === 0) {
      issues.push(`${path}.engine must be non-empty`);
    }
    if (typeof provider.quotaScope !== "string" || provider.quotaScope.length === 0) {
      issues.push(`${path}.quotaScope must be non-empty`);
    }
    if (!BILLING_BOUNDARIES.has(provider.billingBoundary)) {
      issues.push(`${path}.billingBoundary is invalid`);
    }
    if (!PROVISIONING.has(provider.provisioning)) {
      issues.push(`${path}.provisioning is invalid`);
    }
    if (!ratio(provider.applicationHardCapRatio) || provider.applicationHardCapRatio > 0.8) {
      issues.push(`${path}.applicationHardCapRatio must be a ratio in (0, 0.8]`);
    }
    if (typeof provider.source !== "string" || !provider.source.startsWith("https://")) {
      issues.push(`${path}.source must be an HTTPS official documentation URL`);
    }
    const limits = record(provider.limits) ? provider.limits : {};
    if (Object.keys(limits).length === 0) issues.push(`${path}.limits must not be empty`);
    for (const [limitName, limit] of Object.entries(limits)) {
      const limitPath = `${path}.limits.${limitName}`;
      if (!metricIdentifier(limitName)) issues.push(`${limitPath} name is invalid`);
      if (!record(limit)) {
        issues.push(`${limitPath} must be an object`);
        continue;
      }
      if (typeof limit.value !== "number" || !Number.isFinite(limit.value) || limit.value <= 0) {
        issues.push(`${limitPath}.value must be positive and finite`);
      }
      if (!PERIODS.has(limit.period)) issues.push(`${limitPath}.period is invalid`);
    }
    if (providerId === "bigquery-sandbox" && provider.ingestionMode !== "batch-only") {
      issues.push(`${path}.ingestionMode must remain batch-only`);
    }
    for (const key of Object.keys(provider)) {
      if (/secret|token|password|private.?key|credential/iu.test(key)) {
        issues.push(`${path} must not contain credential field ${key}`);
      }
    }
  }

  const shards = record(policy.shards) ? policy.shards : {};
  if (Object.keys(shards).length < 10) issues.push("shards must contain at least ten workload shards");
  for (const [shardId, shard] of Object.entries(shards)) {
    const path = `shards.${shardId}`;
    if (!identifier(shardId)) issues.push(`shard id is invalid: ${shardId}`);
    if (!record(shard)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    if (!providers[shard.provider]) issues.push(`${path}.provider references an unknown provider`);
    uniqueStrings(shard.domains, `${path}.domains`, issues);
    if (!Number.isInteger(shard.virtualShardCount) || shard.virtualShardCount < 1) {
      issues.push(`${path}.virtualShardCount must be a positive integer`);
    }
    if (!WRITE_MODES.has(shard.writeMode)) issues.push(`${path}.writeMode is invalid`);
  }

  const routes = record(policy.routes) ? policy.routes : {};
  if (Object.keys(routes).length < 20) issues.push("routes must contain at least twenty workload routes");
  for (const [routeId, route] of Object.entries(routes)) {
    const path = `routes.${routeId}`;
    if (!identifier(routeId)) issues.push(`route id is invalid: ${routeId}`);
    if (!record(route)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    if (!OPERATIONS.has(route.operation)) issues.push(`${path}.operation is invalid`);
    if (!CONSISTENCY.has(route.consistency)) issues.push(`${path}.consistency is invalid`);
    if (!TRAFFIC_DISTRIBUTIONS.has(route.trafficDistribution)) {
      issues.push(`${path}.trafficDistribution is invalid`);
    }
    if (route.trafficDistribution === "weighted-rendezvous"
      && (route.operation !== "read" || !route.allowReadFallback)) {
      issues.push(`${path}.weighted-rendezvous requires a fallback read`);
    }
    const candidates = uniqueStrings(route.candidates, `${path}.candidates`, issues);
    if (!shards[route.authority]) issues.push(`${path}.authority references an unknown shard`);
    if (!candidates.includes(route.authority)) issues.push(`${path}.authority must be included in candidates`);
    for (const shardId of candidates) {
      if (!shards[shardId]) issues.push(`${path} references an unknown shard ${shardId}`);
    }
    if (typeof route.allowReadFallback !== "boolean") {
      issues.push(`${path}.allowReadFallback must be boolean`);
    }
    if (route.operation !== "read" && route.allowReadFallback) {
      issues.push(`${path}.allowReadFallback is valid only for reads`);
    }
    if (
      route.operation === "write"
      && route.consistency === "authoritative"
      && (candidates.length !== 1 || candidates[0] !== route.authority)
    ) {
      issues.push(`${path} authoritative writes must have exactly one authority shard`);
    }
  }

  const tidbShards = Object.values(shards).filter((shard) => shard?.provider === "tidb-cloud-starter");
  const tidbLimit = providers["tidb-cloud-starter"]?.limits?.instanceCount?.value;
  if (Number.isFinite(tidbLimit) && tidbShards.length !== tidbLimit) {
    issues.push("TiDB Starter must allocate every free instance exactly once");
  }
  const d1VirtualShards = Object.values(shards)
    .filter((shard) => shard?.provider === "cloudflare-d1")
    .reduce((total, shard) => total + (shard.virtualShardCount ?? 0), 0);
  const d1Limit = providers["cloudflare-d1"]?.limits?.databaseCount?.value;
  if (Number.isFinite(d1Limit) && d1VirtualShards > d1Limit) {
    issues.push("Cloudflare D1 virtual shard count exceeds the account database limit");
  }

  return issues;
}

export function readFreeDatabaseFederation(
  path = resolve(FREE_DATABASE_FEDERATION_ROOT, "config/free-database-federation.json"),
) {
  let policy;
  try {
    policy = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `free database federation is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const issues = validateFreeDatabaseFederation(policy);
  if (issues.length > 0) {
    throw new Error(
      `free database federation is invalid:\n${issues.map((issue) => ` - ${issue}`).join("\n")}`,
    );
  }
  return policy;
}
