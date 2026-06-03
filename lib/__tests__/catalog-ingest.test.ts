import { describe, expect, it } from "vitest";
import {
  evaluateRegression,
  extractSourceCounts,
  normalizeCatalogIngestConfig,
  parseCrawlerJsonPayload,
} from "../server/catalog-ingest";
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
      CATALOG_INGEST_TIMEOUT_MS: "9000000",
      CATALOG_INGEST_SCRIPT_MAX_OUTPUT_MB: "0",
      CATALOG_CRAWL_SCRIPT: "custom/crawl.mjs",
    });

    expect(config.mode).toBe("fixed");
    expect(config.intervalSeconds).toBe(60);
    expect(config.timeoutMs).toBe(1800000); // 30분 상한으로 클램프
    expect(config.maxOutputMb).toBe(1);
    expect(config.scriptPath).toBe("custom/crawl.mjs");
  });

  it("국내 플랫폼 수집 소스를 구현 상태로 라우팅한다", () => {
    const config = normalizeCatalogIngestConfig({
      WEBDEX_SOURCE_IDS: "naver-webtoon,ridi,novelpia,kyobo",
    });
    const plan = buildCatalogSourcePlan(config.sourceIds);

    expect(config.sourceIds).toEqual(["naver-webtoon", "ridi", "novelpia", "kyobo"]);
    // 네 소스 모두 공개 카탈로그 크롤러가 구현되어 enabled 로 라우팅된다(ridi/novelpia/kyobo 승격 완료).
    expect(plan.enabled.map((source) => source.id)).toEqual([
      "naver-webtoon",
      "ridi",
      "novelpia",
      "kyobo",
    ]);
    expect(plan.pending.map((source) => source.id)).toEqual([]);
    // 현재 레지스트리는 전 소스가 크롤러로 구현된 상태 — pending 0, implemented == 전체.
    expect(plan.coverage.pendingSources).toBe(0);
    expect(plan.coverage.implementedSources).toBe(plan.coverage.domesticSources);
    expect(plan.coverage.domesticWebtoonSources).toBeGreaterThan(5);
    expect(plan.coverage.domesticWebnovelSources).toBeGreaterThan(5);
  });
});

describe("catalog ingest 품질 게이트", () => {
  it("minRetainRatio를 0<r<=1로 정규화(기본 0.6)", () => {
    expect(normalizeCatalogIngestConfig({}).minRetainRatio).toBe(0.6);
    expect(normalizeCatalogIngestConfig({ CATALOG_INGEST_MIN_RETAIN_RATIO: "0.8" }).minRetainRatio).toBe(0.8);
    expect(normalizeCatalogIngestConfig({ CATALOG_INGEST_MIN_RETAIN_RATIO: "0" }).minRetainRatio).toBe(0.6);
    expect(normalizeCatalogIngestConfig({ CATALOG_INGEST_MIN_RETAIN_RATIO: "2" }).minRetainRatio).toBe(0.6);
  });

  it("첫 스냅샷(비교대상 없음)은 회귀로 보지 않는다", () => {
    expect(evaluateRegression(10, null, null, 0.6)).toBeNull();
    expect(evaluateRegression(10, null, { titleCount: 0, sources: null }, 0.6)).toBeNull();
  });

  it("총건수가 직전 대비 비율 미만으로 급감하면 회귀", () => {
    expect(evaluateRegression(100, null, { titleCount: 300, sources: null }, 0.6)?.reason).toContain(
      "title count dropped"
    );
    expect(evaluateRegression(200, null, { titleCount: 300, sources: null }, 0.6)).toBeNull();
  });

  it("직전에 있던 주요 소스가 0으로 붕괴하면 회귀(건수 충분해도)", () => {
    const current = { titleCount: 300, sources: { naverWebtoon: 200, kakaoWebtoon: 80 } };
    expect(
      evaluateRegression(290, { naverWebtoon: 200, kakaoWebtoon: 0 }, current, 0.6)?.reason
    ).toContain("kakaoWebtoon");
    expect(evaluateRegression(290, { naverWebtoon: 200, kakaoWebtoon: 80 }, current, 0.6)).toBeNull();
  });

  it("extractSourceCounts는 metadata.sources의 유한 숫자만 추출", () => {
    expect(extractSourceCounts({ sources: { naverWebtoon: 10, x: "nope" } })).toEqual({ naverWebtoon: 10 });
    expect(extractSourceCounts(null)).toBeNull();
    expect(extractSourceCounts({ sources: {} })).toBeNull();
  });
});
