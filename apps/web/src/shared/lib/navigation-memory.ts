export interface ScrollPosition { x: number; y: number }

/** Bounded, in-memory history. Never persists route queries or account identifiers. */
export function createNavigationMemory(limit = 80) {
  const capacity = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 80;
  const positions = new Map<string, ScrollPosition>();
  return {
    get(key: string): ScrollPosition | undefined {
      const value = positions.get(key);
      return value ? { ...value } : undefined;
    },
    set(key: string, position: ScrollPosition) {
      const finite = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
      positions.delete(key);
      positions.set(key, { x: finite(position.x), y: finite(position.y) });
      while (positions.size > capacity) {
        const first = positions.keys().next().value;
        if (first === undefined) break;
        positions.delete(first);
      }
    },
    get size() { return positions.size; },
  };
}
