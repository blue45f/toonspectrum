import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { validateReleaseWorkflows } from "./release-workflow-policy.mjs";

export const FREE_INFRASTRUCTURE_POLICY_VERSION =
  "toonspectrum.free-infrastructure.v3";

const BILLING_BOUNDARIES = new Set([
  "hard-stop-free",
  "free-allowance-with-app-cap",
  "device-owned",
  "user-owned",
]);
const OPERATIONS = new Set(["read", "write", "compute"]);
const CONSISTENCY_CLASSES = new Set([
  "authoritative",
  "replicated",
  "derived",
  "ephemeral",
]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteRatio(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1;
}

function identifier(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function collectStrings(value, path, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path} must be a non-empty string array`);
    return [];
  }
  const strings = value.filter((entry) => typeof entry === "string" && entry.trim() === entry && entry.length > 0);
  if (strings.length !== value.length || new Set(strings).size !== strings.length) {
    issues.push(`${path} must contain unique, non-empty, trimmed strings`);
  }
  return strings;
}

export function validateFreeInfrastructurePolicy(policy) { // NOSONAR javascript:S3776
  const issues = [];
  if (!record(policy)) return ["policy root must be an object"];

  if (policy.version !== FREE_INFRASTRUCTURE_POLICY_VERSION) {
    issues.push(`version must be ${FREE_INFRASTRUCTURE_POLICY_VERSION}`);
  }
  if (policy.mode !== "free-strict") issues.push("mode must be free-strict");
  if (policy.automaticDeployments !== false) {
    issues.push("automaticDeployments must remain false");
  }
  if (policy.automaticPaidFailover !== false) {
    issues.push("automaticPaidFailover must remain false");
  }
  if (policy.defaultProjectStorage !== "local-or-byos") {
    issues.push("defaultProjectStorage must remain local-or-byos");
  }

  const forbiddenProviders = collectStrings(
    policy.forbiddenProviders,
    "forbiddenProviders",
    issues,
  );
  for (const required of ["oracle", "oci", "vercel"]) {
    if (!forbiddenProviders.includes(required)) {
      issues.push(`forbiddenProviders must include ${required}`);
    }
  }

  const thresholds = record(policy.quotaThresholds) ? policy.quotaThresholds : {};
  const thresholdNames = [
    "warn",
    "forecast",
    "redirectNewLargeWrites",
    "stopCentralPersonalWrites",
    "critical",
  ];
  const thresholdValues = thresholdNames.map((name) => thresholds[name]);
  for (const [index, value] of thresholdValues.entries()) {
    if (!finiteRatio(value)) issues.push(`quotaThresholds.${thresholdNames[index]} must be a ratio in (0, 1]`);
  }
  if (thresholdValues.every(finiteRatio)) {
    for (let index = 1; index < thresholdValues.length; index += 1) {
      if (thresholdValues[index] <= thresholdValues[index - 1]) {
        issues.push("quota thresholds must be strictly increasing");
        break;
      }
    }
  }

  const providers = record(policy.providers) ? policy.providers : {};
  if (Object.keys(providers).length === 0) issues.push("providers must not be empty");
  for (const [providerId, provider] of Object.entries(providers)) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(providerId)) {
      issues.push(`provider id is invalid: ${providerId}`);
    }
    if (forbiddenProviders.includes(providerId)) {
      issues.push(`forbidden provider is configured: ${providerId}`);
    }
    if (!record(provider)) {
      issues.push(`providers.${providerId} must be an object`);
      continue;
    }
    collectStrings(provider.roles, `providers.${providerId}.roles`, issues);
    if (!BILLING_BOUNDARIES.has(provider.billingBoundary)) {
      issues.push(`providers.${providerId}.billingBoundary is invalid`);
    }
    if (!finiteRatio(provider.applicationHardCapRatio)) {
      issues.push(`providers.${providerId}.applicationHardCapRatio must be a ratio in (0, 1]`);
    }
    if (provider.optional !== undefined && typeof provider.optional !== "boolean") {
      issues.push(`providers.${providerId}.optional must be boolean when present`);
    }
    if (
      provider.billingBoundary === "free-allowance-with-app-cap"
      && finiteRatio(provider.applicationHardCapRatio)
      && provider.applicationHardCapRatio > thresholds.stopCentralPersonalWrites
    ) {
      issues.push(
        `providers.${providerId}.applicationHardCapRatio must not exceed stopCentralPersonalWrites`,
      );
    }
    for (const key of Object.keys(provider)) {
      if (/secret|token|password|private.?key|credential/iu.test(key)) {
        issues.push(`providers.${providerId} must not contain credential field ${key}`);
      }
    }
  }

  const authorities = record(policy.authorities) ? policy.authorities : {};
  const requiredAuthorities = [
    "staticWeb",
    "edgeGateway",
    "edgeConfiguration",
    "edgeRelationalIndex",
    "transactionalDatabase",
    "identityDatabase",
    "projectDatabase",
    "commerceDatabase",
    "communityDatabase",
    "socialDatabase",
    "collaborationDatabase",
    "documentDatabase",
    "auditDatabase",
    "notificationDatabase",
    "presenceDatabase",
    "aiJobDatabase",
    "liveReviewDatabase",
    "feedbackDatabase",
    "analyticsDatabase",
    "analyticsIngestDatabase",
    "adHocAnalytics",
    "legacyDatabase",
    "derivedReadModels",
    "playgroundDatabase",
    "realtimeCoordination",
    "eventDelivery",
    "publicAssets",
    "thumbnailDelivery",
    "backupArchive",
    "localProjects",
    "userOwnedProjects",
    "email",
    "batchCompute",
    "legacyCompute",
  ];
  for (const authority of requiredAuthorities) {
    const providerId = authorities[authority];
    if (typeof providerId !== "string" || !providers[providerId]) {
      issues.push(`authorities.${authority} must reference a configured provider`);
    }
  }

  const workloads = record(policy.workloads) ? policy.workloads : {};
  if (Object.keys(workloads).length === 0) issues.push("workloads must not be empty");
  for (const [workloadId, workload] of Object.entries(workloads)) {
    const path = `workloads.${workloadId}`;
    if (!identifier(workloadId)) issues.push(`workload id is invalid: ${workloadId}`);
    if (!record(workload)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    if (!OPERATIONS.has(workload.operation)) issues.push(`${path}.operation is invalid`);
    if (!CONSISTENCY_CLASSES.has(workload.consistency)) {
      issues.push(`${path}.consistency is invalid`);
    }
    const candidates = collectStrings(workload.candidates, `${path}.candidates`, issues);
    const requiredRoles = collectStrings(
      workload.requiredRoles,
      `${path}.requiredRoles`,
      issues,
    );
    if (typeof workload.allowReadFallback !== "boolean") {
      issues.push(`${path}.allowReadFallback must be boolean`);
    }
    if (!candidates.includes(workload.authority)) {
      issues.push(`${path}.authority must be included in candidates`);
    }
    if (workload.operation !== "read" && workload.allowReadFallback === true) {
      issues.push(`${path}.allowReadFallback is valid only for reads`);
    }
    if (
      workload.operation === "write"
      && workload.consistency === "authoritative"
      && (candidates.length !== 1 || candidates[0] !== workload.authority)
    ) {
      issues.push(`${path} authoritative writes must have exactly one authority candidate`);
    }
    for (const providerId of candidates) {
      const provider = providers[providerId];
      if (!record(provider)) {
        issues.push(`${path} references unknown provider ${providerId}`);
        continue;
      }
      const roles = new Set(Array.isArray(provider.roles) ? provider.roles : []);
      for (const role of requiredRoles) {
        if (!roles.has(role)) {
          issues.push(`${path} provider ${providerId} lacks role ${role}`);
        }
      }
    }
  }

  return issues;
}

export function readFreeInfrastructurePolicy(
  path = resolve(process.cwd(), "config/free-infrastructure-policy.json"),
) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `free infrastructure policy is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const issues = validateFreeInfrastructurePolicy(parsed);
  if (issues.length > 0) {
    throw new Error(`free infrastructure policy is invalid:\n${issues.map((issue) => ` - ${issue}`).join("\n")}`);
  }
  return parsed;
}

export function validateFreeInfrastructureRepository(root = process.cwd()) { // NOSONAR javascript:S3776
  const issues = [];
  const at = (relativePath) => resolve(root, relativePath);
  const requiredPaths = [
    "config/free-infrastructure-policy.json",
    "deploy/cloudflare-static/wrangler.jsonc",
    "deploy/cloudflare-static/src/index.ts",
    "apps/web/public/_headers",
    "docs/FREE_INFRASTRUCTURE.md",
  ];
  for (const path of requiredPaths) {
    if (!existsSync(at(path))) issues.push(`missing free infrastructure file: ${path}`);
  }
  for (const forbiddenPath of [
    "deploy/oci",
    "docs/OCI-MIGRATION.md",
    "vercel.json",
    ".vercelignore",
    "api",
    ".github/workflows/deploy-vercel.yml",
    "apps/api/og-title-files.cjs",
    "apps/api/src/serverless.ts",
    "apps/api/src/studio-live-serverless.ts",
    "scripts/configure-vercel-production.mjs",
    "scripts/vercel-workflow-policy.mjs",
    "scripts/verify-api-serverless-build.mjs",
  ]) {
    if (existsSync(at(forbiddenPath))) issues.push(`retired infrastructure returned: ${forbiddenPath}`);
  }

  try {
    readFreeInfrastructurePolicy(at("config/free-infrastructure-policy.json"));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }


  const activeSurfacePaths = [
    "deploy",
    ".github/workflows",
    "docs/operations",
    "DEPLOY.md",
  ];
  const oraclePattern = /(?:\boracle\b|\boci\b|deploy\/oci)/iu;
  const visit = (path) => {
    if (!existsSync(path)) return;
    const stat = BunLikeStat(path);
    if (stat === "directory") {
      for (const entry of statEntries(path)) visit(resolve(path, entry));
      return;
    }
    if (stat !== "file" || /\.(?:png|jpe?g|gif|webp|zip|gz|wasm)$/iu.test(path)) return;
    const source = readFileSync(path, "utf8");
    if (oraclePattern.test(source)) {
      issues.push(`active infrastructure surface references retired Oracle infrastructure: ${path.slice(root.length + 1)}`);
    }
  };
  for (const relativePath of activeSurfacePaths) visit(at(relativePath));

  issues.push(...validateReleaseWorkflows(root));

  return issues;
}

function BunLikeStat(path) {
  try {
    const stat = statSync(path);
    if (stat.isDirectory()) return "directory";
    if (stat.isFile()) return "file";
  } catch {
    return "missing";
  }
  return "missing";
}

function statEntries(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}
