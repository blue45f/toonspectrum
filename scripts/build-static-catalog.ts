// 정적 카탈로그 생성기 — 커밋된 gz 스냅샷을 읽어 public/data/*.json 을 만든다.
//
//   pnpm catalog:gen                       # apps/api/data/catalog.json.gz → public/data/*
//   WEBDEX_CATALOG_GZ=path pnpm catalog:gen
//
// 카탈로그 읽기에 Neon/DB 를 전혀 쓰지 않는다(순수 함수만). 리뷰·북마크·인증은 런타임 /api 담당.
// public/data 는 빌드 산출물(.gitignore) — git 소스는 2.3MB gz 하나만 유지한다.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { GENRES, WEEK_DAYS } from "../lib/taxonomy";
import { PLATFORM_LIST } from "../lib/platforms";
import { rankBy, RANK_AXES } from "../lib/ranking";
import { sortTitles } from "../lib/search";
import { kstDayOfWeek } from "../lib/utils";
import {
  activeTags,
  adaptationsOf,
  getAuthorDirectory,
  replaceCatalogData,
  TITLES,
} from "../lib/server/catalog-store";
import { getCalendarData } from "../lib/server/calendar";
import { getInsightsData } from "../lib/server/insights";
import { getRankingData } from "../lib/server/ranking-service";
import { enrichExternalAdaptations } from "../lib/adaptations-media";
import type { Title } from "../lib/types";

const RANK_TYPES = ["all", "webtoon", "webnovel"];

// 랭킹 기본 뷰(축×타입, 필터 없음) 사전계산 — live 비활성(스냅샷 산식)으로 결정적.
// /ranking 이 17.8MB 전체 카탈로그를 클라이언트에서 로드하지 않고 작은 정적 파일로 즉시 표시한다.
async function buildRankingFiles(writeJson: (name: string, data: unknown) => void): Promise<void> {
  for (const axis of RANK_AXES.map((a) => a.key)) {
    for (const type of RANK_TYPES) {
      const reader = { get: (n: string) => (n === "axis" ? axis : n === "type" ? type : null) };
      const data = await getRankingData(reader, { disableLive: true });
      writeJson(`ranking/${axis}-${type}.json`, data);
    }
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_GZ = process.env.WEBDEX_CATALOG_GZ ?? path.join(ROOT, "apps/api/data/catalog.json.gz");
const OUT = path.join(ROOT, "public", "data");

function loadTitles(): Title[] {
  if (!existsSync(SRC_GZ)) {
    throw new Error(`catalog gz not found: ${SRC_GZ} (먼저 pnpm catalog:update 로 생성)`);
  }
  const raw = gunzipSync(readFileSync(SRC_GZ)).toString("utf8");
  const parsed = JSON.parse(raw) as unknown;
  const titles = Array.isArray(parsed) ? parsed : (parsed as { titles?: unknown })?.titles;
  if (!Array.isArray(titles)) throw new Error("invalid catalog payload (titles 배열 없음)");
  return titles as Title[];
}

// lib/server/home.ts 의 카탈로그 부분 복제 — 리뷰 통계(DB)만 제외(정적은 reviews:0, 런타임은 /api).
// home.ts 변경 시 함께 갱신할 것.
const DAY_IDX_FROM_GETDAY = [6, 0, 1, 2, 3, 4, 5];
function buildHome() {
  const featured = TITLES.filter((t) => t.featured);
  const spotlight = [...featured].sort((a, b) => b.stats.views - a.stats.views)[0] ?? null;
  const topRated = rankBy(TITLES, "rating", { limit: 12 }).map((r) => r.title);
  const waitFree = sortTitles(
    TITLES.filter((t) => t.availability.some((a) => a.pricing === "free" || a.pricing === "wait-free")),
    "popular"
  ).slice(0, 12);
  const newest = sortTitles(TITLES, "newest").slice(0, 12);
  const families = TITLES.filter((t) => t.type === "webnovel" && adaptationsOf(t).length > 0)
    .map((novel) => ({ original: novel, adaptations: adaptationsOf(novel) }))
    .sort((a, b) => b.original.stats.views - a.original.stats.views)
    .slice(0, 3);
  const tags = activeTags().slice(0, 14);
  const todayDay = WEEK_DAYS[DAY_IDX_FROM_GETDAY[kstDayOfWeek()]];
  const todayReleases = TITLES.filter(
    (t) => t.type === "webtoon" && t.status === "ongoing" && t.updateDays?.includes(todayDay)
  )
    .sort((a, b) => b.stats.views - a.stats.views)
    .slice(0, 12);
  return {
    featured,
    spotlight,
    topRated,
    waitFree,
    newest,
    families,
    tags,
    todayDay,
    todayReleases,
    genres: GENRES,
    // reviews 는 정적 단계에서 0 — 프론트가 정적 모드에서 /api/reviews/stats 로 보강(있으면)하거나 생략.
    stats: { titles: TITLES.length, platforms: PLATFORM_LIST.length, genres: GENRES.length, reviews: 0 },
    generatedAt: new Date().toISOString(),
  };
}

function writeJson(name: string, data: unknown): void {
  const file = path.join(OUT, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
  const kb = (statSync(file).size / 1024).toFixed(0);
  console.log(`  ${name.padEnd(16)} ${kb.padStart(7)} KB`);
}

async function main(): Promise<void> {
  const titles = loadTitles();
  // 큐레이션 영상화(드라마·영화·애니·OTT) 정보 주입 — adaptation-graph 가 렌더.
  const enriched = enrichExternalAdaptations(titles);
  replaceCatalogData(titles, { source: "cli-ingest", sourceVersion: "static-build" });
  console.log(`정적 카탈로그 생성: ${TITLES.length}편 (영상화 ${enriched}편 매칭) → ${path.relative(ROOT, OUT)}/`);

  // 산출물 초기화(낡은 파일 제거) 후 재생성.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // 전체 카탈로그(클라이언트 검색·탐색·랭킹·추천·상세 계산용) — Vercel/CDN 이 전송 시 압축.
  writeJson("catalog.json", TITLES);
  // 파라미터 없는 공통 페이지 — 사전 계산(즉시 로드).
  writeJson("home.json", buildHome());
  writeJson("calendar.json", await getCalendarData());
  writeJson("insights.json", await getInsightsData());
  writeJson("tags.json", { tags: activeTags() });
  writeJson("authors.json", getAuthorDirectory());

  // 랭킹 기본 뷰 사전계산(축×타입). /ranking 즉시 로드.
  let rankingCount = 0;
  await buildRankingFiles((name, data) => {
    const file = path.join(OUT, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
    rankingCount += 1;
  });
  console.log(`  ranking/*.json   ${String(rankingCount).padStart(5)} files (축×타입 사전계산)`);

  console.log("완료.");
}

main().catch((error) => {
  console.error("정적 카탈로그 생성 실패:", error?.message ?? error);
  process.exit(1);
});
