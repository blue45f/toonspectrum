/**
 * Persisted layout for the two drawing palettes that make up the desktop drawing dock.
 *
 * The model intentionally stores only durable presentation state. Active menus, focus, scroll
 * positions, pointer drags, and mobile-sheet state remain transient. Sizes are percentages rather
 * than pixels so a workspace can move between displays without restoring an off-screen palette.
 */

export const STUDIO_DRAWING_PALETTE_IDS = [
  "sub-tools",
  "tool-properties",
] as const;

export type StudioDrawingPaletteId = (typeof STUDIO_DRAWING_PALETTE_IDS)[number];
export type StudioDrawingPaletteMoveDirection = "up" | "down";

export const STUDIO_DRAWING_PALETTE_MIN_PERCENT = 20;
export const STUDIO_DRAWING_PALETTE_MAX_PERCENT = 80;

export interface StudioDrawingPaletteLayout {
  readonly order: readonly StudioDrawingPaletteId[];
  readonly collapsed: Readonly<Record<StudioDrawingPaletteId, boolean>>;
  readonly sizes: Readonly<Record<StudioDrawingPaletteId, number>>;
}

const PALETTE_ID_SET = new Set<string>(STUDIO_DRAWING_PALETTE_IDS);

export const DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT: StudioDrawingPaletteLayout =
  Object.freeze({
    order: Object.freeze([...STUDIO_DRAWING_PALETTE_IDS]),
    collapsed: Object.freeze({
      "sub-tools": false,
      "tool-properties": false,
    }),
    sizes: Object.freeze({
      "sub-tools": 36,
      "tool-properties": 64,
    }),
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampPercent(value: number): number {
  return Math.min(
    STUDIO_DRAWING_PALETTE_MAX_PERCENT,
    Math.max(STUDIO_DRAWING_PALETTE_MIN_PERCENT, Math.round(value)),
  );
}

function normalizeOrder(
  value: unknown,
  fallback: StudioDrawingPaletteLayout,
): readonly StudioDrawingPaletteId[] {
  const fallbackOrder = [
    ...fallback.order.filter(
      (id, index, order) => PALETTE_ID_SET.has(id) && order.indexOf(id) === index,
    ),
    ...STUDIO_DRAWING_PALETTE_IDS,
  ].filter((id, index, order) => order.indexOf(id) === index);
  const candidates = Array.isArray(value) ? value : fallbackOrder;
  const order = candidates.filter(
    (id, index): id is StudioDrawingPaletteId =>
      typeof id === "string" &&
      PALETTE_ID_SET.has(id) &&
      candidates.indexOf(id) === index,
  );
  for (const id of fallbackOrder) {
    if (!order.includes(id)) order.push(id);
  }
  return Object.freeze(order);
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function normalizeSizes(
  value: unknown,
  fallback: StudioDrawingPaletteLayout,
): Readonly<Record<StudioDrawingPaletteId, number>> {
  const candidate = isRecord(value) ? value : {};
  const fallbackSubTools = finiteNonNegative(
    fallback.sizes["sub-tools"],
    DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.sizes["sub-tools"],
  );
  const fallbackToolProperties = finiteNonNegative(
    fallback.sizes["tool-properties"],
    DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.sizes["tool-properties"],
  );
  let subTools = finiteNonNegative(candidate["sub-tools"], fallbackSubTools);
  let toolProperties = finiteNonNegative(
    candidate["tool-properties"],
    fallbackToolProperties,
  );
  let total = subTools + toolProperties;
  if (!Number.isFinite(total) || total <= 0) {
    subTools = DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.sizes["sub-tools"];
    toolProperties =
      DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.sizes["tool-properties"];
    total = subTools + toolProperties;
  }

  const normalizedSubTools = clampPercent((subTools / total) * 100);
  return Object.freeze({
    "sub-tools": normalizedSubTools,
    "tool-properties": 100 - normalizedSubTools,
  });
}

/**
 * Rebuilds the exact allowlist, removes duplicate/unknown IDs, appends missing palettes in fallback
 * order, and guarantees integer 20..80 shares whose sum is exactly 100.
 */
export function normalizeStudioDrawingPaletteLayout(
  value: unknown,
  fallback: StudioDrawingPaletteLayout =
    DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
): StudioDrawingPaletteLayout {
  const candidate = isRecord(value) ? value : {};
  const collapsedCandidate = isRecord(candidate.collapsed)
    ? candidate.collapsed
    : {};

  return Object.freeze({
    order: normalizeOrder(candidate.order, fallback),
    collapsed: Object.freeze({
      "sub-tools":
        typeof collapsedCandidate["sub-tools"] === "boolean"
          ? collapsedCandidate["sub-tools"]
          : fallback.collapsed["sub-tools"],
      "tool-properties":
        typeof collapsedCandidate["tool-properties"] === "boolean"
          ? collapsedCandidate["tool-properties"]
          : fallback.collapsed["tool-properties"],
    }),
    sizes: normalizeSizes(candidate.sizes, fallback),
  });
}

/**
 * Sets one palette's absolute percentage share. The other palette receives the exact complement,
 * so callers should pass `layout.order[0]` when wiring a separator between the ordered palettes.
 */
export function resizeStudioDrawingPalettes(
  layout: StudioDrawingPaletteLayout,
  firstId: StudioDrawingPaletteId,
  sizePercent: number,
): StudioDrawingPaletteLayout {
  const normalized = normalizeStudioDrawingPaletteLayout(layout);
  if (!PALETTE_ID_SET.has(firstId) || !Number.isFinite(sizePercent)) {
    return normalized;
  }
  const secondId = STUDIO_DRAWING_PALETTE_IDS.find((id) => id !== firstId)!;
  const firstSize = clampPercent(sizePercent);
  return normalizeStudioDrawingPaletteLayout({
    ...normalized,
    sizes: {
      [firstId]: firstSize,
      [secondId]: 100 - firstSize,
    },
  });
}

export function toggleStudioDrawingPalette(
  layout: StudioDrawingPaletteLayout,
  id: StudioDrawingPaletteId,
): StudioDrawingPaletteLayout {
  const normalized = normalizeStudioDrawingPaletteLayout(layout);
  if (!PALETTE_ID_SET.has(id)) return normalized;
  return normalizeStudioDrawingPaletteLayout({
    ...normalized,
    collapsed: {
      ...normalized.collapsed,
      [id]: !normalized.collapsed[id],
    },
  });
}

export function moveStudioDrawingPalette(
  layout: StudioDrawingPaletteLayout,
  id: StudioDrawingPaletteId,
  direction: StudioDrawingPaletteMoveDirection,
): StudioDrawingPaletteLayout {
  const normalized = normalizeStudioDrawingPaletteLayout(layout);
  const index = normalized.order.indexOf(id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (
    index < 0 ||
    (direction !== "up" && direction !== "down") ||
    targetIndex < 0 ||
    targetIndex >= normalized.order.length
  ) {
    return normalized;
  }
  const order = [...normalized.order];
  [order[index], order[targetIndex]] = [order[targetIndex]!, order[index]!];
  return normalizeStudioDrawingPaletteLayout({ ...normalized, order });
}
