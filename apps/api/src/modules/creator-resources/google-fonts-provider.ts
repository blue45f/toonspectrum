import { parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";

import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

type Request = (url: URL, headers?: Record<string, string>) => Promise<{ value: unknown; fetchedAt: string }>;

const SIZE = 12;
const MAX_ITEMS = 2500;
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const plain = (value: unknown, max = 400) => textOf(value, 2000)
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, max);

const TERM_ALIASES: Record<string, string> = {
  한글: "korean",
  한국어: "korean",
  고딕: "sans-serif",
  산세리프: "sans-serif",
  명조: "serif",
  손글씨: "handwriting",
  필기: "handwriting",
  장식: "display",
  고정폭: "monospace",
  나눔: "nanum",
  노토: "noto",
  주아: "jua",
  개구: "gaegu",
  도현: "do hyeon",
  송명: "song myung",
  검은고딕: "black han sans",
};

const CATEGORY_LABELS: Record<string, string> = {
  "sans-serif": "고딕·산세리프",
  serif: "명조·세리프",
  display: "타이틀·장식",
  handwriting: "손글씨",
  monospace: "고정폭",
};
export function googleFontsUrl(): URL {
  const url = new URL("https://www.googleapis.com/webfonts/v1/webfonts");
  url.search = new URLSearchParams({
    sort: "popularity",
    capability: "WOFF2",
    fields: "kind,items(family,variants,subsets,version,lastModified,category)",
  }).toString();
  return url;
}

export function validGoogleFontsShape(url: URL, value: unknown): boolean {
  if (url.hostname !== "www.googleapis.com" || url.pathname !== "/webfonts/v1/webfonts") return false;
  const root = recordOf(value);
  if (root.kind !== "webfonts#webfontList" || !Array.isArray(root.items) || root.items.length > MAX_ITEMS) return false;
  return root.items.every((raw) => {
    const item = recordOf(raw);
    return Boolean(textOf(item.family, 200))
      && Array.isArray(item.variants)
      && Array.isArray(item.subsets)
      && Boolean(textOf(item.category, 40));
  });
}

function queryTerms(query: string): string[] {
  const normalized = query.normalize("NFKC").toLocaleLowerCase("ko").trim();
  return normalized.split(/\s+/u).flatMap((term) => (TERM_ALIASES[term] ?? term).split(/\s+/u)).filter(Boolean);
}

function normalize(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const family = plain(item.family, 200);
  const category = plain(item.category, 40);
  if (!family || !CATEGORY_LABELS[category]) return null;
  const variants = rows(item.variants).map((value) => plain(value, 40)).filter(Boolean).slice(0, 24);
  const subsets = rows(item.subsets).map((value) => plain(value, 40)).filter(Boolean).slice(0, 24);
  const slug = family.toLocaleLowerCase("en").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  if (!slug) return null;
  const source = new URL(`https://fonts.google.com/specimen/${encodeURIComponent(family).replace(/%20/gu, "+")}`);
  const Korean = subsets.includes("korean") ? "한글 지원" : "한글 미확인";
  const description = [
    Korean,
    variants.length ? `굵기·스타일 ${variants.join(", ")}` : "",
    subsets.length ? `문자 범위 ${subsets.join(", ")}` : "",
    plain(item.version, 40) ? `버전 ${plain(item.version, 40)}` : "",
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `googlefonts:${slug}`,
    provider: "googlefonts",
    title: family,
    creator: CATEGORY_LABELS[category],
    description,
    sourceUrl: source.href,
    credit: "Google Fonts directory metadata · 개별 폰트 라이선스 원문 확인",
    dateLabel: plain(item.lastModified, 20),
    license: "metadata-only",
    fetchedAt,
  });
}
export async function googleFontsSearch(
  query: string,
  page: number,
  key: string,
  request: Request,
): Promise<ResourceSearchResult> {
  const url = googleFontsUrl();
  const source = await request(url, { "X-Goog-Api-Key": key });
  if (!validGoogleFontsShape(url, source.value)) throw new Error("upstream_schema");
  const terms = queryTerms(query);
  const matched = rows(recordOf(source.value).items).filter((raw) => {
    const item = recordOf(raw);
    const haystack = [
      plain(item.family, 200),
      plain(item.category, 40),
      ...rows(item.variants).map((value) => plain(value, 40)),
      ...rows(item.subsets).map((value) => plain(value, 40)),
    ].join(" ").toLocaleLowerCase("en");
    return terms.every((term) => haystack.includes(term));
  });
  const offset = (page - 1) * SIZE;
  const candidates = matched.slice(offset, offset + SIZE);
  const normalized = candidates
    .map((item) => normalize(item, source.fetchedAt))
    .filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  return {
    provider: "googlefonts",
    status: items.length < candidates.length ? "partial" : "ready",
    items,
    page,
    hasMore: page < 20 && matched.length > page * SIZE,
    total: matched.length,
    fetchedAt: source.fetchedAt,
    message: "Google Fonts 디렉터리의 글꼴 가족·굵기·문자 범위 메타데이터입니다. 한글 지원 여부를 검색할 수 있지만 실제 작품 포함·임베딩·재배포 조건은 각 글꼴 상세 페이지의 라이선스를 확인하세요.",
  };
}
