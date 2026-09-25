import { httpsUrl, parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";

import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

type Request = (url: URL) => Promise<{ value: unknown; fetchedAt: string }>;

const SIZE = 12;
const TYPES = ["material", "hdri", "decal", "atlas", "3d-model", "terrain"] as const;
const INCLUDE = [
  "type", "releaseDate", "shortDescription", "title", "url", "tags",
  "dimensions", "downloadStatistics", "technique", "thumbnails",
].join(",");

const KEYWORDS: Record<string, string> = {
  건축: "architecture", 건물: "building", 거리: "street", 도시: "city", 방: "room",
  가구: "furniture", 의자: "chair", 탁자: "table", 나무: "wood", 돌: "stone",
  금속: "metal", 벽: "wall", 바닥: "floor", 하늘: "sky", 해변: "beach",
  바다: "sea", 숲: "forest", 산: "mountain", 공장: "industrial", 자동차: "car",
  천: "fabric", 가죽: "leather", 흙: "ground", 잔디: "grass", 벽돌: "brick",
};

const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const plain = (value: unknown, max = 1200) => textOf(value, 20000)
  .replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
const safeCount = (value: unknown): number => typeof value === "number"
  && Number.isSafeInteger(value) && value >= 0 ? value : 0;

const TYPE_LABELS: Record<string, string> = {
  material: "PBR 재질", hdri: "HDRI", decal: "데칼", atlas: "아틀라스",
  "3d-model": "3D 모델", terrain: "지형",
};

export function ambientCgUrl(query: string, page: number): URL {
  const localized = query.normalize("NFKC").trim().split(/\s+/u)
    .map((term) => KEYWORDS[term] ?? term).join(" ");
  const url = new URL("https://ambientcg.com/api/v3/assets");
  url.search = new URLSearchParams({
    q: localized,
    type: TYPES.join(","),
    sort: "popular",
    limit: String(SIZE),
    offset: String((page - 1) * SIZE),
    include: INCLUDE,
  }).toString();
  return url;
}

export function validAmbientCgShape(url: URL, value: unknown): boolean {
  if (url.hostname !== "ambientcg.com" || url.pathname !== "/api/v3/assets") return false;
  const data = recordOf(value);
  return safeCount(data.totalResults) === data.totalResults
    && Array.isArray(data.assets)
    && data.assets.length <= SIZE;
}
function normalize(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const id = textOf(item.id, 160);
  const title = plain(item.title, 300);
  const type = textOf(item.type, 40);
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(id) || !title || !TYPE_LABELS[type]) return null;
  const thumbnails = recordOf(item.thumbnails);
  const imageUrl = httpsUrl(
    thumbnails["512-WEBP"] ?? thumbnails["512-PNG"] ?? thumbnails["256-WEBP"],
    ["acg-media.struffelproductions.com"],
  );
  if (!imageUrl) return null;
  const sourceUrl = httpsUrl(item.url, ["ambientcg.com", "www.ambientcg.com"])
    || `https://ambientcg.com/a/${id}`;
  const tags = rows(item.tags).map((tag) => plain(tag, 60)).filter(Boolean).slice(0, 12);
  const dimensions = recordOf(item.dimensions);
  const size = [dimensions.width, dimensions.height, dimensions.depth]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const downloads = safeCount(recordOf(item.downloadStatistics).total);
  const metadata = [
    TYPE_LABELS[type], plain(item.technique, 100),
    size.length ? `크기 ${size.join(" × ")}` : "",
    downloads ? `다운로드 ${downloads.toLocaleString("en-US")}` : "",
    tags.length ? `태그 ${tags.join(", ")}` : "",
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `ambientcg:${id}`, provider: "ambientcg", title,
    creator: "ambientCG contributors", description: [plain(item.shortDescription), metadata].filter(Boolean).join(" · "),
    sourceUrl, imageUrl, credit: "ambientCG · CC0",
    dateLabel: textOf(item.releaseDate, 30), license: "CC0", fetchedAt,
  });
}
export async function ambientCgSearch(
  query: string,
  page: number,
  request: Request,
): Promise<ResourceSearchResult> {
  const url = ambientCgUrl(query, page);
  const source = await request(url);
  if (!validAmbientCgShape(url, source.value)) throw new Error("upstream_schema");
  const data = recordOf(source.value);
  const candidates = rows(data.assets).slice(0, SIZE);
  const total = safeCount(data.totalResults);
  if (total > (page - 1) * SIZE && candidates.length === 0) throw new Error("upstream_schema");
  const normalized = candidates
    .map((item) => normalize(item, source.fetchedAt))
    .filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  return {
    provider: "ambientcg",
    status: items.length < candidates.length ? "partial" : "ready",
    items,
    page,
    hasMore: page < 20 && total > page * SIZE,
    total,
    fetchedAt: source.fetchedAt,
    message: "ambientCG API v3의 CC0 재질·HDRI·데칼·3D 모델·지형을 검색합니다. 미리보기와 메타데이터를 저장하고 실제 파일 포맷·해상도·의존성은 원문에서 확인하세요.",
  };
}
