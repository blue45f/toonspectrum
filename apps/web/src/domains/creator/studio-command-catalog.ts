/**
 * Public command catalog. Existing declarations remain historical evidence in
 * `studio-command-catalog-base.ts`; this boundary applies shipped compatibility migrations
 * before search, help, and shortcut indexes consume them.
 */
import {
  catalogNativeIds as baseNativeIds,
  findCatalogEntriesBySource as findBaseEntries,
  STUDIO_COMMAND_CATALOG as BASE_CATALOG,
  STUDIO_COMMAND_SOURCES as BASE_SOURCES,
  STUDIO_MENU_ITEM_INVENTORY as BASE_MENU_INVENTORY,
} from "./studio-command-catalog-base";

import type { StudioCommandCatalogEntry, StudioCommandSource } from "./studio-command-catalog-base";
import type { CommandId } from "@toonspectrum/studio-command-registry";

export {
  COMMAND_CONFLICTS,
  STUDIO_COMMAND_CATALOG_UNCOVERED,
  STUDIO_HELP_ROW_INVENTORY,
} from "./studio-command-catalog-base";
export type {
  StudioCommandCatalogEntry,
  StudioCommandConflict,
  StudioCommandConflictKind,
  StudioCommandOrigin,
  StudioCommandOriginStatus,
  StudioCommandSource,
  StudioCommandSourceInfo,
} from "./studio-command-catalog-base";

const MANUAL_MENU_ID = "help/user-manual";
const TRANSPARENT_COLOR_COMMAND_ID: CommandId = "color.toggle-transparent";
const TRANSPARENT_COLOR_SHORTCUT = "Shift+C";

/**
 * The base file keeps measured historical conflicts. The public catalog must describe the
 * command users can execute now: Crop owns C and transparent ink owns Shift+C.
 */
const NORMALIZED_BASE_CATALOG: readonly StudioCommandCatalogEntry[] = Object.freeze(
  BASE_CATALOG.map((entry) => {
    if (entry.id !== TRANSPARENT_COLOR_COMMAND_ID) return entry;
    return Object.freeze({
      ...entry,
      shortcut: TRANSPARENT_COLOR_SHORTCUT,
      origins: Object.freeze(
        entry.origins.map((origin) =>
          origin.source === "keymap"
            ? Object.freeze({ ...origin, shortcut: TRANSPARENT_COLOR_SHORTCUT })
            : origin,
        ),
      ),
      note: "Crop uses C; transparent-colour drawing uses Shift+C after the guided-UX migration.",
    });
  }),
);

const MANUAL_COMMAND: StudioCommandCatalogEntry = {
  id: "help.user-manual",
  category: "help",
  labels: [
    { locale: "ko", label: "사용자 매뉴얼", description: "편집 중인 원고를 유지한 채 기능별 사용자 매뉴얼을 새 탭으로 엽니다." },
    { locale: "en", label: "User manual · Korean", description: "Open the Korean reference manual in a new tab without leaving the editor." },
  ],
  aliases: [
    { vendor: "toonstudio", locale: "ko", term: "매뉴얼" },
    { vendor: "toonstudio", locale: "ko", term: "사용 설명서" },
    { vendor: "toonstudio", locale: "en", term: "user guide" },
  ],
  helpNodeId: "help/help/user-manual",
  origins: [{ source: "menu", nativeId: MANUAL_MENU_ID, status: "wired" }],
};

export const STUDIO_COMMAND_CATALOG: readonly StudioCommandCatalogEntry[] =
  Object.freeze([...NORMALIZED_BASE_CATALOG, MANUAL_COMMAND]);

export const STUDIO_MENU_ITEM_INVENTORY: readonly string[] = Object.freeze(
  BASE_MENU_INVENTORY.flatMap((id) => id === "help/current-tool" ? [id, MANUAL_MENU_ID] : [id]),
);

export const STUDIO_COMMAND_SOURCES = Object.freeze({
  ...BASE_SOURCES,
  menu: {
    ...BASE_SOURCES.menu,
    measuredCount: BASE_SOURCES.menu.measuredCount + 1,
  },
});

/** Canonical public chord → command ids after compatibility migrations. */
export function catalogShortcutIndex(): Map<string, CommandId[]> {
  const index = new Map<string, CommandId[]>();
  for (const entry of STUDIO_COMMAND_CATALOG) {
    if (!entry.shortcut) continue;
    const current = index.get(entry.shortcut);
    if (current) current.push(entry.id);
    else index.set(entry.shortcut, [entry.id]);
  }
  return index;
}

export function findCatalogEntriesBySource(
  source: StudioCommandSource,
  nativeId: string,
): StudioCommandCatalogEntry[] {
  const entries = findBaseEntries(source, nativeId).map((entry) =>
    STUDIO_COMMAND_CATALOG.find((candidate) => candidate.id === entry.id) ?? entry,
  );
  return source === "menu" && nativeId === MANUAL_MENU_ID ? [...entries, MANUAL_COMMAND] : entries;
}

export function catalogNativeIds(source: StudioCommandSource): string[] {
  const ids = baseNativeIds(source);
  return source === "menu" ? [...ids, MANUAL_MENU_ID] : ids;
}
