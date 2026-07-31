import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const VERCEL_CONFIG_URL = new URL("../../../../vercel.json", import.meta.url);

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
  });

  it("does not permit this application to be framed", () => {
    expect(headerValue("X-Frame-Options")).toBe("DENY");
  });
});
