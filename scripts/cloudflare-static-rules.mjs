import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RESPONSE_POLICY_PATH = "config/http-response-headers.json";

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
  const expected = renderCloudflareHeaders(policy);
  const actual = readFileSync(resolve(root, "apps/web/public/_headers"), "utf8");
  const issues = [];
  if (actual !== expected) {
    issues.push(
      "apps/web/public/_headers is stale; run pnpm run generate:cloudflare-static-rules",
    );
  }

  return issues;
}

const invoked = process.argv[1]
  && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invoked) {
  const root = process.cwd();
  const target = resolve(root, "apps/web/public/_headers");
  const policy = loadResponseHeaderPolicy(root);
  const rendered = renderCloudflareHeaders(policy);
  if (process.argv.includes("--check")) {
    const issues = verifyCloudflareStaticRules(root);
    if (issues.length > 0) {
      for (const issue of issues) console.error(issue);
      process.exit(1);
    }
    console.log("Cloudflare Static Assets headers match the provider-neutral response policy");
  } else {
    writeFileSync(target, rendered);
    console.log(`wrote ${target}`);
  }
}
