import { XMLParser } from "fast-xml-parser";

import { parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";
import type { CreatorResource, ResourceProvider, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

export type KoreanOpenDataProvider = "kheritage" | "neis" | "tourapi" | "korean";
type Request = (url: URL, headers?: Record<string, string>, responseType?: "json" | "xml") => Promise<{ value: unknown; fetchedAt: string }>;
const SIZE = 12;
const XML = new XMLParser({ ignoreAttributes: true, ignoreDeclaration: true, trimValues: true, parseTagValue: false, processEntities: false });

const plain = (value: unknown, max = 1200) => textOf(value, 20000).replace(/<[^>]*>/gu, " ").replace(/&(nbsp|amp|lt|gt|quot|#39);/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
const integer = (value: unknown): number => {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
};

export function isKoreanOpenDataProvider(value: unknown): value is KoreanOpenDataProvider {
  return value === "kheritage" || value === "neis" || value === "tourapi" || value === "korean";
}

function parseHeritageXml(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.length > 2 * 1024 * 1024 || !value.includes("<result")) return {};
  try { return recordOf(recordOf(XML.parse(value)).result); } catch { return {}; }
}

export function validKoreanOpenDataTextShape(url: URL, value: unknown): boolean {
  if (url.hostname !== "khs.go.kr" || url.pathname !== "/cha/SearchKindOpenapiList.do") return false;
  const result = parseHeritageXml(value);
  const count = integer(result.totalCnt);
  return String(result.totalCnt ?? "") === String(count) && (count === 0 || rows(result.item).length > 0);
}

export function validKoreanOpenDataShape(url: URL, value: unknown): boolean {
  const data = recordOf(value);
  if (url.hostname === "open.neis.go.kr") {
    if (Array.isArray(data.schoolInfo)) {
      const sections = data.schoolInfo as unknown[];
      return sections.some((section) => Array.isArray(recordOf(section).row));
    }
    const result = recordOf(data.RESULT);
    return result.CODE === "INFO-200";
  }
  if (url.hostname === "apis.data.go.kr") {
    const response = recordOf(data.response);
    const header = recordOf(response.header);
    const body = recordOf(response.body);
    return String(header.resultCode) === "0000" && integer(body.totalCount) >= 0;
  }
  if (url.hostname === "stdict.korean.go.kr") {
    const channel = recordOf(data.channel);
    const total = integer(channel.total);
    return String(channel.total ?? "") === String(total)
      && (total === 0 || rows(channel.item).length > 0);
  }
  return false;
}

export function heritageUrl(query: string, page: number): URL {
  const url = new URL("https://khs.go.kr/cha/SearchKindOpenapiList.do");
  url.search = new URLSearchParams({ pageUnit: String(SIZE), pageIndex: String(page), ccbaMnm1: query }).toString();
  return url;
}

function neisUrl(query: string, page: number, key: string): URL {
  const url = new URL("https://open.neis.go.kr/hub/schoolInfo");
  url.search = new URLSearchParams({ KEY: key, Type: "json", pIndex: String(page), pSize: String(SIZE), SCHUL_NM: query }).toString();
  return url;
}

function decodedServiceKey(value: string): string {
  if (!value.includes("%")) return value;
  try { return decodeURIComponent(value); } catch { return value; }
}

function tourApiUrl(query: string, page: number, key: string): URL {
  const url = new URL("https://apis.data.go.kr/B551011/KorService2/searchKeyword2");
  url.search = new URLSearchParams({
    serviceKey: decodedServiceKey(key),
    MobileOS: "ETC",
    MobileApp: "ToonStudio",
    _type: "json",
    arrange: "A",
    numOfRows: String(SIZE),
    pageNo: String(page),
    keyword: query,
  }).toString();
  return url;
}

function koreanDictionaryUrl(query: string, page: number, key: string): URL {
  const url = new URL("https://stdict.korean.go.kr/api/search.do");
  url.search = new URLSearchParams({ key, q: query, req_type: "json", start: String((page - 1) * SIZE + 1), num: String(SIZE), advanced: "y" }).toString();
  return url;
}

export function koreanOpenDataUrl(provider: KoreanOpenDataProvider, query: string, page: number, key: string): URL {
  if (provider === "kheritage") return heritageUrl(query, page);
  if (provider === "neis") return neisUrl(query, page, key);
  if (provider === "tourapi") return tourApiUrl(query, page, key);
  return koreanDictionaryUrl(query, page, key);
}

function normalizeHeritage(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const kind = textOf(item.ccbaKdcd, 12);
  const province = textOf(item.ccbaCtcd, 12);
  const number = textOf(item.ccbaAsno, 32);
  if (!/^\d{2}$/u.test(kind) || !/^\d{2}$/u.test(province) || !/^\d{1,32}$/u.test(number)) return null;
  const title = plain(item.ccbaMnm1, 300);
  if (!title) return null;
  const detail = new URL("https://khs.go.kr/cha/SearchKindOpenapiDt.do");
  detail.search = new URLSearchParams({ ccbaKdcd: kind, ccbaAsno: number, ccbaCtcd: province }).toString();
  const longitude = plain(item.longitude, 40);
  const latitude = plain(item.latitude, 40);
  return parseResource({
    id: `kheritage:${kind}-${province}-${number}`,
    provider: "kheritage",
    title,
    creator: plain(item.ccbaAdmin, 300),
    description: [
      plain(item.ccmaName, 120),
      plain(item.ccbaMnm2, 300),
      [plain(item.ccbaCtcdNm, 100), plain(item.ccsiName, 100)].filter(Boolean).join(" "),
      longitude && latitude ? `좌표 ${latitude}, ${longitude}` : "",
    ].filter(Boolean).join(" · "),
    sourceUrl: detail.href,
    credit: "국가유산청 국가유산 Open API",
    dateLabel: plain(item.regDt, 10),
    license: "metadata-only",
    rightsStatement: "메타데이터·원문 링크 전용 · 미디어와 예문은 개별 권리 확인",
    termsReviewedAt: "2026-09-25",
    importPermission: "metadata-only",
    fetchedAt,
  });
}

function normalizeNeis(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const office = textOf(item.ATPT_OFCDC_SC_CODE, 20);
  const school = textOf(item.SD_SCHUL_CODE, 30);
  if (!/^[A-Za-z0-9_-]{1,20}$/u.test(office) || !/^[A-Za-z0-9_-]{1,30}$/u.test(school)) return null;
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

function normalizeTourApi(raw: unknown, fetchedAt: string, query: string): CreatorResource | null {
  const item = recordOf(raw);
  const id = textOf(item.contentid, 40);
  if (!/^\d{1,40}$/u.test(id)) return null;
  const title = plain(item.title, 300);
  const source = new URL("https://korean.visitkorea.or.kr/search/search_list.do");
  source.searchParams.set("keyword", title || query);
  return parseResource({
    id: `tourapi:${id}`,
    provider: "tourapi",
    title,
    creator: "한국관광공사",
    description: [
      plain(item.addr1, 500),
      plain(item.addr2, 300),
      plain(item.tel, 200),
      textOf(item.mapx, 40) && textOf(item.mapy, 40) ? `좌표 ${textOf(item.mapy, 40)}, ${textOf(item.mapx, 40)}` : "",
      plain(item.cat1, 40) ? `분류 ${plain(item.cat1, 40)} / ${plain(item.cat2, 40)} / ${plain(item.cat3, 40)}` : "",
    ].filter(Boolean).join(" · "),
    sourceUrl: source.href,
    credit: "한국관광공사 TourAPI",
    dateLabel: plain(item.modifiedtime, 8),
    license: "metadata-only",
    rightsStatement: "메타데이터·원문 링크 전용 · 미디어와 예문은 개별 권리 확인",
    termsReviewedAt: "2026-09-25",
    importPermission: "metadata-only",
    fetchedAt,
  });
}

function dictionarySense(value: unknown): string {
  const senses = rows(value);
  for (const raw of senses) {
    const definition = plain(recordOf(raw).definition, 800);
    if (definition) return definition;
  }
  return "";
}

function normalizeKoreanDictionary(raw: unknown, fetchedAt: string): CreatorResource | null {
  const item = recordOf(raw);
  const code = textOf(item.target_code, 40);
  if (!/^\d{1,40}$/u.test(code)) return null;
  const source = new URL("https://stdict.korean.go.kr/search/searchView.do");
  source.search = new URLSearchParams({ word_no: code, searchKeywordTo: "3" }).toString();
  return parseResource({
    id: `korean:${code}`,
    provider: "korean",
    title: plain(item.word, 300),
    creator: "국립국어원",
    description: [plain(item.pos, 100), dictionarySense(item.sense)].filter(Boolean).join(" · "),
    sourceUrl: source.href,
    credit: "국립국어원 표준국어대사전",
    license: "metadata-only",
    rightsStatement: "메타데이터·원문 링크 전용 · 미디어와 예문은 개별 권리 확인",
    termsReviewedAt: "2026-09-25",
    importPermission: "metadata-only",
    fetchedAt,
  });
}

function neisRows(value: unknown): { rows: unknown[]; total: number } {
  const data = recordOf(value);
  if (!Array.isArray(data.schoolInfo)) return { rows: [], total: 0 };
  let resultRows: unknown[] = [];
  let resultTotal = 0;
  for (const section of data.schoolInfo) {
    const entry = recordOf(section);
    if (Array.isArray(entry.row)) resultRows = entry.row;
    for (const head of rows(entry.head)) {
      const list = recordOf(head);
      if (list.list_total_count !== undefined) resultTotal = integer(list.list_total_count);
    }
  }
  return { rows: resultRows, total: resultTotal };
}

function tourRows(value: unknown): { rows: unknown[]; total: number } {
  const body = recordOf(recordOf(recordOf(value).response).body);
  const items = recordOf(body.items).item;
  return { rows: rows(items), total: integer(body.totalCount) };
}

function dictionaryRows(value: unknown): { rows: unknown[]; total: number } {
  const channel = recordOf(recordOf(value).channel);
  return { rows: rows(channel.item), total: integer(channel.total) };
}

export async function koreanOpenDataSearch(provider: KoreanOpenDataProvider, query: string, page: number, key: string, request: Request): Promise<ResourceSearchResult> {
  const url = koreanOpenDataUrl(provider, query, page, key);
  const source = await request(
    url,
    provider === "kheritage" ? { "User-Agent": "ToonStudio/1.0" } : {},
    provider === "kheritage" ? "xml" : "json",
  );
  if (provider === "kheritage") {
    if (!validKoreanOpenDataTextShape(url, source.value)) throw new Error("upstream_schema");
    const result = parseHeritageXml(source.value);
    const candidates = rows(result.item).slice(0, SIZE);
    const items = candidates.map((item) => normalizeHeritage(item, source.fetchedAt)).filter((item): item is CreatorResource => item !== null);
    const found = integer(result.totalCnt);
    return { provider, status: items.length === candidates.length ? "ready" : "partial", items, page, hasMore: page < 20 && found > page * SIZE, total: found, fetchedAt: source.fetchedAt,
      message: "국가유산청 공식 Open API의 국가유산 명칭·분류·지역·관리기관·좌표 메타데이터입니다. 사진·해설·2차 저작물의 공공누리 유형은 상세 원문에서 따로 확인하세요." };
  }
  if (!validKoreanOpenDataShape(url, source.value)) throw new Error("upstream_schema");
  const found = provider === "neis" ? neisRows(source.value) : provider === "tourapi" ? tourRows(source.value) : dictionaryRows(source.value);
  const candidates = found.rows.slice(0, SIZE);
  const normalized = candidates.map((item) => provider === "neis"
    ? normalizeNeis(item, source.fetchedAt)
    : provider === "tourapi"
      ? normalizeTourApi(item, source.fetchedAt, query)
      : normalizeKoreanDictionary(item, source.fetchedAt)).filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  const message = provider === "neis"
    ? "NEIS 학교 기본정보 메타데이터입니다. 학교물 설정의 실제 학사일정·시간표·행사는 학교와 교육청의 최신 공지를 다시 확인하세요."
    : provider === "tourapi"
      ? "한국관광공사 TourAPI의 장소·주소·좌표 메타데이터입니다. 영업·행사·접근 정보와 사진 이용조건은 공식 원문에서 다시 확인하세요."
      : "국립국어원 표준국어대사전의 표제어·품사·뜻풀이 메타데이터입니다. 사전 예문을 작품 대사로 복제하지 않고 말투·용어 조사 근거로 사용하세요.";
  return { provider: provider as ResourceProvider, status: items.length === candidates.length ? "ready" : "partial", items, page,
    hasMore: page < 20 && found.total > page * SIZE, total: found.total, fetchedAt: source.fetchedAt, message };
}
