import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RESPONSE_POLICY_PATH = "config/http-response-headers.json";
const CLOUDFLARE_HEADERS_PATH = "apps/web/public/_headers";
const CLOUDFLARE_WORKER_PATH = "deploy/cloudflare-static/src/index.ts";
const CONTENT_SECURITY_POLICY_KEY = "Content-Security-Policy";
const WORKER_CSP_PATTERN = /("Content-Security-Policy":\s*)"[^"]*",/u;

function mapPattern(source) {
  if (source === "/(.*)") return "/*";
  return source.replace(/\/\(\.\*\)$/u, "/*");
}

export function renderCloudflareHeaders(responsePolicy) {
  const blocks = [
    `# Generated from ${RESPONSE_POLICY_PATH} by scripts/cloudflare-static-rules.mjs.`,
    "# Run `pnpm run generate:cloudflare-static-rules` after changing response headers.",
  ];
  for (const rule of responsePolicy.headers ?? []) {
    if (!rule || typeof rule.source !== "string" || !Array.isArray(rule.headers)) continue;
    blocks.push("", mapPattern(rule.source));
    for (const header of rule.headers) {
      if (typeof header?.key !== "string" || typeof header?.value !== "string") {
        throw new Error(`invalid response header rule for ${rule.source}`);
      }
      blocks.push(`  ${header.key}: ${header.value}`);
    }
  }
  return `${blocks.join("\n")}\n`;
}

function rootResponseHeader(responsePolicy, key) {
  const rootRule = responsePolicy.headers?.find((rule) => rule?.source === "/(.*)");
  const header = rootRule?.headers?.find((candidate) => candidate?.key === key);
  if (typeof header?.value !== "string" || header.value.trim() === "") {
    throw new Error(`${RESPONSE_POLICY_PATH} must define ${key} for /(.*)`);
  }
  return header.value;
}

export function renderCloudflareWorkerSecurityPolicy(source, responsePolicy) {
  const contentSecurityPolicy = rootResponseHeader(
    responsePolicy,
    CONTENT_SECURITY_POLICY_KEY,
  );
  if (!WORKER_CSP_PATTERN.test(source)) {
    throw new Error(
      `${CLOUDFLARE_WORKER_PATH} must expose COMMON_SECURITY_HEADERS.${CONTENT_SECURITY_POLICY_KEY}`,
    );
  }
  return source.replace(
    WORKER_CSP_PATTERN,
    (_match, prefix) => `${prefix}${JSON.stringify(contentSecurityPolicy)},`,
  );
}

export function loadResponseHeaderPolicy(root = process.cwd()) {
  const policy = JSON.parse(
    readFileSync(resolve(root, RESPONSE_POLICY_PATH), "utf8"),
  );
  if (policy?.version !== 1 || !Array.isArray(policy.headers)) {
    throw new Error(`${RESPONSE_POLICY_PATH} must contain version 1 header rules`);
  }
  return policy;
}

export function verifyCloudflareStaticRules(root = process.cwd()) {
  const policy = loadResponseHeaderPolicy(root);
  const expectedHeaders = renderCloudflareHeaders(policy);
  const actualHeaders = readFileSync(resolve(root, CLOUDFLARE_HEADERS_PATH), "utf8");
  const workerSource = readFileSync(resolve(root, CLOUDFLARE_WORKER_PATH), "utf8");
  const expectedWorkerSource = renderCloudflareWorkerSecurityPolicy(workerSource, policy);
  const issues = [];
  if (actualHeaders !== expectedHeaders) {
    issues.push(
      `${CLOUDFLARE_HEADERS_PATH} is stale; run pnpm run generate:cloudflare-static-rules`,
    );
  }
  if (workerSource !== expectedWorkerSource) {
    issues.push(
      `${CLOUDFLARE_WORKER_PATH} has a stale Content-Security-Policy; run pnpm run generate:cloudflare-static-rules`,
    );
  }

  return issues;
}

const invoked = process.argv[1]
  && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invoked) {
  const root = process.cwd();
  const headersTarget = resolve(root, CLOUDFLARE_HEADERS_PATH);
  const workerTarget = resolve(root, CLOUDFLARE_WORKER_PATH);
  const policy = loadResponseHeaderPolicy(root);
  const renderedHeaders = renderCloudflareHeaders(policy);
  if (process.argv.includes("--check")) {
    const issues = verifyCloudflareStaticRules(root);
    if (issues.length > 0) {
      for (const issue of issues) console.error(issue);
      process.exit(1);
    }
    console.log("Cloudflare headers and edge worker match the provider-neutral response policy");
  } else {
    writeFileSync(headersTarget, renderedHeaders);
    const workerSource = readFileSync(workerTarget, "utf8");
    writeFileSync(
      workerTarget,
      renderCloudflareWorkerSecurityPolicy(workerSource, policy),
    );
    console.log(`wrote ${headersTarget}`);
    console.log(`updated ${workerTarget}`);
  }
}
