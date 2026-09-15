import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { SITE_URL, siteUrl } from "../../../../../../packages/core/src/business";

const ROOT = process.cwd();
const CANONICAL_ORIGIN = "https://www.toonstudio.cloud";

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("toonstudio.cloud production domain", () => {
  it("uses the www origin as the single canonical URL source", () => {
    expect(SITE_URL).toBe(CANONICAL_ORIGIN);
    expect(siteUrl("/studio")).toBe(`${CANONICAL_ORIGIN}/studio`);
    expect(siteUrl("fortune")).toBe(`${CANONICAL_ORIGIN}/fortune`);
  });

  it("publishes canonical, OG, JSON-LD, robots and LLM links on the www origin", () => {
    const html = read("apps/web/index.html");
    expect(html).toContain(`<link rel="canonical" href="${CANONICAL_ORIGIN}/"`);
    expect(html).toContain(`<meta property="og:url" content="${CANONICAL_ORIGIN}/"`);
    expect(html).toContain(`"@id": "${CANONICAL_ORIGIN}/#website"`);
    expect(html).toContain(`"urlTemplate": "${CANONICAL_ORIGIN}/search?q={search_term_string}"`);
    expect(read("apps/web/public/robots.txt")).toContain(
      `Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`,
    );
    expect(read("apps/web/public/llms.txt")).toContain(`${CANONICAL_ORIGIN}/studio`);
  });

  it("keeps host-scoped permanent redirects for apex and the legacy fallback hostname", () => {
    const config = JSON.parse(read("vercel.json")) as {
      redirects?: Array<{
        destination?: string;
        permanent?: boolean;
        has?: Array<{ type?: string; value?: string }>;
      }>;
    };
    const redirects = config.redirects ?? [];

    for (const host of ["toonstudio.cloud", "toonspectrum.vercel.app"]) {
      expect(redirects).toContainEqual(
        expect.objectContaining({
          destination: `${CANONICAL_ORIGIN}/:path*`,
          permanent: true,
          has: [{ type: "host", value: host }],
        }),
      );
    }
  });

  it("keeps emergency fallback crawler rewrites compatible", () => {
    const config = JSON.parse(read("vercel.json")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(config.rewrites).toEqual(expect.arrayContaining([
      {
        source: "/market",
        destination: "/api/og?marketPage=home",
      },
      {
        source: "/market/browse",
        destination: "/api/og?marketPage=browse",
      },
      {
        source: "/market/resource/:resourceId",
        destination: "/api/og?marketResourceId=:resourceId",
      },
    ]));
  });

  it("keeps the Render Core API canonical and the realtime fallback isolated", () => {
    const production = read(".env.production.example");
    const render = parse(read("render.yaml")) as {
      services?: Array<{
        name?: string;
        autoDeployTrigger?: string;
        healthCheckPath?: string;
        envVars?: Array<{ key?: string; value?: string; sync?: boolean }>;
      }>;
    };
    const cloudflareGateway = read("deploy/cloudflare-static/wrangler.jsonc");
    expect(production).toContain(
      "API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud",
    );
    expect(production).toContain("OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud");
    expect(production).toContain("WEB_APP_BASE_URL=https://www.toonstudio.cloud");
    expect(production).toContain("CANONICAL_HOST=www.toonstudio.cloud");

    const core = render.services?.find(({ name }) => name === "toonspectrum-core-api");
    expect(core).toMatchObject({
      autoDeployTrigger: "off",
      healthCheckPath: "/api/health/ready",
    });
    expect(core?.envVars).toEqual(expect.arrayContaining([
      { key: "API_RUNTIME_ROLE", value: "full" },
      {
        key: "API_CORS_ALLOWED_ORIGINS",
        value: "https://www.toonstudio.cloud,https://toonstudio.cloud",
      },
      { key: "OAUTH_REDIRECT_BASE_URL", value: "https://www.toonstudio.cloud" },
      { key: "WEB_APP_BASE_URL", value: "https://www.toonstudio.cloud" },
      { key: "CANONICAL_HOST", value: "www.toonstudio.cloud" },
      { key: "DATABASE_URL", sync: false },
    ]));

    const realtime = render.services?.find(({ name }) => name === "toonspectrum-studio-live");
    expect(realtime?.envVars).toEqual(expect.arrayContaining([
      { key: "API_RUNTIME_ROLE", value: "studio-live" },
      { key: "STUDIO_REALTIME_TICKET_ENABLED", value: "false" },
    ]));
    expect(cloudflareGateway).toContain('"/api/*"');
    expect(cloudflareGateway).toContain('"/socket.io/*"');
    expect(cloudflareGateway).toContain('"not_found_handling": "single-page-application"');
  });
});
