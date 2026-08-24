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

/**
 * Specialist tier presentation order.
 *
 * The command catalogue lists specialist groups in §15.3 source order, but that
 * order hides the artist's primary acts behind the menubar overflow at laptop
 * widths: 그리기(브러시·지우개·채우기) and 텍스트(대사·말풍선) sat third/fifth while
 * rarer surfaces stayed visible. Presentation promotes them to the front so the
 * most-used creative menus survive geometry-based clipping; unknown/future
 * groups still append after every known id, in source-relative order.
 */
export const STUDIO_MAIN_MENU_SPECIALIST_ORDER = [
  "brush",
  "text",
  "canvas",
  "transform",
  "vector",
  "3d",
  "collaboration",
  "ai",
] as const;

export type StudioMainMenuFamiliarCoreId =
  (typeof STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER)[number];

export interface StudioMainMenuPresentation<TGroup extends { readonly id: string }> {
  /** Familiar production loop first, specialist extensions second. */
  readonly groups: readonly TGroup[];
  /** Core groups that were actually present in the supplied catalogue. */
  readonly coreGroupIds: readonly string[];
  /** Specialist groups in presentation order (unknown/future ids keep source order at the end). */
  readonly specialistGroupIds: readonly string[];
  /** First specialist group; the React menubar renders a non-interactive tier boundary before it. */
  readonly specialistBoundaryGroupId: string | null;
}

const FAMILIAR_CORE_ID_SET = new Set<string>(STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER);
const SPECIALIST_ORDER_INDEX = new Map<string, number>(
  STUDIO_MAIN_MENU_SPECIALIST_ORDER.map((id, index) => [id, index]),
);

/**
 * Reorders group references without cloning groups or items. Known specialist groups follow
 * the presentation order above; unknown/future groups are never discarded: they remain in the
 * specialist tier after every known id, in the exact order supplied by the command host.
 */
export function createStudioMainMenuPresentation<
  TGroup extends { readonly id: string },
>(groups: readonly TGroup[]): StudioMainMenuPresentation<TGroup> {
  const familiarGroups = STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER.flatMap((id) =>
    groups.filter((group) => group.id === id)
  );
  const specialistGroups = groups
    .filter((group) => !FAMILIAR_CORE_ID_SET.has(group.id))
    .sort((a, b) => {
      const indexA = SPECIALIST_ORDER_INDEX.get(a.id);
      const indexB = SPECIALIST_ORDER_INDEX.get(b.id);
      // Unknown ids keep source order after all known ids (absent index sorts last,
      // ties fall back to source order via sort stability).
      if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
      if (indexA !== undefined) return -1;
      if (indexB !== undefined) return 1;
      return 0;
    });

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
