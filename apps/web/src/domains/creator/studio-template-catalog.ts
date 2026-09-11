import type {
  StudioTemplateDefinition,
  StudioTemplateValue,
} from "./studio-template-system";

export const STUDIO_TEMPLATE_CATEGORIES = [
  "all",
  "webtoon",
  "illustration",
  "promotion",
  "presentation",
  "storyboard",
] as const;

export type StudioTemplateCategory =
  (typeof STUDIO_TEMPLATE_CATEGORIES)[number];
export type StudioTemplateDifficulty = "easy" | "professional";
export type StudioTemplateWorkspace =
  | "comic"
  | "design"
  | "draw"
  | "slides"
  | "storyboard";

export interface StudioTemplateCatalogItem {
  readonly id: string;
  readonly category: Exclude<StudioTemplateCategory, "all">;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly tags: readonly string[];
  readonly difficulty: StudioTemplateDifficulty;
  readonly recommendedWorkspace: StudioTemplateWorkspace;
  readonly definition: StudioTemplateDefinition;
}

export interface StudioTemplateCatalogQuery {
  readonly text?: string;
  readonly category?: StudioTemplateCategory;
  readonly favoriteIds?: readonly string[];
  readonly favoritesOnly?: boolean;
}

export interface StudioTemplateHandoff {
  readonly schemaVersion: 1;
  readonly templateId: string;
  readonly workspace: StudioTemplateWorkspace;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface StudioTemplateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const STUDIO_TEMPLATE_FAVORITES_KEY =
  "toonspectrum:studio-template-favorites:v1";
export const STUDIO_TEMPLATE_HANDOFF_KEY =
  "toonspectrum:studio-template-handoff:v1";

function textSlot(
  id: string,
  label: string,
  defaultValue: string,
  maxLength = 80,
): StudioTemplateDefinition["slots"][number] {
  return {
    id,
    label,
    kind: "text",
    required: true,
    maxLength,
    minimum: null,
    maximum: null,
    acceptedAssetTypes: [],
    defaultValue: { kind: "text", value: defaultValue },
  };
}

function imageSlot(
  id: string,
  label: string,
): StudioTemplateDefinition["slots"][number] {
  return {
    id,
    label,
    kind: "image",
    required: true,
    maxLength: null,
    minimum: null,
    maximum: null,
    acceptedAssetTypes: ["image"],
    defaultValue: {
      kind: "image",
      assetId: `placeholder:${id}`,
      rightsStatus: "unknown",
    },
  };
}

function colorSlot(
  id: string,
  label: string,
  value: string,
): StudioTemplateDefinition["slots"][number] {
  return {
    id,
    label,
    kind: "color",
    required: true,
    maxLength: null,
    minimum: null,
    maximum: null,
    acceptedAssetTypes: [],
    defaultValue: { kind: "color", value },
  };
}

export const STUDIO_TEMPLATE_CATALOG = Object.freeze([
  {
    id: "webtoon-vertical-episode",
    category: "webtoon",
    titleKo: "세로 웹툰 기본 원고",
    titleEn: "Vertical webtoon episode",
    descriptionKo:
      "컷 간격, 말풍선 안전 영역, 휴대폰 미리보기와 플랫폼 출력 규칙을 포함한 연재용 원고입니다.",
    descriptionEn:
      "A production-ready episode with panel gaps, balloon safe areas, phone preview and platform export rules.",
    tags: ["세로 웹툰", "연재", "말풍선", "모바일"],
    difficulty: "easy",
    recommendedWorkspace: "comic",
    definition: {
      id: "template:webtoon-vertical-episode",
      version: 1,
      title: "Vertical webtoon episode",
      documentKind: "comic",
      slots: [
        textSlot("episode-title", "회차 제목", "새 에피소드", 60),
        colorSlot("background", "원고 배경", "#ffffff"),
      ],
    },
  },
  {
    id: "webtoon-four-panel",
    category: "webtoon",
    titleKo: "4컷·컷툰",
    titleEn: "Four-panel comic",
    descriptionKo:
      "도입·전개·반전·마무리 구조와 읽기 순서를 갖춘 짧은 컷툰 템플릿입니다.",
    descriptionEn:
      "A short-form comic with setup, development, twist, payoff and explicit reading order.",
    tags: ["4컷", "컷툰", "SNS", "짧은 만화"],
    difficulty: "easy",
    recommendedWorkspace: "comic",
    definition: {
      id: "template:webtoon-four-panel",
      version: 1,
      title: "Four-panel comic",
      documentKind: "comic",
      slots: [
        textSlot("title", "작품 제목", "오늘의 4컷", 40),
        colorSlot("accent", "강조 색상", "#f97316"),
      ],
    },
  },
  {
    id: "illustration-character-sheet",
    category: "illustration",
    titleKo: "캐릭터 설정 시트",
    titleEn: "Character reference sheet",
    descriptionKo:
      "정면·측면·후면, 표정, 색상, 의상과 소품을 한 장에서 관리하는 전문 설정 시트입니다.",
    descriptionEn:
      "A professional sheet for front, side, back, expressions, colors, costume and props.",
    tags: ["캐릭터", "턴어라운드", "표정", "설정집"],
    difficulty: "professional",
    recommendedWorkspace: "draw",
    definition: {
      id: "template:illustration-character-sheet",
      version: 1,
      title: "Character reference sheet",
      documentKind: "illustration",
      slots: [
        textSlot("character-name", "캐릭터 이름", "새 캐릭터", 40),
        imageSlot("character-reference", "캐릭터 참고 이미지"),
        colorSlot("primary-color", "대표 색상", "#334155"),
      ],
    },
  },
  {
    id: "promotion-episode-release",
    category: "promotion",
    titleKo: "신작·회차 공개 홍보",
    titleEn: "Episode release promotion",
    descriptionKo:
      "작품 표지, 회차 제목, 공개 일시와 CTA를 SNS 규격으로 재배치할 수 있는 디자인입니다.",
    descriptionEn:
      "A social design that adapts cover art, episode title, release time and call to action.",
    tags: ["홍보", "SNS", "썸네일", "표지"],
    difficulty: "easy",
    recommendedWorkspace: "design",
    definition: {
      id: "template:promotion-episode-release",
      version: 1,
      title: "Episode release promotion",
      documentKind: "design",
      slots: [
        textSlot("title", "작품·회차 제목", "새 에피소드 공개", 50),
        imageSlot("hero", "대표 이미지"),
        textSlot("cta", "행동 문구", "지금 감상하기", 24),
        colorSlot("accent", "강조 색상", "#7c3aed"),
      ],
    },
  },
  {
    id: "presentation-webtoon-pitch",
    category: "presentation",
    titleKo: "웹툰 피칭 자료",
    titleEn: "Webtoon pitch deck",
    descriptionKo:
      "로그라인, 독자, 캐릭터, 세계관, 시각 방향, 연재 계획과 제작 예산을 설명하는 발표 자료입니다.",
    descriptionEn:
      "A pitch deck for logline, audience, characters, world, visual direction, release plan and budget.",
    tags: ["PPT", "피칭", "기획서", "발표"],
    difficulty: "professional",
    recommendedWorkspace: "slides",
    definition: {
      id: "template:presentation-webtoon-pitch",
      version: 1,
      title: "Webtoon pitch deck",
      documentKind: "slides",
      slots: [
        textSlot("project-title", "작품 제목", "작품 피칭", 50),
        textSlot("logline", "로그라인", "한 문장으로 작품의 약속을 설명하세요.", 160),
        imageSlot("key-visual", "키 비주얼"),
        colorSlot("theme", "테마 색상", "#111827"),
      ],
    },
  },
  {
    id: "storyboard-animatic",
    category: "storyboard",
    titleKo: "콘티·애니매틱",
    titleEn: "Storyboard and animatic",
    descriptionKo:
      "장면 목적, 샷, 대사, 지속 시간, 카메라 이동과 음성을 순서대로 연결합니다.",
    descriptionEn:
      "Connect scene purpose, shots, dialogue, timing, camera motion and voice in sequence.",
    tags: ["콘티", "애니매틱", "영상", "장면"],
    difficulty: "professional",
    recommendedWorkspace: "storyboard",
    definition: {
      id: "template:storyboard-animatic",
      version: 1,
      title: "Storyboard and animatic",
      documentKind: "storyboard",
      slots: [
        textSlot("sequence-title", "시퀀스 제목", "Opening sequence", 60),
        imageSlot("opening-frame", "첫 프레임"),
      ],
    },
  },
] as const satisfies readonly StudioTemplateCatalogItem[]);

const TEMPLATE_BY_ID = new Map(
  STUDIO_TEMPLATE_CATALOG.map((template) => [template.id, template]),
);

function normalizedText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function studioTemplateById(
  templateId: string | null | undefined,
): StudioTemplateCatalogItem | null {
  if (!templateId) return null;
  return TEMPLATE_BY_ID.get(templateId.trim()) ?? null;
}

export function searchStudioTemplates(
  query: StudioTemplateCatalogQuery = {},
): readonly StudioTemplateCatalogItem[] {
  const text = normalizedText(query.text ?? "");
  const category = query.category ?? "all";
  const favorites = new Set(query.favoriteIds ?? []);
  return Object.freeze(STUDIO_TEMPLATE_CATALOG.filter((template) => {
    if (category !== "all" && template.category !== category) return false;
    if (query.favoritesOnly && !favorites.has(template.id)) return false;
    if (!text) return true;
    const searchable = normalizedText([
      template.titleKo,
      template.titleEn,
      template.descriptionKo,
      template.descriptionEn,
      ...template.tags,
    ].join(" "));
    return searchable.includes(text);
  }));
}

export function defaultStudioTemplateValues(
  template: StudioTemplateCatalogItem,
): Readonly<Record<string, StudioTemplateValue>> {
  return Object.freeze(Object.fromEntries(
    template.definition.slots.flatMap((slot) => slot.defaultValue
      ? [[slot.id, slot.defaultValue] as const]
      : []),
  ));
}

export function readStudioTemplateFavorites(
  storage: StudioTemplateStorage,
): readonly string[] {
  const raw = storage.getItem(STUDIO_TEMPLATE_FAVORITES_KEY);
  if (!raw) return Object.freeze([]);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return Object.freeze([]);
    return Object.freeze([...new Set(parsed.filter((value): value is string => (
      typeof value === "string" && TEMPLATE_BY_ID.has(value)
    )))].sort());
  } catch {
    return Object.freeze([]);
  }
}

export function writeStudioTemplateFavorites(
  storage: StudioTemplateStorage,
  favoriteIds: readonly string[],
): readonly string[] {
  const next = Object.freeze([...new Set(favoriteIds.filter((id) => TEMPLATE_BY_ID.has(id)))].sort());
  storage.setItem(STUDIO_TEMPLATE_FAVORITES_KEY, JSON.stringify(next));
  return next;
}

export function studioTemplateStartHref(templateId: string): string {
  const template = studioTemplateById(templateId);
  if (!template) throw new Error("A known Studio template is required.");
  const params = new URLSearchParams({
    template: template.id,
    workspace: template.recommendedWorkspace,
  });
  params.sort();
  return `/studio/new?${params.toString()}`;
}

export function createStudioTemplateHandoff(
  templateId: string,
  createdAt = new Date().toISOString(),
  ttlMs = 15 * 60 * 1000,
): StudioTemplateHandoff {
  const template = studioTemplateById(templateId);
  const createdAtMs = Date.parse(createdAt);
  if (!template || !Number.isFinite(createdAtMs) || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("A known template, valid time and positive TTL are required.");
  }
  return Object.freeze({
    schemaVersion: 1,
    templateId: template.id,
    workspace: template.recommendedWorkspace,
    createdAt,
    expiresAt: new Date(createdAtMs + ttlMs).toISOString(),
  });
}

export function writeStudioTemplateHandoff(
  storage: StudioTemplateStorage,
  handoff: StudioTemplateHandoff,
): StudioTemplateHandoff {
  if (!studioTemplateById(handoff.templateId)
    || handoff.schemaVersion !== 1
    || !Number.isFinite(Date.parse(handoff.createdAt))
    || !Number.isFinite(Date.parse(handoff.expiresAt))) {
    throw new Error("A valid Studio template handoff is required.");
  }
  storage.setItem(STUDIO_TEMPLATE_HANDOFF_KEY, JSON.stringify(handoff));
  return handoff;
}

export function readStudioTemplateHandoff(
  storage: StudioTemplateStorage,
  now = new Date().toISOString(),
): StudioTemplateHandoff | null {
  const raw = storage.getItem(STUDIO_TEMPLATE_HANDOFF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StudioTemplateHandoff> | null;
    const template = studioTemplateById(parsed?.templateId);
    const nowMs = Date.parse(now);
    const expiresAtMs = Date.parse(parsed?.expiresAt ?? "");
    if (!parsed
      || parsed.schemaVersion !== 1
      || !template
      || parsed.workspace !== template.recommendedWorkspace
      || !Number.isFinite(nowMs)
      || !Number.isFinite(expiresAtMs)
      || expiresAtMs <= nowMs) {
      storage.removeItem?.(STUDIO_TEMPLATE_HANDOFF_KEY);
      return null;
    }
    return Object.freeze({
      schemaVersion: 1,
      templateId: template.id,
      workspace: template.recommendedWorkspace,
      createdAt: String(parsed.createdAt),
      expiresAt: String(parsed.expiresAt),
    });
  } catch {
    storage.removeItem?.(STUDIO_TEMPLATE_HANDOFF_KEY);
    return null;
  }
}
