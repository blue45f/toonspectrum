import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function expectStableProductionTriggers(config: string): void {
  expect(config).toMatch(/"workers_dev"\s*:\s*true/u);
  expect(config).toMatch(/"preview_urls"\s*:\s*false/u);
  expect(config).toMatch(
    /"pattern"\s*:\s*"realtime\.toonstudio\.cloud"[\s\S]{0,120}"custom_domain"\s*:\s*true/u,
  );
}

function readIdentity(config: string): { name: string; issuer: string; audience: string } {
  const name = config.match(/"name"\s*:\s*"([^"]+)"/u)?.[1] ?? "";
  const issuer = config.match(/"REALTIME_TICKET_ISSUER"\s*:\s*"([^"]+)"/u)?.[1] ?? "";
  const audience = config.match(/"REALTIME_TICKET_AUDIENCE"\s*:\s*"([^"]+)"/u)?.[1] ?? "";
  expect({ name, issuer, audience }).not.toEqual({ name: "", issuer: "", audience: "" });
  return { name, issuer, audience };
}

describe("Cloudflare realtime deployment contract", () => {
  it("keeps the custom domain and workers.dev canary explicit", () => {
    expectStableProductionTriggers(read("../wrangler.jsonc"));
  });

  it("keeps the production example aligned with the deployable config", () => {
    expectStableProductionTriggers(read("../wrangler.jsonc.example"));
  });

  it("keeps the example worker identity identical to the deployable config", () => {
    expect(readIdentity(read("../wrangler.jsonc.example"))).toEqual(
      readIdentity(read("../wrangler.jsonc")),
    );
  });
});
