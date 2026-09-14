import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  renderCloudflareHeaders,
  verifyCloudflareStaticRules,
} from "./cloudflare-static-rules.mjs";

describe("Cloudflare static response rules", () => {
  it("maps Vercel wildcard sources without changing header values", () => {
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

  it("keeps the committed _headers artifact synchronized", () => {
    expect(verifyCloudflareStaticRules()).toEqual([]);
    expect(readFileSync("apps/web/public/_headers", "utf8")).toContain(
      "Content-Security-Policy:",
    );
  });
});
