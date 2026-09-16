/**
 * ToonStudio main-menu information architecture.
 *
 * The command catalogue keeps the complete V5 §15.3 grouping (17 groups + AI).
 * This module only changes presentation: command ids, handlers, search metadata,
 * localization paths and persistence contracts remain stable.
 *
 * ## Canvas-first nine-title layout (IA follow-up 2026-09-17)
 *
 * The visible application menu is intentionally limited to the document and
 * creation workflow artists repeatedly scan:
 *
 *   파일 | 편집 | 보기 | 캔버스 | 삽입 | 레이어 | 창작 | 효과 | 도움말
 *
 * AI is preserved as a first-class action menu beside Save/Share/Publish instead
 * of competing with document vocabulary in the primary menubar. Every source
 * catalogue group remains a labelled section inside its composite dropdown.
 */

/** Presentation order of the nine workflow-oriented primary menu titles. */
export const STUDIO_MAIN_MENU_PRESENTATION_ORDER = [
  "file",
  "edit",
  "view",
  "canvas",
  "insert",
  "layer",
  "create",
  "filter",
  "help",
] as const;

/** Action menus live next to document completion actions, outside the scroll lane. */
export const STUDIO_MAIN_MENU_ACTION_ORDER = ["ai"] as const;

export type StudioMainMenuPresentedGroupId =
  (typeof STUDIO_MAIN_MENU_PRESENTATION_ORDER)[number];
export type StudioMainMenuActionGroupId =
  (typeof STUDIO_MAIN_MENU_ACTION_ORDER)[number];

/** Presented titles and the canonical catalogue groups they absorb. */
export const STUDIO_MAIN_MENU_COMPOSITE_GROUPS = Object.freeze({
  file: Object.freeze(["file", "collaboration"] as const),
  edit: Object.freeze(["edit", "select", "transform"] as const),
  view: Object.freeze(["view", "window"] as const),
  insert: Object.freeze(["text", "vector", "3d"] as const),
  create: Object.freeze(["brush", "comic", "animation"] as const),
  filter: Object.freeze(["filter"] as const),
});

export type StudioMainMenuCompositeGroupId =
  keyof typeof STUDIO_MAIN_MENU_COMPOSITE_GROUPS;
export type StudioMainMenuPresentationLabelId =
  | StudioMainMenuCompositeGroupId
  | StudioMainMenuActionGroupId;

/** The complete primary workflow, retained for consumers that still reason in tiers. */
export const STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER =
  STUDIO_MAIN_MENU_PRESENTATION_ORDER;

/** Unknown/future catalogue groups appear immediately before Help. */
const UNKNOWN_GROUP_ANCHOR: StudioMainMenuPresentedGroupId = "help";

const WORKFLOW_LABELS: Readonly<
  Record<StudioMainMenuPresentationLabelId, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  file: { ko: "파일", en: "File" },
  edit: { ko: "편집", en: "Edit" },
  view: { ko: "보기", en: "View" },
  insert: { ko: "삽입", en: "Insert" },
  create: { ko: "창작", en: "Create" },
  filter: { ko: "효과", en: "Effects" },
  ai: { ko: "AI 도우미", en: "AI Assist" },
});

export interface StudioMainMenuPresentableItem {
  readonly id: string;
  /** Caption naming the canonical catalogue group inside a workflow composite. */
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
  /** Localized titles for workflow composites and detached action menus. */
  readonly labels?: Partial<Record<StudioMainMenuPresentationLabelId, string>>;
}

export interface StudioMainMenuPresentation<
  TGroup extends StudioMainMenuPresentableGroup,
> {
  /** Nine workflow titles in the primary menubar, plus unknown groups before Help. */
  readonly groups: readonly TGroup[];
  /** Contextual action menus rendered next to Save/Share/Publish. */
  readonly actionGroups: readonly TGroup[];
  /** Catalogue groups each composite title absorbed, in section order. */
  readonly compositeSources: Readonly<Record<string, readonly string[]>>;
  /** Presented primary ids in order, convenient for tests and overflow consumers. */
  readonly presentedGroupIds: readonly string[];
  /** Presented action ids in order. */
  readonly presentedActionGroupIds: readonly string[];
  /** Retained for StudioMainMenu's stable prop contract; workflow tiers need none. */
  readonly specialistBoundaryGroupId: string | null;
}

const KNOWN_PRESENTED_IDS = new Set<string>([
  ...STUDIO_MAIN_MENU_PRESENTATION_ORDER,
  ...STUDIO_MAIN_MENU_ACTION_ORDER,
]);
const COMPOSITE_SOURCE_TO_TITLE = new Map<
  string,
  StudioMainMenuCompositeGroupId
>(
  (Object.keys(
    STUDIO_MAIN_MENU_COMPOSITE_GROUPS,
  ) as StudioMainMenuCompositeGroupId[]).flatMap((title) =>
    STUDIO_MAIN_MENU_COMPOSITE_GROUPS[title].map(
      (source) => [source, title] as const,
    ),
  ),
);

/** True when the catalogue arrived in Korean product voice. */
function isKoreanCatalogue(
  groups: readonly StudioMainMenuPresentableGroup[],
): boolean {
  const file = groups.find((group) => group.id === "file");
  if (file) return file.label === "파일";
  const help = groups.find((group) => group.id === "help");
  return help ? help.label === "도움말" : true;
}

/** Resolve the visible title that owns a canonical catalogue group. */
export function studioMainMenuPresentedTitleFor(groupId: string): string {
  return COMPOSITE_SOURCE_TO_TITLE.get(groupId) ?? groupId;
}

function buildComposite<
  TGroup extends StudioMainMenuPresentableGroup,
>(
  title: StudioMainMenuCompositeGroupId,
  sources: readonly TGroup[],
  label: string,
): TGroup | null {
  if (sources.length === 0) return null;
  const items: StudioMainMenuPresentableItem[] = [];
  sources.forEach((source, sourceIndex) => {
    const lastSourceIndex = sources.length - 1;
    source.items.forEach((item, itemIndex) => {
      const first = itemIndex === 0;
      const lastInSource = itemIndex === source.items.length - 1;
      items.push({
        ...item,
        ...(first ? { sectionLabel: source.label } : {}),
        separatorAfter: lastInSource
          ? sourceIndex !== lastSourceIndex
          : Boolean(item.separatorAfter),
      });
    });
  });
  const template = sources[0] as TGroup;
  return { ...template, id: title, label, items } as TGroup;
}

/** Build the workflow presentation without mutating the canonical catalogue. */
export function createStudioMainMenuPresentation<
  TGroup extends StudioMainMenuPresentableGroup,
>(
  groups: readonly TGroup[],
  options: StudioMainMenuPresentationOptions = {},
): StudioMainMenuPresentation<TGroup> {
  const korean = isKoreanCatalogue(groups);
  const byId = new Map(groups.map((group) => [group.id, group] as const));
  const compositeSources: Record<string, readonly string[]> = {};

  const composite = (
    title: StudioMainMenuCompositeGroupId,
  ): TGroup | null => {
    const sources = STUDIO_MAIN_MENU_COMPOSITE_GROUPS[title]
      .map((id) => byId.get(id))
      .filter((group): group is TGroup => group !== undefined);
    const primarySourceLabel = sources.find((source) => source.id === title)?.label;
    const firstSourceLabel = sources[0]?.label;
    const defaultLabel = (() => {
      if (title === "insert" || title === "create") {
        return WORKFLOW_LABELS[title][korean ? "ko" : "en"];
      }
      if (title === "filter") {
        if (firstSourceLabel === "필터") return WORKFLOW_LABELS.filter.ko;
        if (/^filters?$/iu.test(firstSourceLabel ?? "")) return WORKFLOW_LABELS.filter.en;
        return firstSourceLabel ?? WORKFLOW_LABELS.filter[korean ? "ko" : "en"];
      }
      return primarySourceLabel ?? WORKFLOW_LABELS[title][korean ? "ko" : "en"];
    })();
    const built = buildComposite(
      title,
      sources,
      options.labels?.[title] ?? defaultLabel,
    );
    if (built) compositeSources[title] = sources.map((group) => group.id);
    return built;
  };

  const unknown = groups.filter(
    (group) =>
      !KNOWN_PRESENTED_IDS.has(group.id) &&
      !COMPOSITE_SOURCE_TO_TITLE.has(group.id),
  );

  const presented: TGroup[] = [];
  for (const id of STUDIO_MAIN_MENU_PRESENTATION_ORDER) {
    if (id === UNKNOWN_GROUP_ANCHOR) presented.push(...unknown);
    const group =
      id in STUDIO_MAIN_MENU_COMPOSITE_GROUPS
        ? composite(id as StudioMainMenuCompositeGroupId)
        : byId.get(id) ?? null;
    if (group) presented.push(group);
  }

  const actionGroups = STUDIO_MAIN_MENU_ACTION_ORDER.flatMap((id) => {
    const source = byId.get(id);
    if (!source) return [];
    return [{
      ...source,
      label: options.labels?.[id] ?? WORKFLOW_LABELS[id][korean ? "ko" : "en"],
    } as TGroup];
  });

  return {
    groups: presented,
    actionGroups,
    compositeSources,
    presentedGroupIds: presented.map((group) => group.id),
    presentedActionGroupIds: actionGroups.map((group) => group.id),
    specialistBoundaryGroupId: null,
  };
}
