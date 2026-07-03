#!/usr/bin/env node
// KMAS(한국만화영상진흥원 만화규장각) 오픈 API 수집 — 공식 공공데이터로 시놉시스·표지를 정당하게 확보.
//
// 왜: 카탈로그의 시놉시스(원문)·표지는 플랫폼 크롤 출처라 저작권/성과도용 리스크가 있다. KMAS 오픈 API는
// 공공데이터로 줄거리(outline)·표지 이미지(imageDownloadUrl)를 제공하므로, 이를 정당한 소스로 교체한다.
// 이 스크립트는 KMAS 데이터를 정규화해 data/kmas-catalog.json 으로 떨군다(교체는 kmas-replace.mjs).
//
// 인증: KMAS_PRV_KEY(승인된 인증키) 필수. 미설정 시 즉시 종료(크롤 데이터 유지).
// 한도: 일 1,000건. viewItemCnt=100 × 최대 pageNo 로 조절한다(기본 10페이지=1000건).
//
// ⚠️ 응답 "엔벨로프"(레코드 배열의 위치·페이지네이션 형태)는 공개 문서에 예시가 없어, 실 응답에서
//    확정한다. 필드명(prdctNm/title/outline/imageDownloadUrl/isbn/pictrWritrNm/mainGenreCdNm/
//    ageGradCdNm)은 공식 가이드 기준이다. findRecords()가 흔한 엔벨로프를 방어적으로 탐색한다.
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

const PRV_KEY = process.env.KMAS_PRV_KEY;
const BASE = process.env.KMAS_BASE_URL || "https://www.kmas.or.kr";
const OUT = process.env.KMAS_OUT || join(process.cwd(), "data", "kmas-catalog.json");
const PAGE_SIZE = Math.min(Number(process.env.KMAS_PAGE_SIZE) || 100, 100);
const MAX_PAGES = Number(process.env.KMAS_MAX_PAGES) || 10; // 100×10 = 1000건/일 한도
const LIST_SE_CD = process.env.KMAS_LIST_SE_CD || "1"; // 1=웹툰 (docs 기준)

// 공식 가이드 문서 기준 필드명. 실 응답에서 키 대소문자/철자가 다르면 여기만 조정한다.
const FIELDS = {
  title: ["prdctNm", "title"], // 작품명 우선, 서명 폴백
  synopsis: ["outline"], // 줄거리
  cover: ["imageDownloadUrl"], // 표지 이미지 URL
  isbn: ["isbn"],
  artist: ["pictrWritrNm"], // 그림작가
  writer: ["writrNm", "storyWritrNm"], // 글작가(문서 미명시 — 방어적)
  genre: ["mainGenreCdNm"],
  age: ["ageGradCdNm"],
};

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// 레코드 배열을 방어적으로 찾는다: 응답 JSON을 훑어 "문서 필드를 가진 객체들의 배열"을 반환한다.
// (엔벨로프가 data.list / result / response.body.items 등 무엇이든 대응)
function findRecords(json) {
  const looksLikeRecord = (o) =>
    o && typeof o === "object" && (o.prdctNm != null || o.outline != null || o.imageDownloadUrl != null || o.title != null);
  const seen = new Set();
  const stack = [json];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length > 0 && node.every(looksLikeRecord)) return node;
      for (const el of node) stack.push(el);
      continue;
    }
    for (const v of Object.values(node)) if (v && typeof v === "object") stack.push(v);
  }
  return [];
}

function normalize(rec) {
  const title = pick(rec, FIELDS.title);
  if (!title) return null;
  return {
    source: "kmas",
    title,
    synopsis: pick(rec, FIELDS.synopsis),
    coverImageUrl: pick(rec, FIELDS.cover),
    isbn: pick(rec, FIELDS.isbn).replace(/[^0-9Xx]/g, ""),
    artist: pick(rec, FIELDS.artist),
    writer: pick(rec, FIELDS.writer),
    genre: pick(rec, FIELDS.genre),
    ageRating: pick(rec, FIELDS.age),
  };
}

async function fetchPage(pageNo) {
  const url = new URL(`${BASE}/openapi/search/bookAndWebtoonList`);
  url.searchParams.set("prvKey", PRV_KEY);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("viewItemCnt", String(PAGE_SIZE));
  if (LIST_SE_CD) url.searchParams.set("listSeCd", LIST_SE_CD);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`KMAS ${res.status} ${res.statusText} (page ${pageNo})`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`KMAS 응답이 JSON 이 아님 (page ${pageNo}): ${text.slice(0, 200)}`);
  }
  return findRecords(json);
}

function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

async function main() {
  if (!PRV_KEY) {
    console.error(
      "[kmas] KMAS_PRV_KEY 미설정 — 수집을 건너뜁니다(크롤 데이터 유지).\n" +
        "  승인된 인증키를 발급받아: KMAS_PRV_KEY=<키> pnpm kmas:fetch"
    );
    process.exit(0);
  }
  const byTitle = new Map();
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    let recs;
    try {
      recs = await fetchPage(page);
    } catch (err) {
      console.error(`[kmas] page ${page} 실패: ${err.message}`);
      break;
    }
    if (recs.length === 0) break;
    for (const raw of recs) {
      const item = normalize(raw);
      if (!item) continue;
      // 같은 작품 중복 시 시놉시스·표지가 더 채워진 레코드를 우선.
      const key = item.isbn || item.title;
      const prev = byTitle.get(key);
      const score = (r) => (r.synopsis ? 2 : 0) + (r.coverImageUrl ? 1 : 0);
      if (!prev || score(item) > score(prev)) byTitle.set(key, item);
    }
    total += recs.length;
    console.error(`[kmas] page ${page}: ${recs.length}건 (누적 고유 ${byTitle.size})`);
    if (recs.length < PAGE_SIZE) break; // 마지막 페이지
  }
  const items = [...byTitle.values()];
  const withSynopsis = items.filter((i) => i.synopsis).length;
  const withCover = items.filter((i) => i.coverImageUrl).length;
  writeAtomic(OUT, { generatedAt: new Date().toISOString(), count: items.length, items });
  console.error(
    `[kmas] 완료 → ${OUT}\n` +
      `  수집 ${total}건 · 고유 ${items.length} · 시놉시스 ${withSynopsis} · 표지 ${withCover}`
  );
}

main().catch((err) => {
  console.error("[kmas] 오류:", err);
  process.exit(1);
});
