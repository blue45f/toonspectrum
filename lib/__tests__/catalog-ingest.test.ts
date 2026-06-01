import { describe, expect, it } from "vitest";
import { normalizeCatalogIngestConfig, parseCrawlerJsonPayload } from "../server/catalog-ingest";
import { buildCatalogSourcePlan } from "../server/catalog-sources";

describe("catalog ingest helpers", () => {
  it("crawler stdout에서 JSON 페이로드를 안전하게 파싱한다", () => {
    const payload = parseCrawlerJsonPayload(
      [
        "log: ignored",
        JSON.stringify({
          titles: [{ id: "nw-1", slug: "nw-1", title: "테스트", availability: [] }],
          count: 1,
          sourceVersion: "crawl/2026-06-02T00:00:00.000Z",
        }),
      ].join("\n")
    );

    expect(payload.count).toBe(1);
    expect(payload.sourceVersion).toContain("crawl/");
    expect(payload.titles[0]?.id).toBe("nw-1");
  });

  it("카탈로그 수집 환경값을 운영 가능한 범위로 정규화한다", () => {
    const config = normalizeCatalogIngestConfig({
      CATALOG_INGEST_MODE: "fixed",
      CATALOG_INGEST_INTERVAL_SECONDS: "10",
      CATALOG_INGEST_TIMEOUT_MS: "900000",
      CATALOG_INGEST_SCRIPT_MAX_OUTPUT_MB: "0",
      CATALOG_CRAWL_SCRIPT: "custom/crawl.mjs",
    });

    expect(config.mode).toBe("fixed");
    expect(config.intervalSeconds).toBe(60);
    expect(config.timeoutMs).toBe(600000);
    expect(config.maxOutputMb).toBe(1);
    expect(config.scriptPath).toBe("custom/crawl.mjs");
  });

  it("국내 플랫폼 수집 소스를 구현 상태와 정책 상태로 분리한다", () => {
    const config = normalizeCatalogIngestConfig({
      WEBDEX_SOURCE_IDS: "naver-webtoon,kakao-webtoon,ridi,munpia",
    });
    const plan = buildCatalogSourcePlan(config.sourceIds);

    expect(config.sourceIds).toEqual(["naver-webtoon", "kakao-webtoon", "ridi", "munpia"]);
    expect(plan.enabled.map((source) => source.id)).toEqual(["naver-webtoon", "kakao-webtoon"]);
    expect(plan.pending.map((source) => source.id)).toEqual(["ridi", "munpia"]);
    expect(plan.coverage.domesticWebtoonSources).toBeGreaterThan(5);
    expect(plan.coverage.domesticWebnovelSources).toBeGreaterThan(5);
  });
});
