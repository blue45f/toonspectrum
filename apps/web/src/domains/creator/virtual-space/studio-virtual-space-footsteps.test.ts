import { describe, expect, it } from "vitest";
import {
  createStudioFootstepState,
  parseStudioFootstepSurface,
  stepStudioFootsteps,
  studioDustSpawnRule,
  studioFootstepImpactParticle,
  studioFootstepSurfaceSpec,
  STUDIO_FOOTSTEP_SURFACES,
} from "./studio-virtual-space-footsteps";

describe("표면 스펙", () => {
  it("세 가지 표면을 모두 정의한다", () => {
    expect(STUDIO_FOOTSTEP_SURFACES).toEqual(["carpet", "wood", "tile"]);
    for (const surface of STUDIO_FOOTSTEP_SURFACES) {
      const spec = studioFootstepSurfaceSpec(surface);
      expect(spec.loudness).toBeGreaterThan(0);
      expect(spec.loudness).toBeLessThanOrEqual(1);
      expect(spec.stridePx).toBeGreaterThan(0);
    }
  });

  it("카펫이 가장 조용하고 타일이 가장 시끄럽다", () => {
    const carpet = studioFootstepSurfaceSpec("carpet");
    const wood = studioFootstepSurfaceSpec("wood");
    const tile = studioFootstepSurfaceSpec("tile");
    expect(carpet.loudness).toBeLessThan(wood.loudness);
    expect(wood.loudness).toBeLessThan(tile.loudness);
    expect(carpet.particleKind).toBe("lint");
    expect(wood.particleKind).toBe("chip");
    expect(tile.particleKind).toBe("dust");
  });

  it("알 수 없는 표면 문자열은 wood로 폴백한다", () => {
    expect(parseStudioFootstepSurface("marble")).toBe("wood");
    expect(parseStudioFootstepSurface(null)).toBe("wood");
    expect(parseStudioFootstepSurface("tile")).toBe("tile");
  });
});

describe("발소리 타이밍", () => {
  it("보폭만큼 이동하면 발소리가 난다", () => {
    const state = createStudioFootstepState();
    const spec = studioFootstepSurfaceSpec("tile");
    const { state: next, events } = stepStudioFootsteps(state, spec.stridePx, "tile", 120);
    expect(events).toHaveLength(1);
    expect(events[0]?.foot).toBe("left");
    expect(events[0]?.volume).toBeGreaterThan(0);
    expect(next.nextFoot).toBe("right");
  });

  it("좌/우 발이 번갈아 난다", () => {
    let state = createStudioFootstepState();
    const stride = studioFootstepSurfaceSpec("wood").stridePx;
    const feet: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = stepStudioFootsteps(state, stride, "wood", 150);
      state = result.state;
      feet.push(...result.events.map((event) => event.foot));
    }
    expect(feet).toEqual(["left", "right", "left", "right"]);
  });

  it("빠르면 볼륨이 크고 느리면 작다", () => {
    const fast = stepStudioFootsteps(createStudioFootstepState(), 40, "tile", 210);
    const slow = stepStudioFootsteps(createStudioFootstepState(), 40, "tile", 60);
    expect(fast.events[0]?.volume ?? 0).toBeGreaterThan(slow.events[0]?.volume ?? 0);
  });

  it("정지 상태에서는 발소리가 나지 않는다", () => {
    const { events } = stepStudioFootsteps(createStudioFootstepState(), 200, "tile", 4);
    expect(events).toHaveLength(0);
  });

  it("한 프레임에 여러 걸음이 발생할 수 있다", () => {
    const { events } = stepStudioFootsteps(createStudioFootstepState(), 130, "carpet", 200);
    // carpet 보폭 34 → 130px이면 3~4걸음
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it("음수 거리 이동은 무시한다", () => {
    const state = createStudioFootstepState();
    const { state: next, events } = stepStudioFootsteps(state, -50, "tile", 120);
    expect(events).toHaveLength(0);
    expect(next).toEqual(state);
  });
});

describe("먼지 파티클 스폰", () => {
  it("느리게 움직이면 먼지가 나지 않는다", () => {
    const request = studioDustSpawnRule({
      speed: 40, surface: "tile", particleDensity: 1, reducedMotion: false, deltaSeconds: 1 / 60,
    });
    expect(request.count).toBe(0);
  });

  it("빠르게 움직이면 먼지가 난다", () => {
    const request = studioDustSpawnRule({
      speed: 210, surface: "tile", particleDensity: 1, reducedMotion: false, deltaSeconds: 1 / 60,
    });
    expect(request.count).toBeGreaterThan(0);
    expect(request.kind).toBe("dust");
  });

  it("타일이 카펫보다 먼지가 많다", () => {
    const base = { speed: 210, particleDensity: 1, reducedMotion: false, deltaSeconds: 1 };
    const tile = studioDustSpawnRule({ ...base, surface: "tile" });
    const carpet = studioDustSpawnRule({ ...base, surface: "carpet" });
    expect(tile.count).toBeGreaterThan(carpet.count);
  });

  it("밀도 0이면 스폰하지 않는다", () => {
    const request = studioDustSpawnRule({
      speed: 210, surface: "tile", particleDensity: 0, reducedMotion: false, deltaSeconds: 1,
    });
    expect(request.count).toBe(0);
  });

  it("reduced-motion이면 스폰하지 않는다", () => {
    const request = studioDustSpawnRule({
      speed: 210, surface: "tile", particleDensity: 1, reducedMotion: true, deltaSeconds: 1,
    });
    expect(request.count).toBe(0);
  });
});

describe("착지 임팩트 파티클", () => {
  it("발걸음 이벤트마다 1개씩 난다", () => {
    const { events } = stepStudioFootsteps(createStudioFootstepState(), 40, "wood", 150);
    const particle = studioFootstepImpactParticle(events[0]!, false);
    expect(particle.count).toBe(1);
    expect(particle.kind).toBe("chip");
  });

  it("reduced-motion이면 나지 않는다", () => {
    const { events } = stepStudioFootsteps(createStudioFootstepState(), 40, "wood", 150);
    expect(studioFootstepImpactParticle(events[0]!, true).count).toBe(0);
  });
});
