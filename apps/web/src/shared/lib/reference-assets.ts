import type { CreatorResource } from "./creator-resources";

export const REFERENCE_SEARCH_FIELDS = [
  { value: "all", label: "전체 메타데이터" },
  { value: "title", label: "작품명" },
  { value: "tags", label: "주제 태그" },
  { value: "artistCulture", label: "제작자·문화권" },
] as const;

export type ReferenceSearchField = typeof REFERENCE_SEARCH_FIELDS[number]["value"];
export type ReferenceSort = "relevance" | "title" | "oldest" | "newest";
export type ReferenceDensity = "comfortable" | "compact";
export type ReferenceMode = "results" | "saved";

export const MET_DEPARTMENTS = [
  { id: "1", label: "미국 장식미술" },
  { id: "3", label: "고대 근동 미술" },
  { id: "4", label: "무기와 갑주" },
  { id: "5", label: "아프리카·오세아니아·아메리카" },
  { id: "6", label: "아시아 미술" },
  { id: "7", label: "클로이스터스" },
  { id: "8", label: "복식 연구소" },
  { id: "9", label: "드로잉과 판화" },
  { id: "10", label: "이집트 미술" },
  { id: "11", label: "유럽 회화" },
  { id: "12", label: "유럽 조각·장식미술" },
  { id: "13", label: "그리스·로마 미술" },
  { id: "14", label: "이슬람 미술" },
  { id: "15", label: "로버트 리먼 컬렉션" },
  { id: "16", label: "도서관" },
  { id: "17", label: "중세 미술" },
  { id: "18", label: "악기" },
  { id: "19", label: "사진" },
  { id: "21", label: "근현대 미술" },
] as const;

export const MET_DEPARTMENT_IDS: ReadonlySet<string> = new Set(MET_DEPARTMENTS.map((department) => department.id));

export const REFERENCE_MEDIUM_PRESETS = [
  "Ceramics",
  "Furniture",
  "Paintings",
  "Photographs",
  "Sculpture",
  "Textiles",
  "Drawings",
  "Prints",
  "Metalwork",
  "Wood",
] as const;

export interface ReferenceSearchState {
  query: string;
  page: number;
  field: ReferenceSearchField;
  departmentId: string;
  medium: string;
  geoLocation: string;
  dateBegin: string;
  dateEnd: string;
  highlightOnly: boolean;
}

export interface ReferenceViewState {
  mode: ReferenceMode;
  within: string;
  department: string;
  culture: string;
  classification: string;
  sort: ReferenceSort;
  density: ReferenceDensity;
}

export interface ReferenceLens {
  id: string;
  title: string;
  description: string;
  query: string;
  field?: ReferenceSearchField;
  departmentId?: string;
  medium?: string;
  geoLocation?: string;
  dateBegin?: string;
  dateEnd?: string;
  highlightOnly?: boolean;
}

export const REFERENCE_LENSES: readonly ReferenceLens[] = [
  {
    id: "costume",
    title: "복식과 실루엣",
    description: "시대별 옷의 구조, 주름, 장식과 인물 실루엣을 조사합니다.",
    query: "dress",
    departmentId: "8",
  },
  {
    id: "armor",
    title: "무기와 갑주",
    description: "전투 장비의 결합 방식, 재료, 문양과 무게감을 살펴봅니다.",
    query: "armor",
    departmentId: "4",
  },
  {
    id: "interior",
    title: "가구와 실내",
    description: "방의 시대성, 생활 동선과 소품 배치를 설계할 자료를 찾습니다.",
    query: "furniture",
    departmentId: "12",
    medium: "Furniture",
  },
  {
    id: "korea",
    title: "한국 문화권",
    description: "한국의 공예, 회화, 복식과 생활 물건을 문화권 기준으로 탐색합니다.",
    query: "Korea",
    field: "artistCulture",
    departmentId: "6",
  },
  {
    id: "ornament",
    title: "문양과 장식",
    description: "테두리, 패턴, 상징, 반복 리듬을 주제 태그 중심으로 모읍니다.",
    query: "ornament",
    field: "tags",
    departmentId: "9",
  },
  {
    id: "architecture",
    title: "건축과 공간",
    description: "입면, 문, 창, 계단과 공간의 깊이를 보여 주는 자료를 찾습니다.",
    query: "architecture",
    field: "tags",
    departmentId: "9",
  },
  {
    id: "vessels",
    title: "그릇과 소품",
    description: "손에 잡히는 생활 소품의 비례, 표면과 재료 표현을 조사합니다.",
    query: "vase",
    medium: "Ceramics",
  },
  {
    id: "gesture",
    title: "자세와 동세",
    description: "몸의 방향, 옷자락, 무게중심이 읽히는 인물 자료를 탐색합니다.",
    query: "figures",
    field: "tags",
  },
] as const;

export function defaultReferenceSearchState(): ReferenceSearchState {
  return {
    query: "",
    page: 1,
    field: "all",
    departmentId: "",
    medium: "",
    geoLocation: "",
    dateBegin: "",
    dateEnd: "",
    highlightOnly: false,
  };
}

export function defaultReferenceViewState(): ReferenceViewState {
  return {
    mode: "results",
    within: "",
    department: "",
    culture: "",
    classification: "",
    sort: "relevance",
    density: "comfortable",
  };
}

function cleanText(value: string | null, maximumLength = 80): string {
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) return "";
  return value.trim().slice(0, maximumLength);
}

function cleanYear(value: string | null): string {
  const text = cleanText(value, 6);
  if (!/^-?\d{1,5}$/u.test(text)) return "";
  const year = Number(text);
  return Number.isInteger(year) && year >= -10000 && year <= 3000 ? String(year) : "";
}

function cleanPage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 20 ? page : 1;
}

export function isReferenceSearchField(value: unknown): value is ReferenceSearchField {
  return REFERENCE_SEARCH_FIELDS.some((option) => option.value === value);
}

function referenceSort(value: string | null): ReferenceSort {
  return value === "title" || value === "oldest" || value === "newest" ? value : "relevance";
}

export function parseReferenceUrlParams(params: URLSearchParams): {
  search: ReferenceSearchState;
  view: ReferenceViewState;
} {
  const departmentId = cleanText(params.get("department"), 3);
  const field = params.get("field");
  return {
    search: {
      query: cleanText(params.get("q")),
      page: cleanPage(params.get("page")),
      field: isReferenceSearchField(field) ? field : "all",
      departmentId: MET_DEPARTMENT_IDS.has(departmentId) ? departmentId : "",
      medium: cleanText(params.get("medium")),
      geoLocation: cleanText(params.get("geo")),
      dateBegin: cleanYear(params.get("from")),
      dateEnd: cleanYear(params.get("to")),
      highlightOnly: params.get("highlight") === "1",
    },
    view: {
      mode: params.get("mode") === "saved" ? "saved" : "results",
      within: cleanText(params.get("within")),
      department: cleanText(params.get("facetDepartment"), 240),
      culture: cleanText(params.get("culture"), 240),
      classification: cleanText(params.get("classification"), 240),
      sort: referenceSort(params.get("sort")),
      density: params.get("density") === "compact" ? "compact" : "comfortable",
    },
  };
}

export function buildReferenceUrlParams(
  search: ReferenceSearchState,
  view: ReferenceViewState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (search.query) params.set("q", search.query);
  if (search.page !== 1) params.set("page", String(search.page));
  if (search.field !== "all") params.set("field", search.field);
  if (search.departmentId) params.set("department", search.departmentId);
  if (search.medium) params.set("medium", search.medium);
  if (search.geoLocation) params.set("geo", search.geoLocation);
  if (search.dateBegin) params.set("from", search.dateBegin);
  if (search.dateEnd) params.set("to", search.dateEnd);
  if (search.highlightOnly) params.set("highlight", "1");
  if (view.mode === "saved") params.set("mode", "saved");
  if (view.within) params.set("within", view.within);
  if (view.department) params.set("facetDepartment", view.department);
  if (view.culture) params.set("culture", view.culture);
  if (view.classification) params.set("classification", view.classification);
  if (view.sort !== "relevance") params.set("sort", view.sort);
  if (view.density === "compact") params.set("density", "compact");
  return params;
}

export function buildReferenceApiParams(search: ReferenceSearchState): URLSearchParams {
  const params = new URLSearchParams({
    provider: "met",
    q: search.query,
    page: String(search.page),
  });
  if (search.field !== "all") params.set("field", search.field);
  if (search.departmentId) params.set("departmentId", search.departmentId);
  if (search.medium) params.set("medium", search.medium);
  if (search.geoLocation) params.set("geoLocation", search.geoLocation);
  if (search.dateBegin && search.dateEnd) {
    params.set("dateBegin", search.dateBegin);
    params.set("dateEnd", search.dateEnd);
  }
  if (search.highlightOnly) params.set("isHighlight", "true");
  return params;
}

export function referenceSearchValidation(search: ReferenceSearchState): string {
  const query = search.query.trim();
  if (query.length < 2 || query.length > 80) return "검색어를 2~80자로 입력하세요.";
  if (Boolean(search.dateBegin) !== Boolean(search.dateEnd)) return "연대 범위는 시작 연도와 종료 연도를 함께 입력하세요.";
  if (search.dateBegin && search.dateEnd) {
    const validYear = (value: string) => /^-?\d{1,5}$/u.test(value)
      && Number.isInteger(Number(value))
      && Number(value) >= -10000
      && Number(value) <= 3000;
    if (!validYear(search.dateBegin) || !validYear(search.dateEnd)) {
      return "연대는 기원전 10000년부터 서기 3000년 사이의 정수로 입력하세요.";
    }
    if (Number(search.dateBegin) > Number(search.dateEnd)) return "시작 연도는 종료 연도보다 늦을 수 없습니다.";
  }
  return "";
}

export function referenceSearchFromLens(lens: ReferenceLens): ReferenceSearchState {
  return {
    ...defaultReferenceSearchState(),
    query: lens.query,
    field: lens.field ?? "all",
    departmentId: lens.departmentId ?? "",
    medium: lens.medium ?? "",
    geoLocation: lens.geoLocation ?? "",
    dateBegin: lens.dateBegin ?? "",
    dateEnd: lens.dateEnd ?? "",
    highlightOnly: lens.highlightOnly ?? false,
  };
}

export function referenceSearchLabel(search: ReferenceSearchState): string {
  const details = [
    MET_DEPARTMENTS.find((department) => department.id === search.departmentId)?.label,
    search.medium,
    search.geoLocation,
    search.dateBegin && search.dateEnd ? `${search.dateBegin}–${search.dateEnd}` : "",
    search.highlightOnly ? "대표작" : "",
  ].filter(Boolean);
  return details.length ? `${search.query} · ${details.join(" · ")}` : search.query;
}

export interface ReferenceFacet {
  value: string;
  count: number;
}

export type ReferenceFacetKey = "department" | "culture" | "classification";

export function referenceFacets(items: readonly CreatorResource[], key: ReferenceFacetKey): ReferenceFacet[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = item.asset?.[key] ?? "";
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "ko"));
}

function referenceHaystack(item: CreatorResource): string {
  const asset = item.asset;
  return [
    item.title,
    item.creator,
    item.description,
    item.dateLabel,
    item.credit,
    asset?.objectName,
    asset?.department,
    asset?.culture,
    asset?.period,
    asset?.dynasty,
    asset?.medium,
    asset?.classification,
    asset?.country,
    ...(asset?.tags ?? []),
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function referenceYear(item: CreatorResource): number | null {
  return item.asset?.objectBeginDate ?? item.asset?.objectEndDate ?? null;
}

export function filterAndSortReferenceItems(
  items: readonly CreatorResource[],
  view: ReferenceViewState,
  savedIds: ReadonlySet<string>,
): CreatorResource[] {
  const within = view.within.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => {
    if (view.mode === "saved" && !savedIds.has(item.id)) return false;
    if (within && !referenceHaystack(item).includes(within)) return false;
    if (view.department && item.asset?.department !== view.department) return false;
    if (view.culture && item.asset?.culture !== view.culture) return false;
    if (view.classification && item.asset?.classification !== view.classification) return false;
    return true;
  });
  if (view.sort === "relevance") return filtered;
  return [...filtered].sort((left, right) => {
    if (view.sort === "title") return left.title.localeCompare(right.title, "ko");
    const leftYear = referenceYear(left);
    const rightYear = referenceYear(right);
    if (leftYear === null && rightYear === null) return left.title.localeCompare(right.title, "ko");
    if (leftYear === null) return 1;
    if (rightYear === null) return -1;
    return view.sort === "oldest"
      ? leftYear - rightYear || left.title.localeCompare(right.title, "ko")
      : rightYear - leftYear || left.title.localeCompare(right.title, "ko");
  });
}

export function nextReferenceComparison(
  current: readonly string[],
  id: string,
  maximum = 4,
): string[] {
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (current.length >= maximum) return [...current];
  return [...current, id];
}

export function referenceSimilarQuery(item: CreatorResource): string {
  return item.asset?.tags[0]
    || item.asset?.objectName
    || item.asset?.classification
    || item.creator
    || item.title;
}

export function referenceAttributionText(item: CreatorResource): string {
  const creator = item.creator || "저작자 미상";
  const credit = item.credit ? ` · ${item.credit}` : "";
  return `${item.title} — ${creator}${credit} · The Metropolitan Museum of Art · CC0 · ${item.sourceUrl}`;
}

export function formatReferenceYear(year: number): string {
  if (year < 0) return `기원전 ${Math.abs(year)}년`;
  return `${year}년`;
}

export function formatReferenceDateRange(item: CreatorResource): string {
  const start = item.asset?.objectBeginDate;
  const end = item.asset?.objectEndDate;
  if (start === undefined && end === undefined) return item.dateLabel ?? "";
  if (start !== undefined && end !== undefined && start !== end) return `${formatReferenceYear(start)}–${formatReferenceYear(end)}`;
  return formatReferenceYear(start ?? end ?? 0);
}
