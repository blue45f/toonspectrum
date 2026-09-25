import { parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";
import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

type Request = (url: URL, headers?: Record<string, string>) => Promise<{ value: unknown; fetchedAt: string }>;
const SIZE = 12;

const plain = (value: unknown, max = 1200) => textOf(value, 20000)
  .replace(/<[^>]*>/gu, " ")
  .replace(/&(nbsp|amp|lt|gt|quot);/gu, " ")
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, max);
const finiteTotal = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function validGoogleBooksShape(url: URL, value: unknown): boolean {
  if (url.hostname !== "www.googleapis.com" || url.pathname !== "/books/v1/volumes") return false;
  const root = recordOf(value);
  return finiteTotal(root.totalItems) && (root.items === undefined || Array.isArray(root.items));
}

export function googleBooksUrl(query: string, page: number): URL {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.search = new URLSearchParams({
    q: query,
    startIndex: String((page - 1) * SIZE),
    maxResults: String(SIZE),
    projection: "lite",
    orderBy: "relevance",
    printType: "books",
  }).toString();
  return url;
}

function normalize(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const id = textOf(item.id, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id)) return null;
  const info = recordOf(item.volumeInfo);
  const title = plain(info.title, 300);
  if (!title) return null;
  const authors = rows(info.authors).map((value) => plain(value, 100)).filter(Boolean).slice(0, 8);
  const categories = rows(info.categories).map((value) => plain(value, 100)).filter(Boolean).slice(0, 6);
  const identifiers = rows(info.industryIdentifiers).map((value) => {
    const entry = recordOf(value);
    const identifier = textOf(entry.identifier, 32).replace(/[^0-9Xx]/gu, "").toUpperCase();
    return /^\d{9}[\dX]$|^\d{13}$/u.test(identifier) ? identifier : "";
  }).filter(Boolean).slice(0, 4);
  const pageCount = typeof info.pageCount === "number" && Number.isSafeInteger(info.pageCount) && info.pageCount > 0
    ? `${info.pageCount}쪽` : "";
  const language = textOf(info.language, 20);
  const description = [
    plain(info.description, 850),
    categories.length ? `분류 ${categories.join(", ")}` : "",
    pageCount,
    language ? `언어 ${language}` : "",
  ].filter(Boolean).join(" · ");
  const source = new URL("https://books.google.com/books");
  source.searchParams.set("id", id);
  return parseResource({
    id: `googlebooks:${id}`,
    provider: "googlebooks",
    title,
    creator: authors.join(", "),
    description,
    sourceUrl: source.href,
    credit: plain(info.publisher, 300),
    dateLabel: plain(info.publishedDate, 40),
    isbn: identifiers.join(" "),
    license: "metadata-only",
    fetchedAt,
  });
}

export async function googleBooksSearch(
  query: string,
  page: number,
  key: string,
  request: Request,
): Promise<ResourceSearchResult> {
  const url = googleBooksUrl(query, page);
  const source = await request(url, { "X-Goog-Api-Key": key });
  if (!validGoogleBooksShape(url, source.value)) throw new Error("upstream_schema");
  const root = recordOf(source.value);
  const total = root.totalItems as number;
  const candidates = rows(root.items).slice(0, SIZE);
  const normalized = candidates.map((item) => normalize(item, source.fetchedAt)).filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  return {
    provider: "googlebooks",
    status: items.length < candidates.length ? "partial" : "ready",
    items,
    page,
    hasMore: page < 20 && total > page * SIZE,
    total,
    fetchedAt: source.fetchedAt,
    message: "Google Books의 판본 발견용 메타데이터입니다. 표지·미리보기·본문의 재배포 또는 각색 권한을 뜻하지 않으며, 정확한 판본과 이용조건은 원문에서 확인하세요.",
  };
}
