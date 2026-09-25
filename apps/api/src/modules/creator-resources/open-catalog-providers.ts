import { parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";

import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

export type OpenCatalogProvider = "musicbrainz" | "internetarchive";
type Request = (url: URL) => Promise<{ value: unknown; fetchedAt: string }>;

const SIZE = 12;
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const plain = (value: unknown, max = 1200) => textOf(value, 20000)
  .replace(/<[^>]*>/gu, " ")
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, max);
const count = (value: unknown): number => typeof value === "number"
  && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function isOpenCatalogProvider(value: unknown): value is OpenCatalogProvider {
  return value === "musicbrainz" || value === "internetarchive";
}
function cleanQuery(query: string): string {
  return query
    .normalize("NFKC")
    .replace(/["\\]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);
}

export function openCatalogUrl(provider: OpenCatalogProvider, query: string, page: number): URL {
  const cleaned = cleanQuery(query);
  if (provider === "musicbrainz") {
    const url = new URL("https://musicbrainz.org/ws/2/artist/");
    url.search = new URLSearchParams({
      query: `artist:${cleaned}`,
      fmt: "json",
      limit: String(SIZE),
      offset: String((page - 1) * SIZE),
    }).toString();
    return url;
  }
  const url = new URL("https://archive.org/advancedsearch.php");
  const params = new URLSearchParams({
    q: cleaned,
    rows: String(SIZE),
    page: String(page),
    output: "json",
  });
  for (const field of [
    "identifier", "title", "creator", "date", "description",
    "mediatype", "language", "subject",
  ]) {
    params.append("fl[]", field);
  }
  params.append("sort[]", "downloads desc");
  url.search = params.toString();
  return url;
}

export function validOpenCatalogShape(url: URL, value: unknown): boolean {
  const root = recordOf(value);
  if (url.hostname === "musicbrainz.org" && url.pathname === "/ws/2/artist/") {
    return count(root.count) === root.count
      && count(root.offset) === root.offset
      && Array.isArray(root.artists)
      && root.artists.length <= SIZE;
  }
  if (url.hostname === "archive.org" && url.pathname === "/advancedsearch.php") {
    const header = recordOf(root.responseHeader);
    const response = recordOf(root.response);
    return header.status === 0
      && count(response.numFound) === response.numFound
      && count(response.start) === response.start
      && Array.isArray(response.docs)
      && response.docs.length <= SIZE;
  }
  return false;
}
function joined(value: unknown, max = 500): string {
  if (Array.isArray(value)) {
    return value.map((entry) => plain(entry, max)).filter(Boolean).join(", ").slice(0, max);
  }
  return plain(value, max);
}

function normalizeArtist(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const id = textOf(item.id, 80);
  const name = plain(item.name, 300);
  if (!id || id.length !== 36 || !name) return null;
  const life = recordOf(item["life-span"]);
  const lifespan = [plain(life.begin, 20), plain(life.end, 20)].filter(Boolean).join("–");
  const description = [
    plain(item.type, 80),
    plain(item.country, 20) ? `국가 ${plain(item.country, 20)}` : "",
    lifespan ? `활동 기간 ${lifespan}` : "",
    plain(item.disambiguation, 300),
    typeof item.score === "number" ? `검색 일치도 ${item.score}` : "",
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `musicbrainz:${id}`,
    provider: "musicbrainz",
    title: name,
    description,
    sourceUrl: `https://musicbrainz.org/artist/${id}`,
    credit: "MusicBrainz artist metadata",
    dateLabel: plain(life.begin, 20),
    license: "metadata-only",
    fetchedAt,
  });
}
function normalizeArchiveItem(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const identifier = textOf(item.identifier, 200);
  const title = joined(item.title, 300);
  if (!identifier || !title || /[^A-Za-z0-9._-]/u.test(identifier)) return null;
  const creator = joined(item.creator, 300);
  const mediaType = joined(item.mediatype, 80);
  const language = joined(item.language, 120);
  const subjects = joined(item.subject, 300);
  const description = [
    mediaType ? `유형 ${mediaType}` : "",
    language ? `언어 ${language}` : "",
    subjects ? `주제 ${subjects}` : "",
    joined(item.description, 700),
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `internetarchive:${identifier}`,
    provider: "internetarchive",
    title,
    creator,
    description,
    sourceUrl: `https://archive.org/details/${identifier}`,
    credit: "Internet Archive item metadata · 항목별 권리 확인",
    dateLabel: joined(item.date, 40),
    license: "metadata-only",
    fetchedAt,
  });
}
export async function openCatalogSearch(
  provider: OpenCatalogProvider,
  query: string,
  page: number,
  request: Request,
): Promise<ResourceSearchResult> {
  const url = openCatalogUrl(provider, query, page);
  const source = await request(url);
  if (!validOpenCatalogShape(url, source.value)) throw new Error("upstream_schema");
  const root = recordOf(source.value);
  const response = recordOf(root.response);
  const candidates = provider === "musicbrainz"
    ? rows(root.artists).slice(0, SIZE)
    : rows(response.docs).slice(0, SIZE);
  const total = provider === "musicbrainz" ? count(root.count) : count(response.numFound);
  const normalized = candidates
    .map((item) => provider === "musicbrainz"
      ? normalizeArtist(item, source.fetchedAt)
      : normalizeArchiveItem(item, source.fetchedAt))
    .filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  const message = provider === "musicbrainz"
    ? "MusicBrainz의 음악가 메타데이터입니다. 음원 파일이나 음악 사용 허가를 제공하지 않으며 작품 BGM 사용 권리는 별도로 확인해야 합니다."
    : "Internet Archive의 항목 메타데이터와 원문 링크입니다. 컬렉션·파일마다 권리가 다르므로 이 화면에서는 파일을 직접 가져오지 않습니다.";
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
