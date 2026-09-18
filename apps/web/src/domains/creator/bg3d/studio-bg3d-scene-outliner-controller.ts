import type { StudioBg3dResolvedHierarchy } from "./studio-bg3d-hierarchy";
import type { StudioBg3dLayerListItem } from "./studio-bg3d-object-ops";

export type StudioBg3dOutlinerSelectionMode = "replace" | "toggle";

export interface StudioBg3dOutlinerItem extends StudioBg3dLayerListItem {
  readonly color?: string;
}

export interface StudioBg3dSceneOutlinerController {
  readonly query: string;
  readonly items: readonly StudioBg3dOutlinerItem[];
  readonly filteredItems: readonly StudioBg3dOutlinerItem[];
  readonly hierarchy: StudioBg3dResolvedHierarchy;
  readonly selectedIds: ReadonlySet<string>;
  readonly setQuery: (query: string) => void;
  readonly select: (id: string, mode: StudioBg3dOutlinerSelectionMode) => void;
  readonly rename: (item: StudioBg3dOutlinerItem) => void;
  readonly toggleVisibility: (item: StudioBg3dOutlinerItem) => void;
  readonly toggleLock: (item: StudioBg3dOutlinerItem) => void;
  readonly duplicate: (item: StudioBg3dOutlinerItem) => void;
  readonly remove: (item: StudioBg3dOutlinerItem) => void;
}

export interface CreateStudioBg3dSceneOutlinerControllerInput {
  readonly query: string;
  readonly items: readonly StudioBg3dLayerListItem[];
  readonly filteredItems: readonly StudioBg3dLayerListItem[];
  readonly hierarchy: StudioBg3dResolvedHierarchy;
  readonly selectedIds: ReadonlySet<string>;
  readonly primitiveColors: ReadonlyMap<string, string>;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (id: string, mode: StudioBg3dOutlinerSelectionMode) => void;
  readonly onRename: (item: StudioBg3dOutlinerItem) => void;
  readonly onToggleVisibility: (item: StudioBg3dOutlinerItem) => void;
  readonly onToggleLock: (item: StudioBg3dOutlinerItem) => void;
  readonly onDuplicate: (item: StudioBg3dOutlinerItem) => void;
  readonly onRemove: (item: StudioBg3dOutlinerItem) => void;
}

function enrichOutlinerItem(
  item: StudioBg3dLayerListItem,
  primitiveColors: ReadonlyMap<string, string>,
): StudioBg3dOutlinerItem {
  const color = item.kind === "primitive" ? primitiveColors.get(item.id) : undefined;
  return Object.freeze({
    ...item,
    ...(color ? { color } : {}),
  });
}

/**
 * Typed migration boundary for the legacy BG3D host bag.
 *
 * The React tree receives this narrow controller rather than renderer objects, mutable refs, or
 * document setters. New outliner behavior therefore cannot accidentally take ownership of the
 * canonical scene or bypass the editor command/mutation boundary.
 */
export function createStudioBg3dSceneOutlinerController(
  input: CreateStudioBg3dSceneOutlinerControllerInput,
): StudioBg3dSceneOutlinerController {
  const enrichedById = new Map(
    input.items.map((item) => {
      const enriched = enrichOutlinerItem(item, input.primitiveColors);
      return [enriched.id, enriched] as const;
    }),
  );
  const items = Object.freeze(
    input.items.flatMap((item) => {
      const enriched = enrichedById.get(item.id);
      return enriched ? [enriched] : [];
    }),
  );
  const filteredItems = Object.freeze(
    input.filteredItems.flatMap((item) => {
      const enriched = enrichedById.get(item.id);
      return enriched ? [enriched] : [];
    }),
  );

  return Object.freeze({
    query: input.query,
    items,
    filteredItems,
    hierarchy: input.hierarchy,
    selectedIds: input.selectedIds,
    setQuery: input.onQueryChange,
    select: input.onSelect,
    rename: input.onRename,
    toggleVisibility: input.onToggleVisibility,
    toggleLock: input.onToggleLock,
    duplicate: input.onDuplicate,
    remove: input.onRemove,
  });
}
