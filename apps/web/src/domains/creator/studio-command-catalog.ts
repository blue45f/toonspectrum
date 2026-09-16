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

import { STUDIO_BRUSH_LABELS } from "./brush/studio-brush-product-model";

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
const BRUSH_LAB_MENU_ID = "brush/brush-lab";
const TRANSPARENT_COLOR_COMMAND_ID: CommandId = "color.toggle-transparent";
const TRANSPARENT_COLOR_SHORTCUT = "Shift+C";
const BRUSH_STUDIO_COMMAND_ID: CommandId = "brush.studio";

/**
 * The base file keeps measured historical conflicts. The public catalog must describe the
 * commands users can execute now while preserving old terminology as aliases.
 */
const NORMALIZED_BASE_CATALOG: readonly StudioCommandCatalogEntry[] = Object.freeze(
  BASE_CATALOG.map((entry) => {
    if (entry.id === TRANSPARENT_COLOR_COMMAND_ID) {
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
    }

    if (entry.id === BRUSH_STUDIO_COMMAND_ID) {
      return Object.freeze({
        ...entry,
        labels: Object.freeze([
          {
            locale: "ko",
            label: STUDIO_BRUSH_LABELS.editCurrent,
            description: "캔버스를 떠나지 않고 현재 브러시의 펜촉·필압·도장·입력·엔진 조합을 빠르게 편집합니다.",
          },
          {
            locale: "en",
            label: "Edit current brush",
            description: "Quickly edit the selected brush tip, pressure, stamp, input, and engine settings without leaving the canvas.",
          },
        ]),
        aliases: Object.freeze([
          ...entry.aliases,
          { vendor: "toonstudio", locale: "ko", term: "브러시 스튜디오" } as const,
          { vendor: "toonstudio", locale: "ko", term: "브러시 상세 설정" } as const,
          { vendor: "toonstudio", locale: "ko", term: "현재 브러시 세부 설정" } as const,
          { vendor: "toonstudio", locale: "en", term: "Brush Studio" } as const,
        ]),
        note: "Compact and full editing are two depths of one Brush Studio product, not separate products.",
      });
    }

    return entry;
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

const BRUSH_LAB_COMMAND: StudioCommandCatalogEntry = {
  id: "brush.lab",
  category: "brush",
  labels: [
    { locale: "ko", label: STUDIO_BRUSH_LABELS.create, description: "시작 브러시를 고르고 실제로 시험한 뒤 재질·물리·패턴·전문 엔진까지 전체 편집합니다." },
    { locale: "en", label: "Create a new brush", description: "Choose a starting brush, test it live, then refine material, physics, pattern, and expert engines in the full Brush Studio." },
  ],
  aliases: [
    { vendor: "toonstudio", locale: "ko", term: "목적별 브러시 제작실" },
    { vendor: "toonstudio", locale: "ko", term: "브러시 연구실" },
    { vendor: "toonstudio", locale: "ko", term: "브러시 제작실" },
    { vendor: "toonstudio", locale: "en", term: "Brush Studio V6" },
  ],
  helpNodeId: "help/brush/lab",
  origins: [{ source: "menu", nativeId: BRUSH_LAB_MENU_ID, status: "wired" }],
  note: "Navigation command to the canonical full Brush Studio while preserving manuscript context; former lab names remain search aliases only.",
};

export const STUDIO_COMMAND_CATALOG: readonly StudioCommandCatalogEntry[] =
  Object.freeze([...NORMALIZED_BASE_CATALOG, MANUAL_COMMAND, BRUSH_LAB_COMMAND]);

export const STUDIO_MENU_ITEM_INVENTORY: readonly string[] = Object.freeze([
  ...BASE_MENU_INVENTORY.flatMap((id) => {
    if (id === "help/current-tool") return [id, MANUAL_MENU_ID];
    if (id === "brush/brush-studio") return [id, BRUSH_LAB_MENU_ID];
    return [id];
  }),
]);

export const STUDIO_COMMAND_SOURCES = Object.freeze({
  ...BASE_SOURCES,
  menu: {
    ...BASE_SOURCES.menu,
    measuredCount: BASE_SOURCES.menu.measuredCount + 2,
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
  if (source !== "menu") return entries;
  if (nativeId === MANUAL_MENU_ID) return [...entries, MANUAL_COMMAND];
  if (nativeId === BRUSH_LAB_MENU_ID) return [...entries, BRUSH_LAB_COMMAND];
  return entries;
}

export function catalogNativeIds(source: StudioCommandSource): string[] {
  const ids = baseNativeIds(source);
  return source === "menu" ? [...ids, MANUAL_MENU_ID, BRUSH_LAB_MENU_ID] : ids;
}
