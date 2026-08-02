#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const productionSupabaseOrigin = "https://ybsgfhofuvkhywbpytnl.supabase.co";

function directive(csp, name) {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `)) ?? "";
}

function rootCsp(vercelConfig) {
  const root = vercelConfig.headers?.find((entry) => entry.source === "/(.*)");
  return root?.headers?.find((header) => header.key === "Content-Security-Policy")?.value;
}

function scriptHash(source) {
  return `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
}

export function verifyVercelCspContract({ html, vercelConfig }) {
  const csp = rootCsp(vercelConfig);
  if (typeof csp !== "string" || csp.length === 0) {
    throw new Error("Vercel root Content-Security-Policy is missing.");
  }

  const scripts = directive(csp, "script-src");
  if (scripts.includes("'unsafe-inline'")) {
    throw new Error("script-src must not contain unsafe-inline.");
  }

  const inlineScripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gu)]
    .filter((match) => !/\bsrc=/u.test(match[1] ?? ""));
  for (const match of inlineScripts) {
    const attributes = match[1] ?? "";
    if (!/\btype=["']application\/ld\+json["']/u.test(attributes)) {
      throw new Error("Executable inline script found in built HTML.");
    }
    const hash = scriptHash(match[2] ?? "");
    if (!scripts.split(/\s+/u).includes(hash)) {
      throw new Error(`Inline JSON-LD hash is absent from script-src: ${hash}`);
    }
  }

  const connections = directive(csp, "connect-src").split(/\s+/u);
  if (connections.includes("https:") || connections.includes("wss:")) {
    throw new Error("connect-src contains an unrestricted network scheme.");
  }
  if (!connections.includes("https://realtime.toonstudio.cloud")
    || !connections.includes("wss://realtime.toonstudio.cloud")) {
    throw new Error("The exact production realtime origins are missing from connect-src.");
  }
  const supabaseOrigins = connections.filter((origin) =>
    origin.includes("supabase.co"));
  if (supabaseOrigins.length !== 1 || supabaseOrigins[0] !== productionSupabaseOrigin) {
    throw new Error("connect-src must contain only the exact production Supabase origin.");
  }

  return Object.freeze({ inlineScriptCount: inlineScripts.length, csp });
}

function main() {
  const htmlPath = resolve(repositoryRoot, process.argv[2] ?? "index.html");
  const vercelPath = resolve(repositoryRoot, "vercel.json");
  const result = verifyVercelCspContract({
    html: readFileSync(htmlPath, "utf8"),
    vercelConfig: JSON.parse(readFileSync(vercelPath, "utf8")),
  });
  console.log(
    `Verified Vercel CSP for ${htmlPath}: ${result.inlineScriptCount} hashed inline data block(s).`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
