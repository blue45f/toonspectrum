import {
  parseResource,
  recordOf,
  textOf,
} from "../../../packages/core/src/creator-resources";

import type {
  CreatorResource,
  ResourceSearchResult,
} from "../../../packages/core/src/creator-resources";

export interface NeisCreatorResourceEnvironment {
  readonly NEIS_API_KEY?: string;
}

interface Runtime {
  readonly fetch: typeof globalThis.fetch;
}
interface CacheEntry {
  readonly until: number;
  readonly result: ResourceSearchResult;
}
interface RateBucket {
  readonly until: number;
  readonly count: number;
}
interface ParsedResult {
  readonly rows: readonly unknown[];
  readonly total: number;
}

const SEARCH_PATH = "/api/creator-resources/search";
const PROVIDERS_PATH = "/api/creator-resources/providers";
const UPSTREAM = "https://open.neis.go.kr/hub/schoolInfo";
const KEYED_SIZE = 12;
const SAMPLE_SIZE = 5;
const MAX_PAGE = 20;
const CACHE_TTL_MS = 15 * 60_000;
const KEY_FAILURE_COOLDOWN_MS = 10 * 60_000;
const MAX_CACHE = 128;
const CLIENT_LIMIT = 5;
const GLOBAL_LIMIT = 30;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SOURCE_HEADER = "x-toonspectrum-creator-resource-source";
const SOURCE_VALUE = "cloudflare-neis-edge";

const rows = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];
const numberOf = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && /^\d+$/u.test(value)
      ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
function plain(value: unknown, maximum = 1_200): string {
  return textOf(value, 20_000)
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/gu, " ")
    .replace(/\s+/gu, " ").trim().slice(0, maximum);
}
function configuredKey(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  return value === normalized && /^[A-Za-z0-9_-]{16,128}$/u.test(normalized)
    ? normalized : null;
}
function headers(extra: HeadersInit = {}): Headers {
  const output = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    [SOURCE_HEADER]: SOURCE_VALUE,
  });
  for (const [name, value] of new Headers(extra)) output.set(name, value);
  return output;
}
function json(body: unknown, status = 200, extra: HeadersInit = {}, head = false) {
  return new Response(head ? null : JSON.stringify(body), {
    status, headers: headers(extra),
  });
}
function queryOf(value: string | null): string | null {
  if (value === null) return null;
  const query = value.normalize("NFKC").trim();
  return query.length >= 2 && query.length <= 80 ? query : null;
}
function pageOf(value: string | null): number | null {
  if (value === null || value === "") return 1;
  if (!/^\d+$/u.test(value)) return null;
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= MAX_PAGE
    ? page : null;
}
function parseUpstream(value: unknown): ParsedResult {
  const root = recordOf(value);
  if (recordOf(root.RESULT).CODE === "INFO-200") {
    return { rows: [], total: 0 };
  }
  if (!Array.isArray(root.schoolInfo)) throw new Error("upstream_schema");
  let total: number | null = null;
  let code = "";
  let resultRows: readonly unknown[] = [];
  for (const rawSection of root.schoolInfo) {
    const section = recordOf(rawSection);
    if (Array.isArray(section.row)) resultRows = section.row;
    for (const rawHead of rows(section.head)) {
      const head = recordOf(rawHead);
      if (head.list_total_count !== undefined) {
        total = numberOf(head.list_total_count);
      }
      const result = recordOf(head.RESULT);
      if (typeof result.CODE === "string") code = result.CODE;
    }
  }
  if (code !== "INFO-000" || total === null) {
    throw new Error("upstream_schema");
  }
  if (total > 0 && resultRows.length === 0) {
    throw new Error("upstream_schema");
  }
  return { rows: resultRows, total };
}

function normalizeResource(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const office = textOf(item.ATPT_OFCDC_SC_CODE, 20);
  const school = textOf(item.SD_SCHUL_CODE, 30);
  if (!/^[A-Za-z0-9_-]{1,20}$/u.test(office)
    || !/^[A-Za-z0-9_-]{1,30}$/u.test(school)) return null;
  return parseResource({
    id: `neis:${office}-${school}`,
    provider: "neis",
    title: plain(item.SCHUL_NM, 300),
    creator: plain(item.ATPT_OFCDC_SC_NM, 200),
    description: [
      plain(item.SCHUL_KND_SC_NM, 100),
      plain(item.FOND_SC_NM, 100),
      plain(item.ORG_RDNMA, 500),
      plain(item.COEDU_SC_NM, 100),
    ].filter(Boolean).join(" · "),
    sourceUrl: "https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do",
    credit: "교육부·한국교육학술정보원 NEIS",
    dateLabel: plain(item.FOND_YMD, 10),
    license: "metadata-only",
    rightsStatement: "메타데이터·원문 링크 전용 · 미디어와 예문은 개별 권리 확인",
    termsReviewedAt: "2026-09-25",
    importPermission: "metadata-only",
    fetchedAt,
  });
}

function normalizedResult(
  parsed: ParsedResult,
  page: number,
  fetchedAt: string,
  sample: boolean,
): ResourceSearchResult {
  const candidates = sample && page > 1 ? []
    : parsed.rows.slice(0, sample ? SAMPLE_SIZE : KEYED_SIZE);
  const resources = candidates
    .map((item) => normalizeResource(item, fetchedAt))
    .filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(resources.map((item) => [item.id, item])).values()];
  return {
    provider: "neis",
    status: items.length === candidates.length ? "ready" : "partial",
    items,
    page,
    hasMore: !sample && page < MAX_PAGE && parsed.total > page * KEYED_SIZE,
    total: parsed.total,
    fetchedAt,
    message: sample
      ? "NEIS 공개 샘플 최대 5건으로 학교 기본정보를 검색했습니다. 결과가 부족하면 학교명을 더 구체적으로 입력하세요. 학사일정·시간표·행사는 학교와 교육청의 최신 공지를 다시 확인하세요."
      : "NEIS 학교 기본정보 메타데이터입니다. 학교물 설정의 실제 학사일정·시간표·행사는 학교와 교육청의 최신 공지를 다시 확인하세요.",
  };
}

async function limitedJson(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  const size = Number(response.headers.get("content-length"));
  if (!response.ok || response.redirected || !type.includes("json")
    || (Number.isFinite(size) && size > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("upstream_response");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("upstream_size");
  }
  return JSON.parse(text) as unknown;
}

function upstreamUrl(query: string, page: number, key: string | null): URL {
  const sample = key === null;
  const url = new URL(UPSTREAM);
  url.search = new URLSearchParams({
    ...(key ? { KEY: key } : {}),
    Type: "json",
    pIndex: String(sample ? 1 : page),
    pSize: String(sample ? SAMPLE_SIZE : KEYED_SIZE),
    SCHUL_NM: query,
  }).toString();
  return url;
}

async function requestUpstream(
  runtime: Runtime,
  query: string,
  page: number,
  key: string | null,
): Promise<{ parsed: ParsedResult; fetchedAt: string }> {
  const response = await runtime.fetch(new Request(upstreamUrl(query, page, key), {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(6_000),
  }));
  return {
    parsed: parseUpstream(await limitedJson(response)),
    fetchedAt: new Date().toISOString(),
  };
}

function takeRate(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  now: number,
): number | null {
  const previous = buckets.get(key);
  const current = previous && previous.until > now
    ? previous : { until: now + 60_000, count: 0 };
  if (current.count >= limit) {
    return Math.max(1, Math.ceil((current.until - now) / 1_000));
  }
  buckets.set(key, { until: current.until, count: current.count + 1 });
  return null;
}
function hasUnsafeIpCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}
function clientKey(request: Request): string {
  const value = request.headers.get("cf-connecting-ip")?.trim();
  return value && value.length <= 64 && !hasUnsafeIpCharacter(value)
    ? value : "anonymous";
}
function cacheKey(query: string, page: number, keyed: boolean): string {
  return `${keyed ? "keyed" : "sample"}:${page}:${query.toLocaleLowerCase("ko")}`;
}
function pruneCache(cache: Map<string, CacheEntry>, now: number): void {
  for (const [key, entry] of cache) {
    if (entry.until <= now) cache.delete(key);
  }
  while (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value as string | undefined;
    if (first === undefined) break;
    cache.delete(first);
  }
}

function patchedProviders(
  response: Response,
  value: unknown,
  request: Request,
): Response | null {
  if (!Array.isArray(value)) return null;
  let changed = false;
  const body = value.map((raw) => {
    const item = recordOf(raw);
    if (item.provider !== "neis") return raw;
    changed = true;
    return { ...item, availability: "configured" };
  });
  if (!changed) return null;
  const output = new Headers(response.headers);
  output.delete("content-length");
  output.delete("content-encoding");
  output.set("content-type", "application/json; charset=utf-8");
  output.set(SOURCE_HEADER, SOURCE_VALUE);
  return new Response(
    request.method.toUpperCase() === "HEAD" ? null : JSON.stringify(body),
    { status: response.status, statusText: response.statusText, headers: output },
  );
}

export function createNeisCreatorResourceEdge(runtime: Runtime) {
  const cache = new Map<string, CacheEntry>();
  const clients = new Map<string, RateBucket>();
  const globals = new Map<string, RateBucket>();
  let keyedUnavailableUntil = 0;

  return {
    async search(
      request: Request,
      env: NeisCreatorResourceEnvironment,
    ): Promise<Response | null> {
      const url = new URL(request.url);
      if (url.pathname !== SEARCH_PATH
        || url.searchParams.get("provider") !== "neis") return null;
      const method = request.method.toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        return json({ error: "method_not_allowed" }, 405, {
          allow: "GET, HEAD",
        });
      }
      const query = queryOf(url.searchParams.get("q"));
      const page = pageOf(url.searchParams.get("page"));
      if (query === null || page === null) {
        return json({ error: "invalid_creator_resource_query" }, 400);
      }
      const now = Date.now();
      const storedKey = configuredKey(env.NEIS_API_KEY);
      const key = keyedUnavailableUntil <= now ? storedKey : null;
      pruneCache(cache, now);
      for (const keyed of key ? [true, false] : [false]) {
        const hit = cache.get(cacheKey(query, page, keyed));
        if (hit && hit.until > now) {
          return json(hit.result, 200, {
            "x-toonspectrum-edge-cache": "hit",
          }, method === "HEAD");
        }
      }
      const clientRetry = takeRate(
        clients, clientKey(request), CLIENT_LIMIT, now,
      );
      const globalRetry = clientRetry === null
        ? takeRate(globals, "global", GLOBAL_LIMIT, now) : null;
      const retry = clientRetry ?? globalRetry;
      if (retry !== null) {
        return json({ error: "creator_resource_rate_limited" }, 429, {
          "retry-after": String(retry),
        });
      }

      let result: ResourceSearchResult;
      let keyed = false;
      if (key) {
        try {
          const source = await requestUpstream(runtime, query, page, key);
          result = normalizedResult(source.parsed, page, source.fetchedAt, false);
          keyed = true;
        } catch {
          keyedUnavailableUntil = now + KEY_FAILURE_COOLDOWN_MS;
          try {
            const source = await requestUpstream(runtime, query, page, null);
            result = normalizedResult(source.parsed, page, source.fetchedAt, true);
          } catch {
            return json({ error: "creator_resource_upstream_failed" }, 502);
          }
        }
      } else {
        try {
          const source = await requestUpstream(runtime, query, page, null);
          result = normalizedResult(source.parsed, page, source.fetchedAt, true);
        } catch {
          return json({ error: "creator_resource_upstream_failed" }, 502);
        }
      }

      pruneCache(cache, now);
      cache.set(cacheKey(query, page, keyed), {
        until: now + CACHE_TTL_MS,
        result,
      });
      return json(result, 200, {
        "x-toonspectrum-edge-cache": "miss",
        "x-toonspectrum-neis-mode": keyed ? "keyed" : "sample",
      }, method === "HEAD");
    },

    async patchProviderAvailability(
      request: Request,
      response: Response,
      env: NeisCreatorResourceEnvironment,
    ): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== PROVIDERS_PATH
        || !["GET", "HEAD"].includes(request.method.toUpperCase())
        || !response.ok
        || configuredKey(env.NEIS_API_KEY) === null) return response;
      try {
        const text = await response.clone().text();
        if (new TextEncoder().encode(text).byteLength > 256 * 1_024) {
          return response;
        }
        return patchedProviders(
          response,
          JSON.parse(text) as unknown,
          request,
        ) ?? response;
      } catch {
        return response;
      }
    },
  };
}
