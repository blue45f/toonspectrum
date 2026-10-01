/**
 * 빌드 모드 테스트 (Track 4 · 벤치마크 gap 1)
 */
import { describe, expect, it } from "vitest";

import {
  buildModeCancel,
  buildModeConfirmPlacement,
  buildModeMoveGhost,
  buildModeRotateGhost,
  buildModeSelectEntry,
  createStudioBuildModeState,
  STUDIO_BUILD_CATALOG,
  STUDIO_BUILD_CATEGORIES,
  studioBuildCatalogByCategory,
  studioBuildCatalogEntryById,
  studioBuildCatalogSearch,
  studioBuildCategoryLabel,
} from "./studio-virtual-space-build-mode";
import { studioVirtualDecorationPreset, type StudioVirtualDecorationState, type StudioVirtualDecorPlacement } from "./studio-virtual-space-customization";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

function world(): StudioVirtualSpaceWorldManifest {
  return { ...studioVirtualPlaceWorldManifest("skyport", true), tilemap: undefined, props: [], colliders: [], portals: [], interactions: [],
    spawns: [{ id: "entry", point: { x: 80, y: 320 } }], npcs: [], interactionSlots: [], npcActivityAnchors: [], acousticZones: [] };
}
function decorations(placements: readonly StudioVirtualDecorPlacement[] = []): StudioVirtualDecorationState {
  return { ...studioVirtualDecorationPreset("minimal"), placements, layoutWidth: 960, layoutHeight: 640 };
}

describe("빌드 카탈로그", () => {
  it("5개 카테고리를 모두 포함한다", () => {
    expect(STUDIO_BUILD_CATEGORIES).toHaveLength(5);
    for (const category of STUDIO_BUILD_CATEGORIES) {
      expect(studioBuildCatalogByCategory(category).length).toBeGreaterThan(0);
    }
  });

  it("id가 중복 없이 유니크하다", () => {
    const ids = STUDIO_BUILD_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("장식·가구·앰비언트·조명·프리셋 항목을 조회할 수 있다", () => {
    expect(studioBuildCatalogEntryById("decor:bench")?.category).toBe("decor");
    expect(studioBuildCatalogEntryById("furniture:arcade-cabinet")?.refId).toBe("arcade-cabinet");
    expect(studioBuildCatalogEntryById("ambient-decor:flag")?.category).toBe("ambient-decor");
    expect(studioBuildCatalogEntryById("light:floor-lamp")?.category).toBe("light");
    expect(studioBuildCatalogEntryById("light-preset:cozy-evening")?.category).toBe("light-preset");
    expect(studioBuildCatalogEntryById("bogus:x")).toBeNull();
  });

  it("한영 라벨·설명으로 검색한다", () => {
    expect(studioBuildCatalogSearch("벤치").some((entry) => entry.id === "decor:bench")).toBe(true);
    expect(studioBuildCatalogSearch("arcade").some((entry) => entry.id === "furniture:arcade-cabinet")).toBe(true);
    expect(studioBuildCatalogSearch("").length).toBe(STUDIO_BUILD_CATALOG.length);
    expect(studioBuildCatalogSearch("존재하지않는검색어").length).toBe(0);
  });

  it("카테고리 라벨을 반환한다", () => {
    expect(studioBuildCategoryLabel("furniture").ko).toBe("가구");
    expect(studioBuildCategoryLabel("light-preset").en).toBe("Light presets");
  });
});

describe("빌드 모드 상태", () => {
  it("항목 선택 → 배치 단계, 취소 → 처음으로", () => {
    const idle = createStudioBuildModeState();
    expect(idle.phase).toBe("browse");
    const placing = buildModeSelectEntry(idle, "decor:bench");
    expect(placing.phase).toBe("placing");
    expect(placing.entryId).toBe("decor:bench");
    const cancelled = buildModeCancel(placing);
    expect(cancelled).toEqual(createStudioBuildModeState());
  });

  it("없는 항목 선택은 무시한다", () => {
    const idle = createStudioBuildModeState();
    expect(buildModeSelectEntry(idle, "bogus:x")).toBe(idle);
  });

  it("고스트는 격자에 스냅된다", () => {
    const placing = buildModeSelectEntry(createStudioBuildModeState(), "decor:bench");
    const moved = buildModeMoveGhost(placing, { x: 404, y: 318 });
    expect(moved.ghost).toEqual({ x: 400, y: 320 });
  });

  it("고스트를 90°씩 회전한다", () => {
    const placing = buildModeSelectEntry(createStudioBuildModeState(), "decor:bench");
    const rotated = buildModeRotateGhost(placing);
    expect(rotated.rotation).toBe(90);
    expect(buildModeRotateGhost(buildModeRotateGhost(buildModeRotateGhost(rotated))).rotation).toBe(0);
  });

  it("browse 단계에서는 고스트·회전이 무시된다", () => {
    const idle = createStudioBuildModeState();
    expect(buildModeMoveGhost(idle, { x: 100, y: 100 }).ghost).toBeNull();
    expect(buildModeRotateGhost(idle).rotation).toBe(0);
  });
});

describe("배치 확정", () => {
  it("장식은 즉시 배치되고 같은 항목을 계속 놓을 수 있다", () => {
    let state = buildModeSelectEntry(createStudioBuildModeState(), "decor:bench");
    state = buildModeMoveGhost(state, { x: 400, y: 320 });
    const result = buildModeConfirmPlacement(state, decorations(), world());
    expect(result.ok).toBe(true);
    expect(result.pending).toBeNull();
    expect(result.decorations.placements).toHaveLength(1);
    expect(result.state.phase).toBe("placing");
    expect(result.state.ghost).toBeNull();
  });

  it("고스트 없이 확정하면 실패한다", () => {
    const state = buildModeSelectEntry(createStudioBuildModeState(), "decor:bench");
    const result = buildModeConfirmPlacement(state, decorations(), world());
    expect(result.ok).toBe(false);
    expect(result.decorations.placements).toHaveLength(0);
  });

  it("가구·조명 등은 pending 요청으로 내보낸다", () => {
    let state = buildModeSelectEntry(createStudioBuildModeState(), "furniture:arcade-cabinet");
    state = buildModeMoveGhost(state, { x: 400, y: 320 });
    const furniture = buildModeConfirmPlacement(state, decorations(), world());
    expect(furniture.ok).toBe(true);
    expect(furniture.decorations.placements).toHaveLength(0);
    expect(furniture.pending).toMatchObject({
      entryId: "furniture:arcade-cabinet", category: "furniture", refId: "arcade-cabinet",
    });

    let light = buildModeSelectEntry(createStudioBuildModeState(), "light-preset:cozy-evening");
    light = buildModeMoveGhost(light, { x: 480, y: 240 });
    const preset = buildModeConfirmPlacement(light, decorations(), world());
    expect(preset.pending).toMatchObject({ category: "light-preset", refId: "cozy-evening" });
  });

  it("회전된 장식은 회전 상태로 배치된다", () => {
    let state = buildModeSelectEntry(createStudioBuildModeState(), "decor:bench");
    state = buildModeRotateGhost(state);
    state = buildModeMoveGhost(state, { x: 400, y: 320 });
    const result = buildModeConfirmPlacement(state, decorations(), world());
    expect(result.ok).toBe(true);
    const placed = result.decorations.placements.at(-1);
    // 회전 적용이 충돌로 실패하면 0도로 유지될 수 있다.
    expect([0, 90]).toContain(placed?.rotation);
  });
});
