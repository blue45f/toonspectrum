/**
 * Main-menu assembler — V5 §15.3 group order.
 *
 * Wave C regrouped the catalogue from 8 product-invented groups into §15.3's 17
 * (plus the declared AI extension). This file only orders and assembles; the
 * items themselves live in `studio-main-menu-items-*.ts`, and which §15.3 rows we
 * do and do not cover lives in `studio-main-menu-group-spec.ts`.
 *
 * Groups that have no shippable command are declared in the spec table but are
 * **not rendered** — an empty menu is worse than an honest gap list.
 */

import {
  STUDIO_MENU_GROUP_SPEC,
  type StudioMenuGroupSpec,
} from "./studio-main-menu-group-spec";
import {
  buildStudioBrushMenuItems,
  buildStudioLayerMenuItems,
  buildStudioSelectMenuItems,
} from "./studio-main-menu-items-artwork";
import {
  buildStudioCanvasMenuItems,
  buildStudioEditMenuItems,
  buildStudioFileMenuItems,
  buildStudioViewMenuItems,
} from "./studio-main-menu-items-document";
import { buildStudioFilterMenuItems } from "./studio-main-menu-items-filter";
import {
  buildStudio3dMenuItems,
  buildStudioAiMenuItems,
  buildStudioComicMenuItems,
  buildStudioTextMenuItems,
  buildStudioVectorMenuItems,
} from "./studio-main-menu-items-story";
import {
  buildStudioHelpMenuItems,
  buildStudioWindowMenuItems,
} from "./studio-main-menu-items-workspace";
import { localizeStudioMainMenuGroups } from "./studio-main-menu-localization";
import { withDisabledMainMenuReasons } from "./studio-main-menu-unavailable";

import type {
  BuildStudioMainMenuGroupsInput,
  StudioMainMenuItemContext,
} from "./studio-main-menu-contract";
import type { StudioMainMenuGroup, StudioMainMenuItem } from "./studio-main-menu-model";

export type {
  BuildStudioMainMenuGroupsInput,
  StudioMainMenuBuilderState,
  StudioMainMenuEditAvailability,
  StudioMainMenuEditorActions,
  StudioMainMenuItemContext,
  StudioMainMenuUiActions,
} from "./studio-main-menu-contract";

type ItemBuilder = (context: StudioMainMenuItemContext) => StudioMainMenuItem[];

const EMPTY: ItemBuilder = () => [];

/**
 * §15.3 groups we ship nothing for yet keep declared: Transform, Animation and
 * Collaboration. They stay in the spec table (so the gap is counted) and out of
 * the menubar (so no empty menu ships).
 */
const ITEM_BUILDERS: Readonly<Record<string, ItemBuilder>> = {
  file: buildStudioFileMenuItems,
  edit: buildStudioEditMenuItems,
  view: buildStudioViewMenuItems,
  canvas: buildStudioCanvasMenuItems,
  layer: buildStudioLayerMenuItems,
  select: buildStudioSelectMenuItems,
  transform: EMPTY,
  brush: buildStudioBrushMenuItems,
  filter: buildStudioFilterMenuItems,
  vector: buildStudioVectorMenuItems,
  text: buildStudioTextMenuItems,
  comic: buildStudioComicMenuItems,
  animation: EMPTY,
  "3d": buildStudio3dMenuItems,
  collaboration: EMPTY,
  window: buildStudioWindowMenuItems,
  ai: buildStudioAiMenuItems,
};

function groupShell(
  spec: StudioMenuGroupSpec,
  items: StudioMainMenuItem[],
  korean: boolean,
): StudioMainMenuGroup {
  return {
    id: spec.id,
    label: korean ? spec.labelKo : spec.labelEn ?? spec.labelKo,
    ...(spec.labelKey === undefined ? {} : { labelKey: spec.labelKey }),
    items,
  };
}

/** Builds the render-safe product catalogue; browser/React mutations stay at the page boundary. */
export function buildStudioMainMenuGroups({
  state,
  editor,
  ui,
  t,
}: BuildStudioMainMenuGroupsInput): StudioMainMenuGroup[] {
  const context: StudioMainMenuItemContext = { state, editor, ui };
  // Reuse the former View labels while the dedicated Help group locale packs catch up.
  const localizedFeatureTutorialLabel = t("studio.mainMenu.item.view.feature-tutorials");
  const korean = localizedFeatureTutorialLabel === "기능 튜토리얼";
  const helpGroupLabel = korean ? "도움말" : "Help";

  const groups: StudioMainMenuGroup[] = [];
  for (const spec of STUDIO_MENU_GROUP_SPEC) {
    if (spec.id === "help") {
      groups.push({
        id: "help",
        label: helpGroupLabel,
        items: buildStudioHelpMenuItems({ ...context, helpGroupLabel }),
      });
      continue;
    }
    const items = (ITEM_BUILDERS[spec.id] ?? EMPTY)(context);
    if (items.length > 0) groups.push(groupShell(spec, items, korean));
  }

  return localizeStudioMainMenuGroups(withDisabledMainMenuReasons(groups, state), state, t);
}
