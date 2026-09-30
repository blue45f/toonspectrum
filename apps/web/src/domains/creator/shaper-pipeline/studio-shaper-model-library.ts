/**
 * 캐릭터 3D 모델 라이브러리(순수 로직).
 *
 * 프로젝트별 모델 보관함: 썸네일+메타데이터(이름/태그/생성일/의상),
 * 의상/소품 바리에이션 관리, 이름/태그 기반 검색·필터를 제공합니다.
 * 저장소는 이 모듈 바깥(호스트 앱의 상태)에서 유지하고, 여기서는 불변 변환만 수행합니다.
 */

export interface StudioModelThumbnail {
  readonly kind: "generated" | "uploaded";
  /** 썸네일 참조(스토리지 키·data URL 등). 실제 바이트는 호스트가 보관합니다. */
  readonly ref: string;
}

export interface StudioModelOutfitVariation {
  readonly variationId: string;
  /** "교복(겨울)" 같은 바리에이션 이름. */
  readonly name: string;
  readonly outfit: string;
  readonly props: readonly string[];
  readonly thumbnail: StudioModelThumbnail;
  readonly createdAt: number;
}

export interface StudioModelLibraryEntry {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly createdAt: number;
  readonly outfit: string;
  readonly props: readonly string[];
  readonly thumbnail: StudioModelThumbnail;
  /** 생성 파이프라인의 모델 참조(선택). */
  readonly sourceModelId?: string;
  readonly outfitVariations: readonly StudioModelOutfitVariation[];
}

export interface StudioModelLibraryQuery {
  readonly projectId?: string;
  readonly query?: string;
  /** 모두 포함(AND) 조건의 태그 목록. */
  readonly tags?: readonly string[];
  /** 의상 정확 일치 필터. */
  readonly outfit?: string;
  readonly sort?: "recent" | "name";
}

/** 입력 검증을 통과한 보관함 항목을 생성합니다. */
export function createModelLibraryEntry(
  input: Omit<StudioModelLibraryEntry, "outfitVariations"> & {
    readonly outfitVariations?: readonly StudioModelOutfitVariation[];
  },
): StudioModelLibraryEntry {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("모델 이름이 비어 있습니다.");
  }
  if (input.id.trim().length === 0 || input.projectId.trim().length === 0) {
    throw new Error("모델 id와 프로젝트 id는 필수입니다.");
  }
  return {
    ...input,
    name,
    tags: Object.freeze([...input.tags].map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    props: Object.freeze([...input.props]),
    outfitVariations: Object.freeze([...(input.outfitVariations ?? [])]),
  };
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

/** 검색/필터. 이름·태그 부분 일치, 태그 AND, 의상 정확 일치를 지원합니다. */
export function searchModelLibrary(
  entries: readonly StudioModelLibraryEntry[],
  query: StudioModelLibraryQuery = {},
): readonly StudioModelLibraryEntry[] {
  const needle = query.query === undefined ? "" : normalizeText(query.query);
  const requiredTags = (query.tags ?? []).map(normalizeText).filter((tag) => tag.length > 0);
  const outfitNeedle = query.outfit === undefined ? "" : normalizeText(query.outfit);

  const matched = entries.filter((entry) => {
    if (query.projectId !== undefined && entry.projectId !== query.projectId) return false;
    if (needle.length > 0) {
      const haystack = `${entry.name} ${entry.tags.join(" ")}`;
      if (!normalizeText(haystack).includes(needle)) return false;
    }
    if (requiredTags.length > 0) {
      const entryTags = new Set(entry.tags.map(normalizeText));
      if (!requiredTags.every((tag) => entryTags.has(tag))) return false;
    }
    if (outfitNeedle.length > 0 && normalizeText(entry.outfit) !== outfitNeedle) return false;
    return true;
  });

  const sorted = [...matched];
  if (query.sort === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return Object.freeze(sorted);
}

/** 의상/소품 바리에이션을 추가합니다(동일 variationId는 교체). */
export function addOutfitVariation(
  entry: StudioModelLibraryEntry,
  variation: StudioModelOutfitVariation,
): StudioModelLibraryEntry {
  if (variation.variationId.trim().length === 0) {
    throw new Error("바리에이션 id가 비어 있습니다.");
  }
  const next = entry.outfitVariations.filter((item) => item.variationId !== variation.variationId);
  next.push(variation);
  next.sort((a, b) => a.createdAt - b.createdAt);
  return { ...entry, outfitVariations: Object.freeze(next) };
}

/** 바리에이션을 제거합니다. */
export function removeOutfitVariation(
  entry: StudioModelLibraryEntry,
  variationId: string,
): StudioModelLibraryEntry {
  return {
    ...entry,
    outfitVariations: Object.freeze(entry.outfitVariations.filter((item) => item.variationId !== variationId)),
  };
}

/** 항목의 모든 의상 이름(기본 의상 + 바리에이션)을 나열합니다. */
export function listOutfitNames(entry: StudioModelLibraryEntry): readonly string[] {
  return Object.freeze([entry.outfit, ...entry.outfitVariations.map((variation) => variation.name)]);
}
