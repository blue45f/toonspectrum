import { describe, expect, it, vi } from "vitest";

import {
  prepareControlledNavigationDocument,
  resolveStudioNavigation,
  stripModulePreloadLinks,
} from "./studio-service-worker-navigation";
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

describe("controlled document preload boundary", () => {
  it("removes modulepreload links while preserving other document resources", async () => {
    const source = `<!doctype html><html><head>
      <link crossorigin href="/assets/a.js" rel="modulepreload">
      <link rel='modulepreload' href='/assets/b.js'>
      <link rel=modulepreload href=/assets/c.js>
      <link rel="preload" as="font" href="/font.woff2">
      <link rel="stylesheet" href="/app.css">
      <link data-rel="modulepreload" rel="stylesheet" href="/data-rel.css">
    </head><body><script type="module" src="/entry.js"></script></body></html>`;
    const response = new Response(source, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-encoding": "br",
        "content-length": "999",
        etag: '"upstream"',
        "last-modified": "Wed, 16 Sep 2026 00:00:00 GMT",
        "content-security-policy": "default-src 'self'",
      },
    });

    const prepared = await prepareControlledNavigationDocument(response);
    const html = await prepared.text();
    expect(stripModulePreloadLinks(source)).toBe(html);
    expect(html).not.toMatch(
      /<link\b(?=[^>]*\srel\s*=\s*(?:"modulepreload"|'modulepreload'|modulepreload\b))[^>]*>/iu,
    );
    expect(html).toContain('rel="preload"');
    expect(html).toContain('rel="stylesheet"');
    expect(html).toContain('data-rel="modulepreload"');
    expect(html).toContain('type="module"');
    expect(prepared.headers.get("content-security-policy")).toBe("default-src 'self'");
    for (const name of ["content-encoding", "content-length", "etag", "last-modified"]) {
      expect(prepared.headers.get(name)).toBeNull();
    }
  });

  it("leaves non-HTML and documents without modulepreloads untouched", async () => {
    const script = new Response("export {};", { headers: { "content-type": "application/javascript" } });
    const html = shell(false);
    expect(await prepareControlledNavigationDocument(script)).toBe(script);
    expect(await prepareControlledNavigationDocument(html)).toBe(html);
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
