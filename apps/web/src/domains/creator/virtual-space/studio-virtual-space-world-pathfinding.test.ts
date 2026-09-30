import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest, type StudioWorldRect } from "./studio-virtual-space-world-manifest";
import {
  StudioWorldConnectivityIndex,
  studioWorldCircleCanOccupy,
  studioWorldNavigationGrid,
  studioWorldNavigationLattice,
} from "./studio-virtual-space-world-connectivity";
import { findStudioWorldPath, studioWorldCanOccupy, studioWorldCanTraverse } from "./studio-virtual-space-world-pathfinding";

/** 세로 벽 9개가 위·아래 틈을 번갈아 두는 3072×1920 미로. */
function mazeWorld(): StudioVirtualSpaceWorldManifest {
  const colliders: StudioWorldRect[] = [];
  for (let index = 0; index < 9; index += 1) {
    const x = 300 + index * 300;
    const gapAtTop = index % 2 === 0;
    colliders.push(gapAtTop
      ? { x, y: 160, width: 24, height: 1920 - 160 }
      : { x, y: 0, width: 24, height: 1920 - 160 });
  }
  // 공간 해시 경로도 거치도록 작은 기둥을 많이 둔다.
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      colliders.push({ x: 120 + column * 300, y: 420 + row * 240, width: 40, height: 40 });
    }
  }
  return Object.freeze({
    ...DEFAULT_STUDIO_WORLD_MANIFEST,
    id: "maze-3072",
    width: 3072,
    height: 1920,
    props: [],
    colliders: Object.freeze(colliders),
    rooms: [{ id: "maze", labelKo: "미로", labelEn: "Maze", x: 0, y: 0, width: 3072, height: 1920 }],
    spawns: [{ id: "main", point: { x: 40, y: 40 } }],
    interactions: [],
    portals: [],
    npcs: [],
    interactionSlots: [],
    npcActivityAnchors: [],
    acousticZones: [],
    occlusionLayers: [],
  });
}

describe("studio world pathfinding at campus scale", () => {
  it("3072×1920 월드(벽 미로 포함)에서 대각 끝→끝 경로를 확장 한도 안에서 찾는다", () => {
    const world = mazeWorld();
    const start = { x: 40, y: 40 };
    const target = { x: 3030, y: 1880 };
    const startedAt = performance.now();
    const path = findStudioWorldPath(world, start, target);
    const elapsed = performance.now() - startedAt;
    expect(path.length).toBeGreaterThan(8);
    expect(path.at(-1)).toEqual(target);
    let previous = start;
    for (const point of path) {
      expect(studioWorldCanOccupy(world, point)).toBe(true);
      expect(studioWorldCanTraverse(world, previous, point)).toBe(true);
      previous = point;
    }
    // 느린 CI 러너도 넉넉히 통과하되, 선형 충돌 탐색으로 돌아가면 드러나는 한도.
    expect(elapsed).toBeLessThan(4_000);
    // 같은 요청은 캐시된 같은 배열을 돌려준다.
    expect(findStudioWorldPath(world, start, target)).toBe(path);
  });

  it("960×640·1280×960 월드의 격자는 6px로 유지된다", () => {
    expect(studioWorldNavigationGrid(960, 640)).toBe(6);
    expect(studioWorldNavigationGrid(1280, 960)).toBe(6);
    expect(studioWorldNavigationGrid(3072, 1920)).toBe(13);
    expect(studioWorldNavigationGrid(Number.NaN, 10)).toBe(6);
    const lattice = studioWorldNavigationLattice({ width: 3072, height: 1920 });
    expect(lattice.cells).toBeLessThanOrEqual(40_000);
    expect(new StudioWorldConnectivityIndex(DEFAULT_STUDIO_WORLD_MANIFEST, [], 9).grid).toBe(6);
  });

  it("3072×1920 연결성 색인은 budgetExceeded=false로 전체 색인한다", () => {
    const world = mazeWorld();
    const index = new StudioWorldConnectivityIndex(world, world.colliders, 9);
    expect(index.connected({ x: 40, y: 40 }, { x: 3030, y: 1880 })).toBe(true);
    expect(index.budgetExceeded).toBe(false);
    expect(index.searchCount).toBe(1);
    // 같은 연결 요소 질의는 다시 탐색하지 않는다.
    expect(index.connected({ x: 1500, y: 100 }, { x: 2900, y: 1800 })).toBe(true);
    expect(index.searchCount).toBe(1);

    const sealed = Object.freeze({ ...world, colliders: Object.freeze([...world.colliders, { x: 1500, y: 0, width: 30, height: 1920 }]) });
    const sealedIndex = new StudioWorldConnectivityIndex(sealed, sealed.colliders, 9);
    expect(sealedIndex.connected({ x: 40, y: 40 }, { x: 3030, y: 1880 })).toBe(false);
    expect(sealedIndex.budgetExceeded).toBe(false);
  });

  it("공간 해시는 선형 충돌 판정과 같은 답을 낸다", () => {
    const world = mazeWorld();
    const colliders = world.colliders;
    const linear = (point: { x: number; y: number }) => point.x >= 9 && point.y >= 9 && point.x <= 3072 - 9 && point.y <= 1920 - 9
      && !colliders.some((rect) => {
        const dx = point.x - Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
        const dy = point.y - Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
        return dx * dx + dy * dy < 81;
      });
    for (let y = 0; y <= 1920; y += 37) {
      for (let x = 0; x <= 3072; x += 41) {
        expect(studioWorldCircleCanOccupy(world, colliders, { x, y }, 9)).toBe(linear({ x, y }));
      }
    }
  });
});
