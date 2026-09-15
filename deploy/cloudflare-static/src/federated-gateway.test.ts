import { describe, expect, it, vi } from "vitest";

import {
  classifyFederatedRoute,
  createFederatedStaticGateway,
  createReadModelSnapshotRequest,
  type FederatedCloudflareStaticEnv,
} from "./federated-gateway";

function environment(
  overrides: Partial<FederatedCloudflareStaticEnv> = {},
): FederatedCloudflareStaticEnv {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response("static", { status: 200 })),
    },
    CORE_API_ORIGIN: "https://core.example.test",
    ...overrides,
  };
}

describe("federated Cloudflare gateway", () => {
  it("keeps the parent gateway route boundaries for security-sensitive paths", () => {
    expect(classifyFederatedRoute(new Request(
      "https://www.toonstudio.cloud/api/titles?genre=fantasy",
    ))).toBe("public-read");
    expect(classifyFederatedRoute(new Request(
      "https://www.toonstudio.cloud/api/community/posts",
    ))).toBe("social");
    expect(classifyFederatedRoute(new Request(
      "https://www.toonstudio.cloud/api/fortune/today",
    ))).toBe("playground");
    expect(classifyFederatedRoute(new Request(
      "https://www.toonstudio.cloud/api/admin/members",
    ))).toBe("admin");
    expect(classifyFederatedRoute(new Request(
      "https://www.toonstudio.cloud/api/health/ready",
    ))).toBe("core");
    expect(classifyFederatedRoute(new Request(
      "https://www.toonstudio.cloud/api/creator-marketplace/orders",
      { method: "POST" },
    ))).toBe("core");
  });

  it("preserves compatibility mode while a workload authority is not split", async () => {
    const baseFetch = vi.fn(async () => new Response("core"));
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch,
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/community/posts"),
      environment(),
    );

    expect(await response.text()).toBe("core");
    expect(response.headers.get("x-toonspectrum-edge-route")).toBe("social");
    expect(response.headers.get("x-toonspectrum-edge-routing")).toBe(
      "legacy-core-authority",
    );
    expect(baseFetch).toHaveBeenCalledOnce();
  });

  it("fails closed instead of crossing workload boundaries in strict mode", async () => {
    const baseFetch = vi.fn(async () => new Response("unexpected"));
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch,
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/community/posts", {
        method: "POST",
      }),
      environment({ FEDERATED_API_STRICT: "true" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "CORE_API_UNAVAILABLE",
    });
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("uses query-free JSON snapshots after public-read replica failure", async () => {
    const baseFetch = vi.fn(async () => new Response("busy", { status: 503 }));
    const assets = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === "/data/api-read-model/titles.json") {
        return new Response(JSON.stringify({ items: ["snapshot"] }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("spa", {
        headers: { "content-type": "text/html" },
      });
    });
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch,
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/titles"),
      environment({
        ASSETS: { fetch: assets },
        PUBLIC_READ_API_ORIGINS:
          "https://catalog-a.example.test,https://catalog-b.example.test",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: ["snapshot"] });
    expect(response.headers.get("x-toonspectrum-edge-routing")).toBe(
      "static-read-model",
    );
    expect(baseFetch).toHaveBeenCalledOnce();
  });

  it("can serve a static public-read snapshot before upstream in strict mode", async () => {
    const baseFetch = vi.fn(async () => new Response("unexpected"));
    const assets = vi.fn(async (request: Request) => new Response(
      JSON.stringify({ path: new URL(request.url).pathname }),
      { headers: { "content-type": "application/json" } },
    ));
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch,
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/titles"),
      environment({
        ASSETS: { fetch: assets },
        FEDERATED_API_STRICT: "true",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      path: "/data/api-read-model/titles.json",
    });
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("does not use static snapshots when query semantics cannot be preserved", async () => {
    const baseFetch = vi.fn(async () => new Response("unexpected"));
    const assets = vi.fn(async () => new Response(JSON.stringify({ stale: true }), {
      headers: { "content-type": "application/json" },
    }));
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch,
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/search?q=toon"),
      environment({
        ASSETS: { fetch: assets },
        FEDERATED_API_STRICT: "true",
      }),
    );

    expect(response.status).toBe(503);
    expect(assets).not.toHaveBeenCalled();
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("rejects SPA HTML that would otherwise masquerade as a snapshot", async () => {
    const baseFetch = vi.fn(async () => new Response("unexpected"));
    const assets = vi.fn(async () => new Response("<html>SPA</html>", {
      headers: { "content-type": "text/html" },
    }));
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch,
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/titles"),
      environment({
        ASSETS: { fetch: assets },
        FEDERATED_API_STRICT: "true",
      }),
    );

    expect(response.status).toBe(503);
  });

  it("does not hide an explicitly invalid authority behind static fallback", async () => {
    const baseFetch = vi.fn(async () => new Response("unexpected"));
    const assets = vi.fn(async () => new Response(JSON.stringify({ stale: true }), {
      headers: { "content-type": "application/json" },
    }));
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch,
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/titles"),
      environment({
        ASSETS: { fetch: assets },
        PUBLIC_READ_API_ORIGINS: "http://insecure.example.test",
      }),
    );

    expect(response.status).toBe(503);
    expect(assets).not.toHaveBeenCalled();
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("sanitizes client-supplied internal routing headers before base proxying", async () => {
    const forwarded: { request?: Request } = {};
    const baseFetch = vi.fn(async (request: Request) => {
      forwarded.request = request;
      return new Response("ok");
    });
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch,
    });
    await gateway(
      new Request("https://www.toonstudio.cloud/api/community/posts", {
        headers: {
          "x-toonspectrum-edge-route": "core",
          "x-toonspectrum-edge-routing": "spoofed",
        },
      }),
      environment({ SOCIAL_API_ORIGIN: "https://social.example.test" }),
    );

    const proxied = forwarded.request;
    if (!proxied) throw new Error("base gateway was not called");
    expect(proxied.headers.get("x-toonspectrum-edge-route")).toBeNull();
    expect(proxied.headers.get("x-toonspectrum-edge-routing")).toBeNull();
  });

  it("reports strict readiness without exposing origin URLs", async () => {
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch: vi.fn(async () => new Response("unused")),
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/edge/health"),
      environment({
        PUBLIC_READ_API_ORIGINS:
          "https://catalog-a.example.test,https://catalog-b.example.test",
        SOCIAL_API_ORIGIN: "https://social.example.test",
        PLAYGROUND_API_ORIGIN: "https://playground.example.test",
        ADMIN_API_ORIGIN: "https://admin.example.test",
        REALTIME_API_ORIGIN: "https://realtime.example.test",
        FEDERATED_API_STRICT: "true",
      }),
    );
    const text = await response.text();
    const body = JSON.parse(text) as {
      strictReady: boolean;
      configured: { publicReadReplicaCount: number };
    };

    expect(response.status).toBe(200);
    expect(body.strictReady).toBe(true);
    expect(body.configured.publicReadReplicaCount).toBe(2);
    expect(text).not.toContain("example.test");
  });

  it("preserves WebSocket upgrade responses without reconstruction", async () => {
    const upstreamResponse = new Response(null, {
      status: 200,
      headers: { "x-upstream-websocket": "preserved" },
    });
    const gateway = createFederatedStaticGateway({
      fetch: vi.fn<typeof fetch>(),
      baseFetch: vi.fn(async () => upstreamResponse),
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/socket.io/?EIO=4&transport=websocket", {
        headers: { upgrade: "websocket" },
      }),
      environment(),
    );

    expect(response).toBe(upstreamResponse);
    expect(response.headers.get("x-toonspectrum-edge-routing")).toBeNull();
  });

  it("creates snapshots only for query-free GET/HEAD API reads", () => {
    const snapshot = createReadModelSnapshotRequest(
      new Request("https://www.toonstudio.cloud/api/titles"),
      "/data/api-read-model",
    );
    const queried = createReadModelSnapshotRequest(
      new Request("https://www.toonstudio.cloud/api/search?q=toon"),
      "/data/api-read-model",
    );
    const write = createReadModelSnapshotRequest(
      new Request("https://www.toonstudio.cloud/api/titles", {
        method: "POST",
      }),
      "/data/api-read-model",
    );

    expect(snapshot?.url).toBe(
      "https://www.toonstudio.cloud/data/api-read-model/titles.json",
    );
    expect(queried).toBeNull();
    expect(write).toBeNull();
  });
});
