import { describe, expect, it, vi } from "vitest";

import { prepareStudioOfflineResources } from "./studio-service-worker-offline";

describe("Studio offline preparation", () => {
  it("accepts reviewed standalone emergency drawing HTML", async () => {
    const cached = new Map<string, Response>([
      [
        "/offline-draw/index.html",
        new Response("<!doctype html><title>Emergency drawing</title>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ],
    ]);
    const report = await prepareStudioOfflineResources({
      origin: "https://toonstudio.test",
      buildId: "offline-html",
      urls: [],
      shellUrls: [],
      criticalUrls: ["/offline-draw/index.html"],
      warmUrls: [],
      read: async (url) => cached.get(url)?.clone(),
      write: vi.fn(),
    });

    expect(report).toMatchObject({ checked: 1, cached: 1, complete: true, missing: [] });
  });

  it("still rejects an HTML error page masquerading as JavaScript", async () => {
    const htmlError = () => new Response("<!doctype html><title>Not found</title>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const report = await prepareStudioOfflineResources({
      origin: "https://toonstudio.test",
      buildId: "html-error",
      urls: [],
      shellUrls: [],
      criticalUrls: ["/bootstrap-compat.js"],
      warmUrls: [],
      read: async () => htmlError(),
      write: vi.fn(),
      fetcher: async () => htmlError(),
    });

    expect(report.complete).toBe(false);
    expect(report.missing).toContain("/bootstrap-compat.js");
  });
});
