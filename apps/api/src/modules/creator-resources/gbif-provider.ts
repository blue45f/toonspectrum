import { parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";

import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

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

const SPECIES_ALIASES: Record<string, string> = {
  여우: "Vulpes vulpes",
  붉은여우: "Vulpes vulpes",
  늑대: "Canis lupus",
  호랑이: "Panthera tigris",
  표범: "Panthera pardus",
  사자: "Panthera leo",
  고양이: "Felis catus",
  개: "Canis lupus familiaris",
  수달: "Lutra lutra",
  토끼: "Oryctolagus cuniculus",
  금빛독수리: "Aquila chrysaetos",
  장미: "Rosa",
  소나무: "Pinus densiflora",
  은행나무: "Ginkgo biloba",
};

function localizedSpeciesName(query: string): string {
  const normalized = query.normalize("NFKC").trim();
  return SPECIES_ALIASES[normalized] ?? normalized;
}

export function gbifMatchUrl(query: string): URL {
  const url = new URL("https://api.gbif.org/v1/species/match");
  url.searchParams.set("name", localizedSpeciesName(query));
  return url;
}

export function gbifOccurrenceUrl(taxonKey: number, page: number): URL {
  const url = new URL("https://api.gbif.org/v1/occurrence/search");
  url.search = new URLSearchParams({
    taxon_key: String(taxonKey),
    media_type: "StillImage",
    limit: String(SIZE),
    offset: String((page - 1) * SIZE),
  }).toString();
  return url;
}
export function validGbifShape(url: URL, value: unknown): boolean {
  if (url.hostname !== "api.gbif.org") return false;
  const root = recordOf(value);
  if (url.pathname === "/v1/species/match") {
    if (root.matchType === "NONE") return true;
    return count(root.usageKey) === root.usageKey
      && Boolean(plain(root.scientificName, 300))
      && typeof root.confidence === "number";
  }
  if (url.pathname === "/v1/occurrence/search") {
    return count(root.count) === root.count
      && count(root.offset) === root.offset
      && count(root.limit) === root.limit
      && root.limit <= SIZE
      && Array.isArray(root.results)
      && root.results.length <= SIZE;
  }
  return false;
}

function normalizeOccurrence(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const key = count(item.key);
  const scientificName = plain(item.scientificName, 300);
  if (!key || !scientificName) return null;
  const media = recordOf(rows(item.media)[0]);
  const commonName = plain(item.vernacularName, 240);
  const place = [plain(item.locality, 200), plain(item.stateProvince, 120), plain(item.country, 120)]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(", ");
  const taxonomy = [plain(item.family, 120), plain(item.genus, 120), plain(item.taxonRank, 80)]
    .filter(Boolean)
    .join(" · ");
  const occurrenceLicense = plain(item.license, 300);
  const mediaLicense = plain(media.license, 500);
  const mediaCreator = plain(media.creator, 240) || plain(media.rightsHolder, 240);
  const description = [
    commonName && commonName !== scientificName ? `일반명 ${commonName}` : "",
    taxonomy,
    place ? `관찰 위치 ${place}` : "",
    plain(item.eventDate, 40) ? `관찰일 ${plain(item.eventDate, 40)}` : "",
    plain(item.basisOfRecord, 80) ? `기록 유형 ${plain(item.basisOfRecord, 80)}` : "",
    occurrenceLicense ? `레코드 권리 ${occurrenceLicense}` : "",
    mediaLicense ? `미디어 권리 ${mediaLicense}` : "",
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `gbif:${key}`,
    provider: "gbif",
    title: commonName && commonName !== scientificName ? `${commonName} · ${scientificName}` : scientificName,
    creator: mediaCreator,
    description,
    sourceUrl: `https://www.gbif.org/occurrence/${key}`,
    credit: ["GBIF occurrence", mediaCreator].filter(Boolean).join(" · "),
    dateLabel: plain(item.eventDate, 10) || String(item.year ?? ""),
    license: "metadata-only",
    fetchedAt,
  });
}
export async function gbifSearch(
  query: string,
  page: number,
  request: Request,
): Promise<ResourceSearchResult> {
  const matchUrl = gbifMatchUrl(query);
  const match = await request(matchUrl);
  if (!validGbifShape(matchUrl, match.value)) throw new Error("upstream_schema");
  const matchData = recordOf(match.value);
  if (matchData.matchType === "NONE") {
    return {
      provider: "gbif",
      status: "ready",
      items: [],
      page,
      hasMore: false,
      total: 0,
      fetchedAt: match.fetchedAt,
      message: "GBIF 분류군에서 일치하는 이름을 찾지 못했습니다. 영문 일반명이나 학명을 입력해 보세요.",
    };
  }
  const taxonKey = count(matchData.usageKey);
  if (!taxonKey) throw new Error("upstream_schema");
  const occurrenceUrl = gbifOccurrenceUrl(taxonKey, page);
  const source = await request(occurrenceUrl);
  if (!validGbifShape(occurrenceUrl, source.value)) throw new Error("upstream_schema");
  const data = recordOf(source.value);
  const candidates = rows(data.results).slice(0, SIZE);
  const normalized = candidates
    .map((item) => normalizeOccurrence(item, source.fetchedAt))
    .filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  const total = count(data.count);
  const scientificName = plain(matchData.scientificName, 300);
  return {
    provider: "gbif",
    status: items.length < candidates.length ? "partial" : "ready",
    items,
    page,
    hasMore: page < 20 && total > page * SIZE,
    total,
    fetchedAt: source.fetchedAt,
    message: `GBIF에서 ${scientificName} 분류군의 이미지 보유 관찰 기록을 찾았습니다. 미디어는 제공처·저작자별 권리가 달라 이 화면에서는 메타데이터와 원문만 저장합니다.`,
  };
}
