import { describe, expect, it, vi } from "vitest";

import { createResourceEngine } from "./resource-engine";

const NOW = Date.parse("2026-09-25T00:00:00Z");
const json = (value: unknown, status = 200) => Response.json(value, { status });
const xml = (value: string, status = 200) => new Response(value, {
  status,
  headers: { "content-type": "application/xml; charset=utf-8" },
});
function engine(fetcher: typeof fetch, env: Record<string, string> = {}) {
  return createResourceEngine({ fetch: fetcher, env: () => env, now: () => NOW });
}

const ambientAsset = {
  id: "Brick001",
  type: "material",
  releaseDate: "2026-09-12",
  shortDescription: "Old red brick wall",
  title: "Bricks 001",
  url: "https://ambientcg.com/a/Brick001",
  tags: ["brick", "wall"],
  dimensions: { width: 2, height: 2, depth: 0 },
  downloadStatistics: { total: 1234 },
  thumbnails: { "512-WEBP": "https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/512-WEBP/Brick001.webp" },
};
describe("open API expansion", () => {
  it("normalizes ambientCG v3 assets as CC0 resources", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      totalResults: 1,
      nextPageHttp: null,
      currentPageHttp: "https://ambientcg.com/api/v3/assets",
      previousPageHttp: null,
      assets: [ambientAsset],
    }));
    const result = await engine(fetcher).search({ provider: "ambientcg", q: "벽돌" });
    expect(result.status).toBe("ready");
    expect(result.items[0]).toMatchObject({
      provider: "ambientcg",
      license: "CC0",
      title: "Bricks 001",
      credit: "ambientCG · CC0",
    });
    expect(result.items[0]?.imageUrl).toContain("acg-media.struffelproductions.com");
    expect(fetcher.mock.calls[0]?.[0]).toContain("q=brick");
  });

  it("rejects ambientCG thumbnails from an untrusted host", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      totalResults: 1,
      assets: [{ ...ambientAsset, thumbnails: { "512-WEBP": "https://evil.test/x.webp" } }],
    }));
    const result = await engine(fetcher).search({ provider: "ambientcg", q: "brick" });
    expect(result.status).toBe("partial");
    expect(result.items).toEqual([]);
  });

  it("keeps V&A and NASA previews reference-only", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const hostname = new URL(String(url)).hostname;
      if (hostname === "api.vam.ac.uk") return json({
        info: { record_count: 1 },
        records: [{
          systemNumber: "O1",
          accessionNumber: "T.1-2026",
          objectType: "Costume",
          _primaryTitle: "Stage costume",
          _primaryMaker: { name: "Designer" },
          _primaryDate: "1920",
          _primaryPlace: "United Kingdom",
          _currentLocation: { displayName: "Gallery" },
          _images: { _primary_thumbnail: "https://framemark.vam.ac.uk/x.jpg" },
        }],
      });
      return json({
        collection: {
          metadata: { total_hits: 1 },
          items: [{ data: [{ nasa_id: "PIA1", title: "Moon", center: "JPL", media_type: "image", date_created: "2020-01-01T00:00:00Z" }], links: [{ rel: "preview", render: "image", href: "https://images-assets.nasa.gov/image/PIA1/PIA1~thumb.jpg" }] }],
        },
      });
    });
    const api = engine(fetcher);
    const vam = await api.search({ provider: "vam", q: "costume" }, "vam-client");
    const nasa = await api.search({ provider: "nasa", q: "moon" }, "nasa-client");
    expect(vam.items[0]).toMatchObject({ provider: "vam", license: "reference-only" });
    expect(nasa.items[0]).toMatchObject({ provider: "nasa", license: "reference-only" });
    expect(vam.items[0]?.imageUrl).toContain("framemark.vam.ac.uk");
    expect(nasa.items[0]?.imageUrl).toContain("images-assets.nasa.gov");
  });

  it("normalizes GBIF, MusicBrainz and Internet Archive discovery metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const hostname = new URL(String(url)).hostname;
      if (hostname === "api.gbif.org") {
        const pathname = new URL(String(url)).pathname;
        if (pathname === "/v1/species/match") return json({ usageKey: 1, scientificName: "Vulpes vulpes", confidence: 100, matchType: "EXACT" });
        return json({ count: 1, offset: 0, limit: 12, results: [{ key: 2, scientificName: "Vulpes vulpes", family: "Canidae", genus: "Vulpes", taxonRank: "SPECIES", country: "Korea", media: [{ license: "CC BY 4.0", creator: "Observer" }] }] });
      }
      if (hostname === "musicbrainz.org") return json({ count: 1, offset: 0, artists: [{ id: "7a3d9f3e-8697-4010-8a59-798cab00a232", name: "Henry Mancini", type: "Person", country: "US", "life-span": { begin: "1924", end: "1994" } }] });
      return json({ responseHeader: { status: 0 }, response: { numFound: 1, start: 0, docs: [{ identifier: "old-book", title: "Old Book", creator: "Author", mediatype: "texts", collection: ["opensource"] }] } });
    });
    const api = engine(fetcher);
    const gbif = await api.search({ provider: "gbif", q: "fox" }, "gbif-client");
    const music = await api.search({ provider: "musicbrainz", q: "moon" }, "music-client");
    const archive = await api.search({ provider: "internetarchive", q: "old book" }, "archive-client");
    expect(gbif.items[0]?.title).toBe("Vulpes vulpes");
    expect(music.items[0]?.title).toBe("Henry Mancini");
    expect(archive.items[0]?.sourceUrl).toBe("https://archive.org/details/old-book");
  });
  it("parses keyless 국가유산 XML without importing media", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(xml(`<?xml version="1.0" encoding="utf-8"?>
      <result><totalCnt>1</totalCnt><pageUnit>12</pageUnit><pageIndex>1</pageIndex><item>
      <ccmaName><![CDATA[국보]]></ccmaName><ccbaMnm1><![CDATA[경복궁 근정전]]></ccbaMnm1>
      <ccbaMnm2><![CDATA[景福宮 勤政殿]]></ccbaMnm2><ccbaCtcdNm><![CDATA[서울]]></ccbaCtcdNm>
      <ccsiName><![CDATA[종로구]]></ccsiName><ccbaAdmin><![CDATA[경복궁관리소]]></ccbaAdmin>
      <ccbaKdcd>11</ccbaKdcd><ccbaCtcd>11</ccbaCtcd><ccbaAsno>0002230000000</ccbaAsno>
      <longitude>126.976953</longitude><latitude>37.578342</latitude><regDt>2026-01-23 15:55:02</regDt>
      </item></result>`));
    const result = await engine(fetcher).search({ provider: "kheritage", q: "궁궐" });
    expect(result.status).toBe("ready");
    expect(result.items[0]).toMatchObject({
      provider: "kheritage",
      title: "경복궁 근정전",
      license: "metadata-only",
    });
    expect(result.items[0]?.imageUrl).toBeUndefined();
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get("ccbaMnm1")).toBe("궁궐");
  });

  it("parses NEIS XML responses with a server key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(xml(`<?xml version="1.0" encoding="UTF-8"?>
      <schoolInfo><head><list_total_count>1</list_total_count></head><head><RESULT>
      <CODE>INFO-000</CODE><MESSAGE>정상 처리되었습니다.</MESSAGE>
      </RESULT></head><row>
      <ATPT_OFCDC_SC_CODE><![CDATA[T10]]></ATPT_OFCDC_SC_CODE>
      <ATPT_OFCDC_SC_NM><![CDATA[제주특별자치도교육청]]></ATPT_OFCDC_SC_NM>
      <SD_SCHUL_CODE><![CDATA[9299048]]></SD_SCHUL_CODE>
      <SCHUL_NM><![CDATA[가마초등학교]]></SCHUL_NM>
      <SCHUL_KND_SC_NM><![CDATA[초등학교]]></SCHUL_KND_SC_NM>
      <FOND_SC_NM><![CDATA[공립]]></FOND_SC_NM>
      <ORG_RDNMA><![CDATA[제주특별자치도 서귀포시 표선면 일주동로6285번길 8]]></ORG_RDNMA>
      <COEDU_SC_NM><![CDATA[남여공학]]></COEDU_SC_NM>
      <FOND_YMD><![CDATA[19460901]]></FOND_YMD>
      </row></schoolInfo>`));
    const result = await engine(fetcher, { NEIS_API_KEY: "NEIS_TEST_KEY" })
      .search({ provider: "neis", q: "가마초등학교" });
    expect(result.status).toBe("ready");
    expect(result.items[0]).toMatchObject({
      provider: "neis",
      title: "가마초등학교",
      creator: "제주특별자치도교육청",
      license: "metadata-only",
    });
    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("Type")).toBe("xml");
    expect(requestUrl.searchParams.get("KEY")).toBe("NEIS_TEST_KEY");
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Accept")).toBe("*/*");
  });

  it("returns an empty NEIS result for INFO-200 XML", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(xml(`<?xml version="1.0" encoding="UTF-8"?>
      <RESULT><CODE>INFO-200</CODE><MESSAGE>해당하는 데이터가 없습니다.</MESSAGE></RESULT>`));
    const result = await engine(fetcher, { NEIS_API_KEY: "NEIS_TEST_KEY" })
      .search({ provider: "neis", q: "존재하지않는학교" });
    expect(result).toMatchObject({
      provider: "neis",
      status: "ready",
      items: [],
      total: 0,
      hasMore: false,
    });
  });

  it("does not call credentialed Korean APIs until server keys exist", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = engine(fetcher);
    for (const provider of ["neis", "tourapi", "korean"] as const) {
      const result = await api.search({ provider, q: "서울" }, `client-${provider}`);
      expect(result.status).toBe("not_configured");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports all providers without exposing keys", () => {
    const described = engine(vi.fn<typeof fetch>(), {
      NEIS_API_KEY: "NEIS_SECRET",
      TOUR_API_SERVICE_KEY: "TOUR_SECRET",
      KOREAN_DICTIONARY_API_KEY: "DICT_SECRET",
    }).describe();
    expect(described).toHaveLength(26);
    expect(described.find((item) => item.provider === "ambientcg")?.availability).toBe("keyless");
    expect(described.find((item) => item.provider === "neis")?.availability).toBe("configured");
    expect(JSON.stringify(described)).not.toContain("SECRET");
  });
});
