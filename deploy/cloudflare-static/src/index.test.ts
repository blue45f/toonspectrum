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

  it("keeps the Worker-first route list limited to dynamic and crawler paths", () => {
    const wrangler = JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    ) as {
      assets?: { run_worker_first?: string[] };
    };

    expect((wrangler as { workers_dev?: boolean }).workers_dev).toBe(true);
    expect(wrangler.assets?.run_worker_first).toEqual([
      "/api",
      "/api/*",
      "/socket.io",
      "/socket.io/*",
      "/title/*",
      "/market",
      "/market/browse",
      "/market/resource/*",
      "/assets/opencascade.wasm-*.wasm",
      "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
    ]);
    expect(wrangler.assets?.run_worker_first).not.toContain("/market/*");
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

  it("keeps non-OG marketplace and nested crawler routes on Static Assets", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    for (const pathname of [
      "/market/library",
      "/market/wishlist",
      "/market/manage",
      "/market/publish",
      "/market/fit",
      "/market/compare",
      "/market/resource/nested/path",
      "/title/nested/path",
    ]) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      expect(await response.text()).toBe("static");
    }

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(8);
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
    expect((proxied as Request).headers.get("x-toonspectrum-edge-route")).toBe("core");
    expect(response.headers.get("content-security-policy")).toBe(
      COMMON_SECURITY_HEADERS["Content-Security-Policy"],
    );
  });

  it("routes social, playground, admin, and realtime traffic to isolated authorities", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const proxied = request as Request;
      return new Response(JSON.stringify({
        host: new URL(proxied.url).host,
        route: proxied.headers.get("x-toonspectrum-edge-route"),
      }));
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      SOCIAL_API_ORIGIN: "https://social.example.test",
      PLAYGROUND_API_ORIGIN: "https://playground.example.test",
      ADMIN_API_ORIGIN: "https://admin.example.test",
      REALTIME_API_ORIGIN: "https://realtime.example.test",
    });

    const cases = [
      ["/api/community/posts", "social.example.test", "social"],
      ["/api/reviews", "social.example.test", "social"],
      ["/api/fortune/today", "playground.example.test", "playground"],
      ["/api/play/session", "playground.example.test", "playground"],
      ["/api/admin/community/posts", "admin.example.test", "admin"],
      ["/socket.io/?EIO=4&transport=polling", "realtime.example.test", "realtime"],
    ] as const;

    for (const [pathname, host, route] of cases) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      await expect(response.json()).resolves.toEqual({ host, route });
    }
  });

  it("proxies oversized immutable assets without forwarding session credentials", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const proxied = request as Request;
      return new Response(JSON.stringify({
        url: proxied.url,
        route: proxied.headers.get("x-toonspectrum-edge-route"),
        range: proxied.headers.get("range"),
        authorization: proxied.headers.get("authorization"),
        cookie: proxied.headers.get("cookie"),
      }));
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(
        "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
        {
          headers: {
            range: "bytes=0-1023",
            authorization: "Bearer private",
            cookie: "session=private",
          },
        },
      ),
      environment({ LARGE_ASSET_ORIGIN: "https://large-assets.example.test" }),
    );

    await expect(response.json()).resolves.toEqual({
      url: "https://large-assets.example.test/assets/opencascade.wasm-build123.wasm",
      route: "large-asset",
      range: "bytes=0-1023",
      authorization: null,
      cookie: null,
    });
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("falls back to the core authority while a domain-specific service is not configured", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => new Response(
      new URL((request as Request).url).host,
    ));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/community/posts"),
      environment(),
    );

    expect(await response.text()).toBe("core.example.test");
    const proxied = upstream.mock.calls[0]?.[0] as Request;
    expect(proxied.headers.get("x-toonspectrum-edge-route")).toBe("social");
  });

  it("distributes public reads deterministically and retries only safe transient failures", async () => {
    const attempts: Request[] = [];
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const proxied = request as Request;
      attempts.push(proxied);
      if (attempts.length === 1) return new Response("busy", { status: 503 });
      return new Response(new URL(proxied.url).host, { status: 200 });
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      PUBLIC_READ_API_ORIGINS:
        "https://catalog-a.example.test,https://catalog-b.example.test",
    });
    const request = new Request(
      "https://www.toonstudio.cloud/api/titles?genre=fantasy",
      {
        headers: {
          "cf-ray": "stable-ray-id",
          authorization: "Bearer private-session-token",
          cookie: "session=private",
          "x-user-id": "private-user",
          "x-forwarded-for": "203.0.113.200",
        },
      },
    );

    const response = await gateway(request, env);

    expect(response.status).toBe(200);
    expect(attempts).toHaveLength(2);
    expect(new URL(attempts[0].url).origin).not.toBe(
      new URL(attempts[1].url).origin,
    );
    expect(attempts.map((attempt) =>
      attempt.headers.get("x-toonspectrum-edge-attempt"))).toEqual(["0", "1"]);
    expect(attempts.every((attempt) =>
      attempt.headers.get("x-toonspectrum-edge-route") === "public-read")).toBe(true);
    for (const attempt of attempts) {
      expect(attempt.headers.get("authorization")).toBeNull();
      expect(attempt.headers.get("cookie")).toBeNull();
      expect(attempt.headers.get("x-user-id")).toBeNull();
      expect(attempt.headers.get("x-forwarded-for")).toBeNull();
    }
  });

  it("keeps public writes on the core authority instead of replica failover", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      new Response("core-write", { status: 503 }));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/catalog/refresh", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      environment({
        PUBLIC_READ_API_ORIGINS:
          "https://catalog-a.example.test,https://catalog-b.example.test",
      }),
    );

    expect(response.status).toBe(503);
    expect(upstream).toHaveBeenCalledOnce();
    const proxied = upstream.mock.calls[0]?.[0] as Request;
    expect(new URL(proxied.url).origin).toBe("https://core.example.test");
    expect(proxied.headers.get("x-toonspectrum-edge-route")).toBe("core");
  });

  it("keeps catalog ingest operations and readiness checks on core", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => new Response(
      JSON.stringify({
        host: new URL((request as Request).url).host,
        route: (request as Request).headers.get("x-toonspectrum-edge-route"),
      }),
    ));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      PUBLIC_READ_API_ORIGINS:
        "https://catalog-a.example.test,https://catalog-b.example.test",
    });

    for (const pathname of [
      "/api/catalog/ingest/status",
      "/api/health/ready",
      "/api/config",
    ]) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      await expect(response.json()).resolves.toEqual({
        host: "core.example.test",
        route: "core",
      });
    }
  });

  it("fails closed for an explicitly configured invalid domain authority", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/community/posts"),
      environment({ SOCIAL_API_ORIGIN: "http://social.example.test" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "CORE_API_UNAVAILABLE",
    });
    expect(upstream).not.toHaveBeenCalled();
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

  it("rejects any self-reference inside the public read pool", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/titles"),
      environment({
        PUBLIC_READ_API_ORIGINS:
          "https://catalog.example.test,https://www.toonstudio.cloud",
      }),
    );

    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects a self-referential core origin before it can create a proxy loop", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/me"),
      environment({ CORE_API_ORIGIN: "https://www.toonstudio.cloud" }),
    );

    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes WebSocket upgrade responses through without reconstructing them", async () => {
    const upstreamResponse = new Response(null, {
      status: 200,
      headers: { "x-upstream-websocket": "preserved" },
    });
    const upstream = vi.fn<typeof fetch>(async () => upstreamResponse);
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/socket.io/?EIO=4&transport=websocket", {
        headers: { upgrade: "websocket" },
      }),
      environment(),
    );

    expect(response).toBe(upstreamResponse);
    expect(response.headers.get("x-upstream-websocket")).toBe("preserved");
    expect(response.headers.get("content-security-policy")).toBeNull();
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
