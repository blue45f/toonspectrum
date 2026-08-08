import type {
  StudioMainMenuGroup,
  StudioMainMenuItem,
} from "./studio-main-menu-model";

export type StudioMainMenuTranslate = (key: string) => string;

export interface StudioMainMenuLocalizationState {
  readonly sharedNonOwnerSave: boolean;
  readonly hasWorkId: boolean;
  readonly filterDisabled: boolean;
  readonly filterUnavailableReason: string | null;
  readonly canvasRotation: number;
  readonly pageSequenceOpen: boolean;
  readonly quickAccessPaletteOpen: boolean;
  readonly quickAccessPaletteLoading: boolean;
  readonly leftPanelOpen: boolean;
  readonly rightPanelOpen: boolean;
  readonly lastFilterDraft: unknown | null;
}

type StudioMainMenuLocalizableItem = StudioMainMenuItem & {
  readonly labelKey?: string;
};

function localizeText(
  t: StudioMainMenuTranslate,
  fallback: string,
  key: string,
): string {
  const text = t(key);
  return text === key ? fallback : text;
}

/**
 * Locale key path for an item: `<group>/<item>` as the locale packs were
 * authored. Items the §15.3 regroup relocated carry `legacyPath`, so their keys
 * stay put even though the group around them changed.
 */
function localePath(groupId: string, item: StudioMainMenuLocalizableItem): string {
  return item.legacyPath ?? `${groupId}/${item.id}`;
}

function itemLabelKey(
  path: string,
  item: StudioMainMenuLocalizableItem,
  state: StudioMainMenuLocalizationState,
): string {
  if (item.labelKey) return item.labelKey;
  const baseKey = `studio.mainMenu.item.${path.replace("/", ".")}`;
  if (path === "file/save-draft" && state.sharedNonOwnerSave) return `${baseKey}.shared`;
  if (path === "file/publish" && state.hasWorkId) return `${baseKey}.has-work`;
  if (path === "view/page-sequence" && state.pageSequenceOpen) return `${baseKey}.open`;
  if (path === "view/quick-access-palette") {
    if (state.quickAccessPaletteLoading) return `${baseKey}.loading`;
    if (state.quickAccessPaletteOpen) return `${baseKey}.open`;
  }
  if (path === "view/left-panel" && state.leftPanelOpen) return `${baseKey}.open`;
  if (path === "view/right-panel" && state.rightPanelOpen) return `${baseKey}.open`;
  if (path === "filter/last-filter") {
    return `${baseKey}.${state.lastFilterDraft ? "ready" : "empty"}`;
  }
  return baseKey;
}

function localizeItemLabel(
  path: string,
  item: StudioMainMenuLocalizableItem,
  state: StudioMainMenuLocalizationState,
  t: StudioMainMenuTranslate,
): string {
  const label = localizeText(t, item.label, itemLabelKey(path, item, state));
  if (path === "file/import-ora-cbz" && !/\bWILL\b/iu.test(label)) {
    const withWill = label.replace(
      /ORA\s*\/\s*CBZ/iu,
      (formats) => `${formats} / WILL`,
    );
    return withWill === label ? `${label} · WILL` : withWill;
  }
  if (path === "view/reset-rotation") {
    return label.replace("{angle}", String(state.canvasRotation));
  }
  return label;
}

function localizeUnavailableReason(
  path: string,
  item: StudioMainMenuLocalizableItem,
  state: StudioMainMenuLocalizationState,
  t: StudioMainMenuTranslate,
): string | undefined {
  if (!item.unavailableReason) return undefined;
  if (path.startsWith("filter/") && state.filterDisabled) {
    return localizeText(
      t,
      state.filterUnavailableReason ?? "현재 편집 상태에서는 필터를 적용할 수 없습니다.",
      "studio.mainMenu.item.filter.unavailable",
    );
  }
  if (path === "filter/last-filter" && !state.lastFilterDraft) {
    return localizeText(
      t,
      item.unavailableReason,
      "studio.mainMenu.item.filter.last-filter.empty-unavailable",
    );
  }
  const key = path.startsWith("view/color-vision-")
    ? "studio.mainMenu.item.view.color-vision.unavailable"
    : `studio.mainMenu.item.${path.replace("/", ".")}.unavailable`;
  return localizeText(t, item.unavailableReason, key);
}

export function localizeStudioMainMenuGroups(
  groups: readonly StudioMainMenuGroup[],
  state: StudioMainMenuLocalizationState,
  t: StudioMainMenuTranslate,
): StudioMainMenuGroup[] {
  return groups.map((group) => ({
    ...group,
    label: localizeText(
      t,
      group.label,
      group.labelKey ?? `studio.mainMenu.group.${group.id}.label`,
    ),
    items: group.items.map((rawItem) => {
      const item = rawItem as StudioMainMenuLocalizableItem;
      const path = localePath(group.id, item);
      return {
        ...item,
        label: localizeItemLabel(path, item, state, t),
        unavailableReason: localizeUnavailableReason(path, item, state, t),
      };
    }),
  }));
}
