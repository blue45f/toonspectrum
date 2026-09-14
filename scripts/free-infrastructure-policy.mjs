import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const FREE_INFRASTRUCTURE_POLICY_VERSION =
  "toonspectrum.free-infrastructure.v1";

const BILLING_BOUNDARIES = new Set([
  "hard-stop-free",
  "free-allowance-with-app-cap",
  "device-owned",
  "user-owned",
]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteRatio(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1;
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
  for (const required of ["oracle", "oci"]) {
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
    "transactionalDatabase",
    "realtimeCoordination",
    "publicAssets",
    "backupArchive",
    "localProjects",
    "userOwnedProjects",
    "email",
  ];
  for (const authority of requiredAuthorities) {
    const providerId = authorities[authority];
    if (typeof providerId !== "string" || !providers[providerId]) {
      issues.push(`authorities.${authority} must reference a configured provider`);
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
    throw new Error(`free infrastructure policy is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const issues = validateFreeInfrastructurePolicy(parsed);
  if (issues.length > 0) {
    throw new Error(`free infrastructure policy is invalid:\n${issues.map((issue) => ` - ${issue}`).join("\n")}`);
  }
  return parsed;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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
  for (const forbiddenPath of ["deploy/oci", "docs/OCI-MIGRATION.md"]) {
    if (existsSync(at(forbiddenPath))) issues.push(`retired Oracle infrastructure returned: ${forbiddenPath}`);
  }

  try {
    readFreeInfrastructurePolicy(at("config/free-infrastructure-policy.json"));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  if (existsSync(at("vercel.json"))) {
    try {
      const vercel = readJson(at("vercel.json"));
      const deploymentEnabled = vercel.git?.deploymentEnabled;
      if (!record(deploymentEnabled) || deploymentEnabled["**"] !== false) {
        issues.push('vercel.json must disable Git deployment for "**"');
      }
      if (Object.values(deploymentEnabled ?? {}).some((value) => value === true)) {
        issues.push("vercel.json must not enable Git deployment for any branch");
      }
    } catch (error) {
      issues.push(`vercel.json could not be validated: ${error instanceof Error ? error.message : String(error)}`);
    }
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
