import type { StudioFloatingSurfaceRect } from "./studio-floating-surface";

export const STUDIO_FLOATING_SURFACE_Z_INDEX_BASE = 70;
/** Persistent panels must remain below the Studio modal tier (z=80). */
export const STUDIO_FLOATING_SURFACE_Z_INDEX_LIMIT = 79;

export interface StudioFloatingSurfaceRegistryEntry {
  readonly id: string;
  readonly node: HTMLElement;
  readonly onZIndexChange: (zIndex: number) => void;
  readonly onReset?: () => void;
}

interface MutableRegistryEntry extends StudioFloatingSurfaceRegistryEntry {
  zIndex: number;
}

export interface StudioFloatingSurfaceRegistry {
  register(entry: StudioFloatingSurfaceRegistryEntry): () => void;
  activate(id: string): number;
  peerRects(id: string): readonly StudioFloatingSurfaceRect[];
  resetAll(): void;
  size(): number;
}

function visibleRect(node: HTMLElement): StudioFloatingSurfaceRect | null {
  if (!node.isConnected || node.hidden || node.getAttribute("aria-hidden") === "true") {
    return null;
  }
  const rect = node.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Process-local owner for focus stacking and peer geometry.
 *
 * No React state or persistence lives here. Every registered window keeps its own durable layout;
 * the registry only assigns a monotonic paint order and exposes currently mounted peer rectangles.
 */
export function createStudioFloatingSurfaceRegistry(): StudioFloatingSurfaceRegistry {
  const entries = new Map<string, MutableRegistryEntry>();
  let sequence = STUDIO_FLOATING_SURFACE_Z_INDEX_BASE;

  const compact = (): void => {
    const ordered = [...entries.values()].sort((left, right) => (
      left.zIndex - right.zIndex || left.id.localeCompare(right.id)
    ));
    // Reserve the highest slot for the interaction that triggered compaction. When more panels
    // are mounted than the numeric band can represent, only the oldest panels share the bottom
    // slot; the newest/active ordering remains distinct and no persistent panel crosses z=79.
    const distinctSlots = Math.max(
      1,
      STUDIO_FLOATING_SURFACE_Z_INDEX_LIMIT
        - STUDIO_FLOATING_SURFACE_Z_INDEX_BASE
        - 1,
    );
    const duplicateBottomCount = Math.max(
      0,
      ordered.length - distinctSlots,
    );
    for (let index = 0; index < ordered.length; index += 1) {
      const entry = ordered[index]!;
      const zIndex = STUDIO_FLOATING_SURFACE_Z_INDEX_BASE
        + 1
        + Math.max(0, index - duplicateBottomCount);
      entry.zIndex = Math.min(
        STUDIO_FLOATING_SURFACE_Z_INDEX_LIMIT - 1,
        zIndex,
      );
      entry.onZIndexChange(entry.zIndex);
    }
    sequence = ordered.length === 0
      ? STUDIO_FLOATING_SURFACE_Z_INDEX_BASE
      : Math.min(
          STUDIO_FLOATING_SURFACE_Z_INDEX_LIMIT - 1,
          STUDIO_FLOATING_SURFACE_Z_INDEX_BASE
            + Math.min(distinctSlots, ordered.length),
        );
  };

  const nextZIndex = (): number => {
    if (sequence >= STUDIO_FLOATING_SURFACE_Z_INDEX_LIMIT) compact();
    sequence += 1;
    return sequence;
  };

  return Object.freeze({
    register(entry: StudioFloatingSurfaceRegistryEntry) {
      const previous = entries.get(entry.id);
      const zIndex = previous?.zIndex ?? nextZIndex();
      entries.set(entry.id, { ...entry, zIndex });
      entry.onZIndexChange(zIndex);
      return () => {
        const current = entries.get(entry.id);
        if (current?.node === entry.node) entries.delete(entry.id);
      };
    },
    activate(id: string) {
      const entry = entries.get(id);
      if (!entry) return STUDIO_FLOATING_SURFACE_Z_INDEX_BASE;
      const zIndex = nextZIndex();
      entry.zIndex = zIndex;
      entry.onZIndexChange(zIndex);
      return zIndex;
    },
    peerRects(id: string) {
      const rects: StudioFloatingSurfaceRect[] = [];
      for (const [peerId, entry] of entries) {
        if (peerId === id) continue;
        const rect = visibleRect(entry.node);
        if (rect) rects.push(rect);
      }
      return Object.freeze(rects);
    },
    resetAll() {
      for (const entry of entries.values()) entry.onReset?.();
    },
    size() {
      return entries.size;
    },
  });
}

export const studioFloatingSurfaceRegistry =
  createStudioFloatingSurfaceRegistry();

/** Command/menu seam for recovering every currently mounted persistent panel. */
export function resetAllStudioFloatingSurfaces(): void {
  studioFloatingSurfaceRegistry.resetAll();
}
