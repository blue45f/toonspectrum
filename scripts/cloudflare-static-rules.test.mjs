import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  renderCloudflareHeaders,
  renderCloudflareWorkerSecurityPolicy,
  verifyCloudflareStaticRules,
} from "./cloudflare-static-rules.mjs";

describe("Cloudflare static response rules", () => {
  it("maps provider-neutral wildcard sources without changing header values", () => {
    const output = renderCloudflareHeaders({
      headers: [
        {
          source: "/(.*)",
          headers: [{ key: "X-Test", value: "root" }],
        },
        {
          source: "/assets/(.*)",
          headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
        },
      ],
    });

    expect(output).toContain("\n/*\n  X-Test: root\n");
    expect(output).toContain(
      "\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
  });

  it("does not apply the long audio cache lifetime to the mutable OST catalogue", () => {
    const policy = JSON.parse(readFileSync("config/http-response-headers.json", "utf8"));
    const broadAudio = policy.headers.find((rule) => rule.source === "/audio/(.*)");
    expect(broadAudio.headers.some((header) => header.key === "Cache-Control")).toBe(false);
    const catalogue = policy.headers.find((rule) => rule.source === "/audio/playlist.json");
    expect(catalogue.headers).toContainEqual({ key: "Cache-Control", value: "no-store" });
    expect(catalogue.headers).toContainEqual({ key: "CDN-Cache-Control", value: "no-store" });
  });

  it("projects the canonical CSP into the edge worker without touching other headers", () => {
    const source = `export const COMMON_SECURITY_HEADERS = {\n  "Content-Security-Policy": "old",\n  "X-Test": "kept",\n};\n`;
    const output = renderCloudflareWorkerSecurityPolicy(source, {
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "Content-Security-Policy", value: "default-src 'self'; object-src 'none'" },
          ],
        },
      ],
    });

    expect(output).toContain(
      `"Content-Security-Policy": "default-src 'self'; object-src 'none'",`,
    );
    expect(output).toContain(`"X-Test": "kept"`);
  });

  it("keeps static and edge response policy artifacts synchronized", () => {
    expect(verifyCloudflareStaticRules()).toEqual([]);
    const headers = readFileSync("apps/web/public/_headers", "utf8");
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain(
      "/studio/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: credentialless\n  X-Robots-Tag: noindex, nofollow, noarchive",
    );
    expect(headers).toContain(
      "/search\n  X-Robots-Tag: noindex, follow",
    );
    expect(headers).toContain(
      "/admin/*\n  X-Robots-Tag: noindex, nofollow, noarchive",
    );
    expect(headers).toContain(
      "/auth/*\n  X-Robots-Tag: noindex, nofollow, noarchive",
    );
    expect(headers).toContain(
      "/messages\n  X-Robots-Tag: noindex, nofollow, noarchive",
    );
  });
});
