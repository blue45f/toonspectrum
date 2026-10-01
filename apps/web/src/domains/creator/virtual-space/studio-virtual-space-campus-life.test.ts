import { describe, expect, it } from "vitest";

import { CAMPUS_LIFE } from "./studio-virtual-space-campus-blueprint";
import {
  STUDIO_BIRD_CYCLE_MS,
  STUDIO_BIRD_FLIGHT_MS,
  STUDIO_FISH_CYCLE_MS,
  studioBirdProgress,
  studioBirdRoute,
  studioButterflyPose,
  studioCampusLifeFlags,
  studioCampusLifeInView,
  studioFishJump,
  studioPetalPose,
  studioSprayDroplet,
  studioStageBeamOffset,
} from "./studio-virtual-space-campus-life";
import { CAMPUS_PROXIMITY_RADIUS, studioCampusProximityLevel } from "./studio-virtual-space-campus-runtime";
import { studioVirtualQualityProfile } from "./studio-virtual-space-quality";

const environment = { viewportWidth: 1440, reducedMotion: false, deviceMemory: 8, hardwareConcurrency: 8 };

describe("캠퍼스 생동감 플래그", () => {
  it("낮에는 나비·새, 밤에는 반딧불이 켜지고 모션 줄이기·접근성 품질에서는 움직이는 것이 모두 꺼진다", () => {
    const high = studioVirtualQualityProfile("high", environment);
    const day = studioCampusLifeFlags({ phase: "day", reducedMotion: false, quality: high });
    expect(day.butterflies && day.birds && !day.fireflies).toBe(true);
    const night = studioCampusLifeFlags({ phase: "night", reducedMotion: false, quality: high });
    expect(night.fireflies && !night.butterflies && !night.birds).toBe(true);
    const reduced = studioCampusLifeFlags({ phase: "day", reducedMotion: true, quality: high });
    expect(reduced.butterflies || reduced.birds || reduced.fish || reduced.spray || reduced.beamSweep).toBe(false);
    // 무대 조명은 모션 줄이기에서도 제자리에 정적으로 남는다.
    expect(reduced.beams).toBe(true);
    const accessible = studioCampusLifeFlags({ phase: "night", reducedMotion: false, quality: studioVirtualQualityProfile("accessibility", environment) });
    expect(accessible.fireflies || accessible.petals || accessible.steam).toBe(false);
  });
});

describe("캠퍼스 생동감 위치(결정적·재사용 객체)", () => {
  it("같은 시각이면 같은 자리이고, out 객체에 써서 매 프레임 객체를 만들지 않는다", () => {
    const bed = CAMPUS_LIFE.flowerBeds[0]!;
    const out = { x: 0, y: 0, groundY: 0, frame: 0 as 0 | 1, flipX: false };
    const first = studioButterflyPose(bed, 3, 12_345, out);
    expect(first).toBe(out);
    expect({ ...first }).toEqual({ ...studioButterflyPose(bed, 3, 12_345) });
    expect(first.y).toBeLessThan(first.groundY);
    expect(Math.abs(first.x - bed.x)).toBeLessThanOrEqual(60);
    const petal = studioPetalPose(CAMPUS_LIFE.blossoms[0]!, 2, 9_000);
    expect(petal.alpha).toBeGreaterThanOrEqual(0);
    expect(petal.alpha).toBeLessThanOrEqual(1);
    const drop = studioSprayDroplet(CAMPUS_LIFE.fountains[0]!, 4, 14, 2_000);
    expect(drop.scale).toBeGreaterThan(0.6);
  });

  it("새 떼는 주기마다 화면을 가로지르고 쉬는 구간에는 없다", () => {
    expect(studioBirdProgress(STUDIO_BIRD_CYCLE_MS * 3 + STUDIO_BIRD_FLIGHT_MS / 2)?.progress).toBeCloseTo(0.5, 5);
    expect(studioBirdProgress(STUDIO_BIRD_CYCLE_MS * 3 + STUDIO_BIRD_FLIGHT_MS + 10)).toBeNull();
    const view = { x: 1000, y: 800, width: 1200, height: 700 };
    const route = studioBirdRoute(7, view);
    expect(Math.min(route.from.x, route.to.x)).toBeLessThan(view.x);
    expect(Math.max(route.from.x, route.to.x)).toBeGreaterThan(view.x + view.width);
    expect(route.count).toBeGreaterThanOrEqual(3);
  });

  it("물고기는 주기마다 석호 안에서 한 번 뛰어오르고 착수 물결을 남긴다", () => {
    let air = 0, splash = 0;
    for (let time = 0; time < STUDIO_FISH_CYCLE_MS * 4; time += 20) {
      const jump = studioFishJump(time, CAMPUS_LIFE.lagoons);
      if (!jump) continue;
      if (jump.stage === "air") { air += 1; expect(jump.y).toBeLessThanOrEqual(jump.surfaceY); } else splash += 1;
      const inside = CAMPUS_LIFE.lagoons.some((lagoon) => jump.surfaceY >= lagoon.y && jump.surfaceY <= lagoon.y + lagoon.height);
      expect(inside).toBe(true);
    }
    expect(air).toBeGreaterThan(0);
    expect(splash).toBeGreaterThan(0);
    expect(studioFishJump(1_000, [])).toBeNull();
  });

  it("무대 조명은 쓸기를 끄면 제자리이고, 화면 밖 판정은 여유를 둔다", () => {
    const beam = CAMPUS_LIFE.stageBeams[0]!;
    expect(studioStageBeamOffset(beam, 0, 5_000, false)).toBe(0);
    expect(Math.abs(studioStageBeamOffset(beam, 0, 5_000, true))).toBeLessThanOrEqual(beam.sweep);
    expect(studioCampusLifeInView({ x: 0, y: 0, width: 100, height: 100 }, 250, 50)).toBe(true);
    expect(studioCampusLifeInView({ x: 0, y: 0, width: 100, height: 100 }, 400, 50)).toBe(false);
  });
});

describe("캠퍼스 근접 연출 세기", () => {
  it("반경 밖 0, 60% 안쪽 1, 그 사이는 단조롭게 오른다", () => {
    const radius = CAMPUS_PROXIMITY_RADIUS.frame;
    expect(studioCampusProximityLevel(radius + 1, radius)).toBe(0);
    expect(studioCampusProximityLevel(radius * 0.5, radius)).toBe(1);
    const middle = studioCampusProximityLevel(radius * 0.8, radius);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(studioCampusProximityLevel(radius * 0.7, radius)).toBeGreaterThan(middle);
    expect(studioCampusProximityLevel(Number.NaN, radius)).toBe(0);
  });
});
