import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";

function deferredFetch() {
  const requests: Array<(response: Response) => void> = [];
  const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
    requests.push(resolve);
  }));
  return { requests, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("Studio 번역 namespace 병렬 로딩", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("필수 namespace를 모두 받은 뒤 manifest 순서로 병합한다", async () => {
    const { loadStudioI18nLocale } = await import("./studio-i18n-loader");
    const { resolveI18nValue } = await import("@/shared/lib/i18n");
    const { requests, fetchImpl } = deferredFetch();
    const pending = loadStudioI18nLocale("fr", { fetchImpl });

    expect(requests).toHaveLength(STUDIO_I18N_NAMESPACES.length);
    for (let index = requests.length - 1; index >= 0; index -= 1) {
      requests[index](new Response(JSON.stringify({ "studio.recovery.namespace": String(index) })));
    }
    await pending;
    expect(resolveI18nValue("fr", "studio.recovery.namespace")).toBe(String(requests.length - 1));
  });
});
