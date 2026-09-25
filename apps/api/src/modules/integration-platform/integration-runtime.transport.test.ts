import { describe, expect, it, vi } from "vitest";

import {
  IntegrationRuntimeExternalError,
  IntegrationRuntimeTransport,
  type IntegrationRuntimeFetch,
} from "./integration-runtime.transport";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("IntegrationRuntimeTransport", () => {
  it("rejects non-HTTPS and hosts outside the explicit allowlist before fetch", async () => {
    const fetcher = vi.fn<IntegrationRuntimeFetch>();
    const transport = new IntegrationRuntimeTransport(fetcher);
    await expect(transport.request({
      url: "http://api.notion.com/v1/pages",
      allowedHosts: ["api.notion.com"],
    })).rejects.toMatchObject({ code: "external_url_rejected", uncertain: false });
    await expect(transport.request({
      url: "https://api.notion.com.evil.test/v1/pages",
      allowedHosts: ["api.notion.com"],
    })).rejects.toMatchObject({ code: "external_url_rejected", uncertain: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks redirects instead of following a credential-bearing request", async () => {
    const fetcher = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "https://evil.test" } }),
    );
    const transport = new IntegrationRuntimeTransport(fetcher);
    await expect(transport.request({
      url: "https://api.notion.com/v1/pages",
      allowedHosts: ["api.notion.com"],
    })).rejects.toMatchObject({ code: "external_redirect_blocked", uncertain: true });
  });

  it("bounds response bytes and marks provider throttling as uncertain", async () => {
    const oversized = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(
      json({ ok: true }, 200, { "Content-Length": "1000" }),
    );
    await expect(new IntegrationRuntimeTransport(oversized).request({
      url: "https://api.linear.app/graphql",
      allowedHosts: ["api.linear.app"],
      maximumResponseBytes: 20,
    })).rejects.toBeInstanceOf(IntegrationRuntimeExternalError);

    const throttled = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(json({ error: "slow" }, 429));
    await expect(new IntegrationRuntimeTransport(throttled).request({
      url: "https://api.linear.app/graphql",
      allowedHosts: ["api.linear.app"],
    })).rejects.toMatchObject({ code: "external_http_429", uncertain: true });
  });
});
