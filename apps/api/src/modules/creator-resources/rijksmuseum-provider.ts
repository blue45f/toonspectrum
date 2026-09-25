import { httpsUrl, parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";

import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

type Request = (url: URL) => Promise<{ value: unknown; fetchedAt: string }>;

const SIZE = 12;
const ENGLISH_LANGUAGE = "http://vocab.getty.edu/aat/300388277";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const plain = (value: unknown, max = 1200) => textOf(value, 20000)
  .replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
const count = (value: unknown): number => typeof value === "number"
  && Number.isSafeInteger(value) && value >= 0 ? value : 0;

function collectRecords(value: unknown, output: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 24 || output.length > 5000) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, output, depth + 1);
    return output;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    output.push(record);
    for (const child of Object.values(record)) collectRecords(child, output, depth + 1);
  }
  return output;
}
function hasEnglishLanguage(record: Record<string, unknown>): boolean {
  return rows(record.language).some((value) => recordOf(value).id === ENGLISH_LANGUAGE);
}

function englishText(records: unknown[], type?: string): string {
  const candidates = records.map(recordOf).filter((record) => !type || record.type === type);
  const selected = candidates.find((record) => hasEnglishLanguage(record)) ?? candidates[0];
  return plain(selected?.content, 1200);
}

function notation(record: Record<string, unknown>): string {
  const values = rows(record.notation).map(recordOf);
  const selected = values.find((entry) => entry["@language"] === "en") ?? values[0];
  return plain(selected?.["@value"], 300);
}

export function rijksmuseumSearchUrl(query: string): URL {
  const url = new URL("https://data.rijksmuseum.nl/search/collection");
  url.search = new URLSearchParams({ title: query, imageAvailable: "true" }).toString();
  return url;
}

export function rijksmuseumDetailUrl(id: string): URL {
  const url = new URL(`https://data.rijksmuseum.nl/${id}`);
  url.searchParams.set("_profile", "la-framed");
  return url;
}

export function validRijksmuseumShape(url: URL, value: unknown): boolean {
  if (url.hostname !== "data.rijksmuseum.nl") return false;
  const data = recordOf(value);
  if (url.pathname === "/search/collection") {
    return Array.isArray(data.orderedItems)
      && count(recordOf(data.partOf).totalItems) === recordOf(data.partOf).totalItems;
  }
  return /^\/\d+$/u.test(url.pathname)
    && typeof data.id === "string"
    && data.id === `https://id.rijksmuseum.nl${url.pathname}`;
}
function normalizeDetail(raw: unknown, fetchedAt: string): CreatorResource | null {
  const root = recordOf(raw);
  const idUrl = httpsUrl(root.id, ["id.rijksmuseum.nl"]);
  const match = idUrl.match(/\/(\d+)$/u);
  if (!match) return null;
  const records = collectRecords(root);
  const title = englishText(rows(root.identified_by), "Name");
  if (!title) return null;
  const website = records.map((record) => httpsUrl(record.id, ["www.rijksmuseum.nl"]))
    .find(Boolean) || idUrl;
  const production = recordOf(root.produced_by);
  const creators = rows(production.part).flatMap((part) => rows(recordOf(part).carried_out_by))
    .map(recordOf).map(notation).filter(Boolean);
  const fallbackCreators = records.filter((record) => record.type === "Person")
    .map(notation).filter(Boolean);
  const creator = [...new Set(creators.length ? creators : fallbackCreators)].slice(0, 4).join(", ");
  const descriptions = rows(root.subject_of).map(recordOf)
    .filter((record) => hasEnglishLanguage(record))
    .flatMap((record) => collectRecords(record).map((node) => plain(node.content, 1200)).filter(Boolean));
  const description = descriptions.sort((a, b) => b.length - a.length)[0] ?? "";
  const timespan = recordOf(production.timespan);
  const dateLabel = englishText(rows(timespan.identified_by), "Name");
  const isCc0 = records.some((record) => record.id === CC0);
  return parseResource({
    id: `rijksmuseum:${match[1]}`, provider: "rijksmuseum", title,
    creator, description, sourceUrl: website,
    credit: "Rijksmuseum · Linked Open Data",
    dateLabel, license: isCc0 ? "CC0" : "reference-only", fetchedAt,
  });
}
export async function rijksmuseumSearch(
  query: string,
  page: number,
  request: Request,
): Promise<ResourceSearchResult> {
  const searchUrl = rijksmuseumSearchUrl(query);
  const source = await request(searchUrl);
  if (!validRijksmuseumShape(searchUrl, source.value)) throw new Error("upstream_schema");
  const data = recordOf(source.value);
  const total = count(recordOf(data.partOf).totalItems);
  const allIds = rows(data.orderedItems).map((item) => {
    const id = httpsUrl(recordOf(item).id, ["id.rijksmuseum.nl"]);
    return id.match(/\/(\d+)$/u)?.[1] ?? "";
  }).filter(Boolean).slice(0, 100);
  const offset = (page - 1) * SIZE;
  const ids = allIds.slice(offset, offset + SIZE);
  if (total > offset && page <= 9 && ids.length === 0) throw new Error("upstream_schema");
  const normalized: CreatorResource[] = [];
  let failed = 0;
  for (let index = 0; index < ids.length; index += 3) {
    const settled = await Promise.allSettled(ids.slice(index, index + 3).map(async (id) => {
      const url = rijksmuseumDetailUrl(id);
      const detail = await request(url);
      if (!validRijksmuseumShape(url, detail.value)) throw new Error("upstream_schema");
      return normalizeDetail(detail.value, detail.fetchedAt);
    }));
    for (const entry of settled) {
      if (entry.status === "fulfilled" && entry.value) normalized.push(entry.value);
      else failed += 1;
    }
  }
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  return {
    provider: "rijksmuseum",
    status: failed ? "partial" : "ready",
    items,
    page,
    hasMore: page < 9 && Math.min(total, 100) > page * SIZE,
    total,
    fetchedAt: source.fetchedAt,
    message: `Rijksmuseum Search와 Linked Data Resolver에서 제목·제작자·설명·권리 표시를 확인한 자료입니다. 첫 100건 안에서 탐색하며 작품별 권리와 원문을 최종 기준으로 사용합니다.${failed ? " 일부 상세 자료는 확인하지 못했습니다." : ""}`,
  };
}
