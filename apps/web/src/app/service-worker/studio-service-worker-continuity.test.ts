import { describe, expect, it, vi } from "vitest";

import { resolveStudioNavigation } from "./studio-service-worker-navigation";
import { hasPreparedStudioDrawingResources } from "./studio-service-worker-offline";

const shell = (isolated = true) => new Response("studio", { headers: {
  "content-type": "text/html",
  ...(isolated ? { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "credentialless" } : {}),
} });
const responseFor = (url: string) => url === "/studio" ? shell() : new Response("code", {
  headers: { "content-type": url.endsWith(".json") ? "application/json" : "application/javascript" },
});
const options = () => ({ shellUrls: ["/studio"], criticalUrls: ["/assets/app.js"],
  warmUrls: ["/i18n/studio/ko.json"], drawingUrls: ["/assets/pen.js", "/assets/export.js"],
  read: vi.fn(async (url: string) => responseFor(url)),
});

describe("prepared Studio continuity", () => {
  it("requires a drawing manifest, not just a cached HTML receipt", async () => {
    expect(await hasPreparedStudioDrawingResources({ ...options(), drawingUrls: [] })).toBe(false);
  });
  it("checks the whole current build without a network request", async () => {
    const input = options();
    expect(await hasPreparedStudioDrawingResources(input)).toBe(true);
    expect(input.read).toHaveBeenCalledTimes(5);
  });
  it.each(["/assets/app.js", "/assets/pen.js", "/assets/export.js", "/i18n/studio/ko.json"])("detects eviction of %s", async (missing) => {
    expect(await hasPreparedStudioDrawingResources({ ...options(),
      read: async (url) => url === missing ? undefined : responseFor(url),
    })).toBe(false);
  });
  it("rejects HTML in place of drawing code", async () => {
    expect(await hasPreparedStudioDrawingResources({ ...options(), read: async () => shell() })).toBe(false);
  });
  it("requires the isolated Studio shell", async () => {
    expect(await hasPreparedStudioDrawingResources({ ...options(),
      read: async (url) => url === "/studio" ? shell(false) : responseFor(url),
    })).toBe(false);
  });
  it("bounds stalled storage and degrades denied storage to not-ready", async () => {
    expect(await hasPreparedStudioDrawingResources({ ...options(), read: () => new Promise(() => {}) }, 5)).toBe(false);
    expect(await hasPreparedStudioDrawingResources({ ...options(), read: async () => { throw new Error("denied"); } })).toBe(false);
  });
  it("bounds concurrent cache reads", async () => {
    let active = 0;
    let maximum = 0;
    expect(await hasPreparedStudioDrawingResources({ ...options(),
      drawingUrls: Array.from({ length: 40 }, (_, i) => `/assets/tool-${i}.js`),
      read: async (url) => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return responseFor(url); },
    })).toBe(true);
    expect(maximum).toBeLessThanOrEqual(8);
  });
});

function navigation(status = 503) {
  return {
    request: new Request("https://studio.test/studio/canvas"), isolated: true, shellUrls: ["/studio"],
    fetcher: vi.fn(async () => new Response("server", { status })),
    readPreparedShell: vi.fn(async (): Promise<Response | undefined> => shell()),
    readRescue: vi.fn(async () => new Response("rescue", { headers: { "content-type": "text/html" } })),
    readShell: vi.fn(async (): Promise<Response | undefined> => shell()),
    refreshShell: vi.fn(async () => {}), waitUntil: vi.fn(),
  };
}

describe("outage fallback precedence", () => {
  it("keeps prepared artists in the full isolated Studio, not an unrelated rescue document", async () => {
    const input = navigation();
    const result = await resolveStudioNavigation(input);
    expect(await result.text()).toBe("studio");
    expect(result.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(input.readRescue).not.toHaveBeenCalled();
  });
  it("keeps the cached Studio shell when the optional full-pack audit is incomplete", async () => {
    for (const response of [undefined, shell(false)]) {
      const input = navigation(); input.readPreparedShell.mockResolvedValue(response);
      expect(await (await resolveStudioNavigation(input)).text()).toBe("studio");
      expect(input.readRescue).not.toHaveBeenCalled();
    }
  });
  it("keeps the cached Studio shell when full-pack cache inspection throws", async () => {
    const input = navigation(); input.readPreparedShell.mockRejectedValue(new Error("quota"));
    expect(await (await resolveStudioNavigation(input)).text()).toBe("studio");
    expect(input.readRescue).not.toHaveBeenCalled();
  });
  it("uses the emergency editor only when no usable Studio shell survives", async () => {
    const input = navigation();
    input.readPreparedShell.mockResolvedValue(undefined);
    input.readShell.mockResolvedValue(undefined);
    expect(await (await resolveStudioNavigation(input)).text()).toBe("rescue");
  });
  it.each([401, 403, 404, 429])("does not hide status %s behind either editor", async (status) => {
    const input = navigation(status);
    expect((await resolveStudioNavigation(input)).status).toBe(status);
    expect(input.readPreparedShell).not.toHaveBeenCalled();
    expect(input.readRescue).not.toHaveBeenCalled();
  });
});
