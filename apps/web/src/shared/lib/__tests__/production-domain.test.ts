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

  it("loads public production build variables from the repository root", () => {
    const viteConfig = read("vite.config.ts");
    const productionExample = read(".env.production.example");

    expect(viteConfig).toContain("envDir: repositoryRoot");
    expect(productionExample).toContain("VITE_KAKAO_JAVASCRIPT_KEY=");
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
      healthCheckPath: "/api/health/live",
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
      { key: "GOOGLE_OAUTH_CLIENT_ID", sync: false },
      { key: "GOOGLE_OAUTH_CLIENT_SECRET", sync: false },
      { key: "KAKAO_REST_API_KEY", sync: false },
      { key: "KAKAO_CLIENT_SECRET", sync: false },
      { key: "KAKAO_ACCOUNT_EMAIL_SCOPE_ENABLED", value: "false" },
      { key: "KAKAO_APP_ID", sync: false },
      { key: "KAKAO_ADMIN_KEY", sync: false },
      { key: "NAVER_OAUTH_CLIENT_ID", sync: false },
      { key: "NAVER_OAUTH_CLIENT_SECRET", sync: false },
      { key: "GITHUB_OAUTH_CLIENT_ID", sync: false },
      { key: "GITHUB_OAUTH_CLIENT_SECRET", sync: false },
      { key: "APPLE_SERVICE_ID", sync: false },
      { key: "APPLE_TEAM_ID", sync: false },
      { key: "APPLE_KEY_ID", sync: false },
      { key: "APPLE_PRIVATE_KEY", sync: false },
    ]));

    const realtime = render.services?.find(({ name }) => name === "toonspectrum-studio-live");
    expect(realtime).toMatchObject({
      autoDeployTrigger: "off",
      healthCheckPath: "/api/health/live",
    });
    expect(realtime?.envVars).toEqual(expect.arrayContaining([
      { key: "API_RUNTIME_ROLE", value: "studio-live" },
      { key: "STUDIO_REALTIME_TICKET_ENABLED", value: "false" },
    ]));
    expect(cloudflareGateway).toContain('"/api/*"');
    expect(cloudflareGateway).toContain('"/socket.io/*"');
    expect(cloudflareGateway).toContain('"not_found_handling": "single-page-application"');
  });
});
