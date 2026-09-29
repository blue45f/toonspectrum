import { describe, expect, it } from "vitest";
import {
  STUDIO_LIGHT_FIXTURE_KINDS,
  createStudioLightFixture,
  setStudioLightFixtureDimmer,
  studioAmbientLightFor,
  studioDayPhaseForHour,
  studioDayPhaseLabel,
  studioHasActiveLighting,
  studioLightFixtureKindMeta,
  studioLightLevelAt,
  toggleStudioLightFixture,
  type StudioLightFixture,
} from "./studio-virtual-space-lighting";

const point = (x: number, y: number) => ({ x, y });

describe("시간대 판정", () => {
  it("24시간을 7개 시간대로 나눈다", () => {
    expect(studioDayPhaseForHour(5)).toBe("dawn");
    expect(studioDayPhaseForHour(8)).toBe("morning");
    expect(studioDayPhaseForHour(12)).toBe("noon");
    expect(studioDayPhaseForHour(16)).toBe("afternoon");
    expect(studioDayPhaseForHour(19)).toBe("sunset");
    expect(studioDayPhaseForHour(22)).toBe("night");
    expect(studioDayPhaseForHour(2)).toBe("midnight");
    expect(studioDayPhaseForHour(0)).toBe("midnight");
  });

  it("경계 밖 입력도 정규화한다", () => {
    expect(studioDayPhaseForHour(25)).toBe("midnight"); // 25시 = 새벽 1시
    expect(studioDayPhaseForHour(29)).toBe("dawn"); // 29시 = 새벽 5시
    expect(studioDayPhaseForHour(-1)).toBe("night"); // -1시 = 23시
    expect(studioDayPhaseForHour(NaN)).toBe("noon");
  });

  it("시간대 라벨이 한/영으로 있다", () => {
    expect(studioDayPhaseLabel("sunset")).toEqual({ ko: "해질녘", en: "Sunset" });
  });
});

describe("기구 종류", () => {
  it("6종 기구가 기본 반경과 함께 정의된다", () => {
    expect(STUDIO_LIGHT_FIXTURE_KINDS).toHaveLength(6);
    for (const meta of STUDIO_LIGHT_FIXTURE_KINDS) {
      expect(meta.defaultRadius).toBeGreaterThan(0);
      expect(meta.labelKo.trim().length).toBeGreaterThan(0);
    }
  });

  it("없는 종류는 null이다", () => {
    expect(studioLightFixtureKindMeta("unknown" as never)).toBeNull();
  });
});

describe("기구 생성·조작", () => {
  it("기본값으로 생성된다", () => {
    const fixture = createStudioLightFixture({ id: "l1", kind: "desk-lamp", position: point(10, 20) });
    expect(fixture).toMatchObject({ id: "l1", on: true, dimmer: 1, warm: true, radius: 120 });
  });

  it("dimmer는 0~1로 클램프된다", () => {
    const fixture = createStudioLightFixture({ id: "l1", kind: "neon-sign", position: point(0, 0), dimmer: 2 });
    expect(fixture.dimmer).toBe(1);
    const dark = createStudioLightFixture({ id: "l2", kind: "neon-sign", position: point(0, 0), dimmer: -1 });
    expect(dark.dimmer).toBe(0);
  });

  it("토글로 켜기/끄기가 뒤집힌다", () => {
    const fixtures: readonly StudioLightFixture[] = [
      createStudioLightFixture({ id: "a", kind: "floor-lamp", position: point(0, 0) }),
      createStudioLightFixture({ id: "b", kind: "floor-lamp", position: point(50, 50), on: false }),
    ];
    const toggled = toggleStudioLightFixture(fixtures, "a");
    expect(toggled[0]?.on).toBe(false);
    expect(toggled[1]?.on).toBe(false); // 다른 기구는 그대로
    expect(fixtures[0]?.on).toBe(true); // 원본 불변
  });

  it("밝기 조절이 불변으로 반영된다", () => {
    const fixtures: readonly StudioLightFixture[] = [
      createStudioLightFixture({ id: "a", kind: "spotlight", position: point(0, 0) }),
    ];
    const dimmed = setStudioLightFixtureDimmer(fixtures, "a", 0.4);
    expect(dimmed[0]?.dimmer).toBe(0.4);
    expect(fixtures[0]?.dimmer).toBe(1);
  });
});

describe("주변광", () => {
  it("정오는 가장 밝고 심야는 가장 어둡다", () => {
    const noon = studioAmbientLightFor(12, "clear");
    const midnight = studioAmbientLightFor(2, "clear");
    expect(noon.level).toBeGreaterThan(midnight.level);
    expect(noon.level).toBe(1);
  });

  it("폭풍우는 실내를 더 어둡게 한다", () => {
    const clear = studioAmbientLightFor(12, "clear");
    const storm = studioAmbientLightFor(12, "thunderstorm");
    expect(storm.level).toBeLessThan(clear.level);
  });

  it("날씨 없으면 보정 없이 시간대만 반영한다", () => {
    const ambient = studioAmbientLightFor(12, null);
    expect(ambient.level).toBe(1);
    expect(ambient.phase).toBe("noon");
  });
});

describe("지점 밝기", () => {
  it("기구 근처가 더 밝다", () => {
    const ambient = studioAmbientLightFor(22, "clear"); // 밤
    const fixtures: readonly StudioLightFixture[] = [
      createStudioLightFixture({ id: "l", kind: "floor-lamp", position: point(100, 100) }),
    ];
    const near = studioLightLevelAt(fixtures, ambient, point(100, 100));
    const far = studioLightLevelAt(fixtures, ambient, point(900, 900));
    expect(near).toBeGreaterThan(far);
  });

  it("꺼진 기구는 기여하지 않는다", () => {
    const ambient = studioAmbientLightFor(22, "clear");
    const on: readonly StudioLightFixture[] = [
      createStudioLightFixture({ id: "l", kind: "floor-lamp", position: point(100, 100), on: true }),
    ];
    const off: readonly StudioLightFixture[] = [
      createStudioLightFixture({ id: "l", kind: "floor-lamp", position: point(100, 100), on: false }),
    ];
    expect(studioLightLevelAt(on, ambient, point(100, 100)))
      .toBeGreaterThan(studioLightLevelAt(off, ambient, point(100, 100)));
  });

  it("밝기는 상한을 넘지 않는다", () => {
    const ambient = studioAmbientLightFor(12, "clear");
    const fixtures: readonly StudioLightFixture[] = Array.from({ length: 10 }, (_, i) =>
      createStudioLightFixture({ id: `l${i}`, kind: "ceiling-light", position: point(100, 100) }));
    expect(studioLightLevelAt(fixtures, ambient, point(100, 100))).toBeLessThanOrEqual(1.15);
  });
});

describe("조명 활성 체크", () => {
  it("낮에는 항상 true다", () => {
    const ambient = studioAmbientLightFor(12, "clear");
    expect(studioHasActiveLighting([], ambient)).toBe(true);
  });

  it("밤에는 켜진 기구가 있어야 true다", () => {
    const ambient = studioAmbientLightFor(23, "clear");
    expect(studioHasActiveLighting([], ambient)).toBe(false);
    const fixtures: readonly StudioLightFixture[] = [
      createStudioLightFixture({ id: "l", kind: "string-lights", position: point(0, 0) }),
    ];
    expect(studioHasActiveLighting(fixtures, ambient)).toBe(true);
  });
});
