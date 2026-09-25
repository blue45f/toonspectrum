import { parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";

import type { CreatorResource, ResourceProvider, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

type Request = (url: URL) => Promise<{ value: unknown; fetchedAt: string }>;
export type InternationalDiscoveryProvider = "smithsonian" | "wikimedia" | "europeana" | "dpla";

const SIZE = 12;
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const plain = (value: unknown, max = 1200): string => textOf(value, 20_000)
  .replace(/<[^>]*>/gu, " ")
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, max);
const count = (value: unknown): number => typeof value === "number"
  && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const firstText = (value: unknown, max = 300): string => Array.isArray(value)
  ? value.map((entry) => plain(entry, max)).find(Boolean) ?? ""
  : plain(value, max);
const joined = (value: unknown, max = 500): string => Array.isArray(value)
  ? value.map((entry) => typeof entry === "string" ? plain(entry, max) : plain(recordOf(entry).content, max))
    .filter(Boolean).join(", ").slice(0, max)
  : plain(value, max);

export function isInternationalDiscoveryProvider(value: unknown): value is InternationalDiscoveryProvider {
  return value === "smithsonian" || value === "wikimedia" || value === "europeana" || value === "dpla";
}

function cleanQuery(value: string): string {
  return value.normalize("NFKC").replace(/[\r\n\t]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 80);
}

export function smithsonianUrl(query: string, page: number, key: string): URL {
  const url = new URL("https://api.si.edu/openaccess/api/v1.0/search");
  url.search = new URLSearchParams({
    q: cleanQuery(query), rows: String(SIZE), start: String((page - 1) * SIZE), api_key: key,
  }).toString();
  return url;
}

export function europeanaUrl(query: string, page: number, key: string): URL {
  const url = new URL("https://api.europeana.eu/record/v2/search.json");
  url.search = new URLSearchParams({
    wskey: key, query: cleanQuery(query), rows: String(SIZE), start: String((page - 1) * SIZE + 1), profile: "minimal",
  }).toString();
  return url;
}

export function dplaUrl(query: string, page: number, key: string): URL {
  const url = new URL("https://api.dp.la/v2/items");
  url.search = new URLSearchParams({
    q: cleanQuery(query), page_size: String(SIZE), page: String(page), api_key: key,
  }).toString();
  return url;
}

function compactDay(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export function wikimediaUrl(article: string, now: number): URL {
  const normalized = cleanQuery(article).replace(/\s+/gu, "_");
  const today = new Date(now);
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const start = compactDay(new Date(midnight - 30 * 86_400_000));
  const end = compactDay(new Date(midnight - 86_400_000));
  const encoded = encodeURIComponent(normalized);
  return new URL(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ko.wikipedia/all-access/user/${encoded}/daily/${start}/${end}`);
}

export function validInternationalDiscoveryShape(url: URL, value: unknown): boolean {
  const root = recordOf(value);
  if (url.hostname === "api.si.edu" && url.pathname === "/openaccess/api/v1.0/search") {
    const response = recordOf(root.response);
    return root.status === 200 && root.responseCode === 1
      && count(response.rowCount) === response.rowCount
      && Array.isArray(response.rows) && response.rows.length <= SIZE;
  }
  if (url.hostname === "api.europeana.eu" && url.pathname === "/record/v2/search.json") {
    return root.success === true
      && count(root.itemsCount) === root.itemsCount
      && count(root.totalResults) === root.totalResults
      && Array.isArray(root.items) && root.items.length <= SIZE;
  }
  if (url.hostname === "api.dp.la" && url.pathname === "/v2/items") {
    return count(root.count) === root.count
      && count(root.start) === root.start
      && count(root.limit) === root.limit
      && Array.isArray(root.docs) && root.docs.length <= SIZE;
  }
  if (url.hostname === "wikimedia.org" && url.pathname.startsWith("/api/rest_v1/metrics/pageviews/per-article/")) {
    return Array.isArray(root.items) && root.items.length <= 31 && root.items.every((raw) => {
      const item = recordOf(raw);
      return item.project === "ko.wikipedia" && item.granularity === "daily"
        && typeof item.timestamp === "string" && /^\d{10}$/u.test(item.timestamp)
        && count(item.views) === item.views;
    });
  }
  return false;
}

function smithsonianTextList(value: unknown, key: string): string {
  return rows(recordOf(value)[key]).map((entry) => plain(recordOf(entry).content, 160)).filter(Boolean).join(", ").slice(0, 500);
}

function normalizeSmithsonian(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const content = recordOf(item.content);
  const descriptive = recordOf(content.descriptiveNonRepeating);
  const indexed = recordOf(content.indexedStructured);
  const id = textOf(item.id, 180);
  const objectId = textOf(item.url, 180);
  const title = plain(item.title, 300) || plain(recordOf(descriptive.title).content, 300);
  if (!id || !objectId || !title || /[^A-Za-z0-9:._-]/u.test(objectId)) return null;
  const dataSource = plain(descriptive.data_source, 180);
  const creator = smithsonianTextList(content.freetext, "name") || joined(indexed.name, 300);
  const objectType = joined(indexed.object_type, 180);
  const topic = joined(indexed.topic, 300);
  const place = joined(indexed.place, 180);
  const date = joined(indexed.date, 80);
  const metadataAccess = plain(recordOf(descriptive.metadata_usage).access, 40);
  return parseResource({
    id: `smithsonian:${id}`,
    provider: "smithsonian",
    title,
    creator,
    description: [dataSource, objectType, place, topic].filter(Boolean).join(" · "),
    sourceUrl: `https://www.si.edu/object/${encodeURIComponent(objectId)}`,
    credit: ["Smithsonian Open Access", dataSource].filter(Boolean).join(" · "),
    dateLabel: date,
    license: "metadata-only",
    rightsStatement: metadataAccess === "CC0"
      ? "Smithsonian 레코드 메타데이터 CC0 표시 · 미디어와 제3자 권리는 원문에서 별도 확인"
      : "Smithsonian 검색 메타데이터 · 미디어와 제3자 권리는 원문에서 별도 확인",
    termsReviewedAt: "2026-09-25",
    fetchedAt,
  });
}

function normalizeEuropeana(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const id = textOf(item.id, 240);
  const guid = textOf(item.guid, 2048);
  const title = firstText(item.title, 300);
  if (!id || !title || !guid.startsWith("https://www.europeana.eu/item/")) return null;
  const provider = firstText(item.dataProvider, 180) || firstText(item.provider, 180);
  const creator = joined(item.dcCreator, 300);
  const rights = firstText(item.rights, 500);
  const description = [
    provider,
    joined(item.type, 100) ? `유형 ${joined(item.type, 100)}` : "",
    joined(item.country, 140) ? `국가 ${joined(item.country, 140)}` : "",
    joined(item.dcDescription, 700),
    rights ? `권리 ${rights}` : "권리 원문 확인",
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `europeana:${encodeURIComponent(id).slice(0, 150)}`,
    provider: "europeana",
    title,
    creator,
    description,
    sourceUrl: guid,
    credit: ["Europeana", provider].filter(Boolean).join(" · "),
    dateLabel: firstText(item.year, 40),
    license: "metadata-only",
    rightsStatement: rights || "Europeana 메타데이터 검색 · 원 제공기관의 현재 권리 문구 확인",
    termsReviewedAt: "2026-09-25",
    fetchedAt,
  });
}

function normalizeDpla(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const source = recordOf(item.sourceResource);
  const provider = recordOf(item.provider);
  const id = textOf(item.id, 80);
  const title = firstText(source.title, 300);
  if (!id || !/^[A-Fa-f0-9]{32}$/u.test(id) || !title) return null;
  const providerName = firstText(provider.name, 200);
  const description = [
    providerName,
    joined(source.type, 100) ? `유형 ${joined(source.type, 100)}` : "",
    joined(source.spatial, 200) ? `장소 ${joined(source.spatial, 200)}` : "",
    joined(source.subject, 300) ? `주제 ${joined(source.subject, 300)}` : "",
    joined(source.description, 700),
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `dpla:${id.toLowerCase()}`,
    provider: "dpla",
    title,
    creator: joined(source.creator, 300),
    description,
    sourceUrl: `https://dp.la/item/${id.toLowerCase()}`,
    credit: ["DPLA", providerName].filter(Boolean).join(" · "),
    dateLabel: joined(source.date, 80),
    license: "metadata-only",
    rightsStatement: "DPLA 통합 메타데이터 · 원 제공기관의 현재 권리 문구와 에셋 조건 확인",
    termsReviewedAt: "2026-09-25",
    fetchedAt,
  });
}

function normalizeWikimedia(article: string, raw: unknown, fetchedAt: string): CreatorResource | null {
  const data = recordOf(raw);
  const items = rows(data.items).map(recordOf);
  if (!items.length) return null;
  const views = items.map((item) => count(item.views));
  const total = views.reduce((sum, value) => sum + value, 0);
  const peakIndex = views.reduce((best, value, index) => value > views[best] ? index : best, 0);
  const first = items[0];
  const last = items.at(-1) ?? first;
  const articleName = plain(first.article, 160) || cleanQuery(article).replace(/\s+/gu, "_");
  const start = textOf(first.timestamp, 10).slice(0, 8);
  const end = textOf(last.timestamp, 10).slice(0, 8);
  const day = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const peakDay = day(textOf(items[peakIndex].timestamp, 10).slice(0, 8));
  const sourceSlug = encodeURIComponent(articleName);
  return parseResource({
    id: `wikimedia:${sourceSlug.slice(0, 150)}`,
    provider: "wikimedia",
    title: `${articleName.replaceAll("_", " ")} · 최근 30일 백과 조회`,
    description: `총 ${total.toLocaleString("ko-KR")}회 · 일평균 ${Math.round(total / items.length).toLocaleString("ko-KR")}회 · 최고 ${peakDay} ${views[peakIndex].toLocaleString("ko-KR")}회. 백과 문서 조회 신호이며 독자 수·매출·작품 성공 가능성을 뜻하지 않습니다.`,
    sourceUrl: `https://ko.wikipedia.org/wiki/${sourceSlug}`,
    credit: "Wikimedia Pageviews API · ko.wikipedia",
    dateLabel: `${day(start)}–${day(end)}`,
    license: "metadata-only",
    rightsStatement: "집계 조회 통계 메타데이터 · 원문 내용과 미디어의 권리는 별도 확인",
    termsReviewedAt: "2026-09-25",
    fetchedAt,
  });
}

export async function internationalDiscoverySearch(
  provider: InternationalDiscoveryProvider,
  query: string,
  page: number,
  key: string,
  request: Request,
  now: number,
): Promise<ResourceSearchResult> {
  if (provider === "wikimedia" && page > 1) {
    return { provider, status: "ready", items: [], page, hasMore: false, fetchedAt: null, total: 0,
      message: "Wikimedia 관심 신호는 검색어별 최근 30일 집계 1건만 제공합니다." };
  }
  const url = provider === "smithsonian" ? smithsonianUrl(query, page, key)
    : provider === "europeana" ? europeanaUrl(query, page, key)
      : provider === "dpla" ? dplaUrl(query, page, key)
        : wikimediaUrl(query, now);
  const source = await request(url);
  if (!validInternationalDiscoveryShape(url, source.value)) throw new Error("upstream_schema");
  const root = recordOf(source.value);
  let candidates: unknown[];
  let total: number;
  let normalize: (raw: unknown, fetchedAt: string) => CreatorResource | null;
  let message: string;
  if (provider === "smithsonian") {
    const response = recordOf(root.response);
    candidates = rows(response.rows).slice(0, SIZE);
    total = count(response.rowCount);
    normalize = normalizeSmithsonian;
    message = "Smithsonian Open Access 검색 메타데이터입니다. 레코드의 CC0 메타데이터 표시와 별개로 이미지·3D·인물·상표 등 미디어 권리는 원문에서 다시 확인합니다.";
  } else if (provider === "europeana") {
    candidates = rows(root.items).slice(0, SIZE);
    total = count(root.totalResults);
    normalize = normalizeEuropeana;
    message = "Europeana 통합검색 메타데이터입니다. 에셋 이용 범위는 각 원 제공기관의 현재 rights statement를 최종 기준으로 합니다.";
  } else if (provider === "dpla") {
    candidates = rows(root.docs).slice(0, SIZE);
    total = count(root.count);
    normalize = normalizeDpla;
    message = "DPLA 통합검색 메타데이터입니다. 이미지·원문은 직접 가져오지 않으며 원 제공기관의 현재 권리와 이용조건을 확인합니다.";
  } else {
    const item = normalizeWikimedia(query, root, source.fetchedAt);
    return {
      provider, status: item ? "ready" : "partial", items: item ? [item] : [], page,
      hasMore: false, total: item ? 1 : 0, fetchedAt: source.fetchedAt,
      message: "한국어 위키백과 문서의 최근 30일 조회 추이입니다. 검색 관심 참고 신호로만 사용하며 사실 검증·독자 수·매출과 합산하지 않습니다.",
    };
  }
  const normalized = candidates.map((item) => normalize(item, source.fetchedAt))
    .filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  return {
    provider: provider as ResourceProvider,
    status: items.length < candidates.length ? "partial" : "ready",
    items,
    page,
    hasMore: page < 20 && total > page * SIZE,
    total,
    fetchedAt: source.fetchedAt,
    message,
  };
}
