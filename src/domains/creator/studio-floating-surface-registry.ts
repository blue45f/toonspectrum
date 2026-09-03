import type { StudioFloatingSurfaceRect } from "./studio-floating-surface";

export const STUDIO_FLOATING_SURFACE_Z_INDEX_BASE = 72;
export const STUDIO_FLOATING_SURFACE_Z_INDEX_LIMIT = 980;

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
    sequence = STUDIO_FLOATING_SURFACE_Z_INDEX_BASE;
    for (const entry of ordered) {
      sequence += 1;
      entry.zIndex = sequence;
      entry.onZIndexChange(sequence);
    }
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
