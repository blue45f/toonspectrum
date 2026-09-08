import type { CanvasImagePlacement } from "./studio-image-placement";
import type {
  StudioUnifiedAssetItem,
  StudioUnifiedAssetPreview,
} from "./studio-unified-asset-catalog";

export const STUDIO_INSERT_HUB_STATE_VERSION = 1 as const;
export const STUDIO_INSERT_HUB_MAX_FAVORITES = 160;
export const STUDIO_INSERT_HUB_MAX_RECENTS = 24;
export const STUDIO_INSERT_HUB_MAX_QUERY_LENGTH = 120;
export const STUDIO_INSERT_HUB_STORAGE_KEY =
  "toonspectrum-studio-insert-hub:v1";

export type StudioInsertActionId =
  | "text"
  | "bubble"
  | "upload"
  | "stock"
  | "template"
  | "collage"
  | "elements"
  | "scene"
  | "clip"
  | "sticker"
  | "emeres"
  | "background3d"
  | "ai";

export type StudioInsertHubCategory =
  | "all"
  | "quick"
  | "scene"
  | "element"
  | "media"
  | "3d"
  | "mine";
export type StudioInsertHubCollection = "all" | "favorites" | "recent";
export type StudioInsertPlacementMode = "auto" | "page" | "selection";
export type StudioInsertPlacementSupport = "none" | "image";
export type StudioInsertHubIcon = StudioInsertActionId;

type InsertCategory = Exclude<StudioInsertHubCategory, "all">;
type ActionCategory = Exclude<StudioInsertHubCategory, "all" | "mine">;

export interface StudioInsertHubActionDefinition {
  readonly id: `action:${StudioInsertActionId}`;
  readonly actionId: StudioInsertActionId;
  readonly category: ActionCategory;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly badges: readonly string[];
  readonly useLabel: string;
  readonly icon: StudioInsertHubIcon;
  readonly sortPriority: number;
}

export interface StudioInsertHubEntryBase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: InsertCategory;
  readonly categoryLabel: string;
  readonly keywords: readonly string[];
  readonly badges: readonly string[];
  readonly useLabel: string;
  readonly sortPriority: number;
  readonly placementSupport: StudioInsertPlacementSupport;
}

export interface StudioInsertHubActionEntry extends StudioInsertHubEntryBase {
  readonly kind: "action";
  readonly actionId: StudioInsertActionId;
  readonly icon: StudioInsertHubIcon;
  readonly preview: { readonly kind: "icon" };
}

export interface StudioInsertHubAssetEntry extends StudioInsertHubEntryBase {
  readonly kind: "asset";
  readonly item: StudioUnifiedAssetItem;
  readonly preview: StudioUnifiedAssetPreview;
}

export type StudioInsertHubEntry =
  | StudioInsertHubActionEntry
  | StudioInsertHubAssetEntry;

export interface StudioInsertHubPreferences {
  readonly version: typeof STUDIO_INSERT_HUB_STATE_VERSION;
  readonly favoriteIds: readonly string[];
  readonly recentIds: readonly string[];
  readonly placementMode: StudioInsertPlacementMode;
}

export interface StudioInsertHubSelectionOptions {
  readonly query?: string;
  readonly category?: StudioInsertHubCategory;
  readonly collection?: StudioInsertHubCollection;
  readonly preferences?: StudioInsertHubPreferences;
  readonly limit?: number;
}

export interface StudioInsertHubCounts {
  readonly all: number;
  readonly quick: number;
  readonly scene: number;
  readonly element: number;
  readonly media: number;
  readonly "3d": number;
  readonly mine: number;
}

export interface StudioInsertPlacementContext {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly selectionBounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

export const STUDIO_INSERT_HUB_CATEGORY_LABELS: Readonly<
  Record<StudioInsertHubCategory, string>
> = Object.freeze({
  all: "전체",
  quick: "빠른 삽입",
  scene: "장면·레이아웃",
  element: "요소·효과",
  media: "이미지·AI",
  "3d": "3D",
  mine: "내 에셋",
});

export const STUDIO_INSERT_HUB_COLLECTION_LABELS: Readonly<
  Record<StudioInsertHubCollection, string>
> = Object.freeze({
  all: "전체",
  favorites: "즐겨찾기",
  recent: "최근 사용",
});

export const STUDIO_INSERT_PLACEMENT_LABELS: Readonly<
  Record<StudioInsertPlacementMode, string>
> = Object.freeze({
  auto: "자동",
  page: "페이지 맞춤",
  selection: "선택 영역",
});

export const STUDIO_INSERT_ACTIONS = [
  {
    id: "action:text",
    actionId: "text",
    category: "quick",
    title: "텍스트",
    description: "편집 가능한 텍스트 레이어를 추가하고 바로 입력합니다.",
    keywords: ["글자", "문구", "대사", "caption", "text", "type"],
    badges: ["편집 가능", "즉시 입력"],
    useLabel: "텍스트 추가",
    icon: "text",
    sortPriority: 1_300,
  },
  {
    id: "action:bubble",
    actionId: "bubble",
    category: "quick",
    title: "말풍선",
    description:
      "꼬리·형태·식자를 계속 수정할 수 있는 말풍선 라이브러리를 엽니다.",
    keywords: ["대사", "speech", "balloon", "bubble", "꼬리", "식자"],
    badges: ["네이티브", "편집 가능"],
    useLabel: "말풍선 열기",
    icon: "bubble",
    sortPriority: 1_290,
  },
  {
    id: "action:upload",
    actionId: "upload",
    category: "media",
    title: "기기 이미지",
    description:
      "PNG·JPEG·WebP·GIF 등 기기의 이미지를 캔버스에 가져옵니다.",
    keywords: ["파일", "업로드", "사진", "이미지", "import", "upload", "gif"],
    badges: ["기기", "이미지"],
    useLabel: "파일 선택",
    icon: "upload",
    sortPriority: 1_280,
  },
  {
    id: "action:stock",
    actionId: "stock",
    category: "media",
    title: "스톡 이미지",
    description:
      "출처와 라이선스 정보를 보존하는 스톡 이미지 검색을 엽니다.",
    keywords: ["사진", "무료 이미지", "unsplash", "stock", "photo", "라이선스"],
    badges: ["검색", "출처 보존"],
    useLabel: "스톡 검색",
    icon: "stock",
    sortPriority: 1_270,
  },
  {
    id: "action:template",
    actionId: "template",
    category: "scene",
    title: "페이지 템플릿",
    description:
      "캔버스와 컷 구성을 빠르게 시작하는 레이아웃 템플릿을 엽니다.",
    keywords: ["레이아웃", "컷", "페이지", "template", "layout", "panel"],
    badges: ["레이아웃", "재사용"],
    useLabel: "템플릿 열기",
    icon: "template",
    sortPriority: 1_260,
  },
  {
    id: "action:collage",
    actionId: "collage",
    category: "scene",
    title: "이미지 콜라주",
    description:
      "여러 이미지를 슬롯에 맞춰 정렬하는 콜라주 배치 도구를 엽니다.",
    keywords: ["그리드", "여러 장", "사진 배치", "collage", "grid", "slot"],
    badges: ["다중 이미지", "자동 배치"],
    useLabel: "콜라주 열기",
    icon: "collage",
    sortPriority: 1_250,
  },
  {
    id: "action:elements",
    actionId: "elements",
    category: "element",
    title: "도형·장식 요소",
    description:
      "도형, 화살표, 프레임, 패턴과 연출 요소를 찾아 삽입합니다.",
    keywords: ["도형", "화살표", "프레임", "패턴", "shape", "element", "decor"],
    badges: ["벡터", "크기 조절"],
    useLabel: "요소 열기",
    icon: "elements",
    sortPriority: 1_240,
  },
  {
    id: "action:scene",
    actionId: "scene",
    category: "scene",
    title: "장면 템플릿",
    description:
      "인물·배경·연출이 조합된 장면을 미리 본 뒤 현재 페이지에 배치합니다.",
    keywords: ["장면", "배경", "연출", "scene", "composition", "background"],
    badges: ["미리보기", "장면 구성"],
    useLabel: "장면 열기",
    icon: "scene",
    sortPriority: 1_230,
  },
  {
    id: "action:clip",
    actionId: "clip",
    category: "quick",
    title: "저장된 클립",
    description:
      "자주 쓰는 레이어 묶음과 소품을 저장된 클립에서 다시 삽입합니다.",
    keywords: ["재사용", "레이어 묶음", "프리셋", "clip", "snippet", "reuse"],
    badges: ["재사용", "레이어 유지"],
    useLabel: "클립 열기",
    icon: "clip",
    sortPriority: 1_220,
  },
  {
    id: "action:sticker",
    actionId: "sticker",
    category: "element",
    title: "만화 효과·스티커",
    description:
      "효과음, 속도선, 집중선, 오버레이와 스티커를 삽입합니다.",
    keywords: ["효과음", "속도선", "집중선", "오버레이", "sticker", "sfx", "fx"],
    badges: ["연출", "효과"],
    useLabel: "효과 열기",
    icon: "sticker",
    sortPriority: 1_210,
  },
  {
    id: "action:emeres",
    actionId: "emeres",
    category: "element",
    title: "이메레스·밑그림",
    description:
      "구도와 포즈를 잡기 위한 밑그림 틀을 찾아 현재 컷에 배치합니다.",
    keywords: ["밑그림", "트레이싱", "포즈", "구도", "underlay", "reference"],
    badges: ["밑그림", "구도 보조"],
    useLabel: "이메레스 열기",
    icon: "emeres",
    sortPriority: 1_200,
  },
  {
    id: "action:background3d",
    actionId: "background3d",
    category: "3d",
    title: "3D 배경·오브젝트",
    description:
      "카메라, 조명과 오브젝트를 조정해 편집 가능한 3D 장면을 삽입합니다.",
    keywords: ["입체", "배경", "소품", "카메라", "3d", "object", "bg3d"],
    badges: ["3D", "재편집 가능"],
    useLabel: "3D 편집기 열기",
    icon: "background3d",
    sortPriority: 1_190,
  },
  {
    id: "action:ai",
    actionId: "ai",
    category: "media",
    title: "AI 이미지·장면 만들기",
    description:
      "배경, 캐릭터와 장면 구성을 생성한 뒤 출처 메타데이터와 함께 삽입합니다.",
    keywords: ["생성", "캐릭터", "배경", "인공지능", "ai", "generate", "prompt"],
    badges: ["AI", "생성 이력"],
    useLabel: "AI 도구 열기",
    icon: "ai",
    sortPriority: 1_180,
  },
] as const satisfies readonly StudioInsertHubActionDefinition[];

const QUERY_SYNONYMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  글자: ["텍스트", "문구", "text", "type"],
  텍스트: ["글자", "문구", "caption", "text"],
  대사: ["말풍선", "식자", "speech", "bubble"],
  말풍선: ["대사", "식자", "speech", "balloon"],
  사진: ["이미지", "스톡", "photo", "image"],
  이미지: ["사진", "미디어", "photo", "image"],
  업로드: ["파일", "가져오기", "import", "upload"],
  가져오기: ["업로드", "파일", "import", "upload"],
  장면: ["배경", "씬", "scene", "background"],
  배경: ["장면", "씬", "scene", "background"],
  레이아웃: ["템플릿", "컷", "layout", "template"],
  템플릿: ["레이아웃", "프리셋", "template", "preset"],
  도형: ["요소", "shape", "element"],
  요소: ["도형", "장식", "shape", "element"],
  효과: ["스티커", "효과음", "fx", "sfx", "sticker"],
  소품: ["오브젝트", "prop", "object"],
  오브젝트: ["소품", "prop", "object"],
  입체: ["3d", "모델", "bg3d"],
  "3d": ["입체", "모델", "bg3d"],
  최근: ["history", "recent"],
  즐겨찾기: ["favorite", "star", "bookmark"],
});

function emptyPreferences(): StudioInsertHubPreferences {
  return Object.freeze({
    version: STUDIO_INSERT_HUB_STATE_VERSION,
    favoriteIds: Object.freeze([]),
    recentIds: Object.freeze([]),
    placementMode: "auto",
  });
}

function normalizedEntryId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 220 ||
    normalized !== value ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizeIdList(raw: unknown, max: number): readonly string[] {
  if (!Array.isArray(raw)) return Object.freeze([]);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const id = normalizedEntryId(value);
    if (!id || seen.has(id)) continue;
    ids.push(id);
    seen.add(id);
    if (ids.length >= max) break;
  }
  return Object.freeze(ids);
}

function isPlacementMode(value: unknown): value is StudioInsertPlacementMode {
  return value === "auto" || value === "page" || value === "selection";
}

export function normalizeStudioInsertHubPreferences(
  raw: unknown,
): StudioInsertHubPreferences {
  let decoded = raw;
  if (typeof raw === "string") {
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      return emptyPreferences();
    }
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    return emptyPreferences();
  }
  const candidate = decoded as {
    version?: unknown;
    favoriteIds?: unknown;
    recentIds?: unknown;
    placementMode?: unknown;
  };
  if (candidate.version !== STUDIO_INSERT_HUB_STATE_VERSION) {
    return emptyPreferences();
  }
  return Object.freeze({
    version: STUDIO_INSERT_HUB_STATE_VERSION,
    favoriteIds: normalizeIdList(
      candidate.favoriteIds,
      STUDIO_INSERT_HUB_MAX_FAVORITES,
    ),
    recentIds: normalizeIdList(
      candidate.recentIds,
      STUDIO_INSERT_HUB_MAX_RECENTS,
    ),
    placementMode: isPlacementMode(candidate.placementMode)
      ? candidate.placementMode
      : "auto",
  });
}

export function loadStudioInsertHubPreferences(
  storage: Pick<Storage, "getItem"> | null,
): StudioInsertHubPreferences {
  if (!storage) return emptyPreferences();
  try {
    const raw = storage.getItem(STUDIO_INSERT_HUB_STORAGE_KEY);
    return raw === null
      ? emptyPreferences()
      : normalizeStudioInsertHubPreferences(raw);
  } catch {
    return emptyPreferences();
  }
}

export function saveStudioInsertHubPreferences(
  storage: Pick<Storage, "setItem"> | null,
  preferences: unknown,
): StudioInsertHubPreferences {
  const normalized = normalizeStudioInsertHubPreferences(preferences);
  if (!storage) return normalized;
  try {
    storage.setItem(STUDIO_INSERT_HUB_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Convenience state must never block editing in private/quota-restricted storage.
  }
  return normalized;
}

export function toggleStudioInsertFavorite(
  preferences: StudioInsertHubPreferences,
  entryId: string,
): StudioInsertHubPreferences {
  const normalized = normalizeStudioInsertHubPreferences(preferences);
  const id = normalizedEntryId(entryId);
  if (!id) return normalized;
  const favoriteIds = normalized.favoriteIds.includes(id)
    ? normalized.favoriteIds.filter((candidate) => candidate !== id)
    : [id, ...normalized.favoriteIds.filter((candidate) => candidate !== id)].slice(
        0,
        STUDIO_INSERT_HUB_MAX_FAVORITES,
      );
  return Object.freeze({
    ...normalized,
    favoriteIds: Object.freeze(favoriteIds),
  });
}

export function recordStudioInsertRecent(
  preferences: StudioInsertHubPreferences,
  entryId: string,
): StudioInsertHubPreferences {
  const normalized = normalizeStudioInsertHubPreferences(preferences);
  const id = normalizedEntryId(entryId);
  if (!id) return normalized;
  const recentIds = [
    id,
    ...normalized.recentIds.filter((candidate) => candidate !== id),
  ].slice(0, STUDIO_INSERT_HUB_MAX_RECENTS);
  return Object.freeze({ ...normalized, recentIds: Object.freeze(recentIds) });
}

export function setStudioInsertPlacementMode(
  preferences: StudioInsertHubPreferences,
  placementMode: StudioInsertPlacementMode,
): StudioInsertHubPreferences {
  return Object.freeze({
    ...normalizeStudioInsertHubPreferences(preferences),
    placementMode,
  });
}

export function reconcileStudioInsertHubPreferences(
  preferences: StudioInsertHubPreferences,
  availableIds: ReadonlySet<string>,
): StudioInsertHubPreferences {
  const normalized = normalizeStudioInsertHubPreferences(preferences);
  const favoriteIds = normalized.favoriteIds.filter((id) => availableIds.has(id));
  const recentIds = normalized.recentIds.filter((id) => availableIds.has(id));
  if (
    favoriteIds.length === normalized.favoriteIds.length &&
    recentIds.length === normalized.recentIds.length
  ) {
    return normalized;
  }
  return Object.freeze({
    ...normalized,
    favoriteIds: Object.freeze(favoriteIds),
    recentIds: Object.freeze(recentIds),
  });
}

function insertCategoryForAsset(item: StudioUnifiedAssetItem): InsertCategory {
  if (item.category === "scene") return "scene";
  if (item.category === "element") return "element";
  if (item.category === "3d") return "3d";
  return "mine";
}

export function buildStudioInsertHubEntries(
  items: readonly StudioUnifiedAssetItem[],
): readonly StudioInsertHubEntry[] {
  const entries: StudioInsertHubEntry[] = STUDIO_INSERT_ACTIONS.map(
    (action) => ({
      kind: "action",
      id: action.id,
      actionId: action.actionId,
      title: action.title,
      description: action.description,
      category: action.category,
      categoryLabel: STUDIO_INSERT_HUB_CATEGORY_LABELS[action.category],
      keywords: action.keywords,
      badges: action.badges,
      useLabel: action.useLabel,
      icon: action.icon,
      preview: { kind: "icon" },
      sortPriority: action.sortPriority,
      placementSupport: "none",
    }),
  );
  for (const item of items) {
    entries.push({
      kind: "asset",
      id: item.id,
      item,
      title: item.title,
      description: item.description,
      category: insertCategoryForAsset(item),
      categoryLabel: item.categoryLabel,
      keywords: item.keywords,
      badges: item.badges,
      useLabel: item.useLabel,
      preview: item.preview,
      sortPriority: item.sortPriority,
      placementSupport: item.source.kind === "local" ? "image" : "none",
    });
  }
  return Object.freeze(entries);
}

export function countStudioInsertHubEntries(
  entries: readonly StudioInsertHubEntry[],
): StudioInsertHubCounts {
  const counts = {
    all: entries.length,
    quick: 0,
    scene: 0,
    element: 0,
    media: 0,
    "3d": 0,
    mine: 0,
  } satisfies Record<StudioInsertHubCategory, number>;
  for (const entry of entries) counts[entry.category] += 1;
  return Object.freeze(counts);
}

function normalizeSearchValue(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function queryGroups(query: string): readonly (readonly string[])[] {
  return normalizeSearchValue(query.slice(0, STUDIO_INSERT_HUB_MAX_QUERY_LENGTH))
    .split(/\s+/u)
    .filter(Boolean)
    .map((token) =>
      Object.freeze(
        [token, ...(QUERY_SYNONYMS[token] ?? [])].map(normalizeSearchValue),
      ),
    );
}

function entryHaystack(entry: StudioInsertHubEntry): string {
  return normalizeSearchValue(
    [
      entry.id,
      entry.title,
      entry.description,
      entry.categoryLabel,
      ...entry.keywords,
      ...entry.badges,
    ].join(" "),
  );
}

function entryMatchesQuery(
  entry: StudioInsertHubEntry,
  groups: readonly (readonly string[])[],
): boolean {
  if (groups.length === 0) return true;
  const haystack = entryHaystack(entry);
  return groups.every((group) =>
    group.some((term) => haystack.includes(term)),
  );
}

function entrySearchScore(
  entry: StudioInsertHubEntry,
  normalizedQuery: string,
  groups: readonly (readonly string[])[],
  favoriteIds: ReadonlySet<string>,
  recentIndex: ReadonlyMap<string, number>,
): number {
  const title = normalizeSearchValue(entry.title);
  const description = normalizeSearchValue(entry.description);
  const keywords = normalizeSearchValue(entry.keywords.join(" "));
  let score = entry.sortPriority;
  if (title === normalizedQuery) score += 1_500;
  else if (title.startsWith(normalizedQuery)) score += 760;
  else if (title.includes(normalizedQuery)) score += 380;
  for (const group of groups) {
    if (group.some((term) => title.includes(term))) score += 120;
    if (group.some((term) => keywords.includes(term))) score += 60;
    if (group.some((term) => description.includes(term))) score += 25;
  }
  if (favoriteIds.has(entry.id)) score += 180;
  const recent = recentIndex.get(entry.id);
  if (recent !== undefined) score += Math.max(0, 120 - recent * 4);
  return score;
}

export function selectStudioInsertHubEntries(
  entries: readonly StudioInsertHubEntry[],
  options: StudioInsertHubSelectionOptions = {},
): StudioInsertHubEntry[] {
  const preferences = normalizeStudioInsertHubPreferences(options.preferences);
  const query = normalizeSearchValue(
    (options.query ?? "").slice(0, STUDIO_INSERT_HUB_MAX_QUERY_LENGTH),
  );
  const groups = queryGroups(query);
  const category = options.category ?? "all";
  const collection = options.collection ?? "all";
  const favoriteIds = new Set(preferences.favoriteIds);
  const recentIndex = new Map(
    preferences.recentIds.map((id, index) => [id, index] as const),
  );
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(240, Math.floor(options.limit ?? 120)))
    : 120;

  const filtered = entries.filter((entry) => {
    if (category !== "all" && entry.category !== category) return false;
    if (collection === "favorites" && !favoriteIds.has(entry.id)) return false;
    if (collection === "recent" && !recentIndex.has(entry.id)) return false;
    return entryMatchesQuery(entry, groups);
  });

  filtered.sort((first, second) => {
    if (collection === "recent") {
      const recentOrder =
        (recentIndex.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
        (recentIndex.get(second.id) ?? Number.MAX_SAFE_INTEGER);
      if (recentOrder !== 0) return recentOrder;
    }
    if (collection === "favorites") {
      const favoriteOrder =
        preferences.favoriteIds.indexOf(first.id) -
        preferences.favoriteIds.indexOf(second.id);
      if (favoriteOrder !== 0) return favoriteOrder;
    }
    const scoreDifference =
      entrySearchScore(
        second,
        query,
        groups,
        favoriteIds,
        recentIndex,
      ) -
      entrySearchScore(first, query, groups, favoriteIds, recentIndex);
    if (scoreDifference !== 0) return scoreDifference;
    return first.title.localeCompare(second.title, "ko-KR");
  });

  return filtered.slice(0, limit);
}

function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function resolveStudioInsertPlacement(
  mode: StudioInsertPlacementMode,
  context: StudioInsertPlacementContext,
): CanvasImagePlacement | undefined {
  if (mode === "auto") return undefined;
  const canvasWidth = finitePositive(context.canvasWidth);
  const canvasHeight = finitePositive(context.canvasHeight);
  if (!canvasWidth || !canvasHeight) return undefined;

  if (mode === "page") {
    return {
      bounds: { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
      inset: Math.min(48, canvasWidth / 10, canvasHeight / 10),
      maxScale: 1,
    };
  }

  const selection = context.selectionBounds;
  if (!selection) return undefined;
  const width = finitePositive(selection.width);
  const height = finitePositive(selection.height);
  if (
    !width ||
    !height ||
    !Number.isFinite(selection.x) ||
    !Number.isFinite(selection.y)
  ) {
    return undefined;
  }
  return {
    anchor: {
      x: selection.x + width / 2,
      y: selection.y + height / 2,
    },
    bounds: {
      x: selection.x,
      y: selection.y,
      width,
      height,
    },
    inset: Math.min(16, width / 12, height / 12),
    maxScale: 1,
  };
}
