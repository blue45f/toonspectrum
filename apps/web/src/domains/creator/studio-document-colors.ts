import { normalizeHexColor } from "./studio-color-utils";

import type { El } from "./studio-element-model";

const COLOR_CONTAINER_KEY = /color|fill|stroke|tint|background|shadow|gradient|format/i;
const SKIP_KEY = /src|dataurl|points|pressures|frames|text|prompt/i;

interface ColorUsage {
  count: number;
  lastSeen: number;
}

function collectValue(
  value: unknown,
  key: string,
  usage: Map<string, ColorUsage>,
  sequence: { current: number },
  depth: number,
  insideColorContainer: boolean,
): void {
  if (depth > 5 || SKIP_KEY.test(key)) return;
  const colorContainer = insideColorContainer || COLOR_CONTAINER_KEY.test(key);
  if (typeof value === "string") {
    if (!colorContainer || value.trim().toLowerCase() === "transparent") return;
    const normalized = normalizeHexColor(value);
    if (!normalized) return;
    const index = sequence.current++;
    const current = usage.get(normalized);
    usage.set(normalized, {
      count: (current?.count ?? 0) + 1,
      lastSeen: index,
    });
    return;
  }
  if (!colorContainer || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 64)) {
      collectValue(item, key, usage, sequence, depth + 1, true);
    }
    return;
  }
  for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    collectValue(nestedValue, nestedKey, usage, sequence, depth + 1, true);
  }
}

/**
 * Returns the most useful authored colours for the current document.
 * Frequency wins first; ties prefer colours seen later in the element stream.
 */
export function collectStudioDocumentColors(
  elements: readonly El[],
  max = 16,
): string[] {
  const usage = new Map<string, ColorUsage>();
  const sequence = { current: 0 };
  for (const element of elements) {
    for (const [key, value] of Object.entries(element as unknown as Record<string, unknown>)) {
      collectValue(value, key, usage, sequence, 0, false);
    }
  }
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 16;
  return [...usage.entries()]
    .sort(([, left], [, right]) => right.count - left.count || right.lastSeen - left.lastSeen)
    .slice(0, limit)
    .map(([color]) => color);
}
