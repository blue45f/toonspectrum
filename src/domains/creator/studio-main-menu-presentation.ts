/**
 * ToonStudio's main-menu presentation order.
 *
 * The command catalogue keeps its complete §15.3 grouping (17 groups + AI) — that
 * table is the coverage contract and it does not move. This module only decides
 * how those groups are *presented* in the desktop chrome, so command ids,
 * handlers, localization paths, and persistence contracts stay untouched.
 *
 * ## Why twelve titles and not eighteen (UX 감사 2026-09-02, §3)
 *
 * Eighteen top-level titles never fit one row: the lane measured itself and
 * offered an overflow menu, but a menubar that needs an overflow menu has already
 * lost the "glance and find" property a menubar exists for. Six catalogue groups
 * carried one to five rows each (변형 1, 벡터 2, 애니메이션 3, AI 3, 3D 4, 협업 4,
 * 캔버스 5) and Help sat in the middle of the row. The presentation now folds
 * those thin groups into two composite titles and pins Help last:
 *
 * ```
 * 파일 | 편집 | 보기 | 삽입 | 레이어 | 선택 | 그리기 | 만화 | 필터 | 도구 | 창 | 도움말
 * ```
 *
 * - **삽입** = 텍스트·말풍선 + 벡터 (what you put on the page).
 * - **도구** = 캔버스 · 변형 · 애니메이션 · 3D · 협업 · AI (workspaces and
 *   specialist surfaces that open something rather than edit the selection).
 *
 * Inside a composite menu every source group keeps its own caption and its rows
 * keep their ids, so `data-studio-menu-item-id` selectors, localization paths
 * and the §15.3 coverage test are unaffected. Filter stays a title of its own:
 * 52 rows do not belong under anything else.
 */

/** Presentation order of the twelve menubar titles. Help is always last. */
export const STUDIO_MAIN_MENU_PRESENTATION_ORDER = [
  "file",
  "edit",
  "view",
  "insert",
  "layer",
  "select",
  "brush",
  "comic",
  "filter",
  "tools",
  "window",
  "help",
] as const;

export type StudioMainMenuPresentedGroupId =
  (typeof STUDIO_MAIN_MENU_PRESENTATION_ORDER)[number];

/**
 * Composite titles and the catalogue groups they absorb, in the order their
 * sections appear inside the dropdown.
 */
export const STUDIO_MAIN_MENU_COMPOSITE_GROUPS = Object.freeze({
  insert: Object.freeze(["text", "vector"] as const),
  tools: Object.freeze([
    "canvas",
    "transform",
    "animation",
    "3d",
    "collaboration",
    "ai",
  ] as const),
});

export type StudioMainMenuCompositeGroupId = keyof typeof STUDIO_MAIN_MENU_COMPOSITE_GROUPS;

/**
 * Kept for consumers that still reason in tiers: the familiar production loop,
 * in presentation order. Composite titles are part of that loop now, which is
 * the point — an artist should never have to cross a "specialist" boundary to
 * insert a balloon.
 */
export const STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER = STUDIO_MAIN_MENU_PRESENTATION_ORDER;

/** Where unknown/future catalogue groups are slotted: after 도구, before 창. */
const UNKNOWN_GROUP_ANCHOR: StudioMainMenuPresentedGroupId = "window";

const COMPOSITE_LABELS: Readonly<
  Record<StudioMainMenuCompositeGroupId, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  insert: { ko: "삽입", en: "Insert" },
  tools: { ko: "도구", en: "Tools" },
});

export interface StudioMainMenuPresentableItem {
  readonly id: string;
  /**
   * Caption rendered above this row inside a composite dropdown — the name of
   * the catalogue group the row came from. Set by the presentation only.
   */
  readonly sectionLabel?: string;
  readonly separatorAfter?: boolean;
}

export interface StudioMainMenuPresentableGroup<
  TItem extends StudioMainMenuPresentableItem = StudioMainMenuPresentableItem,
> {
  readonly id: string;
  readonly label: string;
  readonly items: readonly TItem[];
}

export interface StudioMainMenuPresentationOptions {
  /**
   * Localized titles for the composite menus. Omitted entries fall back to
   * Korean or English depending on the locale the catalogue arrived in.
   */
  readonly labels?: Partial<Record<StudioMainMenuCompositeGroupId, string>>;
}

export interface StudioMainMenuPresentation<
  TGroup extends StudioMainMenuPresentableGroup,
> {
  /** Twelve titles in menubar order (plus any unknown groups before 창). */
  readonly groups: readonly TGroup[];
  /** Catalogue groups each composite title absorbed, in section order. */
  readonly compositeSources: Readonly<Record<string, readonly string[]>>;
  /** Presented ids in order — convenient for tests and the overflow menu. */
  readonly presentedGroupIds: readonly string[];
  /**
   * The two-tier menubar drew a visual boundary before the first specialist
   * group. Composite titles retired the tier, so this is always `null`; the
   * field survives so `StudioMainMenu` keeps one prop contract.
   */
  readonly specialistBoundaryGroupId: string | null;
}

const KNOWN_PRESENTED_IDS = new Set<string>(STUDIO_MAIN_MENU_PRESENTATION_ORDER);
const COMPOSITE_SOURCE_TO_TITLE = new Map<string, StudioMainMenuCompositeGroupId>(
  (Object.keys(STUDIO_MAIN_MENU_COMPOSITE_GROUPS) as StudioMainMenuCompositeGroupId[])
    .flatMap((title) =>
      STUDIO_MAIN_MENU_COMPOSITE_GROUPS[title].map((source) => [source, title] as const),
    ),
);

/** `true` when the catalogue arrived in Korean (the product voice). */
function isKoreanCatalogue(groups: readonly StudioMainMenuPresentableGroup[]): boolean {
  const file = groups.find((group) => group.id === "file");
  if (file) return file.label === "파일";
  const help = groups.find((group) => group.id === "help");
  return help ? help.label === "도움말" : true;
}

/**
 * Is this catalogue group presented under a composite title? Exposed so the
 * menubar can route "open the 캔버스 menu" requests to the title that now holds it.
 */
export function studioMainMenuPresentedTitleFor(groupId: string): string {
  return COMPOSITE_SOURCE_TO_TITLE.get(groupId) ?? groupId;
}

function buildComposite<TGroup extends StudioMainMenuPresentableGroup>(
  title: StudioMainMenuCompositeGroupId,
  sources: readonly TGroup[],
  label: string,
): TGroup | null {
  if (sources.length === 0) return null;
  const items: StudioMainMenuPresentableItem[] = [];
  sources.forEach((source, sourceIndex) => {
    const last = sources.length - 1;
    source.items.forEach((item, itemIndex) => {
      const first = itemIndex === 0;
      const lastInSource = itemIndex === source.items.length - 1;
      items.push({
        ...item,
        // Every section is captioned, including the first: a row called "요소 ·
        // 도형" under a title called 삽입 still needs to say it came from 벡터.
        ...(first ? { sectionLabel: source.label } : {}),
        // Close each section with a rule except the last one, and keep any rule
        // the source itself drew at its own end from doubling up.
        separatorAfter: lastInSource ? sourceIndex !== last : Boolean(item.separatorAfter),
      });
    });
  });
  const template = sources[0] as TGroup;
  return { ...template, id: title, label, items } as TGroup;
}

/**
 * Reorders group references into the twelve-title presentation. Non-composite
 * groups are passed through by reference (items included); composite titles
 * are new objects whose rows are shallow copies carrying `sectionLabel`.
 * Unknown/future groups are never discarded: they slot in before 창, in the
 * order the command host supplied them.
 */
export function createStudioMainMenuPresentation<
  TGroup extends StudioMainMenuPresentableGroup,
>(
  groups: readonly TGroup[],
  options: StudioMainMenuPresentationOptions = {},
): StudioMainMenuPresentation<TGroup> {
  const korean = isKoreanCatalogue(groups);
  const byId = new Map(groups.map((group) => [group.id, group] as const));
  const compositeSources: Record<string, readonly string[]> = {};

  const composite = (title: StudioMainMenuCompositeGroupId): TGroup | null => {
    const sources = STUDIO_MAIN_MENU_COMPOSITE_GROUPS[title]
      .map((id) => byId.get(id))
      .filter((group): group is TGroup => group !== undefined);
    const built = buildComposite(
      title,
      sources,
      options.labels?.[title] ?? COMPOSITE_LABELS[title][korean ? "ko" : "en"],
    );
    if (built) compositeSources[title] = sources.map((group) => group.id);
    return built;
  };

  const unknown = groups.filter(
    (group) => !KNOWN_PRESENTED_IDS.has(group.id) && !COMPOSITE_SOURCE_TO_TITLE.has(group.id),
  );

  const presented: TGroup[] = [];
  for (const id of STUDIO_MAIN_MENU_PRESENTATION_ORDER) {
    // Unknown groups slot in at the anchor whether or not the anchor itself shipped.
    if (id === UNKNOWN_GROUP_ANCHOR) presented.push(...unknown);
    const group = id in STUDIO_MAIN_MENU_COMPOSITE_GROUPS
      ? composite(id as StudioMainMenuCompositeGroupId)
      : byId.get(id) ?? null;
    if (group) presented.push(group);
  }

  return {
    groups: presented,
    compositeSources,
    presentedGroupIds: presented.map((group) => group.id),
    specialistBoundaryGroupId: null,
  };
}
