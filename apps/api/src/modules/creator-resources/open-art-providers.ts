import { httpsUrl, parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";
import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

export type OpenArtProvider = "aic" | "cleveland";
type Request = (url: URL) => Promise<{ value: unknown; fetchedAt: string }>;
const SIZE = 12;
const fields = {
  aic: "id,title,artist_display,date_display,medium_display,credit_line,is_public_domain,copyright_notice,image_id,place_of_origin,artwork_type_title",
  cleveland: "id,title,url,creators,creation_date,technique,culture,type,creditline,share_license_status,copyright,images",
};
export function isOpenArtProvider(value: unknown): value is OpenArtProvider {
  return value === "aic" || value === "cleveland";
}
const totalOf = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const plain = (value: unknown, max = 300) => textOf(value, 3000).replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
export function validOpenArtShape(url: URL, value: unknown): boolean {
  const data = recordOf(value);
  if (!Array.isArray(data.data)) return false;
  if (url.hostname === "api.artic.edu") return totalOf(recordOf(data.pagination).total);
  if (url.hostname === "openaccess-api.clevelandart.org") return totalOf(recordOf(data.info).total);
  return false;
}
export function openArtUrl(provider: OpenArtProvider, query: string, page: number): URL {
  const url = new URL(provider === "aic" ? "https://api.artic.edu/api/v1/artworks/search" : "https://openaccess-api.clevelandart.org/api/artworks/");
  url.search = new URLSearchParams({ q: query, limit: String(SIZE), fields: fields[provider] }).toString();
  if (provider === "aic") { url.searchParams.set("page", String(page)); url.searchParams.set("query[term][is_public_domain]", "true"); }
  else { url.searchParams.set("skip", String((page - 1) * SIZE)); url.searchParams.set("cc0", ""); url.searchParams.set("has_image", "1"); }
  return url;
}
function normalize(provider: OpenArtProvider, raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  if (!totalOf(item.id) || item.id === 0) return null;
  const common = { id: `${provider}:${item.id}`, provider, title: plain(item.title), license: "CC0", fetchedAt };
  if (provider === "aic") {
    if (item.is_public_domain !== true || textOf(item.copyright_notice)) return null;
    const image = textOf(item.image_id, 100);
    if (!/^[a-zA-Z0-9-]{8,100}$/u.test(image)) return null;
    return parseResource({ ...common, sourceUrl: `https://www.artic.edu/artworks/${item.id}`,
      imageUrl: `https://www.artic.edu/iiif/2/${image}/full/843,/0/default.jpg`,
      creator: plain(item.artist_display), dateLabel: plain(item.date_display, 100), credit: plain(item.credit_line, 500),
      description: [item.place_of_origin, item.artwork_type_title, item.medium_display].map((v) => plain(v)).filter(Boolean).join(" · ") });
  }
  if (item.share_license_status !== "CC0" || textOf(item.copyright)) return null;
  const imageUrl = httpsUrl(recordOf(recordOf(item.images).web).url, ["openaccess-cdn.clevelandart.org"]);
  if (!imageUrl) return null;
  const creators = Array.isArray(item.creators) ? item.creators.slice(0, 5).map((v) => plain(recordOf(v).description)).join(", ") : "";
  const cultures = Array.isArray(item.culture) ? item.culture.slice(0, 5).map((v) => plain(v)).join(", ") : "";
  return parseResource({ ...common, sourceUrl: item.url, imageUrl, creator: creators,
    dateLabel: plain(item.creation_date, 100), credit: plain(item.creditline, 500),
    description: [cultures, plain(item.type), plain(item.technique)].filter(Boolean).join(" · ") });
}
export async function openArtSearch(provider: OpenArtProvider, query: string, page: number, request: Request): Promise<ResourceSearchResult> {
  const url = openArtUrl(provider, query, page);
  const source = await request(url);
  if (!validOpenArtShape(url, source.value)) throw new Error("upstream_schema");
  const data = recordOf(source.value);
  const total = (provider === "aic" ? recordOf(data.pagination).total : recordOf(data.info).total) as number;
  const candidates = (data.data as unknown[]).slice(0, SIZE);
  if (total > (page - 1) * SIZE && candidates.length === 0) throw new Error("upstream_schema");
  const normalized = candidates.map((item) => normalize(provider, item, source.fetchedAt)).filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  return { provider, status: items.length < candidates.length ? "partial" : "ready", items, page,
    hasMore: page < 20 && total > page * SIZE, total, fetchedAt: source.fetchedAt,
    message: "공식 API에서 공개 이용 표시와 이미지 출처를 확인한 자료만 표시합니다. 전체 건수는 권리 필터 적용 전 제공처 검색 건수이며, 초상·상표 등 기타 권리는 원문을 확인하세요." };
}
