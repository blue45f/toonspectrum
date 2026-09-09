export type SelectionSetOperation = "replace" | "add" | "subtract" | "intersect" | "toggle";

function orderedUniqueIds(ids: readonly string[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

/** Apply set operations while preserving canonical document z-order and dropping stale ids. */
export function combineSelectionIds(
  documentIds: readonly string[],
  currentIds: readonly string[],
  incomingIds: readonly string[],
  operation: SelectionSetOperation
): string[] {
  const order = orderedUniqueIds(documentIds);
  const known = new Set(order);
  const current = new Set(currentIds.filter((id) => known.has(id)));
  const incoming = new Set(incomingIds.filter((id) => known.has(id)));
  let next: Set<string>;

  if (operation === "replace") next = new Set(incoming);
  else if (operation === "add") next = new Set([...current, ...incoming]);
  else if (operation === "subtract") {
    next = new Set(current);
    for (const id of incoming) next.delete(id);
  } else if (operation === "intersect") {
    next = new Set([...current].filter((id) => incoming.has(id)));
  } else {
    next = new Set(current);
    for (const id of incoming) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
  }

  return order.filter((id) => next.has(id));
}

/** Inverse selection over the current selectable document order. */
export function invertSelectionIds(
  documentIds: readonly string[],
  currentIds: readonly string[]
): string[] {
  const order = orderedUniqueIds(documentIds);
  const selected = new Set(currentIds);
  return order.filter((id) => !selected.has(id));
}

/** Shift-range selection primitive for layer lists and keyboard navigation. */
export function selectIdRange(
  documentIds: readonly string[],
  anchorId: string,
  focusId: string,
  baseIds: readonly string[] = []
): string[] {
  const order = orderedUniqueIds(documentIds);
  const anchorIndex = order.indexOf(anchorId);
  const focusIndex = order.indexOf(focusId);
  if (anchorIndex < 0 || focusIndex < 0) {
    return combineSelectionIds(order, [], baseIds, "replace");
  }
  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);
  return combineSelectionIds(order, baseIds, order.slice(start, end + 1), "add");
}

/** Cycle a topmost-first hit stack, wrapping in either direction. */
export function cycleSelectionCandidate(
  candidates: readonly string[],
  currentId: string | null,
  direction: 1 | -1 = 1
): string | null {
  const ordered = orderedUniqueIds(candidates);
  if (ordered.length === 0) return null;
  const currentIndex = currentId === null ? -1 : ordered.indexOf(currentId);
  if (currentIndex < 0) return direction === 1 ? ordered[0]! : ordered[ordered.length - 1]!;
  const nextIndex = (currentIndex + direction + ordered.length) % ordered.length;
  return ordered[nextIndex]!;
}
