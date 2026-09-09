import { providerAvailability, upstreamRetrySeconds } from "../../../../web/src/shared/lib/creator-resource-workflow";
import {
  httpsUrl, isProvider, parseDeadline, parseResource, recordOf, textOf,
} from "../../../../web/src/shared/lib/creator-resources";
import {
  isReferenceSearchField,
  MET_DEPARTMENT_IDS,
} from "../../../../web/src/shared/lib/reference-assets";

import type { CreatorResource, ResourceProvider, ResourceSearchResult } from "../../../../web/src/shared/lib/creator-resources";
import type { ReferenceSearchField } from "../../../../web/src/shared/lib/reference-assets";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export interface ResourceEngineOptions {
  fetch: Fetcher;
  env: () => Record<string, string | undefined>;
  now?: () => number;
}
export class ResourceInputError extends Error {}
export class ResourceBusyError extends Error {}
const PAGE_SIZE = 12;
const MAX_BODY = 2 * 1024 * 1024;
const MAX_CACHE = 256;
const LIMIT = 20;
const USER_AGENT = "ToonSpectrum/1.0 (+https://www.toonstudio.cloud/about/crawler; blue45f@gmail.com)";
const PROVIDER_KEY: Record<ResourceProvider, string> = {
  met: "",
  openlibrary: "",
  openbd: "",
  kakao: "KAKAO_REST_API_KEY",
  bizinfo: "BIZINFO_API_KEY",
};

interface MetSearchFilters {
  field: ReferenceSearchField;
  departmentId: string;
  medium: string;
  geoLocation: string;
  dateBegin?: number;
  dateEnd?: number;
  isHighlight: boolean;
}

function plainText(value: unknown, max = 1200): string {
  return textOf(value, 20000).replace(/<[^>]*>/gu, " ").replace(/&(nbsp|amp|lt|gt|quot);/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
}
function bizinfoLink(value: unknown): string {
  const raw = textOf(value, 2048);
  return raw.startsWith("/") && !raw.startsWith("//") ? new URL(raw, "https://www.bizinfo.go.kr").href : raw;
}
function rowsOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function validIsbn10(value: string): boolean {
  if (!/^\d{9}[\dX]$/u.test(value)) return false;
  const total = [...value].reduce((sum, digit, index) => sum + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0);
  return total % 11 === 0;
}
function validIsbn13(value: string): boolean {
  if (!/^\d{13}$/u.test(value)) return false;
  const total = [...value].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return total % 10 === 0;
}
function normalizeIsbn(value: unknown): string {
  const normalized = textOf(value, 100).replace(/[^0-9Xx]/gu, "").toUpperCase();
  return validIsbn10(normalized) || validIsbn13(normalized) ? normalized : "";
}
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function validUpstreamShape(url: URL, value: unknown): boolean {
  if (url.hostname === "api.openbd.jp") return Array.isArray(value);
  const shape = recordOf(value);
  if (url.hostname === "openlibrary.org") {
    const total = finiteNumber(shape.numFound) ?? finiteNumber(shape.num_found);
    return total !== null && total >= 0 && Array.isArray(shape.docs);
  }
  if (url.hostname === "www.bizinfo.go.kr") {
    return Array.isArray(shape.jsonArray) || Array.isArray(recordOf(shape.jsonArray).item);
  }
  if (url.hostname === "dapi.kakao.com") {
    return Array.isArray(shape.documents) && typeof recordOf(shape.meta).is_end === "boolean";
  }
  if (url.hostname === "collectionapi.metmuseum.org" && url.pathname.endsWith("/search")) {
    return typeof shape.total === "number"
      && Number.isSafeInteger(shape.total)
      && shape.total >= 0
      && (Array.isArray(shape.objectIDs) || shape.objectIDs === null);
  }
  if (url.hostname === "collectionapi.metmuseum.org" && url.pathname.includes("/objects/")) {
    return typeof shape.objectID === "number" && typeof shape.isPublicDomain === "boolean";
  }
  return false;
}
function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
function optionalInputText(input: Record<string, unknown>, key: string, maximumLength = 80): string {
  const value = input[key];
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > maximumLength || containsControlCharacter(value)) {
    throw new ResourceInputError("검색 필터 형식이 올바르지 않습니다.");
  }
  const trimmed = value.trim();
  if (trimmed.length < 2) throw new ResourceInputError("검색 필터는 2자 이상 입력하세요.");
  return trimmed;
}
function optionalInputYear(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined || value === "") return undefined;
  if ((typeof value !== "string" && typeof value !== "number") || String(value).length > 6) {
    throw new ResourceInputError("연대 필터 형식이 올바르지 않습니다.");
  }
  const year = Number(value);
  if (!Number.isInteger(year) || year < -10000 || year > 3000) {
    throw new ResourceInputError("연대는 기원전 10000년부터 서기 3000년 사이의 정수로 입력하세요.");
  }
  return year;
}
function parseMetFilters(input: Record<string, unknown>): MetSearchFilters {
  const rawField = input.field ?? "all";
  if (typeof rawField !== "string" || !isReferenceSearchField(rawField)) {
    throw new ResourceInputError("지원하지 않는 검색 범위입니다.");
  }
  const departmentId = input.departmentId === undefined || input.departmentId === ""
    ? ""
    : typeof input.departmentId === "string"
      ? input.departmentId.trim()
      : "";
  if (input.departmentId !== undefined && input.departmentId !== "" && !MET_DEPARTMENT_IDS.has(departmentId)) {
    throw new ResourceInputError("지원하지 않는 Met 부서입니다.");
  }
  const dateBegin = optionalInputYear(input, "dateBegin");
  const dateEnd = optionalInputYear(input, "dateEnd");
  if ((dateBegin === undefined) !== (dateEnd === undefined)) {
    throw new ResourceInputError("연대 범위는 시작 연도와 종료 연도를 함께 입력하세요.");
  }
  if (dateBegin !== undefined && dateEnd !== undefined && dateBegin > dateEnd) {
    throw new ResourceInputError("시작 연도는 종료 연도보다 늦을 수 없습니다.");
  }
  const rawHighlight = input.isHighlight;
  if (rawHighlight !== undefined && rawHighlight !== "" && rawHighlight !== "true" && rawHighlight !== "false" && rawHighlight !== true && rawHighlight !== false) {
    throw new ResourceInputError("대표작 필터 형식이 올바르지 않습니다.");
  }
  return {
    field: rawField,
    departmentId,
    medium: optionalInputText(input, "medium"),
    geoLocation: optionalInputText(input, "geoLocation"),
    ...(dateBegin !== undefined ? { dateBegin } : {}),
    ...(dateEnd !== undefined ? { dateEnd } : {}),
    isHighlight: rawHighlight === "true" || rawHighlight === true,
  };
}
async function limitedJson(response: Response): Promise<unknown> {
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.toLowerCase().includes("json")) { await response.body?.cancel(); throw new Error("upstream_response"); }
  const size = Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && size > MAX_BODY) { await response.body?.cancel(); throw new Error("upstream_size"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("upstream_body");
  let bytes = 0; let output = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY) throw new Error("upstream_size");
      output += decoder.decode(chunk.value, { stream: true });
    }
    output += decoder.decode();
    return JSON.parse(output) as unknown;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export function createResourceEngine(options: ResourceEngineOptions) {
  const now = options.now ?? Date.now;
  const cache = new Map<string, { until: number; value: unknown; fetchedAt: string; bytes: number }>();
  const pending = new Map<string, Promise<{ value: unknown; fetchedAt: string }>>();
  const cooldowns = new Map<string, number>();
  const clients = new Map<string, { until: number; count: number }>();
  let active = 0; let budgetStart = 0; let budget = 0; let cacheBytes = 0;
  function removeCached(key: string) {
    const previous = cache.get(key);
    if (previous) cacheBytes -= previous.bytes;
    cache.delete(key);
  }
  function takeClient(clientId: string) {
    const time = now();
    for (const [key, value] of clients) if (value.until <= time) clients.delete(key);
    const key = clientId.slice(0, 100);
    const current = clients.get(key);
    if (current) {
      if (current.count >= LIMIT) throw new ResourceBusyError("요청이 많습니다. 1분 후 다시 검색하세요.");
      current.count += 1;
    } else {
      if (clients.size >= 500) throw new ResourceBusyError("검색이 혼잡합니다. 잠시 후 다시 검색하세요.");
      clients.set(key, { until: time + 60000, count: 1 });
    }
  }
  async function request(url: URL, headers: Record<string, string> = {}) {
    // Keys only exist in the outbound URL/header. Never return/log URL, headers or upstream errors.
    const identity = url.origin + url.pathname + "?" + [...url.searchParams].filter(([key]) => key !== "crtfcKey").map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
    const time = now();
    const hit = cache.get(identity);
    if (hit && hit.until > time) return hit;
    removeCached(identity);
    const running = pending.get(identity);
    if (running) return running;
    if ((cooldowns.get(url.hostname) ?? 0) > time) throw new Error("upstream_cooldown");
    if (active >= 6) throw new Error("upstream_busy");
    if (time - budgetStart >= 60000) { budgetStart = time; budget = 0; }
    if (budget >= 120) throw new Error("upstream_budget");
    budget += 1; active += 1;
    const task = (async () => {
      const response = await options.fetch(url.href, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(6000),
        redirect: "error",
        credentials: "omit",
      });
      if (response.status === 429 || response.status === 503) {
        cooldowns.set(url.hostname, now() + upstreamRetrySeconds(response.headers.get("retry-after"), now()) * 1000);
        await response.body?.cancel();
        throw new Error("upstream_cooldown");
      }
      const value = await limitedJson(response);
      if (!validUpstreamShape(url, value)) throw new Error("upstream_schema");
      const fetchedAt = new Date(now()).toISOString();
      const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
      while (cache.size > 0 && (cache.size >= MAX_CACHE || cacheBytes + bytes > 8 * 1024 * 1024)) removeCached(cache.keys().next().value as string);
      cacheBytes += bytes;
      cache.set(identity, { value, fetchedAt, bytes, until: now() + 300000 });
      return { value, fetchedAt };
    })().finally(() => { active -= 1; pending.delete(identity); });
    pending.set(identity, task);
    return task;
  }

  async function met(query: string, page: number, filters: MetSearchFilters): Promise<ResourceSearchResult> {
    const url = new URL("https://collectionapi.metmuseum.org/public/collection/v1.1/search");
    const search = new URLSearchParams({
      q: query,
      hasImages: "true",
      offset: String((page - 1) * PAGE_SIZE),
      limit: String(PAGE_SIZE),
    });
    if (filters.field === "title") search.set("title", "true");
    if (filters.field === "tags") search.set("tags", "true");
    if (filters.field === "artistCulture") search.set("artistOrCulture", "true");
    if (filters.departmentId) search.set("departmentId", filters.departmentId);
    if (filters.medium) search.set("medium", filters.medium);
    if (filters.geoLocation) search.set("geoLocation", filters.geoLocation);
    if (filters.dateBegin !== undefined && filters.dateEnd !== undefined) {
      search.set("dateBegin", String(filters.dateBegin));
      search.set("dateEnd", String(filters.dateEnd));
    }
    if (filters.isHighlight) search.set("isHighlight", "true");
    url.search = search.toString();
    const source = await request(url);
    const data = recordOf(source.value);
    if (typeof data.total !== "number" || !Number.isFinite(data.total) || (data.objectIDs !== null && !Array.isArray(data.objectIDs))) throw new Error("upstream_schema");
    const ids = [...new Set(rowsOf(data.objectIDs).filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0 && id < 1000000000))].slice(0, PAGE_SIZE);
    if (data.total > (page - 1) * PAGE_SIZE && ids.length === 0) throw new Error("upstream_schema");
    const items: CreatorResource[] = [];
    let failed = 0;
    // Three detail requests at a time. Unknown rights are excluded even when hasImages=true.
    for (let offset = 0; offset < ids.length; offset += 3) {
      const group = await Promise.all(ids.slice(offset, offset + 3).map(async (id) => {
        try {
          const detail = await request(new URL(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`));
          const item = recordOf(detail.value);
          if (item.objectID !== id || typeof item.isPublicDomain !== "boolean") throw new Error("upstream_schema");
          if (item.isPublicDomain !== true || textOf(item.rightsAndReproduction)) return null;
          const imageUrl = httpsUrl(item.primaryImageSmall, ["images.metmuseum.org"]);
          if (!imageUrl) return null;
          const tags = rowsOf(item.tags)
            .map((tag) => plainText(recordOf(tag).term, 80))
            .filter(Boolean)
            .slice(0, 24);
          const additionalImageUrls = rowsOf(item.additionalImages)
            .map((image) => httpsUrl(image, ["images.metmuseum.org"]))
            .filter(Boolean)
            .slice(0, 8);
          return parseResource({
            id: `met:${id}`,
            provider: "met",
            title: item.title,
            creator: item.artistDisplayName,
            sourceUrl: item.objectURL,
            imageUrl,
            description: [item.culture, item.period, item.dynasty, item.objectName, item.medium]
              .map((value) => plainText(value, 300))
              .filter(Boolean)
              .join(" · "),
            license: "CC0",
            credit: item.creditLine,
            dateLabel: item.objectDate,
            fetchedAt: detail.fetchedAt,
            asset: {
              objectName: item.objectName,
              department: item.department,
              culture: item.culture,
              period: item.period,
              dynasty: item.dynasty,
              medium: item.medium,
              dimensions: item.dimensions,
              classification: item.classification,
              country: item.country,
              objectBeginDate: item.objectBeginDate,
              objectEndDate: item.objectEndDate,
              isHighlight: item.isHighlight === true,
              tags,
              originalImageUrl: httpsUrl(item.primaryImage, ["images.metmuseum.org"]),
              additionalImageUrls,
            },
          });
        } catch { failed += 1; return null; }
      }));
      items.push(...group.filter((item): item is CreatorResource => item !== null));
    }
    return {
      provider: "met",
      status: failed === ids.length && ids.length > 0 ? "unavailable" : failed ? "partial" : "ready",
      items,
      page,
      hasMore: page < 20 && data.total > page * PAGE_SIZE,
      fetchedAt: source.fetchedAt,
      total: data.total,
      message: failed
        ? "일부 작품의 공개 이용 조건이나 상세 정보를 확인하지 못했습니다. 검증된 결과만 표시합니다."
        : "검색 후보 중 공개 도메인, CC0 표시와 안전한 미리보기가 확인된 작품만 표시합니다.",
    };
  }

  async function openLibrary(query: string, page: number): Promise<ResourceSearchResult> {
    const url = new URL("https://openlibrary.org/search.json");
    url.search = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(PAGE_SIZE),
      fields: "key,title,author_name,first_publish_year,isbn,language,edition_count,publisher",
    }).toString();
    const source = await request(url);
    const data = recordOf(source.value);
    const total = finiteNumber(data.numFound) ?? finiteNumber(data.num_found) ?? 0;
    const items = rowsOf(data.docs).slice(0, PAGE_SIZE).map((raw) => {
      const item = recordOf(raw);
      const key = textOf(item.key, 120);
      if (!/^\/(?:works|books)\/[A-Za-z0-9._-]+$/u.test(key)) return null;
      const title = plainText(item.title, 300);
      if (!title) return null;
      const authors = rowsOf(item.author_name).map((author) => plainText(author, 100)).filter(Boolean).slice(0, 6);
      const publishers = rowsOf(item.publisher).map((publisher) => plainText(publisher, 120)).filter(Boolean).slice(0, 3);
      const languages = rowsOf(item.language).map((language) => textOf(language, 20)).filter(Boolean).slice(0, 4);
      const isbns = rowsOf(item.isbn).map(normalizeIsbn).filter(Boolean).slice(0, 3);
      const firstYear = finiteNumber(item.first_publish_year);
      const editionCount = finiteNumber(item.edition_count);
      const description = [
        firstYear ? `초판 ${Math.round(firstYear)}` : "",
        editionCount ? `확인 판본 ${Math.round(editionCount)}개` : "",
        languages.length ? `언어 ${languages.join(", ")}` : "",
      ].filter(Boolean).join(" · ");
      return parseResource({
        id: `openlibrary:${key.slice(key.lastIndexOf("/") + 1)}`,
        provider: "openlibrary",
        title,
        creator: authors.join(", "),
        description,
        sourceUrl: `https://openlibrary.org${key}`,
        credit: publishers.join(", "),
        dateLabel: firstYear ? String(Math.round(firstYear)) : "",
        isbn: isbns.join(" "),
        license: "metadata-only",
        fetchedAt: source.fetchedAt,
      });
    }).filter((item): item is CreatorResource => item !== null);
    return {
      provider: "openlibrary",
      status: "ready",
      items,
      page,
      hasMore: page < 20 && total > page * PAGE_SIZE,
      fetchedAt: source.fetchedAt,
      message: "Open Library의 사람 중심 저용량 검색 메타데이터입니다. 표지·원문 재배포 권한을 의미하지 않으며 대량 카탈로그 수집에는 공식 데이터 덤프를 사용해야 합니다.",
    };
  }

  async function openBd(query: string, page: number): Promise<ResourceSearchResult> {
    const isbn = normalizeIsbn(query);
    if (!isbn || page > 1) {
      return {
        provider: "openbd",
        status: "ready",
        items: [],
        page,
        hasMore: false,
        fetchedAt: null,
        message: "openBD는 일본 도서의 ISBN-10 또는 ISBN-13 정확 조회에 사용합니다.",
      };
    }
    const url = new URL("https://api.openbd.jp/v1/get");
    url.search = new URLSearchParams({ isbn }).toString();
    const source = await request(url);
    const rows = rowsOf(source.value);
    const raw = rows[0];
    if (!raw) {
      return {
        provider: "openbd",
        status: "ready",
        items: [],
        page,
        hasMore: false,
        fetchedAt: source.fetchedAt,
        message: "openBD에서 일치하는 일본 도서 판본을 찾지 못했습니다.",
      };
    }
    const item = recordOf(raw);
    const summary = recordOf(item.summary);
    const title = plainText(summary.title, 300);
    const resultIsbn = normalizeIsbn(summary.isbn) || isbn;
    const resource = title ? parseResource({
      id: `openbd:${resultIsbn}`,
      provider: "openbd",
      title,
      creator: plainText(summary.author, 300),
      description: [plainText(summary.series, 200), plainText(summary.volume, 100)].filter(Boolean).join(" · "),
      sourceUrl: "https://openbd.jp/",
      credit: plainText(summary.publisher, 300),
      dateLabel: plainText(summary.pubdate, 30),
      isbn: resultIsbn,
      license: "book-promotion",
      fetchedAt: source.fetchedAt,
    }) : null;
    return {
      provider: "openbd",
      status: resource ? "ready" : "partial",
      items: resource ? [resource] : [],
      page,
      hasMore: false,
      fetchedAt: source.fetchedAt,
      message: "openBD의 일본 도서 소개용 서지정보입니다. 데이터를 임의로 변경하거나 원본 데이터베이스 형태로 재판매하지 않으며 수정·삭제를 서비스에 반영해야 합니다.",
    };
  }

  async function kakao(query: string, page: number, key: string): Promise<ResourceSearchResult> {
    const url = new URL("https://dapi.kakao.com/v3/search/book");
    url.search = new URLSearchParams({ query, page: String(page), size: String(PAGE_SIZE), sort: "accuracy" }).toString();
    const source = await request(url, { Authorization: `KakaoAK ${key}` });
    const data = recordOf(source.value); const meta = recordOf(data.meta);
    if (!Array.isArray(data.documents) || typeof meta.is_end !== "boolean") throw new Error("upstream_schema");
    const items = data.documents.slice(0, PAGE_SIZE).map((raw) => {
      const item = recordOf(raw);
      const sourceUrl = httpsUrl(item.url, ["search.daum.net", "book.daum.net", "m.search.daum.net"]);
      return parseResource({ id: `kakao:${textOf(item.isbn, 100) || sourceUrl.slice(-150)}`, provider: "kakao", title: plainText(item.title, 300),
        sourceUrl, description: plainText(item.contents), creator: rowsOf(item.authors).map((author) => textOf(author, 100)).join(", "),
        credit: textOf(item.publisher, 300), dateLabel: textOf(item.datetime, 10), isbn: textOf(item.isbn, 100),
        license: "metadata-only", fetchedAt: source.fetchedAt });
    }).filter((item): item is CreatorResource => item !== null);
    return { provider: "kakao", status: items.length < Math.min(data.documents.length, PAGE_SIZE) ? "partial" : "ready", items,
      page, hasMore: !meta.is_end && page < 20, fetchedAt: source.fetchedAt,
      message: "카카오 도서 검색 메타데이터입니다. 표지·본문 재배포 또는 각색 권한을 제공하지 않으며, 같은 제목을 같은 작품으로 자동 병합하지 않습니다." };
  }

  async function bizinfo(query: string, page: number, key: string): Promise<ResourceSearchResult> {
    const url = new URL("https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do");
    url.search = new URLSearchParams({ crtfcKey: key, dataType: "json", searchCnt: "100", pageUnit: "100", pageIndex: "1" }).toString();
    const source = await request(url); const data = recordOf(source.value);
    const root = recordOf(data.jsonArray);
    const candidates = Array.isArray(data.jsonArray) ? data.jsonArray : root.item;
    if (!Array.isArray(candidates)) throw new Error("upstream_schema");
    const terms = query.toLocaleLowerCase().split(/\s+/u);
    const mapped = candidates.slice(0, 100).map((raw) => {
      const item = recordOf(raw);
      const title = plainText(item.pblancNm ?? item.title, 300);
      const description = plainText(item.bsnsSumryCn ?? item.description);
      const tags = plainText(item.hashTags);
      if (!terms.every((term) => `${title} ${description} ${tags}`.toLocaleLowerCase().includes(term))) return null;
      const period = textOf(item.reqstBeginEndDe ?? item.reqstDt, 100);
      return parseResource({ id: `bizinfo:${textOf(item.pblancId ?? item.seq, 100)}`, provider: "bizinfo", title, description,
        sourceUrl: bizinfoLink(item.pblancUrl ?? item.link), creator: item.jrsdInsttNm ?? item.author, credit: item.excInsttNm,
        dateLabel: period, deadline: parseDeadline(period), eligibility: textOf(item.trgetNm, 300) || "신청자격 원문 확인",
        license: "metadata-only", fetchedAt: source.fetchedAt });
    }).filter((item): item is CreatorResource => item !== null);
    const unique = [...new Map(mapped.map((item) => [item.id, item])).values()];
    return { provider: "bizinfo", status: "ready", items: unique.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page,
      hasMore: unique.length > page * PAGE_SIZE, fetchedAt: source.fetchedAt,
      message: "기업마당 최근 최대 100건 안에서 검색합니다. 전체 웹툰 공모전 목록이 아닙니다. 접수 상태·정확한 마감 시간·신청 자격은 원문에서 확인하세요." };
  }

  return {
    describe() {
      const env = options.env();
      return providerAvailability({ kakao: Boolean(env.KAKAO_REST_API_KEY?.trim()), bizinfo: Boolean(env.BIZINFO_API_KEY?.trim()) });
    },
    async search(raw: unknown, clientId = "anonymous"): Promise<ResourceSearchResult> {
      const input = recordOf(raw);
      if (!isProvider(input.provider)) throw new ResourceInputError("지원하지 않는 데이터 제공처입니다.");
      if (typeof input.q !== "string" || input.q.trim().length < 2 || input.q.length > 80 || Array.from(input.q).some((character) => character.charCodeAt(0) < 32)) throw new ResourceInputError("검색어는 2~80자로 입력하세요.");
      const page = input.page === undefined ? 1 : Number(input.page);
      if ((typeof input.page !== "string" && input.page !== undefined && typeof input.page !== "number") || !Number.isInteger(page) || page < 1 || page > 20) throw new ResourceInputError("페이지는 1~20 범위여야 합니다.");
      const provider: ResourceProvider = input.provider;
      const metFilters = provider === "met" ? parseMetFilters(input) : null;
      takeClient(clientId);
      const result = (status: "not_configured" | "unavailable", message: string): ResourceSearchResult => ({ provider, status, items: [], page, hasMore: false, fetchedAt: null, message });
      const keyName = PROVIDER_KEY[provider];
      const key = keyName ? options.env()[keyName]?.trim() ?? "" : "";
      if (keyName && !key) return result("not_configured", "서버 API 인증키가 등록되지 않았습니다. 공식 사이트에서 직접 확인할 수 있습니다.");
      try {
        if (provider === "met" && metFilters) return await met(input.q.trim(), page, metFilters);
        if (provider === "openlibrary") return await openLibrary(input.q.trim(), page);
        if (provider === "openbd") return await openBd(input.q.trim(), page);
        if (provider === "kakao") return await kakao(input.q.trim(), page, key);
        return await bizinfo(input.q.trim(), page, key);
      } catch {
        return result("unavailable", "제공처 응답을 확인하지 못했습니다. 잠시 후 다시 검색하거나 공식 사이트를 이용하세요.");
      }
    },
  };
}
export type ResourceEngine = ReturnType<typeof createResourceEngine>;
