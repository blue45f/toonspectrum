import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  COMMON_SECURITY_HEADERS,
  createCloudflareStaticGateway,
  createCoreApiRequest,
  type CloudflareStaticEnv,
} from "./index";

function environment(overrides: Partial<CloudflareStaticEnv> = {}): CloudflareStaticEnv {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response("static", { status: 200 })),
    },
    CORE_API_ORIGIN: "https://core.example.test",
    ...overrides,
  };
}

describe("Cloudflare static gateway", () => {
  it("keeps dynamic security headers synchronized with the canonical Vercel contract", () => {
    const vercel = JSON.parse(
      readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"),
    ) as {
      headers?: Array<{
        source?: string;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };
    const rootHeaders = Object.fromEntries(
      (vercel.headers?.find(({ source }) => source === "/(.*)")?.headers ?? [])
        .map(({ key, value }) => [key, value]),
    );

    for (const [key, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
      expect(rootHeaders[key]).toBe(value);
    }
  });

  it("leaves static traffic on the free Static Assets path", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(new Request("https://www.toonstudio.cloud/studio"), env);

    expect(await response.text()).toBe("static");
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("proxies only dynamic paths to the configured HTTPS core", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => new Response(
      JSON.stringify({
        path: new URL(request instanceof Request ? request.url : String(request)).pathname,
      }),
      { headers: { "content-type": "application/json" } },
    ));
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/auth/session", {
        headers: { cookie: "session=opaque" },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    const proxied = upstream.mock.calls[0]?.[0];
    expect(proxied).toBeInstanceOf(Request);
    expect(new URL((proxied as Request).url).href).toBe(
      "https://core.example.test/api/auth/session",
    );
    expect((proxied as Request).headers.get("cookie")).toBe("session=opaque");
    expect((proxied as Request).headers.get("x-forwarded-host")).toBe("www.toonstudio.cloud");
    expect(response.headers.get("content-security-policy")).toBe(
      COMMON_SECURITY_HEADERS["Content-Security-Policy"],
    );
  });

  it("maps crawler routes to the existing OG endpoint", () => {
    const origin = new URL("https://core.example.test");
    const title = createCoreApiRequest(
      new Request("https://www.toonstudio.cloud/title/a%20b"),
      origin,
    );
    const market = createCoreApiRequest(
      new Request("https://www.toonstudio.cloud/market/resource/r%2F1"),
      origin,
    );

    expect(new URL(title.url).href).toBe("https://core.example.test/api/og?slug=a+b");
    expect(new URL(market.url).href).toBe(
      "https://core.example.test/api/og?marketResourceId=r%2F1",
    );
  });

  it("fails closed instead of serving SPA HTML for an unconfigured API", async () => {
    const env = environment({ CORE_API_ORIGIN: "http://insecure.example.test" });
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });

    const response = await gateway(new Request("https://www.toonstudio.cloud/api/me"), env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "CORE_API_UNAVAILABLE" });
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("returns a bounded upstream error without exposing exception details", async () => {
    const gateway = createCloudflareStaticGateway({
      fetch: vi.fn<typeof fetch>(async () => { throw new Error("secret upstream detail"); }),
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/socket.io/?EIO=4&transport=polling"),
      environment(),
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"error":"CORE_API_UPSTREAM_FAILED"}');
  });
});
