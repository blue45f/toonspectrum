import { httpsUrl, parseResource, recordOf, textOf } from "../../../../web/src/shared/lib/creator-resources";
import type { CreatorResource, ResourceSearchResult } from "../../../../web/src/shared/lib/creator-resources";

type Request = (url: URL, headers?: Record<string, string>) => Promise<{ value: unknown; fetchedAt: string }>;
const SIZE = 12;
const TYPES = ["hdris", "textures", "models"] as const;
const KEYWORDS: Record<string, string> = {
  건축: "architecture", 건물: "building", 거리: "street", 도시: "city", 방: "room", 가구: "furniture",
  의자: "chair", 탁자: "table", 나무: "wood", 돌: "stone", 금속: "metal", 벽: "wall", 바닥: "floor",
  하늘: "sky", 해변: "beach", 바다: "sea", 숲: "forest", 산: "mountain", 공장: "industrial", 자동차: "car",
};
const typeLabel = (value: unknown) => value === 0 ? "HDRI" : value === 1 ? "텍스처" : value === 2 ? "3D 모델" : "에셋";
const plain = (value: unknown, max = 1200) => textOf(value, 20000).replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const safeCount = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function validPolyHavenShape(url: URL, value: unknown): boolean {
  if (url.hostname !== "api.polyhaven.com" || url.pathname !== "/assets") return false;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([id, item]) =>
    /^[A-Za-z0-9_-]{1,160}$/u.test(id) && item !== null && typeof item === "object" && !Array.isArray(item));
}

export function polyHavenUrl(type: typeof TYPES[number]): URL {
  const url = new URL("https://api.polyhaven.com/assets");
  url.searchParams.set("type", type);
  return url;
}

function normalize(id: string, raw: unknown, fetchedAt: string): CreatorResource | null {
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(id)) return null;
  const item = recordOf(raw);
  const title = plain(item.name, 300);
  const imageUrl = httpsUrl(item.thumbnail_url, ["cdn.polyhaven.com"]);
  if (!title || !imageUrl || ![0, 1, 2].includes(Number(item.type))) return null;
  const authors = Object.keys(recordOf(item.authors)).map((value) => plain(value, 100)).filter(Boolean).slice(0, 8);
  const tags = rows(item.tags).map((value) => plain(value, 80)).filter(Boolean).slice(0, 12);
  const resolution = rows(item.max_resolution).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const maximum = resolution.length ? Math.max(...resolution) : 0;
  const polycount = safeCount(item.polycount);
  const metadata = [
    typeLabel(item.type),
    plain(item.category, 240),
    maximum ? `최대 ${maximum >= 1024 ? `${Math.round(maximum / 1024)}K` : maximum}` : "",
    polycount ? `폴리곤 ${polycount.toLocaleString("en-US")}` : "",
    tags.length ? `태그 ${tags.join(", ")}` : "",
  ].filter(Boolean).join(" · ");
  const published = typeof item.date_published === "number" && Number.isFinite(item.date_published) && item.date_published > 0
    ? new Date(item.date_published * 1000).toISOString().slice(0, 10) : "";
  return parseResource({
    id: `polyhaven:${id}`,
    provider: "polyhaven",
    title,
    creator: authors.join(", "),
    description: [plain(item.description, 750), metadata].filter(Boolean).join(" · "),
    sourceUrl: `https://polyhaven.com/a/${id}`,
    imageUrl,
    credit: `Poly Haven${authors.length ? ` · ${authors.join(", ")}` : ""}`,
    dateLabel: published,
    license: "CC0",
    fetchedAt,
  });
}

function searchTerms(query: string): string[] {
  return query.normalize("NFKC").trim().split(/\s+/u).filter(Boolean)
    .map((term) => (KEYWORDS[term] ?? term).toLocaleLowerCase("en-US"));
}

export async function polyHavenSearch(query: string, page: number, request: Request): Promise<ResourceSearchResult> {
  const settled = await Promise.allSettled(TYPES.map(async (type) => {
    const url = polyHavenUrl(type);
    const source = await request(url);
    if (!validPolyHavenShape(url, source.value)) throw new Error("upstream_schema");
    return source;
  }));
  const sources = settled.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
  if (!sources.length) throw new Error("upstream_response");
  const terms = searchTerms(query);
  const candidates = sources.flatMap((source) => Object.entries(recordOf(source.value)).map(([id, item]) => ({ id, item, fetchedAt: source.fetchedAt })));
  const matched = candidates.filter(({ id, item }) => {
    const record = recordOf(item);
    const haystack = [
      id, record.name, record.description, record.category, typeLabel(record.type),
      ...rows(record.tags), ...Object.keys(recordOf(record.authors)),
    ].map((value) => plain(value, 1200)).join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
    return terms.every((term) => haystack.includes(term));
  }).sort((a, b) => safeCount(recordOf(b.item).download_count) - safeCount(recordOf(a.item).download_count) || a.id.localeCompare(b.id));
  const offset = (page - 1) * SIZE;
  const items = matched.slice(offset, offset + SIZE).map(({ id, item, fetchedAt }) => normalize(id, item, fetchedAt)).filter((item): item is CreatorResource => item !== null);
  return {
    provider: "polyhaven",
    status: sources.length === TYPES.length && items.length === Math.min(SIZE, Math.max(0, matched.length - offset)) ? "ready" : "partial",
    items,
    page,
    hasMore: page < 20 && matched.length > page * SIZE,
    total: matched.length,
    fetchedAt: sources[0]?.fetchedAt ?? null,
    message: `Poly Haven의 CC0 HDRI·텍스처·3D 모델을 메타데이터로 검색합니다. 라이브 API 출처를 표시하며 실제 파일 크기·포맷·의존성은 원문에서 확인하세요.${sources.length < TYPES.length ? " 일부 에셋 유형은 현재 응답하지 않았습니다." : ""}`,
  };
}
