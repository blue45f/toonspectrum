// 중소형 플랫폼 크롤러 공유 헬퍼 — 각 scripts/crawlers/<platform>.mjs 가 이 계약을 따른다.
// 출력 row 는 lib/types.ts 의 Title 형태(+ 교차연결용 _normTitle)와 일치해야 한다.
// 표지는 핫링크 회피를 위해 coverProxy()로 /api/cover 프록시 URL을 만든다(호스트는 catalog.controller allowlist에 등록).

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 랭킹/탐색 화면 필터와 동일한 정규 장르 집합.
export const ALLOWED = new Set([
  "로맨스", "로판", "판타지", "현판", "무협", "액션", "스릴러", "미스터리", "드라마",
  "일상", "코미디", "학원", "스포츠", "공포", "SF", "역사", "BL", "게임판타지",
]);

const GENRE_KEYWORDS = [
  ["로판", /로판|로맨스판타지|로맨스 판타지/],
  ["BL", /\bBL\b|블리|보이즈러브/i],
  ["무협", /무협|무림|화산|문파|검신/],
  ["현판", /현판|현대판타지/],
  ["게임판타지", /게임판타지|게임 판타지|VRMMO|레이드/],
  ["로맨스", /로맨스|로맨틱|순정|연애|러브/],
  ["판타지", /판타지|이세계|환생|회귀|마법/],
  ["액션", /액션|배틀|싸움|전투/],
  ["스릴러", /스릴러|범죄|느와르/],
  ["미스터리", /미스터리|추리|수사/],
  ["공포", /공포|호러|괴담/],
  ["학원", /학원|학교|하이틴/],
  ["스포츠", /스포츠|축구|야구|농구/],
  ["역사", /역사|사극|조선|대체역사/],
  ["SF", /\bSF\b|과학|미래|디스토피아/i],
  ["코미디", /코미디|개그|유머|병맛/],
  ["일상", /일상|힐링|슬라이스|에세이/],
  ["드라마", /드라마|성장|가족/],
];

// 임의의 한글 장르/태그 문자열 배열 → 정규 장르(최대 3개). 매칭 없으면 fallback.
export function mapGenres(strings = [], fallback = "드라마") {
  const text = (Array.isArray(strings) ? strings : [strings]).filter(Boolean).join(" ");
  const out = new Set();
  for (const [genre, re] of GENRE_KEYWORDS) {
    if (re.test(text)) out.add(genre);
    if (out.size >= 3) break;
  }
  if (out.has("로맨스") && out.has("판타지")) {
    out.delete("로맨스");
    out.delete("판타지");
    out.add("로판");
  }
  const arr = [...out].filter((g) => ALLOWED.has(g)).slice(0, 3);
  return arr.length ? arr : [fallback];
}

export function hashInt(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function coverGradient(seed, genres = []) {
  const base = { 로맨스: 5, 로판: 340, BL: 315, 판타지: 290, 현판: 268, SF: 245, 게임판타지: 222, 미스터리: 205, 스릴러: 195, 공포: 150, 일상: 162, 스포츠: 138, 코미디: 100, 학원: 78, 역사: 62, 드라마: 35, 무협: 22, 액션: 12 };
  const h = base[genres[0]] ?? hashInt(seed) % 360;
  return [`oklch(0.45 0.14 ${h})`, `oklch(0.28 0.1 ${(h + 40) % 360})`];
}

export const norm = (s) => String(s || "").replace(/[\s:~!?,.\-()[\]·]/g, "").toLowerCase();

export function cleanTitle(s) {
  return String(s || "")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

export function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

// 평점 분포(1~5) 합성 — 평균 주변 정규분포.
export function synthDist(avg, count) {
  const c = count || 1000;
  const w = [1, 2, 3, 4, 5].map((s) => Math.exp(-Math.pow(s - avg, 2) / 0.6));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round((x / sum) * c));
}

// 비공개 지표 추정(footer/README에 추정값임을 명시). 순위·실제 평점이 있으면 반영.
// opts: { seed, rank, total, ratingAvg?, ratingCount?, views?, likes?, finished? }
export function estimateStats(opts = {}) {
  const { seed = "x", rank = 1, ratingAvg: realAvg, ratingCount: realCount, views: realViews, likes: realLikes, finished = false } = opts;
  const jitter = hashInt(seed);
  const views = Math.max(20_000, realViews ?? 5_000_000 - rank * 38_000 + (jitter % 400_000));
  const ratingAvg = Math.round(Math.max(3.2, Math.min(4.9, realAvg ?? 4.2 + (jitter % 7) * 0.08)) * 10) / 10;
  // 평가수는 보수적으로(베이즈 보정이 추정 평점을 지배하지 않도록).
  const ratingCount = Math.max(60, Math.round(realCount ?? 300 + (jitter % 1400)));
  const likes = Math.max(50, Math.round(realLikes ?? views * 0.04));
  return {
    views,
    likes,
    bookmarks: likes,
    ratingAvg,
    ratingCount,
    ratingDist: synthDist(ratingAvg, ratingCount),
    rankDelta: 0,
    trendingScore: Math.max(35, Math.min(99, 92 - rank)),
    completionRate: finished ? 86 : Math.min(95, Math.round(58 + ratingAvg * 7)),
    bingeIndex: Math.min(98, Math.round(52 + ratingAvg * 9)),
  };
}

// 실제 표지 URL → /api/cover 프록시 URL. 호스트는 catalog.controller COVER_ALLOWED_HOST 에 등록되어야 한다.
export function coverProxy(url) {
  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return undefined;
  return `/api/cover?u=${encodeURIComponent(trimmed)}`;
}

export function mapAge(flag) {
  return flag ? "19" : "all";
}

const TIMEOUT_MS = 12_000;

export async function fetchText(url, { referer, headers = {} } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}), ...headers },
      signal: c.signal,
    });
    clearTimeout(t);
    return r.ok ? await r.text() : null;
  } catch {
    clearTimeout(t);
    return null;
  }
}

export async function fetchJson(url, { referer, headers = {} } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...(referer ? { Referer: referer } : {}), ...headers },
      signal: c.signal,
    });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch {
    clearTimeout(t);
    return null;
  }
}

// Next.js __NEXT_DATA__ JSON 추출.
export function extractNextData(html) {
  const m = String(html || "").match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// 깊은 객체에서 조건 함수를 만족하는 객체들을 수집(dedupe는 호출측에서).
export function deepCollect(root, predicate, max = 5000) {
  const out = [];
  const queue = [root];
  const seen = new Set();
  let scanned = 0;
  while (queue.length && scanned < max && out.length < max) {
    const v = queue.shift();
    scanned++;
    if (!v || typeof v !== "object" || seen.has(v)) continue;
    seen.add(v);
    if (!Array.isArray(v) && predicate(v)) out.push(v);
    for (const key of Object.keys(v)) {
      const child = v[key];
      if (child && typeof child === "object") queue.push(child);
    }
  }
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
