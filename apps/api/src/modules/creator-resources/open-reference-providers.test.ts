import { describe, expect, it, vi } from "vitest";

import { ambientCgUrl } from "./ambientcg-provider";
import { googleFontsUrl } from "./google-fonts-provider";
import { referenceMediaUrl } from "./reference-media-providers";
import { rijksmuseumSearchUrl } from "./rijksmuseum-provider";
import { createResourceEngine } from "./resource-engine";
import { parseResource, parseSearchResult } from "@toonspectrum/core/creator-resources";

const stamp = "2026-09-25T02:00:00.000Z";
const engine = (fetcher: typeof fetch) => createResourceEngine({
  fetch: fetcher,
  env: () => ({}),
  now: () => Date.parse(stamp),
});

describe("ambientCG provider", () => {
  it("uses API v3 with bounded pagination and normalizes CC0 previews", async () => {
    const url = ambientCgUrl("나무", 2);
    expect(url.hostname).toBe("ambientcg.com");
    expect(url.pathname).toBe("/api/v3/assets");
    expect(url.searchParams.get("q")).toBe("wood");
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("offset")).toBe("12");

    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      totalResults: 1,
      assets: [{
        id: "Wood001", type: "material", releaseDate: "2026-01-02", title: "Wood 001",
        url: "https://ambientcg.com/a/Wood001", tags: ["wood", "floor"],
        dimensions: { width: 2, height: 2, depth: 0 }, downloadStatistics: { total: 1234 },
        technique: "photogrammetry",
        thumbnails: { "512-WEBP": "https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/512-WEBP/Wood001.webp" },
      }],
    }));
    const result = await engine(fetcher).search({ provider: "ambientcg", q: "wood" });
    expect(result.status).toBe("ready");
    expect(result.items[0]).toMatchObject({ provider: "ambientcg", license: "CC0", title: "Wood 001" });
    expect(result.items[0].imageUrl).toContain("acg-media.struffelproductions.com");
    expect(parseSearchResult(result)).not.toBeNull();
  });
});

describe("reference-only media providers", () => {
  it("normalizes NASA image metadata without granting direct import rights", async () => {
    expect(referenceMediaUrl("nasa", "moon", 2).searchParams.get("page")).toBe("2");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ collection: {
      items: [{ data: [{ nasa_id: "PIA12235", title: "Nearside of the Moon", media_type: "image", center: "JPL", secondary_creator: "NASA/JPL", date_created: "2009-09-24T18:00:22Z", description: "Nearside", keywords: ["Moon"] }],
        links: [{ href: "https://images-assets.nasa.gov/image/PIA12235/PIA12235~thumb.jpg", rel: "preview", render: "image" }] }],
      metadata: { total_hits: 1 },
    } }));
    const result = await engine(fetcher).search({ provider: "nasa", q: "moon" });
    expect(result.items[0]).toMatchObject({ provider: "nasa", license: "reference-only", title: "Nearside of the Moon" });
    expect(result.items[0].licenseUrl).toContain("nasa.gov");
    expect(parseSearchResult(result)).not.toBeNull();
  });

  it("normalizes V&A collection previews as reference-only", async () => {
    expect(referenceMediaUrl("vam", "armor", 1).searchParams.get("images_exist")).toBe("1");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      info: { record_count: 1 },
      records: [{
        systemNumber: "O1025988", accessionNumber: "D.610&A-1894", objectType: "Armour design",
        _primaryTitle: "The Almain Armourer's Album", _primaryMaker: { name: "Jacob Halder", association: "designer" },
        _primaryDate: "1557-1587", _primaryPlace: "Greenwich",
        _images: { _primary_thumbnail: "https://framemark.vam.ac.uk/collections/2006AV8281/full/!100,100/0/default.jpg" },
      }],
    }));
    const result = await engine(fetcher).search({ provider: "vam", q: "armor" });
    expect(result.items[0]).toMatchObject({ provider: "vam", license: "reference-only", creator: "Jacob Halder" });
    expect(result.items[0].sourceUrl).toBe("https://collections.vam.ac.uk/item/O1025988/");
  });

  it("drops a forged preview host even when the provider claims reference-only", () => {
    const resource = parseResource({
      id: "nasa:PIA1", provider: "nasa", title: "Moon", sourceUrl: "https://images.nasa.gov/details/PIA1",
      imageUrl: "https://evil.test/moon.jpg", license: "reference-only", fetchedAt: stamp,
    });
    expect(resource).not.toBeNull();
    expect(resource?.imageUrl).toBeUndefined();
  });
});

describe("Rijksmuseum linked-data provider", () => {
  it("resolves search identifiers and preserves record-level CC0 evidence", async () => {
    expect(rijksmuseumSearchUrl("armor").searchParams.get("title")).toBe("armor");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (raw) => {
      const url = new URL(String(raw));
      if (url.pathname === "/search/collection") return Response.json({
        type: "OrderedCollectionPage",
        partOf: { totalItems: 1 },
        orderedItems: [{ id: "https://id.rijksmuseum.nl/20026794", type: "HumanMadeObject" }],
      });
      return Response.json({
        id: "https://id.rijksmuseum.nl/20026794",
        identified_by: [{ type: "Name", content: "Portrait of a Nobleman in Armor", language: [{ id: "http://vocab.getty.edu/aat/300388277" }] }],
        subject_of: [
          { type: "LinguisticObject", language: [{ id: "http://vocab.getty.edu/aat/300388277" }], part: [{ content: "A sixteenth-century portrait." }] },
          { type: "LinguisticObject", digitally_carried_by: [{ access_point: [{ id: "https://www.rijksmuseum.nl/en/collection/object/SK-A-3035" }] }] },
          { id: "https://data.rijksmuseum.nl/20026794", subject_to: [{ classified_as: [{ id: "https://creativecommons.org/publicdomain/zero/1.0/" }] }] },
        ],
        produced_by: {
          part: [{ carried_out_by: [{ type: "Person", notation: [{ "@language": "en", "@value": "anonymous" }] }] }],
          timespan: { identified_by: [{ type: "Name", content: "1540 - 1560", language: [{ id: "http://vocab.getty.edu/aat/300388277" }] }] },
        },
      });
    });
    const result = await engine(fetcher).search({ provider: "rijksmuseum", q: "갑옷" });
    expect(result.status).toBe("ready");
    expect(result.items[0]).toMatchObject({
      provider: "rijksmuseum", license: "CC0", title: "Portrait of a Nobleman in Armor", creator: "anonymous",
    });
    expect(result.items[0].description).toContain("sixteenth-century");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("Google Fonts lettering provider", () => {
  const fontList = {
    kind: "webfonts#webfontList",
    items: [
      { family: "Noto Sans KR", variants: ["regular", "700"], subsets: ["korean", "latin"], version: "v42", lastModified: "2026-08-10", category: "sans-serif" },
      { family: "Roboto", variants: ["regular"], subsets: ["latin"], version: "v51", lastModified: "2026-02-19", category: "sans-serif" },
      { family: "Gaegu", variants: ["regular", "700"], subsets: ["korean", "latin"], version: "v17", lastModified: "2025-09-10", category: "handwriting" },
    ],
  };

  it("uses a partial-response directory request and filters Korean aliases without exposing the key", async () => {
    const url = googleFontsUrl();
    expect(url.hostname).toBe("www.googleapis.com");
    expect(url.pathname).toBe("/webfonts/v1/webfonts");
    expect(url.searchParams.get("fields")).toContain("items(family");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fontList));
    const api = createResourceEngine({ fetch: fetcher, env: () => ({ GOOGLE_FONTS_API_KEY: "test-font-key" }), now: () => Date.parse(stamp) });
    const result = await api.search({ provider: "googlefonts", q: "한글 고딕" });
    expect(result.status).toBe("ready");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ provider: "googlefonts", title: "Noto Sans KR", license: "metadata-only" });
    expect(result.items[0].sourceUrl).toContain("fonts.google.com/specimen/Noto+Sans+KR");
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("X-Goog-Api-Key")).toBe("test-font-key");
    expect(JSON.stringify(result)).not.toContain("test-font-key");
  });

  it("reports not configured without calling upstream when the server key is absent", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await createResourceEngine({ fetch: fetcher, env: () => ({}), now: () => Date.parse(stamp) })
      .search({ provider: "googlefonts", q: "한글" });
    expect(result.status).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
