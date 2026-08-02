import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { verifyVercelCspContract } from "./verify-vercel-csp.mjs";

const ROOT = new URL("../", import.meta.url);

function fixture() {
  return {
    html: readFileSync(fileURLToPath(new URL("index.html", ROOT)), "utf8"),
    vercelConfig: JSON.parse(
      readFileSync(fileURLToPath(new URL("vercel.json", ROOT)), "utf8"),
    ),
  };
}

describe("Vercel CSP build contract", () => {
  it("accepts the repository HTML and exact production network allowlist", () => {
    expect(verifyVercelCspContract(fixture())).toMatchObject({
      inlineScriptCount: 1,
    });
  });

  it("rejects executable inline script and unrestricted connection schemes", () => {
    const current = fixture();
    expect(() => verifyVercelCspContract({
      ...current,
      html: current.html.replace(
        "</body>",
        "<script>globalThis.compromised = true</script></body>",
      ),
    })).toThrow("Executable inline script");

    const broadened = JSON.parse(JSON.stringify(current.vercelConfig));
    const cspHeader = broadened.headers[0].headers.find(
      (header) => header.key === "Content-Security-Policy",
    );
    cspHeader.value = cspHeader.value.replace(
      "connect-src 'self'",
      "connect-src 'self' https:",
    );
    expect(() => verifyVercelCspContract({
      html: current.html,
      vercelConfig: broadened,
    })).toThrow("unrestricted network scheme");
  });

  it("rejects a wildcard or a second Supabase tenant origin", () => {
    const current = fixture();
    const broadened = JSON.parse(JSON.stringify(current.vercelConfig));
    const cspHeader = broadened.headers[0].headers.find(
      (header) => header.key === "Content-Security-Policy",
    );
    cspHeader.value = cspHeader.value.replace(
      "https://ybsgfhofuvkhywbpytnl.supabase.co",
      "https://*.supabase.co",
    );
    expect(() => verifyVercelCspContract({
      html: current.html,
      vercelConfig: broadened,
    })).toThrow("exact production Supabase origin");

    const secondTenant = JSON.parse(JSON.stringify(current.vercelConfig));
    const secondCsp = secondTenant.headers[0].headers.find(
      (header) => header.key === "Content-Security-Policy",
    );
    secondCsp.value = secondCsp.value.replace(
      "https://ybsgfhofuvkhywbpytnl.supabase.co",
      "https://ybsgfhofuvkhywbpytnl.supabase.co https://attacker.supabase.co",
    );
    expect(() => verifyVercelCspContract({
      html: current.html,
      vercelConfig: secondTenant,
    })).toThrow("exact production Supabase origin");
  });
});
