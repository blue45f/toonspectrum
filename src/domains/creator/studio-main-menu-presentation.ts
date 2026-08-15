/**
 * ToonStudio's main-menu presentation order.
 *
 * The command catalogue keeps its complete, specialist-oriented grouping. This model only
 * controls how those groups are presented in the desktop chrome, so existing command ids,
 * handlers, localization paths, and persistence contracts stay untouched.
 */

export const STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER = [
  "file",
  "edit",
  "comic",
  "animation",
  "layer",
  "select",
  "view",
  "filter",
  "window",
  "help",
] as const;

export type StudioMainMenuFamiliarCoreId =
  (typeof STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER)[number];

export interface StudioMainMenuPresentation<TGroup extends { readonly id: string }> {
  /** Familiar production loop first, specialist extensions second. */
  readonly groups: readonly TGroup[];
  /** Core groups that were actually present in the supplied catalogue. */
  readonly coreGroupIds: readonly string[];
  /** Specialist groups, preserving their source-relative order. */
  readonly specialistGroupIds: readonly string[];
  /** First specialist group; the React menubar renders a non-interactive tier boundary before it. */
  readonly specialistBoundaryGroupId: string | null;
}

const FAMILIAR_CORE_ID_SET = new Set<string>(STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER);

/**
 * Reorders group references without cloning groups or items. Unknown/future groups are never
 * discarded: they remain in the specialist tier in the exact order supplied by the command host.
 */
export function createStudioMainMenuPresentation<
  TGroup extends { readonly id: string },
>(groups: readonly TGroup[]): StudioMainMenuPresentation<TGroup> {
  const familiarGroups = STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER.flatMap((id) =>
    groups.filter((group) => group.id === id)
  );
  const specialistGroups = groups.filter(
    (group) => !FAMILIAR_CORE_ID_SET.has(group.id)
  );

  return {
    groups: [...familiarGroups, ...specialistGroups],
    coreGroupIds: familiarGroups.map((group) => group.id),
    specialistGroupIds: specialistGroups.map((group) => group.id),
    specialistBoundaryGroupId:
      familiarGroups.length > 0 && specialistGroups.length > 0
        ? specialistGroups[0]?.id ?? null
        : null,
  };
}
