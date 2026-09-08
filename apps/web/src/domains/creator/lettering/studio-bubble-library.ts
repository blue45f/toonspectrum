import {
  BUBBLE_VARIANTS,
  BUBBLE_VARIANT_GROUPS,
  type BubbleVariant,
} from "../studio-assets";

export const BUBBLE_LIBRARY_PREFERENCES_STORAGE_KEY =
  "toonstudio.studio.bubble-library.v1";
export const BUBBLE_LIBRARY_PREFERENCES_VERSION = 1 as const;
export const BUBBLE_LIBRARY_RECENT_LIMIT = 6;
export const BUBBLE_LIBRARY_QUERY_LIMIT = 96;
const BUBBLE_LIBRARY_STORAGE_TEXT_LIMIT = 16_384;

export type BubbleLibraryVariant = (typeof BUBBLE_VARIANTS)[number];

export interface BubbleLibraryPreferences {
  readonly favoriteIds: readonly BubbleVariant[];
  readonly recentIds: readonly BubbleVariant[];
}

export interface BubbleLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BubbleLibrarySection {
  readonly id: string;
  readonly kind: "favorite" | "recent" | "group";
  readonly label: string;
  readonly variants: readonly BubbleLibraryVariant[];
}

export const EMPTY_BUBBLE_LIBRARY_PREFERENCES: BubbleLibraryPreferences =
  Object.freeze({
    favoriteIds: Object.freeze([]) as readonly BubbleVariant[],
    recentIds: Object.freeze([]) as readonly BubbleVariant[],
  });

const BUBBLE_VARIANT_BY_ID = new Map<BubbleVariant, BubbleLibraryVariant>(
  BUBBLE_VARIANTS.map((variant) => [variant.id, variant] as const),
);
const BUBBLE_VARIANT_INDEX = new Map<BubbleVariant, number>(
  BUBBLE_VARIANTS.map((variant, index) => [variant.id, index] as const),
);
const BUBBLE_VARIANT_GROUP_BY_ID = new Map<BubbleVariant, string>();
for (const section of BUBBLE_VARIANT_GROUPS) {
  for (const id of section.ids) BUBBLE_VARIANT_GROUP_BY_ID.set(id, section.group);
}

const BUBBLE_SEARCH_ALIASES = {
  speech: [
    "대사",
    "일반",
    "기본",
    "보통",
    "말",
    "dialogue",
    "speech",
    "talk",
    "normal",
    "セリフ",
    "台詞",
    "吹き出し",
  ],
  double: [
    "긴 대사",
    "이어짐",
    "연결",
    "시간차",
    "연속",
    "double",
    "linked",
    "continued",
    "長いセリフ",
  ],
  thought: [
    "생각",
    "속마음",
    "독백",
    "내면",
    "마음속",
    "thought",
    "thinking",
    "monologue",
    "心の声",
    "思考",
  ],
  shout: [
    "외침",
    "고함",
    "큰 소리",
    "소리침",
    "shout",
    "yell",
    "scream",
    "叫び",
    "大声",
  ],
  box: [
    "나레이션",
    "내레이션",
    "설명",
    "시간 장소",
    "캡션",
    "caption",
    "narration",
    "narrative",
    "説明",
    "ナレーション",
  ],
  whisper: [
    "속삭임",
    "작은 목소리",
    "소근",
    "비밀",
    "whisper",
    "quiet",
    "secret",
    "ささやき",
    "小声",
  ],
  scared: [
    "공포",
    "불안",
    "떨림",
    "소심",
    "겁",
    "scared",
    "fear",
    "wobbly",
    "震え",
    "恐怖",
  ],
  system: [
    "상태창",
    "알림",
    "퀘스트",
    "게임 ui",
    "system",
    "notification",
    "quest",
    "status",
    "システム",
  ],
  heart: [
    "사랑",
    "로맨스",
    "설렘",
    "호감",
    "러블리",
    "heart",
    "love",
    "romance",
    "cute",
    "恋愛",
    "ハート",
  ],
  phone: [
    "메신저",
    "채팅",
    "문자",
    "통화",
    "휴대폰",
    "phone",
    "chat",
    "message",
    "sms",
    "メッセージ",
    "チャット",
  ],
  angry: [
    "분노",
    "화남",
    "격앙",
    "절규",
    "angry",
    "rage",
    "furious",
    "怒り",
    "激怒",
  ],
  explosive: [
    "폭발",
    "임팩트",
    "충격",
    "액션",
    "explosion",
    "impact",
    "blast",
    "action",
    "爆発",
    "衝撃",
  ],
  "cloud-soft": [
    "구름",
    "몽환",
    "꿈",
    "회상",
    "부드러움",
    "cloud",
    "dream",
    "soft",
    "reminiscence",
    "雲",
    "夢",
  ],
  "digital-code": [
    "디지털",
    "코드",
    "sf",
    "홀로그램",
    "기계음",
    "전자음",
    "digital",
    "code",
    "hologram",
    "machine",
    "電子音",
    "ホログラム",
  ],
  "sparkle-magical": [
    "마법",
    "반짝",
    "신비",
    "판타지",
    "sparkle",
    "magic",
    "fantasy",
    "glitter",
    "魔法",
    "きらきら",
  ],
  "comic-narrative": [
    "해설",
    "띠",
    "상단",
    "만화 캡션",
    "comic caption",
    "narrative strip",
    "commentary",
    "解説",
    "帯",
  ],
} as const satisfies Readonly<Record<BubbleVariant, readonly string[]>>;

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const HANGUL_SYLLABLES_PER_INITIAL = 588;
const HANGUL_INITIALS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_/-]+/gu, " ")
    .trim();
}

export function extractHangulInitials(value: string): string {
  let result = "";
  for (const character of value.normalize("NFKC")) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint >= HANGUL_BASE && codePoint <= HANGUL_END) {
      const initialIndex = Math.floor(
        (codePoint - HANGUL_BASE) / HANGUL_SYLLABLES_PER_INITIAL,
      );
      result += HANGUL_INITIALS[initialIndex] ?? "";
      continue;
    }
    if (/[ㄱ-ㅎ]/u.test(character)) result += character;
    else if (/\s/u.test(character)) result += " ";
  }
  return result.replace(/\s+/gu, " ").trim();
}

function queryTokens(query: string): readonly string[] {
  return normalizeSearchText(query)
    .slice(0, BUBBLE_LIBRARY_QUERY_LIMIT)
    .split(" ")
    .filter(Boolean);
}

function searchFieldsFor(variant: BubbleLibraryVariant): readonly string[] {
  const values = [
    variant.id,
    variant.label,
    variant.hint,
    BUBBLE_VARIANT_GROUP_BY_ID.get(variant.id) ?? "",
    "말풍선",
    "speech bubble",
    "bubble",
    "吹き出し",
    ...BUBBLE_SEARCH_ALIASES[variant.id],
  ];
  const fields = new Set<string>();
  for (const value of values) {
    const normalized = normalizeSearchText(value);
    if (normalized) fields.add(normalized);
    const initials = normalizeSearchText(extractHangulInitials(value));
    if (initials) fields.add(initials);
  }
  return [...fields];
}

const BUBBLE_SEARCH_FIELDS = new Map<BubbleVariant, readonly string[]>(
  BUBBLE_VARIANTS.map((variant) => [variant.id, searchFieldsFor(variant)] as const),
);

function tokenScore(field: string, token: string): number {
  if (field === token) return 120;
  if (field.startsWith(token)) return 90;
  if (field.split(" ").some((word) => word.startsWith(token))) return 72;
  if (field.includes(token)) return 48;
  return -1;
}

export function scoreBubbleVariantSearch(
  variant: BubbleLibraryVariant,
  query: string,
): number | null {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 0;
  const fields = BUBBLE_SEARCH_FIELDS.get(variant.id) ?? [];
  let score = 0;
  for (const token of tokens) {
    let best = -1;
    for (const field of fields) best = Math.max(best, tokenScore(field, token));
    if (best < 0) return null;
    score += best;
  }
  return score;
}

export function searchBubbleVariants(
  query: string,
  variants: readonly BubbleLibraryVariant[] = BUBBLE_VARIANTS,
): readonly BubbleLibraryVariant[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [...variants];
  return variants
    .map((variant) => ({
      variant,
      score: scoreBubbleVariantSearch(variant, query),
      index: BUBBLE_VARIANT_INDEX.get(variant.id) ?? Number.MAX_SAFE_INTEGER,
    }))
    .filter(
      (entry): entry is { variant: BubbleLibraryVariant; score: number; index: number } =>
        entry.score !== null,
    )
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.variant);
}

function isBubbleVariant(value: unknown): value is BubbleVariant {
  return typeof value === "string" && BUBBLE_VARIANT_BY_ID.has(value as BubbleVariant);
}

function normalizeVariantIds(value: unknown, limit: number): readonly BubbleVariant[] {
  if (!Array.isArray(value)) return [];
  const result: BubbleVariant[] = [];
  const seen = new Set<BubbleVariant>();
  for (const candidate of value) {
    if (!isBubbleVariant(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}

export function parseBubbleLibraryPreferences(
  raw: string | null | undefined,
): BubbleLibraryPreferences {
  if (!raw || raw.length > BUBBLE_LIBRARY_STORAGE_TEXT_LIMIT) {
    return EMPTY_BUBBLE_LIBRARY_PREFERENCES;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return EMPTY_BUBBLE_LIBRARY_PREFERENCES;
    const record = parsed as Record<string, unknown>;
    if (record.version !== BUBBLE_LIBRARY_PREFERENCES_VERSION) {
      return EMPTY_BUBBLE_LIBRARY_PREFERENCES;
    }
    return {
      favoriteIds: normalizeVariantIds(record.favoriteIds, BUBBLE_VARIANTS.length),
      recentIds: normalizeVariantIds(record.recentIds, BUBBLE_LIBRARY_RECENT_LIMIT),
    };
  } catch {
    return EMPTY_BUBBLE_LIBRARY_PREFERENCES;
  }
}

export function readBubbleLibraryPreferences(
  storage: BubbleLibraryStorage | null | undefined,
): BubbleLibraryPreferences {
  if (!storage) return EMPTY_BUBBLE_LIBRARY_PREFERENCES;
  try {
    return parseBubbleLibraryPreferences(
      storage.getItem(BUBBLE_LIBRARY_PREFERENCES_STORAGE_KEY),
    );
  } catch {
    return EMPTY_BUBBLE_LIBRARY_PREFERENCES;
  }
}

export function writeBubbleLibraryPreferences(
  storage: BubbleLibraryStorage | null | undefined,
  preferences: BubbleLibraryPreferences,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      BUBBLE_LIBRARY_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: BUBBLE_LIBRARY_PREFERENCES_VERSION,
        favoriteIds: normalizeVariantIds(
          preferences.favoriteIds,
          BUBBLE_VARIANTS.length,
        ),
        recentIds: normalizeVariantIds(
          preferences.recentIds,
          BUBBLE_LIBRARY_RECENT_LIMIT,
        ),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function toggleBubbleFavorite(
  preferences: BubbleLibraryPreferences,
  id: BubbleVariant,
): BubbleLibraryPreferences {
  const favoriteIds = preferences.favoriteIds.includes(id)
    ? preferences.favoriteIds.filter((candidate) => candidate !== id)
    : [id, ...preferences.favoriteIds];
  return { ...preferences, favoriteIds };
}

export function recordBubbleUse(
  preferences: BubbleLibraryPreferences,
  id: BubbleVariant,
): BubbleLibraryPreferences {
  return {
    ...preferences,
    recentIds: [
      id,
      ...preferences.recentIds.filter((candidate) => candidate !== id),
    ].slice(0, BUBBLE_LIBRARY_RECENT_LIMIT),
  };
}

function variantsFromIds(ids: readonly BubbleVariant[]): readonly BubbleLibraryVariant[] {
  return ids
    .map((id) => BUBBLE_VARIANT_BY_ID.get(id))
    .filter((variant): variant is BubbleLibraryVariant => variant !== undefined);
}

function groupSections(
  variants: readonly BubbleLibraryVariant[],
  excludedIds: ReadonlySet<BubbleVariant> = new Set(),
  orderGroupsByRelevance = false,
): readonly BubbleLibrarySection[] {
  const groupedIds = new Set<BubbleVariant>();
  const sections: BubbleLibrarySection[] = [];
  for (const group of BUBBLE_VARIANT_GROUPS) {
    const groupIds = new Set(group.ids);
    for (const id of group.ids) groupedIds.add(id);
    // Search results keep their relevance order inside each role group instead of
    // silently falling back to the catalog order.
    const groupVariants = variants.filter(
      (variant) => groupIds.has(variant.id) && !excludedIds.has(variant.id),
    );
    if (groupVariants.length > 0) {
      sections.push({
        id: `group:${group.group}`,
        kind: "group",
        label: group.group,
        variants: groupVariants,
      });
    }
  }
  const other = variants.filter(
    (variant) => !groupedIds.has(variant.id) && !excludedIds.has(variant.id),
  );
  if (other.length > 0) {
    sections.push({ id: "group:other", kind: "group", label: "기타", variants: other });
  }
  if (orderGroupsByRelevance) {
    const rankById = new Map(
      variants.map((variant, index) => [variant.id, index] as const),
    );
    sections.sort((left, right) => {
      const leftRank = Math.min(
        ...left.variants.map((variant) => rankById.get(variant.id) ?? Number.MAX_SAFE_INTEGER),
      );
      const rightRank = Math.min(
        ...right.variants.map((variant) => rankById.get(variant.id) ?? Number.MAX_SAFE_INTEGER),
      );
      return leftRank - rightRank;
    });
  }
  return sections;
}

export function buildBubbleLibrarySections(options: {
  readonly query: string;
  readonly favoritesOnly: boolean;
  readonly preferences: BubbleLibraryPreferences;
}): readonly BubbleLibrarySection[] {
  const { query, favoritesOnly, preferences } = options;
  const hasQuery = queryTokens(query).length > 0;
  const favorites = variantsFromIds(preferences.favoriteIds);

  if (favoritesOnly) {
    const variants = hasQuery ? searchBubbleVariants(query, favorites) : favorites;
    return variants.length > 0
      ? [{ id: "favorites", kind: "favorite", label: "즐겨찾기", variants }]
      : [];
  }

  if (hasQuery) {
    return groupSections(searchBubbleVariants(query), new Set(), true);
  }

  const sections: BubbleLibrarySection[] = [];
  const featuredIds = new Set<BubbleVariant>();
  if (favorites.length > 0) {
    sections.push({
      id: "favorites",
      kind: "favorite",
      label: "즐겨찾기",
      variants: favorites,
    });
    for (const variant of favorites) featuredIds.add(variant.id);
  }

  const recent = variantsFromIds(preferences.recentIds).filter(
    (variant) => !featuredIds.has(variant.id),
  );
  if (recent.length > 0) {
    sections.push({ id: "recent", kind: "recent", label: "최근 사용", variants: recent });
    for (const variant of recent) featuredIds.add(variant.id);
  }

  sections.push(...groupSections(BUBBLE_VARIANTS, featuredIds));
  return sections;
}

export function countUniqueBubbleLibraryVariants(
  sections: readonly BubbleLibrarySection[],
): number {
  return new Set(sections.flatMap((section) => section.variants.map((variant) => variant.id)))
    .size;
}

export function getBubbleLibraryVariant(
  id: BubbleVariant | null | undefined,
): BubbleLibraryVariant | null {
  if (!id) return null;
  return BUBBLE_VARIANT_BY_ID.get(id) ?? null;
}

export function dialogueSampleForBubbleRecommendation(script: string): string {
  // Only the newest dialogue can affect the recommendation. Bounding the scanned tail
  // keeps pasted scripts from turning a lightweight local hint into an O(document) render cost.
  const lines = script
    .slice(-4_096)
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const latest = lines[lines.length - 1] ?? "";
  return latest.replace(/^[^:：\n]{1,32}[:：]\s*/u, "").trim();
}

export function bubbleVariantForShapePreset(shapePreset: string): BubbleVariant {
  switch (shapePreset) {
    case "shout-spiky":
      return "shout";
    case "wobbly-distress":
      return "scared";
    case "whisper-dashed":
      return "whisper";
    case "cloud-thought":
      return "thought";
    case "soft-blush":
      return "heart";
    default:
      return "speech";
  }
}

export function bubbleVariantForDialogueRecommendation(
  dialogueSample: string,
  shapePreset: string,
): BubbleVariant {
  // The production script importer already treats parenthesized lines as narration.
  // Preserve that authoring grammar even when the general emotion matcher classifies
  // parentheses as an internal monologue.
  if (/^(?:\(|（)[\s\S]*(?:\)|）)$/u.test(dialogueSample.trim())) return "box";
  return bubbleVariantForShapePreset(shapePreset);
}
