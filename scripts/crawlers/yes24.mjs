// yes24 웹소설(eBook) 베스트셀러 크롤러.
// SOURCE: HTML 베스트셀러 목록 (/product/category/bestseller). 공개 엔드포인트, 데스크톱 UA.
// robots: /product/category/bestseller 허용(금지된 /api,/tpl,/goods/ 직접 호출 안 함). 로그인/연령게이트 우회 없음.
// 표지는 image.yes24.com/goods/<id>/L 의 실제 원본 → coverProxy 로 /api/cover 프록시.

import {
  fetchText,
  mapGenres,
  coverGradient,
  coverProxy,
  estimateStats,
  norm,
  cleanTitle,
  stripTags,
  sleep,
} from "./_shared.mjs";

const PREFIX = "y24";
const PLATFORM_ID = "yes24";
const PLATFORM_NAME = "예스24";
const ORIGIN = "https://www.yes24.com";

// categoryNumber → { 폴백 장르, 표시 태그 }. (probe 로 확인: 046=로맨스, 049=판타지/무협, 045=소설 종합)
const CATEGORIES = [
  { num: "017001046", genre: "로맨스", tags: ["로맨스", "eBook"] },
  { num: "017001049", genre: "판타지", tags: ["판타지", "무협", "eBook"] },
  { num: "017001045", genre: "드라마", tags: ["소설", "eBook"] },
];

const PAGES_PER_CATEGORY = 9;
const PAGE_SIZE = 24;

// 한 카테고리 페이지 HTML 한 장을 받아온다.
async function fetchListPage(categoryNumber, pageNumber) {
  const url = `${ORIGIN}/product/category/bestseller?categoryNumber=${categoryNumber}&pageNumber=${pageNumber}&pageSize=${PAGE_SIZE}`;
  return fetchText(url, { referer: `${ORIGIN}/product/category/bestseller` });
}

// info_name 행에서 goodsId+title 추출. onclick 등 부가 속성을 허용한다.
const GD_NAME_RE =
  /<a\s+class="gd_name"\s+href="\/product\/goods\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;

// 한 상품의 info_auth(저자) 블록 추출. 첫 <a> 텍스트가 저자명, 뒤따르는 " 저" 제거.
function extractAuthor(blockHtml) {
  const m = blockHtml.match(/<span\s+class="authPub info_auth"[^>]*>([\s\S]*?)<\/span>/);
  if (!m) return null;
  const inner = stripTags(m[1]);
  // stripTags 후: "이유진 저" 또는 "이유진, 홍길동 저" 형태. 뒤쪽 " 저"/" 글" 꼬리 제거.
  const cleaned = inner.replace(/\s*저\s*$/, "").replace(/\s*글\s*$/, "").trim();
  if (!cleaned) return null;
  // 선집 등 저자가 매우 많으면 첫 저자 + "외" 로 요약.
  const parts = cleaned.split(/\s*,\s*/).filter(Boolean);
  return parts.length > 3 ? `${parts[0]} 외 ${parts.length - 1}명` : cleaned;
}

// info_date 에서 연도 추출(예: "2026년 05월").
function extractYear(blockHtml) {
  const m = blockHtml.match(/class="authPub info_date"[^>]*>\s*(\d{4})\s*년/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1990 && y <= 2100 ? y : null;
}

// gd_res 가 [eBook] 등 머리표기를 갖는 경우가 있으나 title 은 gd_name 내부만 사용한다.
function parseListPage(html, category) {
  if (!html) return [];
  const rows = [];
  GD_NAME_RE.lastIndex = 0;
  let m;
  while ((m = GD_NAME_RE.exec(html)) !== null) {
    const goodsId = m[1];
    const rawTitle = stripTags(m[2]);
    if (!goodsId || !rawTitle) continue;
    // 상품 단위 블록에서 저자/연도 탐색. 선집(수상작품집 등)은 저자 <a>가 다수라
    // info_auth span 이 길어질 수 있으므로 다음 gd_name 직전까지(없으면 6000자) 사용.
    const nextIdx = html.indexOf('class="gd_name"', m.index + m[0].length);
    const end = nextIdx > 0 ? Math.min(nextIdx, m.index + 6000) : m.index + 6000;
    const block = html.slice(m.index, end);
    rows.push({
      goodsId,
      rawTitle,
      author: extractAuthor(block),
      releaseYear: extractYear(block),
      category,
    });
  }
  return rows;
}

function buildRow(item, index) {
  const { goodsId, rawTitle, author, releaseYear, category } = item;
  const title = cleanTitle(rawTitle);
  const id = `${PREFIX}-${goodsId}`;
  const realCover = `https://image.yes24.com/goods/${goodsId}/L`;
  const workUrl = `${ORIGIN}/product/goods/${goodsId}`;

  // 장르: 제목 + 카테고리 태그 텍스트로 매핑, 카테고리 폴백 장르 사용.
  const genres = mapGenres([title, ...category.tags], category.genre);

  return {
    _normTitle: norm(title),
    id,
    slug: id,
    type: "webnovel",
    title,
    author: author || "미상",
    genres,
    tags: category.tags.slice(0, 6),
    synopsis: `${title} · ${PLATFORM_NAME} 공개 카탈로그 수집작.`,
    cover: coverGradient(goodsId, genres),
    coverImage: coverProxy(realCover),
    status: "ongoing",
    ageRating: mapAgeFromCategory(),
    releaseYear: releaseYear ?? 2023,
    availability: [{ platformId: PLATFORM_ID, pricing: "paid", url: workUrl }],
    stats: estimateStats({ seed: id, rank: index + 1 }),
    featured: false,
  };
}

// 일반 베스트셀러 목록(연령게이트 우회 없음)이므로 성인 플래그 없음 → "all".
function mapAgeFromCategory() {
  return "all";
}

export async function crawl() {
  const byWorkId = new Map();
  let globalIndex = 0;

  for (const category of CATEGORIES) {
    for (let page = 1; page <= PAGES_PER_CATEGORY; page++) {
      const html = await fetchListPage(category.num, page);
      const parsed = parseListPage(html, category);
      if (!parsed.length) {
        // 더 받을 페이지가 없으면 이 카테고리 종료.
        break;
      }
      for (const item of parsed) {
        if (byWorkId.has(item.goodsId)) continue;
        byWorkId.set(item.goodsId, buildRow(item, globalIndex));
        globalIndex++;
      }
      await sleep(350);
    }
  }

  return [...byWorkId.values()];
}
