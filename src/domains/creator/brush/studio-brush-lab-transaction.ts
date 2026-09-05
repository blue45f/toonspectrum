/** Renderer-independent orchestration only. The product adapter owns all brush semantics. */
export const BRUSH_LAB_SLOTS = [
  { id: "tip", label: "주 펜촉", description: "모양 · 경도 · 사용자 알파" },
  { id: "dual-tip", label: "보조 펜촉", description: "듀얼 팁 · 팁 레이어" },
  { id: "surface", label: "종이 질감", description: "그레인 · 스케일 · 고정 방식" },
  { id: "pigment", label: "색상 변화", description: "안료 · 색상 동역학" },
  { id: "size-opacity", label: "굵기와 농도", description: "필압 · 속도 반응" },
  { id: "flow-spacing", label: "도포와 간격", description: "유량 · 도장 간격" },
  { id: "scatter-orientation", label: "산포와 방향", description: "흩어짐 · 회전" },
  { id: "taper", label: "획 시작과 끝", description: "테이퍼 · 끝맺음" },
] as const;

export type BrushLabSlot = (typeof BRUSH_LAB_SLOTS)[number]["id"];
export type BrushLabRecipe = Readonly<Partial<Record<BrushLabSlot, string>>>;
export const BRUSH_LAB_MAX_VARIANTS = 12;
export const BRUSH_LAB_HISTORY_LIMIT = 20;
export const BRUSH_LAB_HISTORY_BYTES = 2 * 1024 * 1024;

export type BrushLabComposition<T> =
  | { readonly ok: true; readonly value: T; readonly applied: readonly BrushLabSlot[] }
  | { readonly ok: false; readonly reason: "invalid-recipe" | "missing-source" | "load-failed" | "cancelled"; readonly sourceIds: readonly string[] };

export interface BrushLabCompositionPort<T> {
  /** Must return an immutable, normalized value or null. Never substitute an unknown source. */
  load: (id: string) => Promise<T | null>;
  /** Must be pure; the canonical product merger preserves carrier pins and seed. */
  merge: (slot: BrushLabSlot, current: T, source: T) => T;
}

/** Validates unknown files/recipes without accepting overlapping bundle aliases. */
export function readBrushLabRecipe(raw: unknown): BrushLabRecipe | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const allowed = new Set<string>(BRUSH_LAB_SLOTS.map((slot) => slot.id));
  const result: Partial<Record<BrushLabSlot, string>> = {};
  const entries = Object.entries(raw);
  if (entries.length > BRUSH_LAB_SLOTS.length) return null;
  for (const [key, value] of entries) {
    if (!allowed.has(key) || typeof value !== "string" || value.length > 160) return null;
    if (value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) return null;
    if (value) result[key as BrushLabSlot] = value;
  }
  return Object.freeze(result);
}

/** Resolve every distinct source first. A failed load never applies a partial recipe. */
export async function composeBrushLabRecipe<T>(
  base: T,
  raw: unknown,
  port: BrushLabCompositionPort<T>,
  isCurrent: () => boolean = () => true,
): Promise<BrushLabComposition<T>> {
  const recipe = readBrushLabRecipe(raw);
  if (!recipe) return { ok: false, reason: "invalid-recipe", sourceIds: [] };
  if (!isCurrent()) return { ok: false, reason: "cancelled", sourceIds: [] };
  const sourceIds = [...new Set(Object.values(recipe))];
  try {
    const resolved = await Promise.all(sourceIds.map(async (id) => [id, await port.load(id)] as const));
    if (!isCurrent()) return { ok: false, reason: "cancelled", sourceIds: [] };
    const missing = resolved.filter(([, value]) => value === null).map(([id]) => id);
    if (missing.length) return { ok: false, reason: "missing-source", sourceIds: missing };
    const sources = new Map(resolved);
    let value = base;
    const applied: BrushLabSlot[] = [];
    // Fixed slot order: input object key insertion order cannot change the result.
    for (const slot of BRUSH_LAB_SLOTS) {
      const id = recipe[slot.id];
      if (!id) continue;
      const source = sources.get(id);
      if (source === null || source === undefined) {
        return { ok: false, reason: "missing-source", sourceIds: [id] };
      }
      value = port.merge(slot.id, value, source);
      applied.push(slot.id);
    }
    return isCurrent()
      ? { ok: true, value, applied }
      : { ok: false, reason: "cancelled", sourceIds: [] };
  } catch {
    return isCurrent()
      ? { ok: false, reason: "load-failed", sourceIds }
      : { ok: false, reason: "cancelled", sourceIds: [] };
  }
}

/** Both new async requests and synchronous edits invalidate earlier pending completions. */
export function createBrushLabRevisionGate() {
  let revision = 0;
  return {
    invalidate: () => { revision += 1; },
    begin: () => { revision += 1; return revision; },
    isCurrent: (ticket: number) => ticket === revision,
  };
}

export interface BrushLabHistory<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

/** Caps retained JSON bytes as well as entry count: imported alpha tips can be large. */
function boundedHistory<T>(values: readonly T[]): readonly T[] {
  const result: T[] = [];
  let bytes = 0;
  for (let index = values.length - 1; index >= 0 && result.length < BRUSH_LAB_HISTORY_LIMIT; index -= 1) {
    const value = values[index]!;
    bytes += JSON.stringify(value).length * 2;
    if (bytes > BRUSH_LAB_HISTORY_BYTES) break;
    result.unshift(value);
  }
  return result;
}

export function editBrushLabHistory<T>(history: BrushLabHistory<T>, value: T, expected?: T): BrushLabHistory<T> {
  if (expected !== undefined && history.present !== expected) return history;
  if (JSON.stringify(history.present) === JSON.stringify(value)) return history;
  return { past: boundedHistory([...history.past, history.present]), present: value, future: [] };
}

export function undoBrushLabHistory<T>(history: BrushLabHistory<T>): BrushLabHistory<T> {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1]!,
    future: boundedHistory([...history.future, history.present]),
  };
}

export function redoBrushLabHistory<T>(history: BrushLabHistory<T>): BrushLabHistory<T> {
  if (!history.future.length) return history;
  return {
    past: boundedHistory([...history.past, history.present]),
    present: history.future[history.future.length - 1]!,
    future: history.future.slice(0, -1),
  };
}

/** One-axis exploration, not an exponential Cartesian product or inflated combination count. */
export function enumerateBrushLabVariants(
  recipe: BrushLabRecipe,
  slot: BrushLabSlot,
  candidates: readonly string[],
): readonly BrushLabRecipe[] {
  const ids = [...new Set(candidates)].filter((id) => id !== recipe[slot]);
  return ids.flatMap((id) => {
    const next = readBrushLabRecipe({ ...recipe, [slot]: id });
    return next ? [next] : [];
  }).slice(0, BRUSH_LAB_MAX_VARIANTS);
}
