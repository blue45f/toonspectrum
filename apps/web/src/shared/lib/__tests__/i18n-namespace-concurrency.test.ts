import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_I18N_NAMESPACES, STUDIO_I18N_NAMESPACES } from "../i18n-asset-manifest";

function deferredFetch() {
  const requests: Array<(response: Response) => void> = [];
  const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
    requests.push(resolve);
  }));
  return { requests, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("namespace translation loading", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("loads all app namespaces concurrently and merges in manifest order", async () => {
    const { loadAppI18nLocale } = await import("../i18n-asset-loader");
    const { resolveI18nValue } = await import("../i18n");
    const { requests, fetchImpl } = deferredFetch();
    const pending = loadAppI18nLocale("fr", { fetchImpl });

    expect(requests).toHaveLength(APP_I18N_NAMESPACES.length);
    for (let index = requests.length - 1; index >= 0; index -= 1) {
      requests[index](new Response(JSON.stringify({ "recovery.namespace": String(index) })));
    }
    expect((await pending).state).toBe("loaded");
    expect(resolveI18nValue("fr", "recovery.namespace")).toBe(String(requests.length - 1));
  });

  it("loads all required Studio namespaces before registering their deterministic merge", async () => {
    const { loadStudioI18nLocale } = await import("../../../domains/creator/studio-i18n-loader");
    const { resolveI18nValue } = await import("../i18n");
    const { requests, fetchImpl } = deferredFetch();
    const pending = loadStudioI18nLocale("fr", { fetchImpl });

    expect(requests).toHaveLength(STUDIO_I18N_NAMESPACES.length);
    for (let index = requests.length - 1; index >= 0; index -= 1) {
      requests[index](new Response(JSON.stringify({ "studio.recovery.namespace": String(index) })));
    }
    await pending;
    expect(resolveI18nValue("fr", "studio.recovery.namespace")).toBe(String(requests.length - 1));
  });

  it("keeps available optional Studio namespaces when another request rejects", async () => {
    const { loadStudioAssetIfAvailable } = await import("../i18n-asset-loader");
    const { resolveI18nValue } = await import("../i18n");
    let index = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      index += 1;
      if (index === 1) return Promise.reject(new Error("temporary transport failure"));
      if (index === 2) {
        return Promise.resolve(new Response(JSON.stringify({ "studio.recovery.available": "Disponible" })));
      }
      return Promise.resolve(new Response("", { status: 404 }));
    }));

    await loadStudioAssetIfAvailable("fr");
    expect(index).toBe(STUDIO_I18N_NAMESPACES.length);
    expect(resolveI18nValue("fr", "studio.recovery.available")).toBe("Disponible");
  });
});
