import { describe, expect, it } from "vitest";

import {
  createResourceEngine,
  ResourceInputError,
} from "../apps/api/src/modules/creator-resources/resource-engine";
import {
  parseResource,
  parseSearchResult,
} from "../apps/web/src/shared/lib/creator-resources";
import {
  buildReferenceApiParams,
  buildReferenceUrlParams,
  defaultReferenceSearchState,
  defaultReferenceViewState,
  filterAndSortReferenceItems,
  formatReferenceDateRange,
  nextReferenceComparison,
  parseReferenceUrlParams,
  referenceFacets,
  referenceSearchFromLens,
  referenceSearchValidation,
  REFERENCE_LENSES,
} from "../apps/web/src/shared/lib/reference-assets";

import type { CreatorResource } from "../apps/web/src/shared/lib/creator-resources";

const NOW = Date.parse("2026-09-09T03:00:00Z");

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resource(id: number, overrides: Record<string, unknown> = {}): CreatorResource {
  const parsed = parseResource({
    id: `met:${id}`,
    provider: "met",
    title: `Object ${id}`,
    creator: `Maker ${id}`,
    sourceUrl: `https://www.metmuseum.org/art/collection/search/${id}`,
    imageUrl: "https://images.metmuseum.org/sample.jpg",
    license: "CC0",
    credit: "The Met",
    description: "Reference",
    fetchedAt: new Date(NOW).toISOString(),
    asset: {
      department: id % 2 ? "Asian Art" : "The Costume Institute",
      culture: id % 2 ? "Korea" : "France",
      classification: id % 2 ? "Ceramics" : "Costumes",
      objectName: id % 2 ? "Vase" : "Dress",
      medium: id % 2 ? "Porcelain" : "Silk",
      objectBeginDate: 1700 + id,
      objectEndDate: 1700 + id,
      tags: id % 2 ? ["Flowers", "Vases"] : ["Clothing"],
      additionalImageUrls: [],
      ...overrides,
    },
  });
  if (!parsed) throw new Error("fixture failed");
  return parsed;
}

describe("reference asset search state", () => {
  it("round-trips shareable search and result controls", () => {
    const search = {
      ...defaultReferenceSearchState(),
      query: "Korea",
      page: 3,
      field: "artistCulture" as const,
      departmentId: "6",
      medium: "Silk|Textiles",
      geoLocation: "Korea",
      dateBegin: "-100",
      dateEnd: "1900",
      highlightOnly: true,
    };
    const view = {
      ...defaultReferenceViewState(),
      mode: "saved" as const,
      within: "flower",
      department: "Asian Art",
      culture: "Korea",
      classification: "Ceramics",
      sort: "oldest" as const,
      density: "compact" as const,
    };
    const params = buildReferenceUrlParams(search, view);
    expect(parseReferenceUrlParams(params)).toEqual({ search, view });
    expect(buildReferenceApiParams(search).toString()).toContain("artistCulture");
    expect(buildReferenceApiParams(search).get("dateBegin")).toBe("-100");
    expect(buildReferenceApiParams(search).get("dateEnd")).toBe("1900");
  });

  it("sanitizes unknown URL state and validates paired bounded years", () => {
    const parsed = parseReferenceUrlParams(new URLSearchParams(
      "q=armor&page=99&field=evil&department=999&from=abc&sort=bad&density=huge",
    ));
    expect(parsed.search.page).toBe(1);
    expect(parsed.search.field).toBe("all");
    expect(parsed.search.departmentId).toBe("");
    expect(parsed.search.dateBegin).toBe("");
    expect(parsed.view.sort).toBe("relevance");
    expect(parsed.view.density).toBe("comfortable");

    expect(referenceSearchValidation({ ...defaultReferenceSearchState(), query: "armor", dateBegin: "1700" })).toContain("함께");
    expect(referenceSearchValidation({ ...defaultReferenceSearchState(), query: "armor", dateBegin: "1900", dateEnd: "1700" })).toContain("늦을");
    expect(referenceSearchValidation({ ...defaultReferenceSearchState(), query: "armor", dateBegin: "-10001", dateEnd: "1700" })).toContain("10000");
    expect(referenceSearchValidation({ ...defaultReferenceSearchState(), query: "a" })).toContain("2~80");
  });

  it("builds curated lens state without leaking previous filters", () => {
    const lens = REFERENCE_LENSES.find((entry) => entry.id === "korea");
    expect(lens).toBeDefined();
    expect(referenceSearchFromLens(lens!)).toMatchObject({
      query: "Korea",
      field: "artistCulture",
      departmentId: "6",
      page: 1,
    });
  });
});

describe("reference asset client curation", () => {
  const items = [resource(3), resource(1), resource(2)];

  it("derives stable facets and filters saved items without mutating source order", () => {
    const original = items.map((item) => item.id);
    expect(referenceFacets(items, "culture")).toEqual([
      { value: "Korea", count: 2 },
      { value: "France", count: 1 },
    ]);
    const filtered = filterAndSortReferenceItems(items, {
      ...defaultReferenceViewState(),
      mode: "saved",
      culture: "Korea",
      sort: "oldest",
    }, new Set(["met:1", "met:2", "met:3"]));
    expect(filtered.map((item) => item.id)).toEqual(["met:1", "met:3"]);
    expect(items.map((item) => item.id)).toEqual(original);
  });

  it("searches rich metadata and sorts missing years last", () => {
    const withoutYear = resource(4, { objectBeginDate: "bad", objectEndDate: "bad", tags: ["Moonlight"] });
    const filtered = filterAndSortReferenceItems([...items, withoutYear], {
      ...defaultReferenceViewState(),
      within: "moonlight",
      sort: "newest",
    }, new Set());
    expect(filtered.map((item) => item.id)).toEqual(["met:4"]);
    expect(formatReferenceDateRange(resource(5, { objectBeginDate: -100, objectEndDate: -50 }))).toBe("기원전 100년–기원전 50년");
  });

  it("caps comparison at four and toggles existing selections", () => {
    expect(nextReferenceComparison(["1", "2", "3", "4"], "5")).toEqual(["1", "2", "3", "4"]);
    expect(nextReferenceComparison(["1", "2"], "2")).toEqual(["1"]);
    expect(nextReferenceComparison(["1", "2"], "3")).toEqual(["1", "2", "3"]);
  });
});

describe("reference asset contracts and API", () => {
  it("preserves bounded Met metadata and rejects unsafe image hosts", () => {
    const item = parseResource({
      id: "met:45734",
      provider: "met",
      title: "Quail and Millet",
      creator: "Kiyohara Yukinobu",
      sourceUrl: "https://www.metmuseum.org/art/collection/search/45734",
      imageUrl: "https://images.metmuseum.org/small.jpg",
      license: "CC0",
      credit: "The Howard Mansfield Collection",
      fetchedAt: new Date(NOW).toISOString(),
      asset: {
        objectName: "Hanging scroll",
        department: "Asian Art",
        culture: "Japan",
        period: "Edo period",
        medium: "Ink and color on silk",
        dimensions: "118.4 x 47.6 cm",
        classification: "Paintings",
        objectBeginDate: 1667,
        objectEndDate: 1682,
        isHighlight: true,
        tags: [...Array.from({ length: 30 }, (_, index) => `Tag ${index}`), 1],
        originalImageUrl: "https://evil.test/original.jpg",
        additionalImageUrls: [
          "https://images.metmuseum.org/extra.jpg",
          "https://evil.test/extra.jpg",
        ],
      },
    });
    expect(item?.asset?.tags).toHaveLength(24);
    expect(item?.asset?.originalImageUrl).toBeUndefined();
    expect(item?.asset?.additionalImageUrls).toEqual(["https://images.metmuseum.org/extra.jpg"]);
    expect(item?.asset?.isHighlight).toBe(true);

    const nonMet = parseResource({
      ...item,
      id: "kakao:1",
      provider: "kakao",
      sourceUrl: "https://search.daum.net/search?w=book",
      license: "CC0",
    });
    expect(nonMet?.asset).toBeUndefined();
  });

  it("validates optional total in search responses", () => {
    const item = resource(1);
    expect(parseSearchResult({
      provider: "met",
      status: "ready",
      items: [item],
      page: 1,
      hasMore: false,
      total: 12,
    })?.total).toBe(12);
    expect(parseSearchResult({
      provider: "met",
      status: "ready",
      items: [item],
      page: 1,
      total: -1,
    })).toBeNull();
  });

  it("forwards official Met filters and returns rich verified metadata", async () => {
    const calls: string[] = [];
    const engine = createResourceEngine({
      now: () => NOW,
      env: () => ({}),
      fetch: async (url) => {
        calls.push(url);
        if (url.includes("/search")) return json({ total: 1, objectIDs: [45734] });
        return json({
          objectID: 45734,
          isPublicDomain: true,
          isHighlight: true,
          rightsAndReproduction: "",
          title: "Quail and Millet",
          objectURL: "https://www.metmuseum.org/art/collection/search/45734",
          primaryImageSmall: "https://images.metmuseum.org/small.jpg",
          primaryImage: "https://images.metmuseum.org/original.jpg",
          additionalImages: [
            "https://images.metmuseum.org/additional.jpg",
            "https://evil.test/blocked.jpg",
          ],
          artistDisplayName: "Kiyohara Yukinobu",
          creditLine: "The Howard Mansfield Collection",
          department: "Asian Art",
          objectName: "Hanging scroll",
          culture: "Japan",
          period: "Edo period",
          dynasty: "",
          objectDate: "late 17th century",
          objectBeginDate: 1667,
          objectEndDate: 1682,
          medium: "Ink and color on silk",
          dimensions: "118.4 x 47.6 cm",
          classification: "Paintings",
          country: "Japan",
          tags: [{ term: "Birds" }, { term: "Millet" }],
        });
      },
    });
    const result = await engine.search({
      provider: "met",
      q: "Korea",
      page: "2",
      field: "artistCulture",
      departmentId: "6",
      medium: "Silk|Textiles",
      geoLocation: "Korea",
      dateBegin: "-100",
      dateEnd: "1900",
      isHighlight: "true",
    });
    const searchUrl = new URL(calls[0]);
    expect(searchUrl.pathname).toContain("/v1.1/search");
    expect(searchUrl.searchParams.get("artistOrCulture")).toBe("true");
    expect(searchUrl.searchParams.get("departmentId")).toBe("6");
    expect(searchUrl.searchParams.get("medium")).toBe("Silk|Textiles");
    expect(searchUrl.searchParams.get("geoLocation")).toBe("Korea");
    expect(searchUrl.searchParams.get("dateBegin")).toBe("-100");
    expect(searchUrl.searchParams.get("dateEnd")).toBe("1900");
    expect(searchUrl.searchParams.get("isHighlight")).toBe("true");
    expect(searchUrl.searchParams.get("offset")).toBe("12");
    expect(result.total).toBe(1);
    expect(result.items[0]?.asset).toMatchObject({
      department: "Asian Art",
      objectName: "Hanging scroll",
      objectBeginDate: 1667,
      tags: ["Birds", "Millet"],
      originalImageUrl: "https://images.metmuseum.org/original.jpg",
      additionalImageUrls: ["https://images.metmuseum.org/additional.jpg"],
    });
  });

  it("rejects malformed Met filters before making an upstream call", async () => {
    let calls = 0;
    const engine = createResourceEngine({
      now: () => NOW,
      env: () => ({}),
      fetch: async () => {
        calls += 1;
        return json({});
      },
    });
    await expect(engine.search({ provider: "met", q: "armor", field: "unknown" })).rejects.toBeInstanceOf(ResourceInputError);
    await expect(engine.search({ provider: "met", q: "armor", departmentId: ["6"] })).rejects.toBeInstanceOf(ResourceInputError);
    await expect(engine.search({ provider: "met", q: "armor", dateBegin: "1700" })).rejects.toBeInstanceOf(ResourceInputError);
    await expect(engine.search({ provider: "met", q: "armor", dateBegin: "1900", dateEnd: "1700" })).rejects.toBeInstanceOf(ResourceInputError);
    expect(calls).toBe(0);
  });
});
