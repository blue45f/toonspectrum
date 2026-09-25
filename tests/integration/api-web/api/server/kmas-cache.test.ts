import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearKmasLookupCache,
  enrichTitleWithKmas,
  KMAS_LOOKUP_CACHE_MAX_ENTRIES,
  kmasLookupCacheStats,
} from "../../../../../apps/api/src/server/kmas";
import { TITLES } from "../../../../../packages/core/src/server/catalog-store";


import type { Title } from "../../../../../apps/web/src/shared/lib/types";

const env = {
  KMAS_PRV_KEY: "test-key",
  KMAS_LOOKUP_CACHE_TTL_MS: String(24 * 60 * 60 * 1000),
};

function title(name: string): Title {
  const source = TITLES[0]!;
  return {
    ...source,
    id: `cache-${name}`,
    slug: `cache-${name}`,
    title: name,
    coverImage: undefined,
  };
}
function installKmasFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  const transport = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const requestedTitle = url.searchParams.get("title") ?? "";
    return Response.json({
      result: {
        resultState: "success",
        itemlist: [{ prdctNm: requestedTitle }],
      },
    });
  });
  vi.stubGlobal("fetch", transport);
  return transport;
}

afterEach(() => {
  clearKmasLookupCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("KMAS lookup cache retention", () => {
  it("removes expired entries instead of only treating them as cache misses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T00:00:00.000Z"));
    installKmasFetch();
    const shortTtlEnv = { ...env, KMAS_LOOKUP_CACHE_TTL_MS: "100" };

    await enrichTitleWithKmas(title("첫 작품"), shortTtlEnv);
    expect(kmasLookupCacheStats().entries).toBe(1);
    await vi.advanceTimersByTimeAsync(101);
    await enrichTitleWithKmas(title("둘째 작품"), shortTtlEnv);

    expect(kmasLookupCacheStats()).toMatchObject({
      entries: 1,
      maxEntries: KMAS_LOOKUP_CACHE_MAX_ENTRIES,
    });
  });

  it("keeps lookup entries bounded and evicts the least recently used key", async () => {
    const transport = installKmasFetch();
    const names = Array.from(
      { length: KMAS_LOOKUP_CACHE_MAX_ENTRIES + 1 },
      (_, index) => `작품-${index}-테스트`,
    );

    for (const name of names) {
      await enrichTitleWithKmas(title(name), env);
    }

    expect(kmasLookupCacheStats().entries).toBe(KMAS_LOOKUP_CACHE_MAX_ENTRIES);
    const callsBeforeEvictedLookup = transport.mock.calls.length;
    await enrichTitleWithKmas(title(names[0]!), env);
    expect(transport).toHaveBeenCalledTimes(callsBeforeEvictedLookup + 1);

    const callsBeforeHotLookup = transport.mock.calls.length;
    await enrichTitleWithKmas(title(names.at(-1)!), env);
    expect(transport).toHaveBeenCalledTimes(callsBeforeHotLookup);
  });
});
