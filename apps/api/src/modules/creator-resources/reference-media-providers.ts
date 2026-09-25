import { httpsUrl, parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";

import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

export type ReferenceMediaProvider = "nasa" | "vam";
type Request = (url: URL) => Promise<{ value: unknown; fetchedAt: string }>;

const SIZE = 12;
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const count = (value: unknown): number => typeof value === "number"
  && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const plain = (value: unknown, max = 1200) => textOf(value, 20000)
  .replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);

export function isReferenceMediaProvider(value: unknown): value is ReferenceMediaProvider {
  return value === "nasa" || value === "vam";
}

export function referenceMediaUrl(provider: ReferenceMediaProvider, query: string, page: number): URL {
  if (provider === "nasa") {
    const url = new URL("https://images-api.nasa.gov/search");
    url.search = new URLSearchParams({ q: query, media_type: "image", page: String(page), page_size: String(SIZE) }).toString();
    return url;
  }
  const url = new URL("https://api.vam.ac.uk/v2/objects/search");
  url.search = new URLSearchParams({ q: query, page: String(page), page_size: String(SIZE), images_exist: "1" }).toString();
  return url;
}
export function validReferenceMediaShape(url: URL, value: unknown): boolean {
  const data = recordOf(value);
  if (url.hostname === "images-api.nasa.gov" && url.pathname === "/search") {
    const collection = recordOf(data.collection);
    return Array.isArray(collection.items)
      && count(recordOf(collection.metadata).total_hits) === recordOf(collection.metadata).total_hits;
  }
  if (url.hostname === "api.vam.ac.uk" && url.pathname === "/v2/objects/search") {
    return Array.isArray(data.records)
      && count(recordOf(data.info).record_count) === recordOf(data.info).record_count;
  }
  return false;
}

function nasaResource(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const data = recordOf(rows(item.data)[0]);
  const nasaId = textOf(data.nasa_id, 160);
  const title = plain(data.title, 300);
  if (!/^[A-Za-z0-9._-]{1,160}$/u.test(nasaId) || !title || data.media_type !== "image") return null;
  const preview = rows(item.links).map(recordOf).find((link) => link.rel === "preview" && link.render === "image")
    ?? rows(item.links).map(recordOf).find((link) => link.render === "image");
  const imageUrl = httpsUrl(recordOf(preview).href, ["images-assets.nasa.gov"]);
  if (!imageUrl) return null;
  const keywords = rows(data.keywords).map((value) => plain(value, 80)).filter(Boolean).slice(0, 10);
  const center = plain(data.center, 100);
  return parseResource({
    id: `nasa:${nasaId}`, provider: "nasa", title,
    creator: plain(data.secondary_creator, 300) || center,
    description: [plain(data.description), keywords.length ? `키워드 ${keywords.join(", ")}` : ""].filter(Boolean).join(" · "),
    sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
    imageUrl, credit: ["NASA Images", center].filter(Boolean).join(" · "),
    dateLabel: textOf(data.date_created, 10), license: "reference-only", fetchedAt,
  });
}
function vamResource(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const systemNumber = textOf(item.systemNumber, 120);
  const title = plain(item._primaryTitle, 300) || plain(item.objectType, 300);
  if (!/^[A-Za-z0-9._-]{1,120}$/u.test(systemNumber) || !title) return null;
  const images = recordOf(item._images);
  const imageUrl = httpsUrl(images._primary_thumbnail, ["framemark.vam.ac.uk"]);
  if (!imageUrl) return null;
  const maker = recordOf(item._primaryMaker);
  const makerName = plain(maker.name, 200);
  const makerRole = plain(maker.association, 100);
  const description = [
    plain(item.objectType, 160), plain(item._primaryPlace, 160),
    makerRole ? `역할 ${makerRole}` : "", textOf(item.accessionNumber, 100) ? `소장번호 ${textOf(item.accessionNumber, 100)}` : "",
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `vam:${systemNumber}`, provider: "vam", title,
    creator: makerName, description,
    sourceUrl: `https://collections.vam.ac.uk/item/${systemNumber}/`,
    imageUrl, credit: "Victoria and Albert Museum, London",
    dateLabel: plain(item._primaryDate, 100), license: "reference-only", fetchedAt,
  });
}

export async function referenceMediaSearch(
  provider: ReferenceMediaProvider,
  query: string,
  page: number,
  request: Request,
): Promise<ResourceSearchResult> {
  const url = referenceMediaUrl(provider, query, page);
  const source = await request(url);
  if (!validReferenceMediaShape(url, source.value)) throw new Error("upstream_schema");
  const root = recordOf(source.value);
  const collection = recordOf(root.collection);
  const candidates = (provider === "nasa" ? rows(collection.items) : rows(root.records)).slice(0, SIZE);
  const total = provider === "nasa" ? count(recordOf(collection.metadata).total_hits) : count(recordOf(root.info).record_count);
  if (total > (page - 1) * SIZE && candidates.length === 0) throw new Error("upstream_schema");
  const normalized = candidates
    .map((item) => provider === "nasa" ? nasaResource(item, source.fetchedAt) : vamResource(item, source.fetchedAt))
    .filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  const message = provider === "nasa"
    ? "NASA Images의 공식 이미지 메타데이터와 안전한 미리보기를 제공합니다. NASA 표장·인물·제3자 권리는 별도 정책을 확인하고 원본을 직접 재배포하지 않습니다."
    : "V&A Collections API의 소장품 메타데이터와 미리보기입니다. 이미지 이용 조건은 작품별 원문과 V&A 약관을 다시 확인하며 Studio 직접 가져오기는 차단합니다.";
  return {
    provider,
    status: items.length < candidates.length ? "partial" : "ready",
    items,
    page,
    hasMore: page < 20 && total > page * SIZE,
    total,
    fetchedAt: source.fetchedAt,
    message,
  };
}
