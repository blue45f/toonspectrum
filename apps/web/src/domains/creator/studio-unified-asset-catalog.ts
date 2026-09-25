import {
  listStudioElementLibrary,
  type StudioElementItem,
} from "./studio-elements-catalog";
import {
  getStudio2dAssetMetadata,
  isRecommendedStudio2dScene,
  studio2dResolutionLabel,
} from "./studio-2d-asset-quality";
import {
  getStudioBackgroundTemplateIds,
  getStudioSceneTemplateBackgroundIds,
} from "./studio-scene-template-asset-recommendations";
import {
  listStudioObjectInsertItems,
  type StudioObjectInsertItem,
} from "./studio-object-insert-catalog";

import type { StudioAsset } from "./studio-asset-library";
import type { SceneTemplate } from "./studio-scene-templates";
import type { StudioRasterAsset } from "./render/studio-raster-assets";

export type StudioUnifiedAssetCategory =
  | "all"
  | "scene"
  | "element"
  | "3d"
  | "mine";

export type StudioUnifiedAssetScope = "all" | "studio" | "mine";
export type StudioUnifiedNativeToolId = "bubble";
export type StudioUnifiedAssetUseMode = "insert" | "apply" | "open";
export type StudioUnifiedAssetDiscoverability =
  | "featured"
  | "standard"
  | "caution";

export interface StudioUnifiedBackgroundSource {
  readonly id: string;
  readonly label: string;
  readonly genre: string;
  readonly svg?: string;
  readonly imgSrc?: string;
  readonly width?: number;
  readonly height?: number;
}

export type StudioUnifiedAssetPreview =
  | { readonly kind: "image"; readonly src: string }
  | { readonly kind: "svg"; readonly svg: string }
  | { readonly kind: "none" };

export interface StudioUnifiedNativeTool {
  readonly id: StudioUnifiedNativeToolId;
  readonly menu: "bubble";
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
}

export type StudioUnifiedAssetSource =
  | { readonly kind: "background"; readonly value: StudioUnifiedBackgroundSource }
  | { readonly kind: "scene-template"; readonly value: SceneTemplate }
  | { readonly kind: "element"; readonly value: StudioElementItem }
  | { readonly kind: "builtin-raster"; readonly value: StudioRasterAsset }
  | { readonly kind: "object-3d"; readonly value: StudioObjectInsertItem }
  | { readonly kind: "local"; readonly value: StudioAsset }
  | { readonly kind: "native-tool"; readonly value: StudioUnifiedNativeTool };

export interface StudioUnifiedAssetItem {
  readonly id: string;
  readonly category: Exclude<StudioUnifiedAssetCategory, "all">;
  readonly scope: Exclude<StudioUnifiedAssetScope, "all">;
  readonly title: string;
  readonly description: string;
  readonly categoryLabel: string;
  readonly keywords: readonly string[];
  readonly badges: readonly string[];
  readonly preview: StudioUnifiedAssetPreview;
  readonly useMode: StudioUnifiedAssetUseMode;
  readonly useLabel: string;
  readonly discoverability: StudioUnifiedAssetDiscoverability;
  readonly sortPriority: number;
  readonly source: StudioUnifiedAssetSource;
}

export interface BuildStudioUnifiedAssetCatalogInput {
  readonly backgrounds?: readonly StudioUnifiedBackgroundSource[];
  readonly sceneTemplates?: readonly SceneTemplate[];
  readonly localAssets?: readonly StudioAsset[];
  readonly elements?: readonly StudioElementItem[];
  readonly rasterAssets?: readonly StudioRasterAsset[];
  readonly objects?: readonly StudioObjectInsertItem[];
  readonly nativeTools?: readonly StudioUnifiedNativeTool[];
}

export interface StudioUnifiedAssetSearchInput {
  readonly query?: string;
  readonly category?: StudioUnifiedAssetCategory;
  readonly scope?: StudioUnifiedAssetScope;
  readonly limit?: number;
}

export const STUDIO_UNIFIED_ASSET_CATEGORY_LABELS: Readonly<
  Record<StudioUnifiedAssetCategory, string>
> = Object.freeze({
  all: "전체",
  scene: "장면",
  element: "요소",
  "3d": "3D",
  mine: "내 에셋",
});

const QUERY_SYNONYMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  학교: ["교실", "학원", "school", "classroom"],
  교실: ["학교", "학원", "school", "classroom"],
  회사: ["오피스", "사무실", "office"],
  오피스: ["회사", "사무실", "office"],
  배경: ["장면", "scene", "background"],
  장면: ["배경", "scene", "background", "template"],
  소품: ["오브젝트", "prop", "object"],
  오브젝트: ["소품", "prop", "object"],
  입체: ["3d", "모델", "bg3d"],
  "3d": ["입체", "모델", "bg3d"],
  말풍선: ["대사", "bubble", "speech"],
  효과: ["fx", "effect", "스티커"],
  밤: ["야간", "night"],
  야간: ["밤", "night"],
  비: ["우천", "rain"],
  로맨스: ["연애", "romance"],
  판타지: ["마법", "fantasy"],
});

const ELEMENT_CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  shape: "도형",
  frame: "프레임",
  arrow: "화살표",
  badge: "배지",
  line: "선",
  decor: "장식",
  panel: "컷 구성",
  bubble: "말풍선",
  sfx: "효과음",
  effect: "연출 효과",
  pattern: "패턴",
});

const NATIVE_TOOL_PREVIEW_SVGS: Readonly<Record<StudioUnifiedNativeToolId, string>> = Object.freeze({
  bubble: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">
    <defs>
      <linearGradient id="bubble-paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f5f7fb"/>
      </linearGradient>
      <filter id="bubble-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#0f172a" flood-opacity=".15"/>
      </filter>
    </defs>
    <rect width="320" height="220" rx="28" fill="#eef2f7"/>
    <path d="M45 55c0-22 18-40 40-40h151c22 0 40 18 40 40v65c0 22-18 40-40 40H151l-42 35 9-35H85c-22 0-40-18-40-40V55Z" fill="url(#bubble-paper)" stroke="#111827" stroke-width="5" stroke-linejoin="round" filter="url(#bubble-shadow)"/>
    <path d="M88 68h135M88 92h110M88 116h78" stroke="#64748b" stroke-width="9" stroke-linecap="round" opacity=".72"/>
    <circle cx="260" cy="184" r="20" fill="#4f46e5"/><path d="M251 184h18M260 175v18" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  </svg>`,
});

const DEFAULT_NATIVE_TOOLS: readonly StudioUnifiedNativeTool[] = Object.freeze([
  Object.freeze({
    id: "bubble",
    menu: "bubble",
    title: "편집 가능한 말풍선",
    description: "대사·꼬리·형태를 계속 수정할 수 있는 네이티브 말풍선 도구입니다.",
    keywords: Object.freeze([
      "말풍선",
      "대사",
      "speech bubble",
      "balloon",
      "꼬리",
      "텍스트",
    ]),
  }),
]);

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function queryGroups(query: string): readonly (readonly string[])[] {
  return normalize(query)
    .split(/\s+/u)
    .filter(Boolean)
    .map((token) => Object.freeze([
      token,
      ...(QUERY_SYNONYMS[token] ?? []),
    ].map(normalize)));
}

function itemHaystack(item: StudioUnifiedAssetItem): string {
  return normalize([
    item.id,
    item.title,
    item.description,
    item.categoryLabel,
    ...item.keywords,
    ...item.badges,
  ].join(" "));
}

function queryMatches(
  item: StudioUnifiedAssetItem,
  groups: readonly (readonly string[])[],
): boolean {
  if (groups.length === 0) return true;
  const haystack = itemHaystack(item);
  return groups.every(([literal, ...synonyms]) => {
    if (literal && haystack.includes(literal)) return true;
    return synonyms.some((term) => /^[a-z0-9 ]+$/u.test(term)
      ? new RegExp(`(?:^|[^a-z0-9])${term}(?:$|[^a-z0-9])`, "u").test(haystack)
      : haystack.includes(term));
  });
}

function queryScore(
  item: StudioUnifiedAssetItem,
  query: string,
  groups: readonly (readonly string[])[],
): number {
  const normalizedQuery = normalize(query);
  const title = normalize(item.title);
  const description = normalize(item.description);
  const keywords = normalize(item.keywords.join(" "));
  let score = item.sortPriority;
  if (!normalizedQuery) return score;
  if (title === normalizedQuery) score += 1_000;
  else if (title.startsWith(normalizedQuery)) score += 500;
  else if (title.includes(normalizedQuery)) score += 250;
  for (const group of groups) {
    if (group.some((term) => title.includes(term))) score += 80;
    if (group.some((term) => keywords.includes(term))) score += 40;
    if (group.some((term) => description.includes(term))) score += 20;
  }
  if (item.discoverability === "featured") score += 120;
  if (item.discoverability === "caution") score -= 180;
  return score;
}

function backgroundItem(
  background: StudioUnifiedBackgroundSource,
  index: number,
  sceneTemplates: readonly SceneTemplate[],
): StudioUnifiedAssetItem {
  const metadata = getStudio2dAssetMetadata(background);
  const recommended = isRecommendedStudio2dScene(background);
  const linkedTemplateIds = getStudioBackgroundTemplateIds(background.id);
  const linkedTemplates = sceneTemplates.filter((template) => linkedTemplateIds.includes(template.id));
  const vector = !background.imgSrc && Boolean(background.svg);
  const rightsUnverified = metadata?.provenance.licenseStatus === "unverified";
  const cc0Verified = metadata?.provenance.licenseStatus === "cc0-verified";
  const preview: StudioUnifiedAssetPreview = background.imgSrc
    ? { kind: "image", src: background.imgSrc }
    : background.svg
      ? { kind: "svg", svg: background.svg }
      : { kind: "none" };
  const badges = [
    recommended ? "검수 추천" : vector ? "벡터" : "Studio 내장",
    metadata ? studio2dResolutionLabel(background) : vector ? "크기 조절" : "원본 확인 필요",
    cc0Verified ? "CC0" : rightsUnverified ? "권리 미확인" : null,
    linkedTemplates.length > 0 ? `템플릿 연계 ${linkedTemplates.length}` : null,
  ].filter((value): value is string => Boolean(value));
  const discoverability: StudioUnifiedAssetDiscoverability = rightsUnverified
    ? "caution"
    : recommended
      ? "featured"
      : "standard";
  return {
    id: `background:${background.id}`,
    category: "scene",
    scope: "studio",
    title: metadata?.title ?? background.label,
    description: `${background.genre} 배경 · ${metadata?.style === "photographic-reference" ? "포토 레퍼런스 · " : ""}${metadata ? studio2dResolutionLabel(background) : vector ? "벡터" : "원본 정보 미확인"}`,
    categoryLabel: "2D 배경",
    keywords: Object.freeze([
      background.id,
      background.label,
      background.genre,
      metadata?.environment ?? "",
      metadata?.timeOfDay ?? "",
      ...(metadata?.tags ?? []),
      ...linkedTemplates.flatMap((template) => [
        template.id,
        template.label,
        template.category,
        template.description,
      ]),
      "배경",
      "장면",
      linkedTemplates.length > 0 ? "템플릿 추천" : "",
    ].filter(Boolean)),
    badges: Object.freeze(badges),
    preview,
    useMode: "insert",
    useLabel: "배경 삽입",
    discoverability,
    sortPriority: (recommended ? 700 : vector ? 560 : 260) - index,
    source: { kind: "background", value: background },
  };
}

function sceneTemplateItem(
  template: SceneTemplate,
  index: number,
  backgrounds: readonly StudioUnifiedBackgroundSource[],
): StudioUnifiedAssetItem {
  const recommendedBackgroundIds = getStudioSceneTemplateBackgroundIds(template.id);
  const recommendedBackgrounds = backgrounds.filter((background) =>
    recommendedBackgroundIds.includes(background.id));
  return {
    id: `scene-template:${template.id}`,
    category: "scene",
    scope: "studio",
    title: template.label,
    description: template.description,
    categoryLabel: "장면 템플릿",
    keywords: Object.freeze([
      template.id,
      template.label,
      template.category,
      template.description,
      ...recommendedBackgrounds.flatMap((background) => [
        background.id,
        background.label,
        background.genre,
      ]),
      "장면",
      "템플릿",
      recommendedBackgrounds.length > 0 ? "추천 배경" : "",
    ].filter(Boolean)),
    badges: Object.freeze([
      "장면 레시피",
      "편집 가능",
      ...(recommendedBackgrounds.length > 0
        ? [`추천 배경 ${recommendedBackgrounds.length}`]
        : []),
    ]),
    preview: { kind: "none" },
    useMode: "apply",
    useLabel: "장면 배치",
    discoverability: "featured",
    sortPriority: 660 - index,
    source: { kind: "scene-template", value: template },
  };
}

function elementItem(
  element: StudioElementItem,
  index: number,
): StudioUnifiedAssetItem {
  return {
    id: `element:${element.id}`,
    category: "element",
    scope: "studio",
    title: element.label,
    description: `${ELEMENT_CATEGORY_LABELS[element.category] ?? "벡터 요소"} · 캔버스에서 크기와 회전을 편집할 수 있습니다.`,
    categoryLabel: ELEMENT_CATEGORY_LABELS[element.category] ?? "벡터 요소",
    keywords: Object.freeze([
      element.id,
      element.label,
      element.category,
      ...element.keywords,
      "요소",
      "벡터",
    ]),
    badges: Object.freeze(["벡터", "크기 조절"]),
    preview: { kind: "svg", svg: element.svg },
    useMode: "insert",
    useLabel: "요소 삽입",
    discoverability: "standard",
    sortPriority: 480 - index,
    source: { kind: "element", value: element },
  };
}

function objectItem(
  object: StudioObjectInsertItem,
  index: number,
): StudioUnifiedAssetItem {
  return {
    id: `3d:${object.id}`,
    category: "3d",
    scope: "studio",
    title: object.label,
    description: object.hint ?? `${object.familyLabel} 편집 도구에서 엽니다.`,
    categoryLabel: object.familyLabel,
    keywords: Object.freeze([
      object.id,
      object.sourceId,
      object.label,
      object.family,
      object.familyLabel,
      ...object.keywords,
      "3d",
      "입체",
    ]),
    badges: Object.freeze(["3D", object.familyLabel]),
    preview: { kind: "none" },
    useMode: "open",
    useLabel: "3D 도구 열기",
    discoverability: "standard",
    sortPriority: 420 - index,
    source: { kind: "object-3d", value: object },
  };
}

function nativeToolItem(
  tool: StudioUnifiedNativeTool,
  index: number,
): StudioUnifiedAssetItem {
  return {
    id: `native-tool:${tool.id}`,
    category: "element",
    scope: "studio",
    title: tool.title,
    description: tool.description,
    categoryLabel: "제작 도구",
    keywords: Object.freeze([tool.id, ...tool.keywords, "편집 가능", "네이티브"]),
    badges: Object.freeze(["편집 가능", "네이티브 도구"]),
    preview: { kind: "svg", svg: NATIVE_TOOL_PREVIEW_SVGS[tool.id] },
    useMode: "open",
    useLabel: "말풍선 도구 열기",
    discoverability: "featured",
    sortPriority: 720 - index,
    source: { kind: "native-tool", value: tool },
  };
}

function localItem(asset: StudioAsset, index: number): StudioUnifiedAssetItem {
  const aiGenerated = asset.kind === "ai" || asset.rights?.sourceKind === "ai-generated";
  const rightsConfirmed = asset.rights?.rightsConfirmed === true;
  return {
    id: `local:${asset.id}`,
    category: "mine",
    scope: "mine",
    title: asset.name,
    description: `${asset.width} × ${asset.height}px · 내 라이브러리`,
    categoryLabel: "내 에셋",
    keywords: Object.freeze([
      asset.id,
      asset.name,
      asset.kind ?? "",
      asset.rights?.licenseLabel ?? "",
      aiGenerated ? "AI 생성" : "업로드",
      "내 에셋",
    ].filter(Boolean)),
    badges: Object.freeze([
      aiGenerated ? "AI" : "내 에셋",
      rightsConfirmed ? "권리 확인" : "개인 보관",
    ]),
    preview: { kind: "image", src: asset.dataUrl },
    useMode: "insert",
    useLabel: "에셋 삽입",
    discoverability: "standard",
    sortPriority: 620 - index,
    source: { kind: "local", value: asset },
  };
}

function builtinRasterItem(asset: StudioRasterAsset, index: number): StudioUnifiedAssetItem {
  const decorativeBubble = asset.kind === "bubble-decoration";
  return {
    id: `builtin-raster:${asset.id}`,
    category: "element",
    scope: "studio",
    title: asset.label,
    description: asset.description,
    categoryLabel: decorativeBubble ? "장식 말풍선" : asset.kind === "texture" ? "질감" : asset.kind === "effect-overlay" ? "연출 효과" : "일러스트 소품",
    keywords: Object.freeze([...asset.tags, asset.collection, ...(asset.hasAlpha ? ["투명"] : []), "일러스트", asset.kind === "texture" ? "질감" : "소품"]),
    badges: Object.freeze([
      asset.hasAlpha ? "투명 배경" : "질감 원본",
      `${asset.width} × ${asset.height}px`,
      ...(decorativeBubble ? ["대사 별도 편집"] : []),
    ]),
    preview: { kind: "image", src: asset.src },
    useMode: "insert",
    useLabel: decorativeBubble ? "장식과 대사 삽입" : "일러스트 삽입",
    discoverability: "featured",
    sortPriority: 700 - index,
    source: { kind: "builtin-raster", value: asset },
  };
}

export function buildStudioUnifiedAssetCatalog(
  input: BuildStudioUnifiedAssetCatalogInput = {},
): readonly StudioUnifiedAssetItem[] {
  // Reuse the production element library view so flattened legacy speech balloons stay hidden.
  const elements = input.elements ?? listStudioElementLibrary();
  const objects = input.objects ?? listStudioObjectInsertItems();
  const nativeTools = input.nativeTools ?? DEFAULT_NATIVE_TOOLS;
  const backgrounds = input.backgrounds ?? [];
  const sceneTemplates = input.sceneTemplates ?? [];
  const rasterAssets = input.rasterAssets ?? [];
  const localAssets = [...(input.localAssets ?? [])].sort(
    (left, right) => right.createdAt - left.createdAt,
  );
  const candidates = [
    ...backgrounds.map((item, index) => backgroundItem(item, index, sceneTemplates)),
    ...sceneTemplates.map((item, index) => sceneTemplateItem(item, index, backgrounds)),
    ...localAssets.map((item, index) => localItem(item, index)),
    ...nativeTools.map((item, index) => nativeToolItem(item, index)),
    ...rasterAssets.map((item, index) => builtinRasterItem(item, index)),
    ...elements.map((item, index) => elementItem(item, index)),
    ...objects.map((item, index) => objectItem(item, index)),
  ];
  const unique = new Map<string, StudioUnifiedAssetItem>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }
  return Object.freeze([...unique.values()]);
}

export function searchStudioUnifiedAssets(
  items: readonly StudioUnifiedAssetItem[],
  input: StudioUnifiedAssetSearchInput = {},
): readonly StudioUnifiedAssetItem[] {
  const category = input.category ?? "all";
  const scope = input.scope ?? "all";
  const query = input.query ?? "";
  const groups = queryGroups(query);
  const limit = Math.max(1, Math.min(240, Math.floor(input.limit ?? 80)));
  return items
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => scope === "all" || item.scope === scope)
    .filter((item) => queryMatches(item, groups))
    .map((item) => ({ item, score: queryScore(item, query, groups) }))
    .sort((left, right) =>
      right.score - left.score
      || left.item.title.localeCompare(right.item.title, "ko"),
    )
    .slice(0, limit)
    .map(({ item }) => item);
}

export function curateStudioUnifiedAssetHighlights(
  items: readonly StudioUnifiedAssetItem[],
  input: Omit<StudioUnifiedAssetSearchInput, "query"> = {},
): readonly StudioUnifiedAssetItem[] {
  const category = input.category ?? "all";
  const scope = input.scope ?? "all";
  const limit = Math.max(1, Math.min(120, Math.floor(input.limit ?? 48)));
  const eligible = items
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => scope === "all" || item.scope === scope);
  const preferred = eligible.filter((item) => item.discoverability !== "caution");
  const source = preferred.length >= Math.min(12, limit) ? preferred : eligible;
  if (category !== "all") {
    return [...source]
      .sort((left, right) => right.sortPriority - left.sortPriority)
      .slice(0, limit);
  }
  const order: Exclude<StudioUnifiedAssetCategory, "all">[] = [
    "scene",
    "mine",
    "element",
    "3d",
  ];
  const buckets = new Map(order.map((key) => [
    key,
    source
      .filter((item) => item.category === key)
      .sort((left, right) => right.sortPriority - left.sortPriority),
  ]));
  const result: StudioUnifiedAssetItem[] = [];
  for (let index = 0; result.length < limit; index += 1) {
    let added = false;
    for (const key of order) {
      const item = buckets.get(key)?.[index];
      if (!item) continue;
      result.push(item);
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
  }
  return result;
}

export function countStudioUnifiedAssets(
  items: readonly StudioUnifiedAssetItem[],
  scope: StudioUnifiedAssetScope = "all",
): Readonly<Record<StudioUnifiedAssetCategory, number>> {
  const counts: Record<StudioUnifiedAssetCategory, number> = {
    all: 0,
    scene: 0,
    element: 0,
    "3d": 0,
    mine: 0,
  };
  for (const item of items) {
    if (scope !== "all" && item.scope !== scope) continue;
    counts.all += 1;
    counts[item.category] += 1;
  }
  return Object.freeze(counts);
}
