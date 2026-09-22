import {
  clampStudioVirtualSpacePoint,
  type StudioVirtualSpacePoint,
} from "@/domains/creator/virtual-space/studio-virtual-space-model";
import type { CampusDistrictId } from "@/shared/lib/spatial-campus/campus-model";

export interface CampusPositionMemory {
  read(ownerScope: string, districtId: CampusDistrictId): StudioVirtualSpacePoint | null;
  write(ownerScope: string, districtId: CampusDistrictId, point: StudioVirtualSpacePoint): void;
  clear(): void;
  readonly size: number;
}

/** Bounded, tab-local memory. It never persists account ids or coordinates. */
export function createCampusPositionMemory(limit = 9): CampusPositionMemory {
  const capacity = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 9;
  const positions = new Map<CampusDistrictId, StudioVirtualSpacePoint>();
  let currentOwner: string | null = null;

  const enterOwner = (ownerScope: string) => {
    if (currentOwner === ownerScope) return;
    positions.clear();
    currentOwner = ownerScope;
  };
  return {
    read(ownerScope, districtId) {
      enterOwner(ownerScope);
      const point = positions.get(districtId);
      return point ? { ...point } : null;
    },
    write(ownerScope, districtId, point) {
      enterOwner(ownerScope);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      positions.delete(districtId);
      positions.set(districtId, clampStudioVirtualSpacePoint(point));
      while (positions.size > capacity) {
        const oldest = positions.keys().next().value;
        if (oldest === undefined) break;
        positions.delete(oldest);
      }
    },
    clear() {
      positions.clear();
      currentOwner = null;
    },
    get size() {
      return positions.size;
    },
  };
}

export const campusPositionMemory = createCampusPositionMemory();
