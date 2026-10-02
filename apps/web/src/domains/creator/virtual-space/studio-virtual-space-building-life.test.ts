import { describe, expect, it } from "vitest";

import {
  CAMPUS_DRESSING,
  CAMPUS_GATES,
  CAMPUS_OBJECTS,
  CAMPUS_WATER,
  CAMPUS_ZONES,
  campusTileRect,
} from "./studio-virtual-space-campus-blueprint";
import {
  STUDIO_BUILDING_LIFE_LEVELS,
  STUDIO_BUILDING_WINDOW_MAX,
  buildStudioBuildingAoStrips,
  buildStudioBuildingObjectShadows,
  buildStudioBuildingWindows,
  buildStudioStreetLampAnchors,
  studioBuildingHash01,
  studioBuildingLifeAmbienceAt,
  studioBuildingLifeBudget,
  studioBuildingLifeLerpLevels,
  studioBuildingLifePhaseFor,
  studioBuildingShadowFrame,
  studioBuildingSkyTint,
  studioBuildingWindowState,
} from "./studio-virtual-space-building-life";
import { StudioBuildingLifeRuntime } from "./studio-virtual-space-building-life-runtime";
import * as buildingLife from "./studio-virtual-space-building-life";
import {
  studioCampusDoorways,
  studioCampusWallSegments,
  studioVirtualCampusManifest,
  studioVirtualCampusScene,
} from "./studio-virtual-space-campus-world";
import {
  studioVirtualSetDressingPlacement,
} from "./studio-virtual-space-world-set-dressing";

const ALL_WALLS = CAMPUS_ZONES.flatMap((zone) => studioCampusWallSegments(zone));
const STREET_LAMPS = CAMPUS_OBJECTS.filter((object) => object.kind === "street-lamp");

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("시간대 위상·목표값", () => {
  it("캠퍼스 생동감 위상을 건물 위상으로 잇는다 (새벽→아침)", () => {
    expect(studioBuildingLifePhaseFor("dawn")).toBe("morning");
    expect(studioBuildingLifePhaseFor("day")).toBe("day");
    expect(studioBuildingLifePhaseFor("dusk")).toBe("dusk");
    expect(studioBuildingLifePhaseFor("night")).toBe("night");
  });

  it("가로등은 낮에 꺼지고 황혼·밤에 켜지며, 창문 점등률은 밤이 가장 높다", () => {
    const levels = STUDIO_BUILDING_LIFE_LEVELS;
    expect(levels.day.lampGlow).toBe(0);
    expect(levels.dusk.lampGlow).toBe(1);
    expect(levels.night.lampGlow).toBe(1);
    expect(levels.night.windowLitRatio).toBeGreaterThan(levels.dusk.windowLitRatio);
    expect(levels.dusk.windowLitRatio).toBeGreaterThan(levels.day.windowLitRatio);
    expect(levels.night.windowGlow).toBe(1);
    expect(levels.day.windowGlow).toBeLessThan(0.2);
  });

  it("그림자는 아침에 서쪽, 황혼에 동쪽으로 기울고 황혼에 가장 길다", () => {
    const levels = STUDIO_BUILDING_LIFE_LEVELS;
    expect(levels.morning.shadowOffsetX).toBeLessThan(0);
    expect(levels.dusk.shadowOffsetX).toBeGreaterThan(0);
    expect(levels.dusk.shadowStretch).toBeGreaterThan(levels.day.shadowStretch);
    expect(levels.dusk.aoLength).toBeGreaterThan(levels.day.aoLength);
  });

  it("하늘 틴트는 낮에 무색(흰색)이고 밤에만 배경용으로 달라진다", () => {
    expect(studioBuildingSkyTint("day")).toBe(0xffffff);
    expect(studioBuildingSkyTint("night")).not.toBe(0xffffff);
    expect(studioBuildingSkyTint("dawn")).toBe(STUDIO_BUILDING_LIFE_LEVELS.morning.skyTint);
  });

  it("목표값 보간은 양 끝에서 정확하고 색도 채널별로 섞인다", () => {
    const { morning, night } = STUDIO_BUILDING_LIFE_LEVELS;
    expect(studioBuildingLifeLerpLevels(morning, night, 0).windowGlow).toBe(morning.windowGlow);
    expect(studioBuildingLifeLerpLevels(morning, night, 1).windowGlow).toBe(night.windowGlow);
    const mid = studioBuildingLifeLerpLevels(morning, night, 0.5);
    expect(mid.windowGlow).toBeCloseTo((morning.windowGlow + night.windowGlow) / 2, 5);
    expect(mid.skyTint).not.toBe(morning.skyTint);
    expect(mid.skyTint).not.toBe(night.skyTint);
  });
});

describe("studioBuildingLifeAmbienceAt (환경광 곡선)", () => {
  it("밤은 어둡고 정오는 밝으며 전 구간 0.3~0.98 안에 있다", () => {
    expect(studioBuildingLifeAmbienceAt(0).ambient).toBe(0.3);
    expect(studioBuildingLifeAmbienceAt(12.5 / 24).ambient).toBe(0.98);
    for (let hour = 0; hour < 24; hour += 0.25) {
      const { ambient } = studioBuildingLifeAmbienceAt(hour / 24);
      expect(ambient).toBeGreaterThanOrEqual(0.3);
      expect(ambient).toBeLessThanOrEqual(0.98);
    }
  });

  it("곡선은 연속이다 (이웃한 시각끼리 급격히 뛰지 않는다)", () => {
    let previous = studioBuildingLifeAmbienceAt(0).ambient;
    for (let hour = 0.1; hour < 24; hour += 0.1) {
      const next = studioBuildingLifeAmbienceAt(hour / 24).ambient;
      expect(Math.abs(next - previous)).toBeLessThan(0.03);
      previous = next;
    }
  });

  it("아침에는 점점 밝아지고 저녁에는 점점 어두워진다", () => {
    expect(studioBuildingLifeAmbienceAt(9 / 24).ambient).toBeGreaterThan(studioBuildingLifeAmbienceAt(6 / 24).ambient);
    expect(studioBuildingLifeAmbienceAt(21 / 24).ambient).toBeLessThan(studioBuildingLifeAmbienceAt(18 / 24).ambient);
  });
});

describe("창문 배치", () => {
  const windows = buildStudioBuildingWindows(ALL_WALLS);

  it("북벽이 있는 모든 구역에 창문이 생기고 상한 안에 있다", () => {
    expect(windows.length).toBeGreaterThan(80);
    expect(windows.length).toBeLessThanOrEqual(STUDIO_BUILDING_WINDOW_MAX);
    const zones = new Set(windows.map((window) => window.zoneId));
    for (const zone of CAMPUS_ZONES) {
      if (zone.walls.includes("north")) expect(zones.has(zone.roomId)).toBe(true);
      else expect(zones.has(zone.roomId)).toBe(false);
    }
  });

  it("결정적이다 (같은 입력이면 같은 배치)", () => {
    expect(buildStudioBuildingWindows(ALL_WALLS)).toEqual(windows);
  });

  it("모든 창문은 자기 구역 북벽 구간 안, 앞면 높이에 있다", () => {
    const northWalls = ALL_WALLS.filter((wall) => wall.side === "north");
    for (const window of windows) {
      const wall = northWalls.find((candidate) =>
        candidate.zoneId === window.zoneId
        && window.x >= candidate.rect.x + 26 - 0.5
        && window.x <= candidate.rect.x + candidate.rect.width - 26 + 0.5);
      expect(wall, window.id).toBeDefined();
      expect(window.y).toBe(wall!.rect.y + Math.round(wall!.rect.height / 2) + 2);
      expect((window.x - (wall!.rect.x + 26)) % 38).toBe(0);
    }
  });

  it("창문은 북쪽 문 틈과 겹치지 않는다", () => {
    for (const zone of CAMPUS_ZONES) {
      for (const doorway of studioCampusDoorways(zone)) {
        if (doorway.side !== "north") continue;
        for (const window of windows.filter((item) => item.zoneId === zone.roomId)) {
          const inside = window.x + 10 > doorway.rect.x && window.x - 10 < doorway.rect.x + doorway.rect.width;
          expect(inside, `${window.id} vs ${zone.roomId} door`).toBe(false);
        }
      }
    }
  });
});

describe("창문 점등 상태", () => {
  const windows = buildStudioBuildingWindows(ALL_WALLS);
  const night = STUDIO_BUILDING_LIFE_LEVELS.night;
  const day = STUDIO_BUILDING_LIFE_LEVELS.day;

  it("점등률 0이면 어떤 창도 켜지지 않고, 밤에는 대부분 켜진다", () => {
    const none = windows.filter((window) => studioBuildingWindowState(window, { windowLitRatio: 0, windowGlow: 1 }, 5000, false).lit);
    expect(none).toHaveLength(0);
    const lit = windows.filter((window) => studioBuildingWindowState(window, night, 5000, false).lit);
    expect(lit.length / windows.length).toBeGreaterThan(0.7);
    const dayLit = windows.filter((window) => studioBuildingWindowState(window, day, 5000, false).lit);
    expect(dayLit.length).toBeLessThan(lit.length / 3);
  });

  it("켜진 창 알파는 0~1 안이고, 깜빡이는 창은 시간에 따라 요동친다", () => {
    const flickering = windows.filter((window) => window.flicker);
    expect(flickering.length).toBeGreaterThan(0);
    const alphas = new Set<number>();
    for (let time = 0; time < 4000; time += 130) {
      for (const window of flickering) {
        const state = studioBuildingWindowState(window, night, time, false);
        if (state.lit) {
          expect(state.alpha).toBeGreaterThan(0);
          expect(state.alpha).toBeLessThanOrEqual(1);
          alphas.add(state.alpha);
        }
      }
    }
    expect(alphas.size).toBeGreaterThan(3);
  });

  it("느린 버킷이 지나면 경계 근처 창이 가끔 토글된다", () => {
    const bucketMs = 150 * 48;
    const litAt = (time: number) => new Set(
      windows.filter((window) => studioBuildingWindowState(window, STUDIO_BUILDING_LIFE_LEVELS.dusk, time, false).lit)
        .map((window) => window.id),
    );
    const first = litAt(0);
    let changed = false;
    for (let bucket = 1; bucket <= 24 && !changed; bucket += 1) {
      const next = litAt(bucket * bucketMs);
      changed = next.size !== first.size || [...next].some((id) => !first.has(id));
    }
    expect(changed).toBe(true);
  });

  it("reduced-motion에서는 토글·요동이 멈추고 점등 집합이 고정된다", () => {
    const at = (time: number) => windows.map((window) => {
      const state = studioBuildingWindowState(window, night, time, true);
      return state.lit ? state.alpha : 0;
    });
    expect(at(1000)).toEqual(at(1000 + 150 * 48 * 5 + 777));
  });
});

describe("가로등 배치·앵커", () => {
  it("전용 가로등 10곳이 대로변에 있고 충돌체가 전부 겹치지 않는다", () => {
    expect(STREET_LAMPS).toHaveLength(10);
    for (const lamp of STREET_LAMPS) {
      expect(lamp.collider, lamp.id).toBeDefined();
      for (const other of CAMPUS_OBJECTS) {
        if (other.id === lamp.id || !other.collider) continue;
        expect(rectsOverlap(lamp.collider!, other.collider), `${lamp.id} vs ${other.id}`).toBe(false);
      }
    }
  });

  it("가로등은 드레싱 충돌체·문 틈·물과 겹치지 않는다", () => {
    const dressingColliders = CAMPUS_DRESSING.flatMap((item) =>
      studioVirtualSetDressingPlacement(`campus-${item.id}`, item.atlas, item.frame, item.x, item.y, item.width, item.height, item.depth ?? "y-sort").colliders);
    const doorways = CAMPUS_ZONES.flatMap((zone) => studioCampusDoorways(zone));
    const waters = CAMPUS_WATER.map((rect) => campusTileRect(rect));
    for (const lamp of STREET_LAMPS) {
      for (const collider of dressingColliders) {
        expect(rectsOverlap(lamp.collider!, collider), `${lamp.id} vs dressing`).toBe(false);
      }
      for (const doorway of doorways) {
        expect(rectsOverlap(lamp.collider!, doorway.rect), `${lamp.id} vs door ${doorway.zoneId}`).toBe(false);
      }
      for (const water of waters) {
        expect(rectsOverlap(lamp.collider!, water), `${lamp.id} in water`).toBe(false);
      }
    }
  });

  it("가로등은 스폰·게이트와 안전 거리를 둔다", () => {
    for (const personal of [true, false]) {
      for (const spawn of studioVirtualCampusManifest(personal).spawns) {
        for (const lamp of STREET_LAMPS) {
          expect(Math.hypot(spawn.point.x - lamp.x, spawn.point.y - lamp.y), `${lamp.id} vs spawn ${spawn.id}`).toBeGreaterThanOrEqual(48);
        }
      }
    }
    for (const gate of CAMPUS_GATES) {
      for (const lamp of STREET_LAMPS) {
        expect(Math.hypot(gate.trigger.x - lamp.x, gate.trigger.y - lamp.y)).toBeGreaterThanOrEqual(48);
        expect(Math.hypot(gate.portal.x - lamp.x, gate.portal.y - lamp.y)).toBeGreaterThanOrEqual(48);
      }
    }
  });

  it("앵커는 전용 오브젝트와 기존 아틀라스 램프 드레싱 양쪽에서 뽑힌다", () => {
    const anchors = buildStudioStreetLampAnchors(CAMPUS_OBJECTS);
    const dressingLamps = CAMPUS_DRESSING.filter((item) => item.atlas === "furniture" && item.frame === 3);
    expect(anchors).toHaveLength(STREET_LAMPS.length + dressingLamps.length);
    expect(new Set(anchors.map((anchor) => anchor.id)).size).toBe(anchors.length);
    for (const anchor of anchors) {
      expect(anchor.headY).toBeLessThan(anchor.baseY);
    }
  });
});

describe("오브젝트 블롭 섀도우·접지 AO", () => {
  const shadows = buildStudioBuildingObjectShadows(CAMPUS_OBJECTS);

  it("충돌체 있는 비벽걸이 오브젝트에만 생기고, 무대·배는 제외된다", () => {
    expect(shadows.length).toBeGreaterThan(30);
    const ids = new Set(shadows.map((shadow) => shadow.id));
    expect(ids.has("building-shadow:event-screen")).toBe(false);
    expect(ids.has("building-shadow:event-stage")).toBe(false);
    expect(ids.has("building-shadow:terrace-boat")).toBe(false);
    expect(ids.has("building-shadow:cafe-counter")).toBe(true);
    expect(ids.has("building-shadow:lamp-avenue1-plaza-north")).toBe(true);
    for (const shadow of shadows) {
      expect(shadow.width).toBeGreaterThanOrEqual(30);
      expect(shadow.width).toBeLessThanOrEqual(210);
    }
  });

  it("섀도우 프레임은 시간대 방향·길이를 그대로 반영한다", () => {
    const dusk = studioBuildingShadowFrame(STUDIO_BUILDING_LIFE_LEVELS.dusk);
    const day = studioBuildingShadowFrame(STUDIO_BUILDING_LIFE_LEVELS.day);
    const morning = studioBuildingShadowFrame(STUDIO_BUILDING_LIFE_LEVELS.morning);
    expect(dusk.scaleX).toBeGreaterThan(day.scaleX);
    expect(dusk.offsetX).toBeGreaterThan(0);
    expect(morning.offsetX).toBeLessThan(0);
    expect(dusk.alpha).toBeGreaterThan(0);
    expect(dusk.alpha).toBeLessThanOrEqual(0.26);
  });

  it("AO 띠는 북벽 안쪽과 남벽 바깥쪽에만 깔린다", () => {
    const strips = buildStudioBuildingAoStrips(CAMPUS_ZONES, 64);
    const lobby = CAMPUS_ZONES.find((zone) => zone.roomId === "skyport")!;
    const northIn = strips.find((strip) => strip.id === "ao:skyport:north-in")!;
    expect(northIn.y).toBe(lobby.tiles.row * 64 + 56);
    const southOut = strips.find((strip) => strip.id === "ao:skyport:south-out")!;
    expect(southOut.y).toBe((lobby.tiles.row + lobby.tiles.height) * 64);
    // 벽 없는 야외 구역(카페·광장·테라스)에는 띠가 없다.
    expect(strips.some((strip) => strip.id.startsWith("ao:creator-cafe"))).toBe(false);
    expect(strips.some((strip) => strip.id.startsWith("ao:creator-plaza"))).toBe(false);
    expect(strips.some((strip) => strip.id.startsWith("ao:beach"))).toBe(false);
  });
});

describe("성능 예산", () => {
  it("동적 조명이 꺼진 등급에서는 발광을 만들지 않는다", () => {
    const budget = studioBuildingLifeBudget({ dynamicLights: false, particleRatio: 1 });
    expect(budget.dynamic).toBe(false);
    expect(budget.maxLitWindows).toBe(0);
    expect(budget.maxPools).toBe(0);
  });

  it("파티클 비율이 낮으면 발광 상한과 글로우 크기가 함께 줄어든다 (저사양 폴백)", () => {
    const low = studioBuildingLifeBudget({ dynamicLights: true, particleRatio: 0.2 });
    const high = studioBuildingLifeBudget({ dynamicLights: true, particleRatio: 1 });
    expect(low.maxLitWindows).toBeLessThan(high.maxLitWindows);
    expect(low.maxPools).toBeLessThan(high.maxPools);
    expect(low.glowScale).toBeLessThan(high.glowScale);
    expect(high.maxPools).toBe(19);
  });

  it("해시는 결정적이고 0~1 안에 있다", () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const value = studioBuildingHash01(seed * 977 + 13);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(value).toBe(studioBuildingHash01(seed * 977 + 13));
    }
  });
});

describe("전면 틴트 부재 회귀 (건물 생동감 트랙)", () => {
  it("모듈 공개 표면에 오버레이·워시·헤이즈 계열 API가 없다", () => {
    const names = Object.keys(buildingLife);
    expect(names.some((name) => /overlay|wash|haze|veil/i.test(name))).toBe(false);
  });
});

/* ---------------- 런타임 (페이크 씬) ---------------- */

class MockImage {
  alpha = 1;
  visible = true;
  tint = 0xffffff;
  blendMode = "NORMAL";
  scaleX = 1;
  scaleY = 1;
  destroyed = false;
  constructor(public x: number, public y: number, public texture: string) {}
  setDepth() { return this; }
  setTint(color: number) { this.tint = color; return this; }
  setBlendMode(mode: string) { this.blendMode = mode; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setDisplaySize(width: number, height: number) { this.scaleX = width / 96; this.scaleY = height / 96; return this; }
  setTexture(key: string) { this.texture = key; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setScale(x: number, y: number) { this.scaleX = x; this.scaleY = y; return this; }
  setOrigin() { return this; }
  destroy() { this.destroyed = true; }
}

function fakeContext() {
  const gradient = { addColorStop: () => {} };
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "measureText") return () => ({ width: 10 });
      return () => {};
    },
    set() { return true; },
  });
}

function harness() {
  const images: MockImage[] = [];
  const created = new Set<string>();
  const scene = {
    textures: {
      exists: (key: string) => created.has(key),
      createCanvas: (key: string) => {
        created.add(key);
        return { getContext: () => fakeContext(), refresh: () => {} };
      },
    },
    add: {
      image: (x: number, y: number, texture: string) => {
        const image = new MockImage(x, y, texture);
        images.push(image);
        return image;
      },
    },
  };
  return { scene: scene as never, images };
}

const FULL_VIEW = { x: 0, y: 0, width: 3072, height: 1920 };

function settle(runtime: StudioBuildingLifeRuntime, phase: "day" | "night", start: number): number {
  let time = start;
  for (let step = 0; step < 8; step += 1) {
    time += 300;
    runtime.update({ time, phase, reducedMotion: false, quality: null, view: FULL_VIEW });
  }
  return time;
}

describe("StudioBuildingLifeRuntime", () => {
  it("창문·가로등·섀도우·AO 스프라이트를 만들고 밤에 창이 켜진다", () => {
    const campus = studioVirtualCampusScene(studioVirtualCampusManifest(false));
    expect(campus).not.toBeNull();
    const { scene, images } = harness();
    const runtime = new StudioBuildingLifeRuntime(scene, campus!, { style: "sky-island" });
    const diag = runtime.diagnostics;
    expect(diag.windows).toBeGreaterThan(80);
    expect(diag.lamps).toBe(19);
    expect(diag.shadows).toBeGreaterThan(30);
    expect(diag.aoStrips).toBeGreaterThanOrEqual(8);
    expect(diag.sprites).toBe(diag.windows + diag.lamps * 2 + diag.shadows + diag.aoStrips);

    settle(runtime, "night", 0);
    expect(runtime.diagnostics.litWindows).toBeGreaterThan(40);
    expect(runtime.levels.phase).toBe("night");
    const pools = images.filter((image) => image.blendMode === "ADD" && image.visible && image.alpha > 0);
    expect(pools.length).toBeGreaterThan(10);

    const time = settle(runtime, "day", 100_000);
    expect(runtime.diagnostics.litWindows).toBeLessThan(25);
    const litPools = images.filter((image) => image.blendMode === "ADD" && image.visible && image.alpha > 0.01);
    expect(litPools).toHaveLength(0);
    expect(time).toBeGreaterThan(0);

    runtime.destroy();
    expect(images.every((image) => image.destroyed)).toBe(true);
  });

  it("reduced-motion에서는 위상이 즉시 고정되고 토글이 없다", () => {
    const campus = studioVirtualCampusScene(studioVirtualCampusManifest(false))!;
    const { scene, images } = harness();
    const runtime = new StudioBuildingLifeRuntime(scene, campus, { style: "sky-island" });
    runtime.update({ time: 500, phase: "night", reducedMotion: true, quality: null, view: FULL_VIEW });
    expect(runtime.levels.windowGlow).toBe(STUDIO_BUILDING_LIFE_LEVELS.night.windowGlow);
    const litOnce = runtime.diagnostics.litWindows;
    runtime.update({ time: 500 + 150 * 48 * 9, phase: "night", reducedMotion: true, quality: null, view: FULL_VIEW });
    expect(runtime.diagnostics.litWindows).toBe(litOnce);
    runtime.destroy();
    expect(images.every((image) => image.destroyed)).toBe(true);
  });

  it("뷰 밖 스프라이트는 숨긴다", () => {
    const campus = studioVirtualCampusScene(studioVirtualCampusManifest(false))!;
    const { scene, images } = harness();
    const runtime = new StudioBuildingLifeRuntime(scene, campus, { style: "sky-island" });
    runtime.update({ time: 500, phase: "day", reducedMotion: false, quality: null, view: { x: 0, y: 0, width: 400, height: 300 } });
    const far = images.filter((image) => image.x > 2400 && image.y > 1400);
    expect(far.length).toBeGreaterThan(0);
    expect(far.every((image) => !image.visible)).toBe(true);
    runtime.destroy();
  });
});
