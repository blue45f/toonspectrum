/** Shared HTTP/static-engine contract. Pagination limits payloads, not just rendering. */
export const SEARCH_DEFAULT_PAGE_SIZE = 24;
export const SEARCH_MAX_PAGE_SIZE = 80;
export const SEARCH_MAX_PAGE = 1_000_000;
export const SEARCH_MAX_FILTER_IDS = 1_000;

export interface SearchPageQuery {
  page?: unknown;
  pageSize?: unknown;
  ids?: unknown;
}

export interface SearchPageOptions {
  page: number;
  pageSize: number;
  ids?: ReadonlySet<string>;
}

export interface SearchPagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  nextPage: number | null;
}

export class SearchPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchPaginationError";
  }
}

function integer(value: unknown, fallback: number, max: number, name: string): number {
  if (value === undefined || value === null) return fallback;
  // Reject repeated URL parameters, fractions, exponent notation, negatives and empty values.
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d+(?![\s\S])/.test(String(value))) {
    throw new SearchPaginationError(`Invalid ${name}`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > max) {
    throw new SearchPaginationError(`${name} must be between 1 and ${max}`);
  }
  return result;
}

export function parseSearchPageQuery(query: SearchPageQuery): SearchPageOptions {
  const page = integer(query.page, 1, SEARCH_MAX_PAGE, "page");
  const pageSize = integer(query.pageSize, SEARCH_DEFAULT_PAGE_SIZE, SEARCH_MAX_PAGE_SIZE, "pageSize");
  if (query.ids === undefined || query.ids === null) return { page, pageSize };
  if (typeof query.ids !== "string" || query.ids.length > 128_000) {
    throw new SearchPaginationError("Invalid ids");
  }
  // Present-but-empty is an empty saved collection, NOT an unfiltered public search.
  const ids = query.ids.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length > SEARCH_MAX_FILTER_IDS || ids.some((id) => id.length > 128)) {
    throw new SearchPaginationError(`ids supports at most ${SEARCH_MAX_FILTER_IDS} identifiers`);
  }
  return { page, pageSize, ids: new Set(ids) };
}

export function searchPagination(total: number, options: SearchPageOptions): SearchPagination {
  const hasMore = options.page < SEARCH_MAX_PAGE && options.page * options.pageSize < total;
  return {
    page: options.page,
    pageSize: options.pageSize,
    total,
    hasMore,
    nextPage: hasMore ? options.page + 1 : null,
  };
}

export function searchPageItems<T>(items: readonly T[], options: SearchPageOptions): T[] {
  const offset = (options.page - 1) * options.pageSize;
  return items.slice(offset, offset + options.pageSize);
}

export function searchPageQueryFromParams(params: URLSearchParams): SearchPageQuery {
  const terms = params.getAll("q");
  if (terms.length > 1 || (terms[0]?.length ?? 0) > 512) {
    throw new SearchPaginationError("Search query must be a single string of at most 512 characters");
  }
  const value = (name: string) => {
    const values = params.getAll(name);
    return values.length > 1 ? values : values[0];
  };
  return { page: value("page"), pageSize: value("pageSize"), ids: value("ids") };
}

const SEARCH_QUERY_FIELDS = new Set([
  "q", "sort", "types", "genres", "tags", "status", "platforms", "ages",
  "minRating", "yearMin", "yearMax", "freeOnly", "adaptedOnly", "page", "pageSize", "ids",
]);

/** Body counterpart to URLSearchParams, used only by read-only POST /api/search. */
export function searchParamsFromBody(body: unknown): URLSearchParams {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SearchPaginationError("Expected search query object");
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (!SEARCH_QUERY_FIELDS.has(key) || typeof value !== "string"
      || value.length > (key === "ids" ? 128_000 : 4_096)) {
      throw new SearchPaginationError(`Invalid search field: ${key.slice(0, 40)}`);
    }
    params.set(key, value);
  }
  parseSearchPageQuery(searchPageQueryFromParams(params));
  return params;
}
