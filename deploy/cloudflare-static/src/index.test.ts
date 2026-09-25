import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  COMMON_SECURITY_HEADERS,
  createCloudflareStaticGateway,
  createCoreApiRequest,
  type CloudflareStaticEnv,
  type R2ObjectBodyBinding,
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

function r2Object(
  bodyText: string,
  options: {
    readonly size?: number;
    readonly range?: { readonly offset: number; readonly length: number };
    readonly etag?: string;
  } = {},
): R2ObjectBodyBinding {
  return {
    size: options.size ?? new TextEncoder().encode(bodyText).byteLength,
    httpEtag: options.etag ?? '"r2-etag"',
    range: options.range,
    body: new Response(bodyText).body!,
    writeHttpMetadata(headers) {
      headers.set("content-disposition", "inline");
    },
  };
}

describe("Cloudflare static gateway", () => {
  it("keeps dynamic security headers synchronized with the provider-neutral contract", () => {
    const responsePolicy = JSON.parse(
      readFileSync(
        new URL("../../../config/http-response-headers.json", import.meta.url),
        "utf8",
      ),
    ) as {
      headers?: Array<{
        source?: string;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };
    const rootHeaders = Object.fromEntries(
      (responsePolicy.headers?.find(({ source }) => source === "/(.*)")?.headers ?? [])
        .map(({ key, value }) => [key, value]),
    );

    for (const [key, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
      expect(rootHeaders[key]).toBe(value);
    }
    expect(COMMON_SECURITY_HEADERS["Content-Security-Policy"]).toContain("https://commons.wikimedia.org");
    expect(COMMON_SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    );
  });

  it("keeps the Worker-first route list limited to dynamic and crawler paths", () => {
    const wrangler = JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    ) as {
      assets?: { run_worker_first?: string[] };
      r2_buckets?: Array<{
        binding?: string;
        bucket_name?: string;
        preview_bucket_name?: string;
      }>;
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
      "/create/*",
      "/showcase/work/*",
      "/showcase/series/*",
      "/u/*",
      "/author/*",
      "/community/post/*",
      "/community/cafes/*",
      "/pencafe/*",
      "/collaborate/*",
      "/community/promote/*",
      "/ranking",
      "/play",
      "/assets/opencascade.wasm-*.wasm",
      "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
      "/brand/toonstudio-product-tour.mp4",
    ]);
    expect(wrangler.assets?.run_worker_first).not.toContain("/market/*");
    expect(wrangler.r2_buckets).toEqual([{
      binding: "LARGE_ASSETS",
      bucket_name: "toonspectrum-public-assets",
      preview_bucket_name: "toonspectrum-public-assets",
    }]);
  });

  it("serves liveness at the edge without waking the Core API", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    for (const pathname of ["/api/health", "/api/health/live"]) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
      expect(response.headers.get("x-toonspectrum-health-source")).toBe(
        "cloudflare-edge",
      );
    }

    const head = await gateway(new Request(
      "https://www.toonstudio.cloud/api/health/live",
      { method: "HEAD" },
    ), env);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves legal policies from first-party static content without an upstream", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/legal/policies/privacy-policy",
    ), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      policySlug: "privacy-policy",
      source: "static",
    }));
    expect(response.headers.get("x-toonspectrum-policy-source")).toBe(
      "first-party-release",
    );
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();

    const missing = await gateway(new Request(
      "https://www.toonstudio.cloud/api/legal/policies/not-a-policy",
    ), env);
    expect(missing.status).toBe(404);
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

  it("serves human shareable navigation from Static Assets", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    for (const pathname of [
      "/title/a-title",
      "/market",
      "/market/browse",
      "/market/resource/123e4567-e89b-42d3-a456-426614174000",
      "/ranking",
      "/author/%EA%B9%80%EC%9E%91%EA%B0%80",
      "/create/work-1",
      "/community/post/post-1",
      "/collaborate/job-1",
    ]) {
      const response = await gateway(new Request(
        `https://www.toonstudio.cloud${pathname}`,
        { headers: { "user-agent": "Mozilla/5.0" } },
      ), env);
      expect(await response.text()).toBe("static");
    }

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(9);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("routes crawler shareable requests to the Render OG endpoint", async () => {
    const requests: Request[] = [];
    const upstream = vi.fn<typeof fetch>(async (request) => {
      requests.push(request as Request);
      return new Response("crawler metadata", { status: 200 });
    });
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    for (const pathname of [
      "/title/a%20b",
      "/market/browse",
      "/ranking",
      "/create/work-1",
    ]) {
      const response = await gateway(new Request(
        `https://www.toonstudio.cloud${pathname}`,
        {
          headers: {
            "user-agent": "Googlebot/2.1",
            authorization: "Bearer must-not-cross-public-og-boundary",
            cookie: "session=must-not-cross-public-og-boundary",
          },
        },
      ), env);
      expect(await response.text()).toBe("crawler metadata");
    }

    expect(requests.map((request) => new URL(request.url).href)).toEqual([
      "https://core.example.test/api/og?slug=a+b",
      "https://core.example.test/api/og?marketPage=browse",
      "https://core.example.test/api/og?staticPage=ranking",
      "https://core.example.test/api/og?creatorWorkId=work-1",
    ]);
    for (const request of requests) {
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("cookie")).toBeNull();
      expect(request.headers.get("x-toonspectrum-edge-route")).toBe("core");
    }
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
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
      "/create/challenges",
      "/create/nested/path",
      "/community/post/nested/path",
      "/author/nested/path",
    ]) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      expect(await response.text()).toBe("static");
    }

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(12);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("proxies only dynamic paths to the configured HTTPS core", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => new Response(
      JSON.stringify({
        path: new URL(request instanceof Request ? request.url : String(request)).pathname,
      }),
      { headers: { "content-type": "application/json" } },
    ));
    const coreOriginSecret = "cloudflare-to-render-origin-secret-0123456789";
    const env = environment({ CORE_ORIGIN_SECRET: coreOriginSecret });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/auth/session", {
        headers: {
          cookie: "session=opaque",
          "x-toonspectrum-origin-secret": "client-spoofed-value",
        },
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
    expect((proxied as Request).headers.get("x-toonspectrum-origin-secret")).toBe(
      coreOriginSecret,
    );
    expect(response.headers.get("content-security-policy")).toBe(
      COMMON_SECURITY_HEADERS["Content-Security-Policy"],
    );
  });

  it("fails closed when the Core origin secret binding is weak", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/projects"),
      environment({ CORE_ORIGIN_SECRET: "too-short" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "CORE_API_UNAVAILABLE",
    });
    expect(upstream).not.toHaveBeenCalled();
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

  it("serves oversized immutable assets from Brotli static sidecars", async () => {
    const assetFetch = vi.fn(async (_request: Request) => new Response("compressed-static", {
      status: 200,
      headers: { etag: "sidecar-etag" },
    }));
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      ASSETS: { fetch: assetFetch },
      LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
    });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
      {
        headers: {
          "accept-encoding": "gzip, br",
          authorization: "Bearer private",
          cookie: "session=private",
        },
      },
    ), env);

    expect(await response.text()).toBe("compressed-static");
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("content-type")).toBe("application/wasm");
    expect(response.headers.get("accept-ranges")).toBe("none");
    expect(response.headers.get("vary")).toContain("Accept-Encoding");
    expect(response.headers.get("x-toonspectrum-large-asset-source")).toBe(
      "static-br",
    );
    expect(upstream).not.toHaveBeenCalled();
    expect(assetFetch).toHaveBeenCalledOnce();
    const staticRequest = assetFetch.mock.calls[0]?.[0] as Request;
    expect(new URL(staticRequest.url).pathname).toBe(
      "/assets/opencascade.wasm-build123.wasm.br",
    );
    expect(staticRequest.headers.get("authorization")).toBeNull();
    expect(staticRequest.headers.get("cookie")).toBeNull();
    expect(staticRequest.headers.get("accept-encoding")).toBe("identity");
  });

  it("uses gzip static sidecars when Brotli is not accepted", async () => {
    const assetFetch = vi.fn(async (_request: Request) => new Response("gzip-static"));
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({ ASSETS: { fetch: assetFetch } });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
      { headers: { "accept-encoding": "gzip" } },
    ), env);

    expect(await response.text()).toBe("gzip-static");
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("content-type")).toBe("model/gltf-binary");
    expect(upstream).not.toHaveBeenCalled();
    const staticRequest = assetFetch.mock.calls[0]?.[0] as Request;
    expect(new URL(staticRequest.url).pathname).toBe(
      "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb.gz",
    );
  });

  it("continues from a missing compressed sidecar to R2", async () => {
    const assetFetch = vi.fn(async () => new Response("missing", { status: 404 }));
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => r2Object("r2-fallback"));
    const head = vi.fn(async (_key: string) => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(
        "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
        { headers: { "accept-encoding": "br" } },
      ),
      environment({
        ASSETS: { fetch: assetFetch },
        LARGE_ASSETS: { get, head },
      }),
    );

    expect(await response.text()).toBe("r2-fallback");
    expect(assetFetch).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves oversized immutable assets from R2 before the origin", async () => {
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => r2Object("r2-wasm"));
    const head = vi.fn(async (_key: string) => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(
        "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
        { headers: { authorization: "Bearer private", cookie: "session=private" } },
      ),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("r2-wasm");
    expect(response.headers.get("content-type")).toBe("application/wasm");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("x-toonspectrum-large-asset-source")).toBe("r2");
    expect(response.headers.get("etag")).toBe('"r2-etag"');
    expect(get).toHaveBeenCalledWith(
      "assets/opencascade.wasm-build123.wasm",
      undefined,
    );
    expect(head).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves a full R2 object as 200 even when R2 reports its full byte range", async () => {
    const get = vi.fn(async () => r2Object("full", {
      size: 4,
      range: { offset: 0, length: 4 },
    }));
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/brand/toonstudio-product-tour.mp4"),
      environment({ LARGE_ASSETS: { get, head: vi.fn(async () => null) } }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("full");
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("content-length")).toBe("4");
    expect(get).toHaveBeenCalledWith("brand/toonstudio-product-tour.mp4", undefined);
  });

  it("serves large-asset HEAD metadata as a full 200 response", async () => {
    const metadata = r2Object("ignored", {
      size: 35_347_422,
      range: { offset: 0, length: 35_347_422 },
    });
    const head = vi.fn(async () => metadata);
    const get = vi.fn(async () => null);
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/brand/toonstudio-product-tour.mp4", { method: "HEAD" }),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("content-length")).toBe("35347422");
    expect(head).toHaveBeenCalledWith("brand/toonstudio-product-tour.mp4");
    expect(get).not.toHaveBeenCalled();
  });

  it("honors a matching If-Range validator for resumable video playback", async () => {
    const head = vi.fn(async (_key: string) => r2Object("metadata", { etag: '"video-etag"' }));
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => r2Object("part", {
      size: 35_347_422,
      range: { offset: 1024, length: 4 },
      etag: '"video-etag"',
    }));
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/brand/toonstudio-product-tour.mp4", {
        headers: { range: "bytes=1024-1027", "if-range": '"video-etag"' },
      }),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1024-1027/35347422");
    expect(get.mock.calls[0]?.[1]?.range?.get("range")).toBe("bytes=1024-1027");
    expect(head).toHaveBeenCalledOnce();
  });

  it("falls back to a full 200 response when If-Range no longer matches", async () => {
    const head = vi.fn(async (_key: string) => r2Object("metadata", { etag: '"new-etag"' }));
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => r2Object("full", {
      size: 4,
      range: { offset: 0, length: 4 },
      etag: '"new-etag"',
    }));
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/brand/toonstudio-product-tour.mp4", {
        headers: { range: "bytes=1024-1027", "if-range": '"old-etag"' },
      }),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-range")).toBeNull();
    expect(await response.text()).toBe("full");
    expect(get).toHaveBeenCalledWith("brand/toonstudio-product-tour.mp4", undefined);
  });

  it("preserves byte ranges while serving R2 large assets", async () => {
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => r2Object("part", {
      size: 65_864_037,
      range: { offset: 0, length: 4 },
    }));
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(
        "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
        {
          headers: {
            range: "bytes=0-3",
            authorization: "Bearer private",
            cookie: "session=private",
          },
        },
      ),
      environment({ LARGE_ASSETS: { get, head: vi.fn(async (_key: string) => null) } }),
    );

    expect(response.status).toBe(206);
    expect(await response.text()).toBe("part");
    expect(response.headers.get("content-range")).toBe(
      "bytes 0-3/65864037",
    );
    expect(response.headers.get("content-length")).toBe("4");
    const options = get.mock.calls[0]?.[1];
    expect(options?.range?.get("range")).toBe("bytes=0-3");
    expect(options?.range?.get("authorization")).toBeNull();
    expect(options?.range?.get("cookie")).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("falls back to the immutable origin when R2 misses", async () => {
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => null);
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
      environment({
        LARGE_ASSETS: { get, head: vi.fn(async (_key: string) => null) },
        LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      url: "https://large-assets.example.test/assets/opencascade.wasm-build123.wasm",
      route: "large-asset",
      range: "bytes=0-1023",
      authorization: null,
      cookie: null,
    });
    expect(get).toHaveBeenCalledOnce();
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("does not wake the Core API when every large-asset authority misses", async () => {
    const assetFetch = vi.fn(async () => new Response("missing", { status: 404 }));
    const get = vi.fn(async () => null);
    const head = vi.fn(async () => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
      { headers: { range: "bytes=0-7" } },
    ), environment({
      ASSETS: { fetch: assetFetch },
      LARGE_ASSETS: { get, head },
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "LARGE_ASSET_UNAVAILABLE",
    });
    expect(get).toHaveBeenCalledOnce();
    expect(upstream).not.toHaveBeenCalled();
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
      new Request("https://www.toonstudio.cloud/api/creator-marketplace/orders", {
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

  it("keeps readiness and runtime configuration on core", async () => {
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

  it("maps crawler paths to the provider-neutral OG endpoint", () => {
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

function neisFixture(total = 1) {
  return {
    schoolInfo: [
      {
        head: [
          { list_total_count: total },
          { RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." } },
        ],
      },
      {
        row: [{
          ATPT_OFCDC_SC_CODE: "B10",
          ATPT_OFCDC_SC_NM: "서울특별시교육청",
          SD_SCHUL_CODE: "7010080",
          SCHUL_NM: "서울고등학교",
          SCHUL_KND_SC_NM: "고등학교",
          FOND_SC_NM: "공립",
          ORG_RDNMA: "서울특별시 서초구 효령로 197",
          COEDU_SC_NM: "남",
          FOND_YMD: "19460201",
        }],
      },
    ],
  };
}

describe("NEIS creator-resource edge", () => {  it("serves keyed school metadata without waking the core origin", async () => {
    const apiKey = "a".repeat(32);
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const url = new URL((request as Request).url);
      expect(url.origin).toBe("https://open.neis.go.kr");
      expect(url.searchParams.get("KEY")).toBe(apiKey);
      expect(url.searchParams.get("pSize")).toBe("12");
      return Response.json(neisFixture());
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=%EC%84%9C%EC%9A%B8%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&page=1",
      { headers: { "cf-connecting-ip": "203.0.113.10" } },
    ), environment({ NEIS_API_KEY: apiKey }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-toonspectrum-neis-mode")).toBe("keyed");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ provider: "neis", status: "ready", total: 1 });
    const item = (body.items as Array<Record<string, unknown>>)[0];
    expect(item).toMatchObject({
      id: "neis:B10-7010080",
      title: "서울고등학교",
      license: "metadata-only",
    });    expect(item?.provenance).toMatchObject({
      provider: "neis",
      importPermission: "metadata-only",
      termsReviewedAt: "2026-09-25",
    });
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("falls back to the official five-row sample when the key is rejected", async () => {
    const apiKey = "b".repeat(32);
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const url = new URL((request as Request).url);
      if (url.searchParams.has("KEY")) {
        return new Response("upstream failure", {
          status: 500,
          headers: { "content-type": "text/html" },
        });
      }
      expect(url.searchParams.get("pIndex")).toBe("1");
      expect(url.searchParams.get("pSize")).toBe("5");
      return Response.json(neisFixture(42));
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&page=2",
      { headers: { "cf-connecting-ip": "203.0.113.11" } },
    ), environment({ NEIS_API_KEY: apiKey }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-toonspectrum-neis-mode")).toBe("sample");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      provider: "neis",
      status: "ready",
      page: 2,
      hasMore: false,
      total: 42,
      items: [],
    });
    expect(String(body.message)).toContain("공개 샘플 최대 5건");
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(upstream).toHaveBeenCalledTimes(2);

    const next = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=%EC%A4%91%ED%95%99%EA%B5%90&page=1",
      { headers: { "cf-connecting-ip": "203.0.113.11" } },
    ), environment({ NEIS_API_KEY: apiKey }));
    expect(next.headers.get("x-toonspectrum-neis-mode")).toBe("sample");
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it("caches repeated searches and bounds uncached traffic per client", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({
      RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." },
    }));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const request = (query: string) => new Request(
      `https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=${query}&page=1`,
      { headers: { "cf-connecting-ip": "203.0.113.12" } },
    );

    const first = await gateway(request("학교00"), environment());
    const cached = await gateway(request("학교00"), environment());
    expect(first.headers.get("x-toonspectrum-edge-cache")).toBe("miss");
    expect(cached.headers.get("x-toonspectrum-edge-cache")).toBe("hit");
    expect(upstream).toHaveBeenCalledOnce();
    for (const query of ["학교01", "학교02", "학교03", "학교04"]) {
      expect((await gateway(request(query), environment())).status).toBe(200);
    }
    const limited = await gateway(request("학교05"), environment());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(upstream).toHaveBeenCalledTimes(5);
  });

  it("marks NEIS configured in the public provider summary", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json([
      { provider: "neis", availability: "not_configured" },
      { provider: "ambientcg", availability: "keyless" },
    ]));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/providers",
    ), environment({ NEIS_API_KEY: "c".repeat(32) }));

    expect(response.status).toBe(200);
    expect(response.headers.get(
      "x-toonspectrum-creator-resource-source",
    )).toBe("cloudflare-neis-edge");
    await expect(response.json()).resolves.toEqual([
      { provider: "neis", availability: "configured" },
      { provider: "ambientcg", availability: "keyless" },
    ]);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("rejects invalid input before any provider request", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=x&page=99",
    ), environment());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_creator_resource_query",
    });
    expect(upstream).not.toHaveBeenCalled();
  });
});
