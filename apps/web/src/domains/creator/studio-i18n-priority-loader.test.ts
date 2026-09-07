import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  preloadStudioI18nCore,
  STUDIO_I18N_CORE_NAMESPACES,
} from "./studio-i18n-priority-loader";

function namespaceFromUrl(input: string | URL | Request): string {
  const pathname = new URL(String(input), "https://toonstudio.test").pathname;
  const match = pathname.match(/\/i18n\/studio\/([^/]+)\/([^/]+)\.json$/);
  if (!match) throw new Error(`unexpected Studio i18n URL: ${pathname}`);
  return match[1]!;
}

function dictionaryResponse(namespace: string): Response {
  return new Response(JSON.stringify({
    [`studio.${namespace}.ready`]: `${namespace} ready`,
  }));
}

describe("Studio priority i18n loader", () => {
  it("loads only the active locale core namespaces", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      dictionaryResponse(namespaceFromUrl(input))
    );

    const report = await preloadStudioI18nCore({
      locale: "ko",
      baseUrl: "/priority-active-locale/",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(STUDIO_I18N_CORE_NAMESPACES.length);
    expect(fetchMock.mock.calls.every(([input]) => String(input).endsWith("/ko.json"))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/en.json"))).toBe(false);
    expect(report.loadedNamespaces).toEqual(STUDIO_I18N_CORE_NAMESPACES);
    expect(report.failedNamespaces).toEqual([]);
  });

  it("starts core namespace requests concurrently", async () => {
    const releases: Array<() => void> = [];
    const fetchMock = vi.fn((input: string | URL | Request) =>
      new Promise<Response>((resolve) => {
        releases.push(() => resolve(dictionaryResponse(namespaceFromUrl(input))));
      })
    );

    const loading = preloadStudioI18nCore({
      locale: "ko",
      baseUrl: "/priority-concurrent/",
      fetchImpl: fetchMock as typeof fetch,
    });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(STUDIO_I18N_CORE_NAMESPACES.length);
    releases.forEach((release) => release());
    await loading;
  });

  it("isolates a namespace failure instead of rejecting Studio route readiness", async () => {
    const failedNamespace = STUDIO_I18N_CORE_NAMESPACES[0];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const namespace = namespaceFromUrl(input);
      return namespace === failedNamespace
        ? new Response("missing", { status: 500 })
        : dictionaryResponse(namespace);
    });

    const report = await preloadStudioI18nCore({
      locale: "ko",
      baseUrl: "/priority-failure-isolation/",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(report.failedNamespaces).toEqual([failedNamespace]);
    expect(report.loadedNamespaces).toHaveLength(
      STUDIO_I18N_CORE_NAMESPACES.length - 1,
    );
  });

  it("keeps translation fetches outside the lazy chunk recovery promise", () => {
    const routeSource = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/app/routes/groups/creator.routes.tsx"),
      "utf8",
    );

    expect(routeSource).toContain("void preloadStudioI18nCore()");
    expect(routeSource).not.toContain("import { loadStudioI18nDictionaries }");
    expect(routeSource).not.toMatch(/await\s+preloadStudioI18nCore/);
  });
});
