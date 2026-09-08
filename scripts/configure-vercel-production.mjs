#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import process from "node:process";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const SOURCE_ROOTS = ["apps/api/src", "apps/web/src", "packages"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const PUBLIC_ORIGIN = (process.env.PUBLIC_APP_ORIGIN || "https://www.toonstudio.cloud").replace(/\/$/u, "");
const VERCEL_API = process.env.VERCEL_API_URL || "https://api.vercel.com";
const TARGET = process.env.VERCEL_ENV_TARGET || "production";

// These keys are read through env(key) or process.env[key] in the actual API.
// Text discovery alone cannot identify that runtime contract.
const AUTH_RUNTIME_KEYS = [
  "AUTH_SESSION_SECRET", "AUTH_STATE_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
  "KAKAO_REST_API_KEY", "KAKAO_OAUTH_CLIENT_ID", "KAKAO_CLIENT_SECRET", "KAKAO_OAUTH_CLIENT_SECRET",
  "NAVER_OAUTH_CLIENT_ID", "NAVER_CLIENT_ID", "NAVER_OAUTH_CLIENT_SECRET", "NAVER_CLIENT_SECRET",
];

const FORWARDED_SECRET_KEYS = [
  "DATABASE_URL",
  ...AUTH_RUNTIME_KEYS,
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "CREATOR_ASSET_OBJECT_STORAGE_ENDPOINT",
  "CREATOR_ASSET_OBJECT_STORAGE_BUCKET",
  "CREATOR_ASSET_OBJECT_STORAGE_ACCESS_KEY_ID",
  "CREATOR_ASSET_OBJECT_STORAGE_SECRET_ACCESS_KEY",
];

const PUBLIC_VALUES = new Map([
  ["WEB_APP_BASE_URL", PUBLIC_ORIGIN],
  ["OAUTH_REDIRECT_BASE_URL", PUBLIC_ORIGIN],
]);

const OAUTH_STATE_REQUIRED_KEYS = [
  "GOOGLE_OAUTH_CLIENT_SECRET", "KAKAO_REST_API_KEY", "KAKAO_CLIENT_SECRET",
  "NAVER_OAUTH_CLIENT_ID", "NAVER_OAUTH_CLIENT_SECRET",
  "KAKAO_OAUTH_CLIENT_ID", "KAKAO_OAUTH_CLIENT_SECRET", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET",
];

// Preserve the effective runtime credential when production currently uses an opaque fallback.
const AUTH_PREFERRED_FALLBACKS = new Map([
  ["AUTH_SESSION_SECRET", "AUTH_STATE_SECRET"],
  ["KAKAO_REST_API_KEY", "KAKAO_OAUTH_CLIENT_ID"],
  ["KAKAO_CLIENT_SECRET", "KAKAO_OAUTH_CLIENT_SECRET"],
  ["NAVER_OAUTH_CLIENT_ID", "NAVER_CLIENT_ID"],
  ["NAVER_OAUTH_CLIENT_SECRET", "NAVER_CLIENT_SECRET"],
]);

function requireValue(name, fallback = "") {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function targetMatches(entry) {
  if (!Array.isArray(entry?.target)) return true;
  return entry.target.includes(TARGET);
}

async function walk(directory, output = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, output);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) output.push(path);
  }
  return output;
}

export async function collectReferencedEnvironmentKeys() {
  const keys = new Set([...AUTH_RUNTIME_KEYS, ...PUBLIC_VALUES.keys()]);
  const files = [];
  for (const root of SOURCE_ROOTS) await walk(join(REPO_ROOT, root), files);
  const dotPattern = /(?:process|import\.meta)\.env\.([A-Z][A-Z0-9_]*)/gu;
  const bracketPattern = /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/gu;
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const pattern of [dotPattern, bracketPattern]) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

function queryString(teamId) {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function vercelRequest(path, { token, teamId, method = "GET", body } = {}) {
  const response = await fetch(`${VERCEL_API}${path}${queryString(teamId)}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new Error(`Vercel API ${method} ${path} failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

async function addEnvironmentVariable({ token, teamId, project, key, value, type }) {
  const response = await fetch(
    `${VERCEL_API}/v10/projects/${encodeURIComponent(project)}/env${queryString(teamId)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ key, value, type, target: [TARGET] }),
    },
  );
  if (response.status === 409) return "existing";
  if (!response.ok) {
    throw new Error(`Vercel env create failed for ${key} (${response.status})`);
  }
  await response.arrayBuffer();
  return "created";
}

function secretInput(key) {
  const forwarded = process.env[`${key}_VALUE`];
  const value = forwarded?.trim() ? forwarded : process.env[key];
  return value?.trim() ? value : "";
}

function isAuthSecretKey(key) {
  return key === "AUTH_SESSION_SECRET" || key === "AUTH_STATE_SECRET";
}

function validateNewAuthSecret(key, value) {
  if (value !== value.trim() || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${key} must be an unpadded secret of at least 32 UTF-8 bytes`);
  }
}

export async function reconcileProductionEnvironment() {
  const token = requireValue("VERCEL_TOKEN");
  const project = requireValue("VERCEL_PROJECT_ID", process.env.VERCEL_PROJECT_NAME || "toonspectrum");
  const teamId = process.env.VERCEL_ORG_ID?.trim() || process.env.VERCEL_TEAM_ID?.trim() || "";
  const auditOnly = process.argv.includes("--audit-only");
  const referenced = await collectReferencedEnvironmentKeys();
  const listed = await vercelRequest(
    `/v9/projects/${encodeURIComponent(project)}/env`,
    { token, teamId },
  );
  const envs = Array.isArray(listed?.envs) ? listed.envs : [];
  const existing = new Set(
    envs.filter(targetMatches).map((entry) => entry?.key).filter((key) => typeof key === "string"),
  );
  const created = [];
  const retained = [];
  const warnings = [];
  const missingRequired = [];
  const desired = new Map();
  for (const [key, value] of PUBLIC_VALUES) {
    if (referenced.includes(key)) desired.set(key, { value, type: "plain" });
  }
  for (const key of FORWARDED_SECRET_KEYS) {
    if (!referenced.includes(key)) continue;
    if (existing.has(key)) continue;
    // Adding a preferred alias changes the runtime value even without overwriting its fallback.
    if (existing.has(AUTH_PREFERRED_FALLBACKS.get(key))) continue;
    const value = secretInput(key);
    if (value) {
      if (isAuthSecretKey(key)) validateNewAuthSecret(key, value);
      desired.set(key, { value, type: "encrypted" });
    }
  }

  const configured = new Set([...existing, ...desired.keys()]);
  if (!configured.has("DATABASE_URL")) missingRequired.push("DATABASE_URL");
  if (!configured.has("AUTH_SESSION_SECRET") && !configured.has("AUTH_STATE_SECRET")) {
    missingRequired.push("AUTH_SESSION_SECRET (or AUTH_STATE_SECRET)");
  }
  if (OAUTH_STATE_REQUIRED_KEYS.some((key) => configured.has(key)) && !configured.has("AUTH_STATE_SECRET")) {
    missingRequired.push("AUTH_STATE_SECRET");
  }
  const planned = [];
  for (const key of referenced) {
    if (existing.has(key)) retained.push(key);
    else if (desired.has(key)) planned.push(key);
    else if (/(_SECRET|_TOKEN|_KEY|_PASSWORD|DATABASE_URL)$/u.test(key)) warnings.push(key);
  }
  // Validate the complete plan before adding anything, including public URLs.
  if (missingRequired.length > 0) {
    throw new Error(`Missing required production variables: ${missingRequired.sort().join(", ")}`);
  }
  if (!auditOnly) {
    for (const key of planned) {
      const { value, type } = desired.get(key);
      const result = await addEnvironmentVariable({ token, teamId, project, key, value, type });
      if (result === "created") created.push(key);
      else retained.push(key);
    }
  }

  const report = {
    project,
    target: TARGET,
    origin: PUBLIC_ORIGIN,
    referencedCount: referenced.length,
    existingCount: existing.size,
    created: created.sort(),
    planned: planned.sort(),
    retained: retained.sort(),
    missingRequired: missingRequired.sort(),
    optionalSecretsWithoutForwardedValue: warnings.sort(),
    auditOnly,
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  reconcileProductionEnvironment().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
