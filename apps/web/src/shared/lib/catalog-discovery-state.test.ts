import { describe, expect, it } from "vitest";

import {
  catalogDiscoveryHref,
  parseCatalogDiscoveryState,
  parseTitleFiltersFromSearchParams,
  writeCatalogDiscoveryState,
  writeTitleFiltersToSearchParams,
} from "./catalog-discovery-state";

import { EMPTY_TITLE_FILTERS } from "./title-filters";

describe("catalog discovery URL state", () => {
  it("normalizes invalid values and legacy free-only parameters", () => {
    const params = new URLSearchParams(
      "q=hello&types=webtoon,invalid&genres=판타지,없는장르&platforms=naver-webtoon,void"
      + "&free=1&minRating=9&yearMin=2025&yearMax=2020&view=wall",
    );
    const state = parseCatalogDiscoveryState(params);

    expect(state.query).toBe("hello");
    expect(state.sort).toBe("relevance");
    expect(state.view).toBe("grid");
    expect(state.filters.types).toEqual(["webtoon"]);
    expect(state.filters.genres).toEqual(["판타지"]);
    expect(state.filters.platforms).toEqual(["naver-webtoon"]);
    expect(state.filters.pricing).toEqual(["free", "wait-free"]);
    expect(state.filters.minRating).toBe(5);
    expect(state.filters.yearRange).toBeNull();
  });

  it("round-trips shareable search, filter and recommendation state", () => {
    const source = new URLSearchParams(
      "q=dragon&types=webtoon&genres=판타지&tags=회귀&pricing=free"
      + "&savedOnly=true&sort=rating&view=list&taste=판타지,무협"
      + "&seed=title-1&diversity=wide",
    );
    const state = parseCatalogDiscoveryState(source);
    const written = writeCatalogDiscoveryState(new URLSearchParams(), state);
    const restored = parseCatalogDiscoveryState(written);

    expect(restored).toEqual(state);
    expect(written.get("free")).toBeNull();
    expect(written.get("freeOnly")).toBeNull();
  });

  it("preserves unrelated campaign parameters while replacing owned filters", () => {
    const base = new URLSearchParams("utm_source=share&genres=판타지&seed=old");
    const next = writeTitleFiltersToSearchParams(base, {
      ...EMPTY_TITLE_FILTERS,
      status: ["completed"],
      savedOnly: true,
    });

    expect(next.get("utm_source")).toBe("share");
    expect(next.get("genres")).toBeNull();
    expect(next.get("seed")).toBeNull();
    expect(next.get("status")).toBe("completed");
    expect(next.get("savedOnly")).toBe("true");
  });

  it("carries useful conditions between search, explore and recommend", () => {
    const params = new URLSearchParams(
      "q=hero&genres=액션&status=completed&taste=액션&seed=work-1&view=list",
    );

    expect(catalogDiscoveryHref("search", params)).toContain("q=hero");
    expect(catalogDiscoveryHref("explore", params)).not.toContain("q=hero");
    expect(catalogDiscoveryHref("explore", params)).toContain("genres=");
    expect(catalogDiscoveryHref("recommend", params)).toContain("taste=");
    expect(catalogDiscoveryHref("recommend", params)).toContain("seed=work-1");
    expect(catalogDiscoveryHref("recommend", params)).not.toContain("view=list");
  });

  it("deduplicates and bounds free-form tag values", () => {
    const filters = parseTitleFiltersFromSearchParams(
      new URLSearchParams("tags=magic,magic,school&tag=school"),
    );
    expect(filters.tags).toEqual(["magic", "school"]);
  });
});
