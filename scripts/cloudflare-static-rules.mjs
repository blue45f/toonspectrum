import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function mapPattern(source) {
  if (source === "/(.*)") return "/*";
  return source.replace(/\/\(\.\*\)$/u, "/*");
}

export function renderCloudflareHeaders(vercelConfig) {
  const blocks = [
    "# Generated from vercel.json by scripts/cloudflare-static-rules.mjs.",
    "# Run `pnpm run generate:cloudflare-static-rules` after changing response headers.",
  ];
  for (const rule of vercelConfig.headers ?? []) {
    if (!rule || typeof rule.source !== "string" || !Array.isArray(rule.headers)) continue;
    blocks.push("", mapPattern(rule.source));
    for (const header of rule.headers) {
      if (typeof header?.key !== "string" || typeof header?.value !== "string") {
        throw new Error(`invalid Vercel header rule for ${rule.source}`);
      }
      blocks.push(`  ${header.key}: ${header.value}`);
    }
  }
  return `${blocks.join("\n")}\n`;
}

export function verifyCloudflareStaticRules(root = process.cwd()) {
  const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
  const expected = renderCloudflareHeaders(vercel);
  const actual = readFileSync(resolve(root, "apps/web/public/_headers"), "utf8");
  return actual === expected ? [] : [
    "apps/web/public/_headers is stale; run pnpm run generate:cloudflare-static-rules",
  ];
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invoked) {
  const root = process.cwd();
  const target = resolve(root, "apps/web/public/_headers");
  const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
  const rendered = renderCloudflareHeaders(vercel);
  if (process.argv.includes("--check")) {
    const issues = verifyCloudflareStaticRules(root);
    if (issues.length > 0) {
      for (const issue of issues) console.error(issue);
      process.exit(1);
    }
    console.log("Cloudflare static header rules are synchronized with vercel.json");
  } else {
    writeFileSync(target, rendered);
    console.log(`wrote ${target}`);
  }
}
