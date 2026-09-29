import { describe, expect, it } from "vitest";

import {
  addStudioMannequinLight,
  applyStudioMannequinTimeOfDay,
  createStudioMannequinLightingRig,
  removeStudioMannequinLight,
  setStudioMannequinShadows,
  studioMannequinLightingToToneHint,
  updateStudioMannequinLight,
  StudioMannequinLightingError,
  STUDIO_MANNEQUIN_MAX_LIGHTS,
  STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS,
} from "./studio-mannequin-lighting";

function addMany(base: ReturnType<typeof createStudioMannequinLightingRig>, count: number) {
  let rig = base;
  for (let i = 0; i < count; i += 1) {
    rig = addStudioMannequinLight(rig, {
      kind: "point",
      intensity: 1,
      color: "#ffffff",
      position: [i, 1, 0],
    });
  }
  return rig;
}

describe("studio mannequin lighting", () => {
  it("조명은 최대 4개까지 추가할 수 있습니다", () => {
    const rig = addMany(createStudioMannequinLightingRig(), STUDIO_MANNEQUIN_MAX_LIGHTS);
    expect(rig.lights).toHaveLength(STUDIO_MANNEQUIN_MAX_LIGHTS);
    expect(() =>
      addStudioMannequinLight(rig, { kind: "point", intensity: 1, color: "#fff", position: [0, 0, 0] }),
    ).toThrowError(StudioMannequinLightingError);
  });

  it("조명 추가/삭제/업데이트가 동작합니다", () => {
    let rig = addStudioMannequinLight(createStudioMannequinLightingRig(), {
      kind: "directional",
      intensity: 2,
      color: "#FF0000",
      position: [1, 2, 3],
    });
    const id = rig.lights[0]?.id ?? "";
    expect(rig.lights[0]?.color).toBe("#ff0000");
    rig = updateStudioMannequinLight(rig, id, { intensity: 5 });
    expect(rig.lights[0]?.intensity).toBe(5);
    rig = removeStudioMannequinLight(rig, id);
    expect(rig.lights).toHaveLength(0);
  });

  it("밝기와 색상 정규화가 적용됩니다", () => {
    const rig = addStudioMannequinLight(createStudioMannequinLightingRig(), {
      kind: "spot",
      intensity: 99,
      color: "not-a-color",
      position: [0, 0, 0],
    });
    expect(rig.lights[0]?.intensity).toBe(10);
    expect(rig.lights[0]?.color).toBe("#ffffff");
  });

  it("그림자 on/off가 동작합니다", () => {
    const rig = setStudioMannequinShadows(createStudioMannequinLightingRig(), false);
    expect(rig.shadowsEnabled).toBe(false);
  });

  it("시간대 프리셋 4종이 모두 정의되어 있습니다", () => {
    expect(Object.keys(STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS)).toEqual(["dawn", "noon", "dusk", "night"]);
    for (const preset of ["dawn", "noon", "dusk", "night"] as const) {
      const rig = applyStudioMannequinTimeOfDay(preset);
      expect(rig.lights.length).toBeGreaterThan(0);
      expect(rig.lights.length).toBeLessThanOrEqual(STUDIO_MANNEQUIN_MAX_LIGHTS);
    }
  });

  it("LT 연동 명암 힌트가 주광 방향과 대비를 돌립니다", () => {
    const rig = applyStudioMannequinTimeOfDay("noon");
    const hint = studioMannequinLightingToToneHint(rig);
    expect(hint.contrast).toBeGreaterThan(0);
    const length = Math.hypot(...hint.keyLightDirection);
    expect(length).toBeCloseTo(1, 10);
    expect(hint.shadows).toBe(true);
  });
});
