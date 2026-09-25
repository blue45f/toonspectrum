import { describe, expect, it, vi } from "vitest";

import { createResourceEngine } from "./resource-engine";
import {
  dplaUrl,
  europeanaUrl,
  internationalDiscoverySearch,
  smithsonianUrl,
  validInternationalDiscoveryShape,
  wikimediaUrl,
} from "./international-discovery-providers";

const stamp = "2026-09-25T00:00:00.000Z";
const request = (value: unknown) => vi.fn(async () => ({ value, fetchedAt: stamp }));

describe("international discovery providers", () => {
  it("builds bounded URLs while keeping provider credentials server-side", () => {
    const smithsonian = smithsonianUrl("kimono & mask", 2, "server-secret");
    expect(smithsonian.hostname).toBe("api.si.edu");
    expect(smithsonian.searchParams.get("rows")).toBe("12");
    expect(smithsonian.searchParams.get("start")).toBe("12");
    expect(smithsonian.searchParams.get("api_key")).toBe("server-secret");

    const europeana = europeanaUrl("castle", 3, "server-secret");
    expect(europeana.searchParams.get("start")).toBe("25");
    expect(europeana.searchParams.get("wskey")).toBe("server-secret");

    const dpla = dplaUrl("newspaper", 2, "server-secret");
    expect(dpla.searchParams.get("page_size")).toBe("12");
    expect(dpla.searchParams.get("page")).toBe("2");
    expect(dpla.searchParams.get("api_key")).toBe("server-secret");
  });

  it("normalizes Smithsonian metadata without importing media", async () => {
    const body = {
      status: 200,
      responseCode: 1,
      response: {
        rowCount: 1,
        rows: [{
          id: "ld1-1",
          title: "Kimono collection",
          url: "edanmdm:siris_sil_1",
          content: {
            descriptiveNonRepeating: {
              data_source: "Smithsonian Libraries",
              metadata_usage: { access: "CC0" },
            },
            freetext: { name: [{ content: "Museum curator" }] },
            indexedStructured: {
              date: ["1900"], object_type: ["Textiles"], topic: ["Kimono"], place: ["Japan"],
            },
          },
        }],
      },
    };
    const result = await internationalDiscoverySearch("smithsonian", "kimono", 1, "secret", request(body), Date.parse(stamp));
    expect(result.status).toBe("ready");
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      provider: "smithsonian",
      title: "Kimono collection",
      creator: "Museum curator",
      license: "metadata-only",
    });
    expect(result.items[0].imageUrl).toBeUndefined();
    expect(result.items[0].provenance?.rightsStatement).toContain("미디어");
  });

  it("turns Wikimedia pageviews into one explicitly limited interest signal", async () => {
    const url = wikimediaUrl("경복궁", Date.parse("2026-09-25T04:00:00Z"));
    expect(url.pathname).toContain("/daily/20260826/20260924");
    const body = {
      items: [
        { project: "ko.wikipedia", article: "경복궁", granularity: "daily", timestamp: "2026092300", access: "all-access", agent: "user", views: 120 },
        { project: "ko.wikipedia", article: "경복궁", granularity: "daily", timestamp: "2026092400", access: "all-access", agent: "user", views: 180 },
      ],
    };
    expect(validInternationalDiscoveryShape(url, body)).toBe(true);
    const result = await internationalDiscoverySearch("wikimedia", "경복궁", 1, "", request(body), Date.parse(stamp));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toContain("총 300회");
    expect(result.items[0].description).toContain("독자 수·매출");
    expect(result.hasMore).toBe(false);
  });

  it("normalizes Europeana and DPLA as metadata-only records", async () => {
    const europeanaBody = {
      success: true,
      itemsCount: 1,
      totalResults: 13,
      items: [{
        id: "/123/item", guid: "https://www.europeana.eu/item/123/item", title: ["Castle"],
        dataProvider: ["City Museum"], dcCreator: ["Archive maker"], type: ["IMAGE"], year: ["1880"],
        rights: ["http://rightsstatements.org/vocab/InC/1.0/"],
      }],
    };
    const europeana = await internationalDiscoverySearch("europeana", "castle", 1, "secret", request(europeanaBody), Date.parse(stamp));
    expect(europeana.items[0]).toMatchObject({ provider: "europeana", title: "Castle", license: "metadata-only" });
    expect(europeana.hasMore).toBe(true);

    const dplaBody = {
      count: 1, start: 0, limit: 12,
      docs: [{
        id: "0123456789abcdef0123456789abcdef",
        provider: { name: "Example Library" },
        sourceResource: { title: ["Street scene"], creator: ["Photographer"], type: ["image"], date: ["1920"] },
      }],
    };
    const dpla = await internationalDiscoverySearch("dpla", "street", 1, "secret", request(dplaBody), Date.parse(stamp));
    expect(dpla.items[0]).toMatchObject({ provider: "dpla", title: "Street scene", creator: "Photographer", license: "metadata-only" });
  });

  it("does not partition cache identity by a rotated secret query value", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      status: 200, responseCode: 1, response: { rowCount: 0, rows: [] },
    }));
    const env: Record<string, string> = { SMITHSONIAN_API_KEY: "first-secret" };
    const engine = createResourceEngine({
      fetch: fetcher,
      env: () => env,
      now: () => Date.parse(stamp),
    });
    await engine.search({ provider: "smithsonian", q: "armor" }, "client-a");
    env.SMITHSONIAN_API_KEY = "second-secret";
    await engine.search({ provider: "smithsonian", q: "armor" }, "client-b");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
