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

function itemLabelKey(
  groupId: string,
  itemId: string,
  item: StudioMainMenuLocalizableItem,
  state: StudioMainMenuLocalizationState,
): string {
  if (item.labelKey) return item.labelKey;
  const baseKey = `studio.mainMenu.item.${groupId}.${itemId}`;
  if (groupId === "file" && itemId === "save-draft" && state.sharedNonOwnerSave) {
    return `${baseKey}.shared`;
  }
  if (groupId === "file" && itemId === "publish" && state.hasWorkId) {
    return `${baseKey}.has-work`;
  }
  if (groupId === "view" && itemId === "page-sequence" && state.pageSequenceOpen) {
    return `${baseKey}.open`;
  }
  if (groupId === "view" && itemId === "quick-access-palette") {
    if (state.quickAccessPaletteLoading) return `${baseKey}.loading`;
    if (state.quickAccessPaletteOpen) return `${baseKey}.open`;
  }
  if (groupId === "view" && itemId === "left-panel" && state.leftPanelOpen) {
    return `${baseKey}.open`;
  }
  if (groupId === "view" && itemId === "right-panel" && state.rightPanelOpen) {
    return `${baseKey}.open`;
  }
  if (groupId === "filter" && itemId === "last-filter") {
    return `${baseKey}.${state.lastFilterDraft ? "ready" : "empty"}`;
  }
  return baseKey;
}

function localizeItemLabel(
  groupId: string,
  item: StudioMainMenuLocalizableItem,
  state: StudioMainMenuLocalizationState,
  t: StudioMainMenuTranslate,
): string {
  const label = localizeText(t, item.label, itemLabelKey(groupId, item.id, item, state));
  if (
    groupId === "file"
    && item.id === "import-ora-cbz"
    && !/\bWILL\b/iu.test(label)
  ) {
    const withWill = label.replace(
      /ORA\s*\/\s*CBZ/iu,
      (formats) => `${formats} / WILL`,
    );
    return withWill === label ? `${label} · WILL` : withWill;
  }
  if (groupId === "view" && item.id === "reset-rotation") {
    return label.replace("{angle}", String(state.canvasRotation));
  }
  return label;
}

function localizeUnavailableReason(
  groupId: string,
  item: StudioMainMenuLocalizableItem,
  state: StudioMainMenuLocalizationState,
  t: StudioMainMenuTranslate,
): string | undefined {
  if (!item.unavailableReason) return undefined;
  if (groupId === "filter" && state.filterDisabled) {
    return localizeText(
      t,
      state.filterUnavailableReason ?? "현재 편집 상태에서는 필터를 적용할 수 없습니다.",
      "studio.mainMenu.item.filter.unavailable",
    );
  }
  if (groupId === "filter" && item.id === "last-filter" && !state.lastFilterDraft) {
    return localizeText(
      t,
      item.unavailableReason,
      "studio.mainMenu.item.filter.last-filter.empty-unavailable",
    );
  }
  const key = groupId === "view" && item.id.startsWith("color-vision-")
    ? "studio.mainMenu.item.view.color-vision.unavailable"
    : `studio.mainMenu.item.${groupId}.${item.id}.unavailable`;
  return localizeText(t, item.unavailableReason, key);
}

export function localizeStudioMainMenuGroups(
  groups: readonly StudioMainMenuGroup[],
  state: StudioMainMenuLocalizationState,
  t: StudioMainMenuTranslate,
): StudioMainMenuGroup[] {
  return groups.map((group) => ({
    ...group,
    label: localizeText(t, group.label, `studio.mainMenu.group.${group.id}.label`),
    items: group.items.map((rawItem) => {
      const item = rawItem as StudioMainMenuLocalizableItem;
      return {
        ...item,
        label: localizeItemLabel(group.id, item, state, t),
        unavailableReason: localizeUnavailableReason(group.id, item, state, t),
      };
    }),
  }));
}
