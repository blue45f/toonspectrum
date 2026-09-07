import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveTranslation } from "@/shared/lib/i18n-core";

import {
  preloadStudioI18nCore,
  scheduleStudioI18nDeferredLoad,
  STUDIO_I18N_CORE_NAMESPACES,
  STUDIO_I18N_DEFERRED_NAMESPACES,
  STUDIO_I18N_MANAGED_SENTINEL_KEY,
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

  it("marks the active locale as priority-managed before network responses settle", async () => {
    const releases: Array<() => void> = [];
    const fetchMock = vi.fn((input: string | URL | Request) =>
      new Promise<Response>((resolve) => {
        releases.push(() => resolve(dictionaryResponse(namespaceFromUrl(input))));
      })
    );

    const loading = preloadStudioI18nCore({
      locale: "af",
      baseUrl: "/priority-managed-sentinel/",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(resolveTranslation("af", STUDIO_I18N_MANAGED_SENTINEL_KEY)).toBe("managed");
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

  it("retries only deferred namespaces that fail transiently", async () => {
    vi.useFakeTimers();
    try {
      const transientNamespace = STUDIO_I18N_DEFERRED_NAMESPACES[0]!;
      const attempts = new Map<string, number>();
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        const namespace = namespaceFromUrl(input);
        const nextAttempt = (attempts.get(namespace) ?? 0) + 1;
        attempts.set(namespace, nextAttempt);
        if (namespace === transientNamespace && nextAttempt === 1) {
          return new Response("temporary", { status: 503 });
        }
        return dictionaryResponse(namespace);
      });

      const cancel = scheduleStudioI18nDeferredLoad({
        locale: "is",
        baseUrl: "/priority-deferred-retry/",
        fetchImpl: fetchMock as typeof fetch,
        deferredRetryDelaysMs: [10],
      });

      await vi.advanceTimersByTimeAsync(250);
      expect(attempts.get(transientNamespace)).toBe(1);
      await vi.advanceTimersByTimeAsync(10);
      expect(attempts.get(transientNamespace)).toBe(2);
      for (const namespace of STUDIO_I18N_DEFERRED_NAMESPACES) {
        expect(attempts.get(namespace)).toBe(namespace === transientNamespace ? 2 : 1);
      }
      cancel();
    } finally {
      vi.useRealTimers();
    }
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
