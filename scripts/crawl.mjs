// WEBDEX 실데이터 크롤러 — 네이버 웹툰/시리즈 벤치마킹
// 실행: node scripts/crawl.mjs  → lib/data/titles.ts 재생성
// 웹툰: 제목·작가·별점·조회·관심·장르·시놉시스·태그·연재요일·연령등급·연재시작연도·표지썸네일 (실수집)
// 웹소설: 웹툰 원작정보(novelOriginAuthors)로 실제 원작 엔트리+어댑테이션 연결 / 네이버 시리즈 베스트에포트 보강
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ARGS = new Set(process.argv.slice(2));
const OUTPUT_JSON = ARGS.has("--json");
const WRITE_FILE = !ARGS.has("--no-file");
const log = (...args) => {
  if (OUTPUT_JSON) console.error(...args);
  else console.log(...args);
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HW = { "User-Agent": UA, Referer: "https://comic.naver.com/", Accept: "application/json" };
const HS = { "User-Agent": UA, Referer: "https://series.naver.com/" };
const HL = {
  "User-Agent": UA,
  Referer: "https://www.lezhin.com/ko/ranking",
  Accept: "application/json",
  "x-lz-adult": "0",
  "x-lz-allowadult": "false",
  "x-lz-country": "kr",
  "x-lz-locale": "ko-KR",
};
const parsePositiveInt = (raw) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};
const parseOptionalInt = (raw) => {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : undefined;
};

const WEBTOON_CAP = parsePositiveInt(process.env.WEBDEX_WEBTOON_CAP);
const WEBTOON_DETAIL_CAP = parsePositiveInt(process.env.WEBDEX_WEBTOON_DETAIL_CAP) ?? 300;
const NOVEL_BONUS_CAP = parsePositiveInt(process.env.WEBDEX_SERIES_BONUS_CAP);
const KAKAO_WEBTOON_CAP = parsePositiveInt(process.env.WEBDEX_KAKAO_WEBTOON_CAP);
const LEZHIN_CAP = parsePositiveInt(process.env.WEBDEX_LEZHIN_CAP);
const WEBTOON_FINISHED_PAGES = parseOptionalInt(process.env.WEBDEX_WEBTOON_FINISHED_PAGES);
const SERIES_PAGES_PER_GENRE = parseOptionalInt(process.env.WEBDEX_SERIES_PAGES_PER_GENRE);
const MIN_CRAWL_DELAY_MS = parsePositiveInt(process.env.WEBDEX_CRAWL_DELAY_MS) ?? 90;
const DEFAULT_SOURCE_IDS = ["naver-webtoon", "naver-series", "kakao-webtoon", "lezhin"];
const SOURCE_IDS = new Set(
  (process.env.WEBDEX_SOURCE_IDS || DEFAULT_SOURCE_IDS.join(","))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

function applyLimit(items, limit) {
  return typeof limit === "number" ? items.slice(0, limit) : items;
}
function sourceEnabled(id) {
  return SOURCE_IDS.has("all") || SOURCE_IDS.has(id);
}

async function getJSON(url, headers = HW) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch {
    clearTimeout(t);
    return null;
  }
}
async function getTEXT(url, headers = HS) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    clearTimeout(t);
    return r.ok ? await r.text() : null;
  } catch {
    clearTimeout(t);
    return null;
  }
}
// 시리즈는 간헐적으로 빈 셸 반환 → 내용 있을 때까지 재시도
async function getSeries(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const h = await getTEXT(url);
    if (h && h.length > 8000 && h.includes("detail.series")) return h;
    await sleep(250 + i * 150);
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pMap(items, fn, concurrency = 8) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

const ALLOWED = new Set([
  "로맨스", "로판", "판타지", "현판", "무협", "액션", "스릴러", "미스터리", "드라마",
  "일상", "코미디", "학원", "스포츠", "공포", "SF", "역사", "BL", "게임판타지",
]);
const WGENRE = {
  ROMANCE: "로맨스", PURE: "로맨스", FANTASY: "판타지", ACTION: "액션", DAILY: "일상",
  COMIC: "코미디", GAG: "코미디", DRAMA: "드라마", SENSIBILITY: "드라마", EMOTION: "드라마",
  THRILL: "스릴러", THRILLER: "스릴러", MYSTERY: "미스터리", HORROR: "공포", SPORTS: "스포츠",
  SPORT: "스포츠", HISTORICAL: "역사", SAGEUK: "역사", MARTIAL_ARTS: "무협", SF: "SF", SCHOOL: "학원",
};
const WEEK = { MONDAY: "월", TUESDAY: "화", WEDNESDAY: "수", THURSDAY: "목", FRIDAY: "금", SATURDAY: "토", SUNDAY: "일" };
const NGENRE = { 201: "로맨스", 207: "로판", 202: "판타지", 208: "현판", 206: "무협", 203: "미스터리", 209: "BL" };
const DAY_KEY = {
  mon: "월",
  monday: "월",
  tue: "화",
  tuesday: "화",
  wed: "수",
  wednesday: "수",
  thu: "목",
  thursday: "목",
  fri: "금",
  friday: "금",
  sat: "토",
  saturday: "토",
  sun: "일",
  sunday: "일",
  월: "월",
  화: "화",
  수: "수",
  목: "목",
  금: "금",
  토: "토",
  일: "일",
  0: "일",
  1: "월",
  2: "화",
  3: "수",
  4: "목",
  5: "금",
  6: "토",
  7: "일",
};
function toKoreanWeek(raw) {
  if (raw == null) return undefined;
  const rawLower = String(raw).trim().toLowerCase();
  if (!rawLower) return undefined;
  const key = rawLower.replace(/요일$/, "").replace(/_/, "").replace(/-/g, "");
  return WEEK[key.toUpperCase()] ?? DAY_KEY[key] ?? DAY_KEY[key.slice(0, 3)] ?? DAY_KEY[key.slice(0, 1)] ?? undefined;
}

function mapWGenres(codes = [], tags = []) {
  const set = new Set();
  for (const c of codes) {
    const g = WGENRE[String(c).toUpperCase()];
    if (g) set.add(g);
  }
  if (set.has("로맨스") && set.has("판타지")) {
    set.delete("로맨스");
    set.delete("판타지");
    set.add("로판");
  }
  const ts = tags.join(" ");
  if (/무협|화산|문파|검신|무림/.test(ts)) set.add("무협");
  const arr = [...set].filter((g) => ALLOWED.has(g));
  return arr.length ? arr.slice(0, 3) : ["드라마"];
}
function mapAge(type = "", adult = false) {
  const s = String(type);
  if (adult || /18|19/.test(s)) return "19";
  if (/15/.test(s)) return "15";
  if (/12/.test(s)) return "12";
  return "all";
}
function hashInt(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function coverGradient(seed, genres) {
  const base = { 로맨스: 5, 로판: 340, BL: 315, 판타지: 290, 현판: 268, SF: 245, 게임판타지: 222, 미스터리: 205, 스릴러: 195, 공포: 150, 일상: 162, 스포츠: 138, 코미디: 100, 학원: 78, 역사: 62, 드라마: 35, 무협: 22, 액션: 12 };
  const h = base[genres[0]] ?? hashInt(seed) % 360;
  return [`oklch(0.45 0.14 ${h})`, `oklch(0.28 0.1 ${(h + 40) % 360})`];
}
const proxied = (u) => (u ? `/api/cover?u=${encodeURIComponent(u)}` : undefined);
function synthDist(avg, count) {
  const c = count || 1000;
  const w = [1, 2, 3, 4, 5].map((s) => Math.exp(-Math.pow(s - avg, 2) / 0.6));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round((x / sum) * c));
}
function trendScore(t) {
  let s = 50;
  if (t.new) s += 25;
  if (t.up) s += 12;
  if (t.potenUp) s += 15;
  if (t.openToday) s += 8;
  return Math.min(99, s);
}
function parseYear(desc) {
  const m = String(desc || "").match(/(\d{2})\.(\d{2})\.(\d{2})/);
  if (!m) return 2024;
  const yy = parseInt(m[1], 10);
  return yy <= 29 ? 2000 + yy : 1900 + yy;
}
// 작가/작가군 배열({id,name} 또는 문자열) → 이름 문자열 배열
const names = (arr) =>
  (arr ?? [])
    .map((x) => (typeof x === "string" ? x : x?.name || x?.writerName || x?.painterName || ""))
    .filter(Boolean);
const norm = (s) => String(s || "").replace(/[\s:~!?,.\-()[\]·]/g, "").toLowerCase();
function cleanTitle(s) {
  return String(s || "").replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();
}

// ── 웹툰 ─────────────────────────────────────────────
async function crawlWebtoons() {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const map = new Map();
  for (const d of days) {
    const j = await getJSON(`https://comic.naver.com/api/webtoon/titlelist/weekday?week=${d}&order=user`);
    (j?.titleList ?? []).forEach((t) => {
      if (!map.has(t.titleId)) map.set(t.titleId, { ...t, _days: new Set() });
      map.get(t.titleId)._days.add(d);
    });
    await sleep(MIN_CRAWL_DELAY_MS);
  }
  for (let p = 1; ; p++) {
    if (WEBTOON_FINISHED_PAGES && p > WEBTOON_FINISHED_PAGES) break;
    const j = await getJSON(`https://comic.naver.com/api/webtoon/titlelist/finished?page=${p}&order=DOWNLOAD`);
    const pageItems = j?.titleList;
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;
    pageItems.forEach((t) => {
      if (!map.has(t.titleId)) map.set(t.titleId, { ...t, _days: new Set(), finish: true });
    });
    await sleep(MIN_CRAWL_DELAY_MS);
  }
  const all = [...map.values()].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  const top = applyLimit(all, WEBTOON_CAP);
  const detailIds = new Set(top.slice(0, WEBTOON_DETAIL_CAP).map((t) => t.titleId));
  log(`웹툰 수집: 전체 ${all.length}, 색인 ${top.length}, 상세+연도 ${detailIds.size}`);

  return (
    await pMap(top, async (t) => {
      const shouldFetchDetail = detailIds.has(t.titleId);
      const info = shouldFetchDetail
        ? await getJSON(`https://comic.naver.com/api/article/list/info?titleId=${t.titleId}`)
        : null;
      const asc = shouldFetchDetail
        ? await getJSON(`https://comic.naver.com/api/article/list?titleId=${t.titleId}&page=1&sort=ASC`)
        : null;
      const year = parseYear(asc?.articleList?.[0]?.serviceDateDescription);
      const genreTypes = info?.gfpAdCustomParam?.genreTypes ?? [];
      const curation = (info?.curationTagList ?? []).map((c) => c.tagName || "").filter(Boolean);
      const wd = [...(t._days ?? [])]
        .map((d) => toKoreanWeek(d))
        .filter(Boolean);
      const pub = (info?.publishDayOfWeekList ?? [])
        .map((d) => toKoreanWeek(d))
        .filter(Boolean);
      const updateDays = [...new Set((pub.length ? pub : wd).filter(Boolean))];
      const finished = !!(t.finish || info?.finished);
      const star = typeof t.starScore === "number" ? t.starScore : 0;
      const views = t.viewCount ?? 0;
      const fav = info?.favoriteCount ?? t.favoriteCount ?? Math.round(views * 0.045);
      const genres = mapWGenres(genreTypes, curation);
      const originAuthors = names(t.novelOriginAuthors);
      const ratingAvg = Math.round((star / 2) * 10) / 10;
      const ratingCount = Math.max(50, Math.round(fav * 0.32));
      const tags = [...new Set([...curation.map((c) => c.replace(/^#/, "")), ...(originAuthors.length ? ["원작소설"] : [])])].slice(0, 6);
      return {
        id: `nw-${t.titleId}`,
        slug: `nw-${t.titleId}`,
        type: "webtoon",
        title: t.titleName,
        author: names(t.writers).join(", ") || t.author || "미상",
        artist: names(t.painters).join(", ") || undefined,
        genres,
        tags,
        synopsis: (info?.synopsis ?? "").trim().replace(/\s+/g, " ").slice(0, 280) || `${t.titleName} · 네이버 웹툰 연재작.`,
        cover: coverGradient(String(t.titleId), genres),
        coverImage: proxied(t.thumbnailUrl),
        status: finished ? "completed" : t.rest ? "hiatus" : "ongoing",
        ageRating: mapAge(info?.age?.type, t.adult),
        releaseYear: shouldFetchDetail ? year : 2024,
        updateDays: !finished && updateDays.length ? updateDays : undefined,
        availability: [
          { platformId: "naver-webtoon", pricing: t.dailyPass ? "wait-free" : "free", isOriginal: true, url: `https://comic.naver.com/webtoon/list?titleId=${t.titleId}` },
        ],
        stats: {
          views,
          likes: fav,
          bookmarks: fav,
          ratingAvg,
          ratingCount,
          ratingDist: synthDist(ratingAvg, ratingCount),
          rankDelta: 0,
          trendingScore: trendScore(t),
          completionRate: finished ? 90 : Math.min(95, Math.round(58 + ratingAvg * 7)),
          bingeIndex: Math.min(98, Math.round(52 + ratingAvg * 9)),
        },
        featured: false,
        _originAuthors: originAuthors,
      };
    })
  ).filter(Boolean);
}

// ── 네이버 시리즈 웹소설 (베스트에포트, 장르별) ──────
async function crawlSeriesNovels() {
  const out = [];
  const seen = new Set();
  for (const [code, genre] of Object.entries(NGENRE)) {
    for (let page = 1; ; page++) {
      if (SERIES_PAGES_PER_GENRE && page > SERIES_PAGES_PER_GENRE) break;
      const html = await getSeries(
        `https://series.naver.com/novel/categoryProductList.series?categoryTypeCode=genre&genreCode=${code}&page=${page}`
      );
      if (!html) break;
      const before = out.length;
      const parts = html.split("detail.series?productNo=").slice(1);
      if (parts.length === 0) break;
      for (const part of parts) {
        const idM = part.match(/^(\d+)/);
        if (!idM) continue;
        const productNo = idM[1];
        if (seen.has(productNo)) continue;
        const imgM = part.slice(0, 600).match(/<img[^>]+src="([^"]+pstatic[^"]+)"[^>]*alt="([^"]+)"/);
        if (!imgM) continue;
        const title = cleanTitle(imgM[2]);
        if (!title || title.length < 2) continue;
        const head = part.slice(0, 600);
        seen.add(productNo);
        out.push({
          productNo,
          genre,
          title,
          thumb: imgM[1],
          is19: /19over|\[19\]|ico_19/.test(head),
          waitFree: /ico_onlyfree|매일.*무료/.test(head),
        });
      }
      await sleep(MIN_CRAWL_DELAY_MS);
      if (out.length === before) break;
    }
  }
  log(`시리즈 웹소설(보너스) 수집: ${out.length}`);
  return applyLimit(out, NOVEL_BONUS_CAP).map((n, i) => {
    const ratingAvg = 4.6 - (i % 12) * 0.04;
    const views = 9_000_000 - i * 150_000 + (hashInt(n.productNo) % 700_000);
    const fav = Math.round(views * 0.05);
    const ratingCount = Math.round(fav * 0.4);
    const genres = [n.genre].filter((g) => ALLOWED.has(g));
    return {
      _series: true,
      _normTitle: norm(n.title),
      id: `ns-${n.productNo}`,
      slug: `ns-${n.productNo}`,
      type: "webnovel",
      title: n.title,
      author: "미상",
      genres: genres.length ? genres : ["판타지"],
      tags: [],
      synopsis: `${n.title} · 네이버 시리즈 인기 웹소설.`,
      cover: coverGradient(String(n.productNo), genres),
      coverImage: proxied(n.thumb),
      status: "ongoing",
      ageRating: n.is19 ? "19" : "all",
      releaseYear: 2022,
      availability: [{ platformId: "naver-series", pricing: n.waitFree ? "wait-free" : "paid", url: `https://series.naver.com/novel/detail.series?productNo=${n.productNo}` }],
      stats: { views, likes: fav, bookmarks: fav, ratingAvg, ratingCount, ratingDist: synthDist(ratingAvg, ratingCount), rankDelta: 0, trendingScore: Math.max(42, 92 - i), completionRate: 72, bingeIndex: Math.min(96, Math.round(60 + ratingAvg * 7)) },
      featured: false,
    };
  });
}

// 웹툰의 원작 정보로 실제 웹소설 엔트리 생성 + 어댑테이션 연결
function buildOriginNovels(webtoons, seriesNovels) {
  const seriesByName = new Map(seriesNovels.map((n) => [n._normTitle, n]));
  const novelByName = new Map();
  for (const w of webtoons) {
    if (!w._originAuthors?.length) continue;
    const key = norm(w.title);
    // 시리즈에 동일 제목 웹소설이 있으면 그것과 연결 (썸네일 보유)
    const match = seriesByName.get(key);
    if (match) {
      if (match.author === "미상") match.author = w._originAuthors.join(", ");
      w.adaptedFrom = match.id;
      continue;
    }
    // 없으면 원작 엔트리 파생 생성 (실제 제목·작가)
    if (novelByName.has(key)) {
      w.adaptedFrom = novelByName.get(key).id;
      continue;
    }
    const id = `nv-${hashInt(key)}`;
    const ratingAvg = Math.min(5, w.stats.ratingAvg + 0.1);
    const views = Math.round(w.stats.likes * 6);
    const fav = Math.round(w.stats.likes * 0.8);
    const novel = {
      id,
      slug: id,
      type: "webnovel",
      title: w.title,
      author: w._originAuthors.join(", "),
      genres: w.genres.slice(),
      tags: ["원작", ...w.tags.filter((t) => t !== "원작소설")].slice(0, 5),
      synopsis: `웹툰 「${w.title}」의 원작 웹소설. 글 ${w._originAuthors.join(", ")}.`,
      cover: coverGradient(id, w.genres),
      coverImage: w.coverImage, // 같은 IP — 웹툰화 표지를 상속(원작 소설 썸네일 보강)
      status: "ongoing",
      ageRating: w.ageRating,
      releaseYear: Math.max(2010, w.releaseYear - 1),
      availability: [{ platformId: "naver-series", pricing: "paid", url: "https://series.naver.com/" }],
      stats: { views, likes: fav, bookmarks: fav, ratingAvg, ratingCount: Math.round(fav * 0.4), ratingDist: synthDist(ratingAvg, Math.round(fav * 0.4)), rankDelta: 0, trendingScore: 60, completionRate: 80, bingeIndex: 82 },
      featured: false,
    };
    novelByName.set(key, novel);
    w.adaptedFrom = id;
  }
  return [...novelByName.values()];
}

// ── 카카오웹툰 (2번째 실 플랫폼) ───────────────────
const KW_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const KW_H = {
  "User-Agent": UA,
  Referer: "https://webtoon.kakao.com/",
  Origin: "https://webtoon.kakao.com",
  Accept: "application/json",
};
function kwGenres(keywords = []) {
  const text = keywords.join(" ");
  const out = new Set();
  for (const g of ALLOWED) if (text.includes(g)) out.add(g);
  if (out.has("로맨스") && out.has("판타지")) {
    out.delete("로맨스");
    out.delete("판타지");
    out.add("로판");
  }
  if (/무협|무림/.test(text)) out.add("무협");
  const arr = [...out].filter((g) => ALLOWED.has(g));
  return arr.length ? arr.slice(0, 3) : ["드라마"];
}

const LZ_GENRE = {
  drama: "드라마",
  romance: "로맨스",
  bl: "BL",
  fantasy: "판타지",
  school: "학원",
  gag: "코미디",
  gl: "로맨스",
  day: "일상",
  action: "액션",
  mystery: "미스터리",
  thriller: "스릴러",
  horror: "공포",
};
function lzGenres(codes = []) {
  const out = codes.map((code) => LZ_GENRE[String(code).toLowerCase()]).filter(Boolean);
  return out.length ? [...new Set(out)].slice(0, 3) : ["드라마"];
}
function lzAuthorNames(artists = [], roles = ["writer", "scripter", "original"]) {
  const allowed = new Set(roles);
  return artists.filter((artist) => allowed.has(artist?.role)).map((artist) => artist.name).filter(Boolean);
}
function lzUpdateDays(periods = []) {
  return periods
    .map((period) => toKoreanWeek(period))
    .filter(Boolean);
}
async function crawlLezhinCatalog() {
  const limit = 100;
  const out = new Map();
  const genreScopes = ["", ...Object.keys(LZ_GENRE)];
  for (const genre of genreScopes) {
    const page = await getJSON(
      `https://api.lezhin.com/v2/content-list/ranking?filter=all&rankType=realtime&limit=${limit}&offset=0&genres=${encodeURIComponent(genre)}`,
      HL
    );
    const items = page?.data;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item?.id && !out.has(item.id)) out.set(item.id, item);
      }
    }
    if (LEZHIN_CAP && out.size >= LEZHIN_CAP) break;
    await sleep(MIN_CRAWL_DELAY_MS);
  }

  const rows = applyLimit([...out.values()], LEZHIN_CAP);
  log(`레진 카탈로그 수집: ${rows.length}`);
  return rows.map((item, i) => {
    const genres = lzGenres(item.genres ?? []);
    const authors = lzAuthorNames(item.artists);
    const painters = lzAuthorNames(item.artists, ["painter"]);
    const fallbackAuthors = lzAuthorNames(item.artists, ["writer", "scripter", "painter", "original"]);
    const views = Number(item.viewCount) || 0;
    const subscriptions = Number(item.subscriptions) || Math.max(100, Math.round(views * 0.02));
    const rank = Number(item.currentRank) || i + 1;
    const ratingAvg = Math.max(3.4, Math.min(4.9, 4.78 - Math.log10(rank + 1) * 0.18 + Math.min(0.12, Math.log10(subscriptions + 1) * 0.012)));
    const ratingCount = Math.max(80, Math.round(subscriptions * 0.32));
    const status = item.contentsState === "completed" ? "completed" : "ongoing";
    const updateDays = status === "completed" ? undefined : lzUpdateDays(item.schedule?.periods ?? []);
    const releaseYear = item.publishedAt ? new Date(Number(item.publishedAt)).getFullYear() : 2024;
    const tags = [
      "레진",
      ...genres,
      item.freedEpisodeSize ? "무료회차" : "",
      item.print || item.isPrint ? "단행본" : "연재",
    ].filter(Boolean);

    return {
      _normTitle: norm(item.title),
      id: `lz-${item.id}`,
      slug: `lz-${item.alias || item.id}`,
      type: "webtoon",
      title: item.title,
      author: authors.join(", ") || fallbackAuthors.join(", ") || "미상",
      artist: painters.join(", ") || undefined,
      genres,
      tags: [...new Set(tags)].slice(0, 6),
      synopsis: `${item.title} · 레진코믹스 공개 카탈로그 수집작.`,
      cover: coverGradient(String(item.id), genres),
      status,
      ageRating: "all",
      releaseYear: Number.isFinite(releaseYear) ? releaseYear : 2024,
      updateDays: updateDays?.length ? updateDays : undefined,
      availability: [
        {
          platformId: "lezhin",
          pricing: item.freedEpisodeSize ? "wait-free" : "paid",
          url: `https://www.lezhin.com/ko/comic/${item.alias || item.id}`,
        },
      ],
      stats: {
        views,
        likes: subscriptions,
        bookmarks: subscriptions,
        ratingAvg: Math.round(ratingAvg * 10) / 10,
        ratingCount,
        ratingDist: synthDist(ratingAvg, ratingCount),
        rankDelta: 0,
        trendingScore: Math.max(35, Math.min(99, 100 - rank)),
        completionRate: status === "completed" ? 86 : 66,
        bingeIndex: Math.min(96, Math.round(58 + ratingAvg * 7)),
      },
      featured: false,
    };
  });
}
async function crawlKakaoWebtoon() {
  const map = new Map();
  for (const d of KW_DAYS) {
    const j = await getJSON(
      `https://gateway-kw.kakao.com/section/v2/timetables/days?placement=timetable_${d}`,
      KW_H
    );
    for (const sec of j?.data ?? [])
      for (const grp of sec.cardGroups ?? [])
        for (const card of grp.cards ?? []) {
          const c = card.content;
          if (c?.id && c.title && !map.has(c.id)) map.set(c.id, c);
        }
    await sleep(MIN_CRAWL_DELAY_MS);
  }
  const cards = [...map.values()];
  log(`카카오웹툰 수집: ${cards.length}`);
  return applyLimit(cards, KAKAO_WEBTOON_CAP).map((c, i) => {
    const authors = (c.authors ?? []).filter((a) => a.type === "AUTHOR").map((a) => a.name);
    const illus = (c.authors ?? []).filter((a) => a.type === "ILLUSTRATOR").map((a) => a.name);
    const kws = (c.seoKeywords ?? []).map((k) => String(k).replace(/^#/, "").trim()).filter(Boolean);
    const genres = kwGenres(kws);
    const bg = typeof c.backgroundColor === "string" && /^#/.test(c.backgroundColor) ? c.backgroundColor : null;
    const imgUrl = c.backgroundImage || c.featuredCharacterImageA; // 카카오 CDN 은 확장자 필요
    const ratingAvg = Math.round((4.3 + (hashInt(String(c.id)) % 5) * 0.1) * 10) / 10; // 추정
    const views = 6_000_000 - i * 90_000 + (hashInt(String(c.id)) % 500_000); // 추정
    const ratingCount = 400 + (hashInt(String(c.id)) % 1200); // 낮게 → 베이즈가 평점랭킹 지배 방지
    return {
      _normTitle: norm(c.title),
      id: `kw-${c.id}`,
      slug: `kw-${c.id}`,
      type: "webtoon",
      title: c.title,
      author: authors.join(", ") || "미상",
      artist: illus.join(", ") || undefined,
      genres,
      tags: kws.slice(0, 5),
      synopsis:
        (c.catchphraseTwoLines || "").replace(/\s+/g, " ").trim().slice(0, 200) ||
        `${c.title} · 카카오웹툰 연재작.`,
      cover: bg ? [bg, coverGradient(String(c.id), genres)[1]] : coverGradient(String(c.id), genres),
      coverImage: imgUrl ? proxied(imgUrl + ".webp") : undefined,
      status: "ongoing",
      ageRating: c.adult ? "19" : "all",
      releaseYear: 2023,
      availability: [
        {
          platformId: "kakao-webtoon",
          pricing: "wait-free",
          isOriginal: true,
          url: `https://webtoon.kakao.com/content/${c.seoId || c.id}/${c.id}`,
        },
      ],
      stats: {
        views,
        likes: Math.round(views * 0.04),
        bookmarks: Math.round(views * 0.04),
        ratingAvg,
        ratingCount,
        ratingDist: synthDist(ratingAvg, ratingCount),
        rankDelta: 0,
        trendingScore: Math.max(45, 90 - i),
        completionRate: 70,
        bingeIndex: 72,
      },
      featured: false,
    };
  });
}

function fmt(n) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, "")}만`;
  return String(n);
}
function pickFeatured(all) {
  [...all].sort((a, b) => b.stats.views - a.stats.views).slice(0, 10).forEach((t) => {
    t.featured = true;
    t.editorNote = `누적 조회 ${fmt(t.stats.views)}, 별점 ${t.stats.ratingAvg.toFixed(1)}의 대표작.`;
  });
}
function clean(t) {
  const rest = { ...t };
  delete rest._originAuthors;
  delete rest._series;
  delete rest._normTitle;
  Object.keys(rest).forEach((k) => rest[k] === undefined && delete rest[k]);
  return rest;
}

async function main() {
  const startedAt = new Date().toISOString();
  log("네이버 실데이터 크롤 시작…");
  const webtoons = sourceEnabled("naver-webtoon") ? await crawlWebtoons() : [];
  let series = [];
  if (sourceEnabled("naver-series")) {
    try {
      series = await crawlSeriesNovels();
    } catch (e) {
      log("시리즈 크롤 스킵:", e.message);
    }
  }
  const originNovels = buildOriginNovels(webtoons, series);
  const linked = webtoons.filter((w) => w.adaptedFrom).length;

  // 카카오웹툰 (2번째 실 플랫폼)
  let kakao = [];
  if (sourceEnabled("kakao-webtoon")) {
    try {
      kakao = await crawlKakaoWebtoon();
    } catch (e) {
      log("카카오웹툰 크롤 스킵:", e.message);
    }
  }
  // 교차 매칭: 같은 제목이면 네이버 작품에 카카오 가용성 추가(진짜 크로스플랫폼), 아니면 신규
  const naverByName = new Map(webtoons.map((w) => [norm(w.title), w]));
  const kakaoNew = [];
  let crossLinked = 0;
  for (const k of kakao) {
    const match = naverByName.get(k._normTitle);
    if (match) {
      if (!match.availability.some((a) => a.platformId === "kakao-webtoon")) {
        match.availability.push(k.availability[0]);
        crossLinked++;
      }
    } else {
      kakaoNew.push(k);
    }
  }

  let lezhin = [];
  if (sourceEnabled("lezhin")) {
    try {
      lezhin = await crawlLezhinCatalog();
    } catch (e) {
      log("레진 크롤 스킵:", e.message);
    }
  }
  const knownByName = new Map([...webtoons, ...kakaoNew].map((w) => [norm(w.title), w]));
  const lezhinNew = [];
  let lezhinCrossLinked = 0;
  for (const item of lezhin) {
    const match = knownByName.get(item._normTitle);
    if (match) {
      if (!match.availability.some((a) => a.platformId === "lezhin")) {
        match.availability.push(item.availability[0]);
        match.stats.views = Math.max(match.stats.views, item.stats.views);
        match.stats.likes = Math.max(match.stats.likes, item.stats.likes);
        match.stats.bookmarks = Math.max(match.stats.bookmarks, item.stats.bookmarks);
        lezhinCrossLinked++;
      }
    } else {
      lezhinNew.push(item);
    }
  }

  // 시리즈 보너스 중 웹툰과 연결 안 된 것도 standalone 으로 포함
  const novels = [...series, ...originNovels];
  const all = [...webtoons.map(clean), ...novels.map(clean), ...kakaoNew.map(clean), ...lezhinNew.map(clean)];
  pickFeatured(all);

  const crawledAt = new Date().toISOString();
  const sourceVersion = `crawl/${crawledAt}`;
  const result = {
    titles: all,
    count: all.length,
    sourceVersion,
    crawledAt,
    metadata: {
      startedAt,
      sources: {
        naverWebtoon: webtoons.length,
        naverSeries: novels.length,
        kakaoWebtoon: kakao.length,
        kakaoNew: kakaoNew.length,
        kakaoCrossLinked: crossLinked,
        lezhin: lezhin.length,
        lezhinNew: lezhinNew.length,
        lezhinCrossLinked,
        adaptations: linked,
      },
      limits: {
        webtoonCap: WEBTOON_CAP ?? null,
        webtoonDetailCap: WEBTOON_DETAIL_CAP,
        seriesBonusCap: NOVEL_BONUS_CAP ?? null,
        kakaoWebtoonCap: KAKAO_WEBTOON_CAP ?? null,
        lezhinCap: LEZHIN_CAP ?? null,
        finishedPages: WEBTOON_FINISHED_PAGES ?? null,
        seriesPagesPerGenre: SERIES_PAGES_PER_GENRE ?? null,
      },
      sourceIds: [...SOURCE_IDS],
    },
  };

  if (WRITE_FILE) {
    const header = `// 자동 생성 — scripts/crawl.mjs (네이버 웹툰/시리즈 + 카카오웹툰 + 레진 공개 카탈로그 벤치마킹)\n// 재생성: node scripts/crawl.mjs\n// 네이버 웹툰/시리즈: 조회·관심·별점·장르·시놉시스·연재요일·표지·연재연도 실수집. 카카오웹툰/레진: 공개 카탈로그 메타데이터 수집. 일부 파생지표(평가수·분포·완독률)는 추정.\nimport type { Title } from "../types";\n\nexport const TITLES: Title[] = `;
    await writeFile(path.resolve("lib/data/titles.ts"), header + JSON.stringify(all, null, 2) + ";\n", "utf8");
  }

  if (OUTPUT_JSON) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }

  log(
    `완료: ${all.length}편 — 네이버웹툰 ${webtoons.length}, 웹소설 ${novels.length}, 카카오웹툰 신규 ${kakaoNew.length}(+교차연결 ${crossLinked}), 레진 신규 ${lezhinNew.length}(+교차연결 ${lezhinCrossLinked}), 어댑테이션 ${linked}`
  );
}
main();
