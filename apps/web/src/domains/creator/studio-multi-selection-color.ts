import { normalizeHexColor } from "./studio-color-utils";

import type {
  BubbleEl,
  DrawEl,
  El,
  FrameEl,
  TextEl,
} from "./studio-element-model";

export type StudioStrokeColorElement = DrawEl | TextEl | BubbleEl | FrameEl;

export interface StudioMultiSelectionStrokeColorState {
  readonly targets: readonly StudioStrokeColorElement[];
  readonly value: string | null;
  readonly mixed: boolean;
  readonly includesNone: boolean;
}

export function isStudioStrokeColorElement(
  element: El,
): element is StudioStrokeColorElement {
  return (
    element.type === "draw" ||
    element.type === "text" ||
    element.type === "bubble" ||
    element.type === "frame"
  );
}

export function studioVisibleStrokeColor(
  stroke: string | undefined,
): string | null {
  const trimmed = stroke?.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "transparent" || lower === "none") return null;
  return normalizeHexColor(trimmed) ?? lower;
}

export function resolveStudioMultiSelectionStrokeColor(
  elements: readonly El[],
  selectedIds: readonly string[],
): StudioMultiSelectionStrokeColorState {
  const selected = new Set(selectedIds);
  const targets = elements.filter(
    (element): element is StudioStrokeColorElement =>
      selected.has(element.id) && isStudioStrokeColorElement(element),
  );
  const values = targets.map((element) =>
    studioVisibleStrokeColor(element.stroke),
  );
  const unique = new Set(values.map((value) => value ?? "__none__"));
  const mixed = unique.size > 1;
  const firstVisible = values.find((value): value is string => value !== null);

  return {
    targets,
    value: mixed ? firstVisible ?? null : values[0] ?? null,
    mixed,
    includesNone: values.some((value) => value === null),
  };
}

function withStudioStrokeColor(
  element: StudioStrokeColorElement,
  color: string | null,
): StudioStrokeColorElement {
  const current = studioVisibleStrokeColor(element.stroke);
  const nextColor = color ? normalizeHexColor(color) ?? color : null;
  if (current === nextColor) return element;

  const stroke = nextColor ??
    (element.type === "draw" ? "transparent" : undefined);
  const needsDefaultWidth =
    nextColor !== null &&
    (!Number.isFinite(element.strokeWidth) || (element.strokeWidth ?? 0) <= 0);

  return {
    ...element,
    stroke,
    ...(needsDefaultWidth ? { strokeWidth: 3 } : {}),
  } as StudioStrokeColorElement;
}

export function applyStudioMultiSelectionStrokeColor(
  elements: readonly El[],
  selectedIds: readonly string[],
  color: string | null,
): El[] {
  const selected = new Set(selectedIds);
  let changed = false;
  const next = elements.map((element) => {
    if (!selected.has(element.id) || !isStudioStrokeColorElement(element)) {
      return element;
    }
    const patched = withStudioStrokeColor(element, color);
    if (patched !== element) changed = true;
    return patched;
  });

  return changed ? next : [...elements];
}
