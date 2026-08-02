import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const VERCEL_CONFIG_URL = new URL("../../../../vercel.json", import.meta.url);
const INDEX_HTML_URL = new URL("../../../../index.html", import.meta.url);

type Header = Readonly<{ key: string; value: string }>;
type VercelConfig = Readonly<{
  headers?: readonly Readonly<{ source: string; headers: readonly Header[] }>[];
}>;

function rootHeaders(): readonly Header[] {
  const config = JSON.parse(
    readFileSync(fileURLToPath(VERCEL_CONFIG_URL), "utf8"),
  ) as VercelConfig;
  return config.headers?.find((entry) => entry.source === "/(.*)")?.headers ?? [];
}

function headerValue(key: string): string | undefined {
  return rootHeaders().find((header) => header.key === key)?.value;
}

function directive(csp: string, name: string): string {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `)) ?? "";
}

function inlineJsonLdHash(): string {
  const html = readFileSync(fileURLToPath(INDEX_HTML_URL), "utf8");
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) throw new Error("index.html JSON-LD data block is missing");
  return `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`;
}

describe("Vercel static security headers", () => {
  it("ships a Studio-aware CSP without reopening active content", () => {
    const csp = headerValue("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("https://accounts.google.com");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");

    const scripts = directive(csp ?? "", "script-src");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).toContain(inlineJsonLdHash());

    const connections = directive(csp ?? "", "connect-src");
    expect(connections.split(/\s+/)).not.toContain("https:");
    expect(connections.split(/\s+/)).not.toContain("wss:");
    expect(connections).toContain("https://www.googleapis.com");
    expect(connections).toContain("https://graph.microsoft.com");
    expect(connections).toContain("https://api.unsplash.com");
    expect(connections).toContain("https://api.openai.com");
    expect(connections).toContain(
      "https://ybsgfhofuvkhywbpytnl.supabase.co",
    );
    expect(connections).not.toContain("https://*.supabase.co");
    expect(connections).toContain(
      "wss://toonspectrum-realtime.toonstudio-realtime.workers.dev",
    );
    expect(connections).toContain("wss://realtime.toonstudio.cloud");
  });

  it("keeps executable bootstraps external and hashes the only inline data block", () => {
    const html = readFileSync(fileURLToPath(INDEX_HTML_URL), "utf8");
    const inlineScripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter((match) => !/\bsrc=/.test(match[1] ?? ""));

    expect(inlineScripts).toHaveLength(1);
    expect(inlineScripts[0]?.[1]).toContain('type="application/ld+json"');
    expect(html).toContain('<script src="/bootstrap-theme.js"></script>');
    expect(html).toContain('<script src="/bootstrap-compat.js"></script>');
  });

  it("does not permit this application to be framed", () => {
    expect(headerValue("X-Frame-Options")).toBe("DENY");
  });
});
