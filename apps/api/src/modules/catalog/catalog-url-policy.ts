// Every network/redirect authority comes from server-owned constants. User input
// can supply only the resource path, query and (for navigation) fragment.
const COVER_ORIGINS = [
  "https://image-comic.pstatic.net",
  "https://comicthumb-phinf.pstatic.net",
  "https://series-phinf.pstatic.net",
  "https://bookthumb-phinf.pstatic.net",
  "https://ssl.pstatic.net",
  "https://kr-a.kakaopagecdn.com",
  "https://kr-a2.kakaopagecdn.com",
  "https://t1.kakaocdn.net",
  "https://t2.kakaocdn.net",
  "https://t3.kakaocdn.net",
  "https://ccdn.lezhin.com",
  "https://img.ridicdn.net",
  "https://dn-img-page.kakao.com",
  "https://cdn1.munpia.com",
  "https://cf-image.joara.com",
  "https://d3mcojo3jv0dbr.cloudfront.net",
  "https://img.mrblue.com",
  "https://bookimg.bookcube.com",
  "https://img-books.onestore.co.kr",
  "https://image.yes24.com",
  "https://images.novelpia.com",
  "https://novelpia.com",
  "https://image.balcony.studio",
  "https://cdn.balcony.studio",
  "https://toptoon.com",
  "https://cdn.toptoon.com",
  "https://smurfs.toptoon.com",
  "https://toomics.com",
  "https://cdn.toomics.com",
  "https://thumb.toomics.com",
  "https://contents.kyobobook.co.kr",
  "https://www.comico.kr",
] as const;

const PLATFORM_ORIGINS: Readonly<Record<string, readonly string[]>> = {
  naver: ["https://series.naver.com", "https://comic.naver.com"],
  "naver-webtoon": ["https://comic.naver.com", "https://m.comic.naver.com"],
  "naver-series": ["https://series.naver.com", "https://m.series.naver.com"],
  "kakao-page": ["https://page.kakao.com"],
  "kakao-webtoon": ["https://webtoon.kakao.com"],
  ridi: ["https://ridibooks.com", "https://www.ridibooks.com"],
  munpia: ["https://novel.munpia.com", "https://www.munpia.com", "https://m.munpia.com"],
  joara: ["https://www.joara.com", "https://m.joara.com"],
  novelpia: ["https://novelpia.com", "https://www.novelpia.com"],
  lezhin: ["https://www.lezhin.com", "https://www.lezhinus.com"],
  bomtoon: ["https://www.bomtoon.com", "https://bomtoon.com"],
  toptoon: ["https://toptoon.com", "https://www.toptoon.com"],
  postype: ["https://www.postype.com"],
  mrblue: ["https://www.mrblue.com", "https://m.mrblue.com"],
  comico: ["https://www.comico.kr"],
  toomics: ["https://toomics.com", "https://www.toomics.com"],
  bookcube: ["https://www.bookcube.com", "https://m.bookcube.com"],
  onestory: ["https://onestory.co.kr", "https://www.onestory.co.kr"],
  kyobo: ["https://ebook-product.kyobobook.co.kr", "https://product.kyobobook.co.kr", "https://www.kyobobook.co.kr"],
  yes24: ["https://www.yes24.com", "https://m.yes24.com"],
  kmas: ["https://www.kmas.or.kr"],
};

function parseUrl(value: string): URL | null {
  if (value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveCoverFetchUrl(value: string): string | null {
  const url = parseUrl(value);
  if (!url) return null;
  const origin = COVER_ORIGINS.find((allowed) => allowed === url.origin);
  if (!origin) return null;
  // The slash is part of the trusted prefix, so a path beginning with // or a
  // percent-encoded authority cannot replace the chosen server.
  return `${origin}/${url.pathname.slice(1)}${url.search}`;
}

export function resolveAffiliateDestination(platformId: string, value: string): string | null {
  const url = parseUrl(value);
  if (!url || !Object.hasOwn(PLATFORM_ORIGINS, platformId)) return null;
  const origin = PLATFORM_ORIGINS[platformId]?.find((allowed) => allowed === url.origin);
  if (!origin) return null;
  return `${origin}/${url.pathname.slice(1)}${url.search}${url.hash}`;
}
