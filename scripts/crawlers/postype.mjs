// Postype 크롤러 — SSR HTML(self.__next_f.push 페이로드)에서 시리즈 카탈로그를 수집한다.
// 출처: https://www.postype.com/@<handle>/series (path 페이지네이션 ?page=N — robots 허용).
// 표지는 d3mcojo3jv0dbr.cloudfront.net (catalog.controller allowlist 등록 호스트), coverProxy()로 프록시.
// robots: /api,/@*/search,*series_sort= 등은 사용하지 않는다. 데스크톱 UA, 소량 요청 + sleep.
import {
  fetchText,
  mapGenres,
  coverGradient,
  coverProxy,
  estimateStats,
  norm,
  cleanTitle,
  stripTags,
  mapAge,
  sleep,
} from "./_shared.mjs";

const PREFIX = "pt";
const PLATFORM_ID = "postype";
const ORIGIN = "https://www.postype.com";
const COVER_HOST = "d3mcojo3jv0dbr.cloudfront.net";

// 검증된 공개 콘텐츠 채널. @original 은 포스타입 오리지널 카탈로그(다수 시리즈).
// 추가 핸들은 안전을 위해 화이트리스트로만 둔다(빈/마케팅 채널은 자연히 0건 → 영향 없음).
const HANDLES = ["original"];

const MAX_PAGES = 8; // 핸들당 안전 상한(소량 요청 유지). @original 은 ~6p.

// self.__next_f.push([1,"...escaped..."]) 문자열 페이로드를 모두 이어붙여 디코드한다.
function decodeNextPayload(html) {
  const re = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  let joined = "";
  while ((m = re.exec(html))) {
    try {
      joined += JSON.parse('"' + m[1] + '"');
    } catch {
      /* 부분 청크 디코드 실패는 무시 */
    }
  }
  return joined;
}

// 디코드된 텍스트에서 "series":{...} 객체를 중괄호 균형으로 추출 → JSON 파싱.
// title + thumbnail + id 를 가진 객체만 채택.
function extractSeries(joined) {
  const out = [];
  const marker = '"series":{';
  let i = 0;
  while ((i = joined.indexOf(marker, i)) !== -1) {
    const start = i + marker.length - 1; // 여는 '{' 위치
    let depth = 0;
    let j = start;
    let inStr = false;
    let esc = false;
    for (; j < joined.length; j++) {
      const ch = joined[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') {
        inStr = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    const objText = joined.slice(start, j);
    try {
      // "$undefined" 토큰을 null 로 치환해 JSON 파싱 가능하게 한다.
      const obj = JSON.parse(objText.replace(/"\$undefined"/g, "null"));
      if (obj && obj.id != null && obj.title && obj.thumbnail) out.push(obj);
    } catch {
      /* 깨진 객체 무시 */
    }
    i = j;
  }
  return out;
}

// 시리즈 type 코드 → 표준 status.
function mapStatus(type) {
  // FINISHED/SHORT(단편 완결) → completed, 그 외(ONGOING 등) → ongoing.
  if (type === "FINISHED" || type === "SHORT") return "completed";
  return "ongoing";
}

// thumbnail 이 허용 표지 호스트인지 검증(잘못된 호스트면 coverImage 생략).
function safeCover(url) {
  if (typeof url !== "string") return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return undefined;
    if (u.hostname !== COVER_HOST) return undefined;
    return coverProxy(url);
  } catch {
    return undefined;
  }
}

// thumbnail 경로 prefix(YYYY/MM/...)에서 발행연도 추정.
function inferYear(url) {
  const m = String(url || "").match(/\/(\d{4})\/(\d{2})\//);
  if (m) {
    const y = Number(m[1]);
    if (y >= 2014 && y <= 2026) return y;
  }
  return 2023;
}

function toRow(obj, handle, index) {
  const workId = String(obj.id);
  const id = `${PREFIX}-${workId}`;
  const rawTitle = stripTags(String(obj.title));
  const isNovel = Array.isArray(obj.majorTags) && obj.majorTags.includes("웹소설");
  const type = isNovel ? "webnovel" : "webtoon";
  const fallbackGenre = isNovel ? "판타지" : "드라마";

  const tagPool = [
    ...(Array.isArray(obj.userTags) ? obj.userTags : []),
    ...(Array.isArray(obj.majorTags) ? obj.majorTags : []),
  ]
    .filter((t) => typeof t === "string" && t.trim())
    .map((t) => t.trim());

  const genres = mapGenres(tagPool, fallbackGenre);
  const status = mapStatus(obj.type);
  const synopsisRaw = stripTags(String(obj.description || ""));
  const synopsis =
    synopsisRaw.length > 4
      ? synopsisRaw
      : `${rawTitle} · 포스타입 공개 카탈로그 수집작.`;

  const workUrl = `${ORIGIN}/@${handle}/series/${workId}`;
  const realViews =
    typeof obj.viewCount === "number" && obj.viewCount > 0 ? obj.viewCount : undefined;
  const realLikes =
    typeof obj.likeCount === "number" && obj.likeCount > 0 ? obj.likeCount : undefined;

  const row = {
    _normTitle: norm(rawTitle),
    id,
    slug: id,
    type,
    title: cleanTitle(rawTitle),
    author: stripTags(String(obj.nickname || "")) || "미상",
    genres,
    tags: [...new Set(tagPool)].slice(0, 6),
    synopsis,
    cover: coverGradient(workId, genres),
    coverImage: safeCover(obj.thumbnail),
    status,
    ageRating: mapAge(Boolean(obj.adult)),
    releaseYear: inferYear(obj.thumbnail),
    availability: [{ platformId: PLATFORM_ID, pricing: "free", url: workUrl }],
    stats: estimateStats({
      seed: id,
      rank: index + 1,
      views: realViews,
      likes: realLikes,
      finished: status === "completed",
    }),
    featured: false,
  };

  return row;
}

export async function crawl() {
  const byWorkId = new Map();

  for (const handle of HANDLES) {
    let prevSize = -1;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${ORIGIN}/@${handle}/series${page > 1 ? `?page=${page}` : ""}`;
      const html = await fetchText(url, { referer: ORIGIN + "/" });
      if (!html) break;

      const joined = decodeNextPayload(html);
      if (!joined) break;

      const series = extractSeries(joined);
      if (series.length === 0) break;

      let added = 0;
      for (const obj of series) {
        const wid = String(obj.id);
        if (byWorkId.has(wid)) continue;
        byWorkId.set(wid, { obj, handle });
        added++;
      }

      // 이번 페이지가 새 항목을 전혀 추가하지 않았다면(중복/마지막 페이지) 다음 핸들로.
      if (added === 0) break;

      // 마지막 페이지 감지: 직전 페이지보다 시리즈가 적게 나오면 끝.
      if (prevSize !== -1 && series.length < prevSize) break;
      prevSize = series.length;

      await sleep(450);
    }
    await sleep(300);
  }

  const rows = [];
  let i = 0;
  for (const { obj, handle } of byWorkId.values()) {
    rows.push(toRow(obj, handle, i));
    i++;
  }
  return rows;
}
