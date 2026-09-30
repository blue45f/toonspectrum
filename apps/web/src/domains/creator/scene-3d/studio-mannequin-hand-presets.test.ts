import { describe, expect, it } from "vitest";

import {
  applyStudioMannequinHandPreset,
  applyStudioMannequinHandPresetMirrored,
  blendStudioHandCurl,
  clampStudioHandCurlValue,
  createStudioMannequinHandPosePayload,
  filterStudioMannequinHandPresets,
  getStudioMannequinHandPreset,
  mirrorStudioMannequinHandJointId,
  mirrorStudioMannequinHandSide,
  normalizeStudioHandCurl,
  STUDIO_HAND_FINGER_ORDER,
  STUDIO_HAND_PRESET_CATEGORIES,
  STUDIO_HAND_PRESET_COUNT,
  STUDIO_MANNEQUIN_HAND_PRESETS,
} from "./studio-mannequin-hand-presets";
import { mirrorStudioMannequinHandEuler } from "./studio-mannequin-hand-tracking";
import {
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
} from "./studio-mannequin-model";

describe("studio mannequin hand presets", () => {
  it("프리셋이 정확히 50종이며 ID가 유일합니다", () => {
    expect(STUDIO_MANNEQUIN_HAND_PRESETS).toHaveLength(STUDIO_HAND_PRESET_COUNT);
    const ids = STUDIO_MANNEQUIN_HAND_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STUDIO_MANNEQUIN_HAND_PRESETS.every((preset) => Object.isFrozen(preset))).toBe(true);
  });

  it("모든 프리셋의 컬이 0~100 범위이고 설명이 비어 있지 않습니다", () => {
    for (const preset of STUDIO_MANNEQUIN_HAND_PRESETS) {
      for (const finger of STUDIO_HAND_FINGER_ORDER) {
        const value = preset.curl[finger];
        expect(value, `${preset.id}.${finger}`).toBeGreaterThanOrEqual(0);
        expect(value, `${preset.id}.${finger}`).toBeLessThanOrEqual(100);
      }
      expect(preset.name.trim().length, `${preset.id}.name`).toBeGreaterThan(0);
      expect(preset.description.trim().length, `${preset.id}.description`).toBeGreaterThan(0);
      for (const axis of preset.wrist) {
        expect(Number.isFinite(axis), `${preset.id}.wrist`).toBe(true);
        expect(axis, `${preset.id}.wrist`).toBeGreaterThanOrEqual(-Math.PI);
        expect(axis, `${preset.id}.wrist`).toBeLessThanOrEqual(Math.PI);
      }
    }
  });

  it("프리셋 적용 시 관절 ID가 손 관절 ID 체계에 속하고 각도가 관절 한계 안에 있습니다", () => {
    for (const preset of STUDIO_MANNEQUIN_HAND_PRESETS) {
      for (const side of ["left", "right"] as const) {
        const applied = applyStudioMannequinHandPreset(preset, side);
        const jointIds = Object.keys(applied.angles);
        expect(jointIds).toHaveLength(1);
        const jointId = jointIds[0];
        expect(isStudioMannequinJointId(jointId)).toBe(true);
        expect(jointId === "leftHand" || jointId === "rightHand").toBe(true);
        const euler = applied.angles[jointId as "leftHand" | "rightHand"];
        expect(euler).toBeDefined();
        if (euler) {
          // 관절 한계 클램프를 통과한 값이 입력과 사실상 같으면 한계 안이라는 뜻입니다.
          // (1e-6 rad 양자화를 감안해 근사 비교합니다.)
          const clamped = clampStudioMannequinJointRotation(jointId, euler);
          for (let axis = 0; axis < 3; axis += 1) {
            expect(clamped[axis], `${preset.id}.${jointId}[${axis}]`).toBeCloseTo(euler[axis], 5);
          }
        }
        expect(applied.curl).toEqual(preset.curl);
      }
    }
  });

  it("미러 적용은 관절 ID 스왑 + 하우스 미러 계약 반사로 대칭을 이룹니다", () => {
    const preset = getStudioMannequinHandPreset("point");
    expect(preset).toBeDefined();
    if (!preset) return;

    const left = applyStudioMannequinHandPreset(preset, "left");
    const mirrored = applyStudioMannequinHandPresetMirrored(preset, "left");

    expect(Object.keys(mirrored.angles)).toEqual(["rightHand"]);
    expect(mirrored.angles.rightHand).toEqual(mirrorStudioMannequinHandEuler(preset.wrist));
    expect(Object.keys(left.angles)).toEqual(["leftHand"]);
    expect(mirrorStudioMannequinHandJointId("leftHand")).toBe("rightHand");
    expect(mirrorStudioMannequinHandSide("left")).toBe("right");

    // 미러를 두 번 적용하면 원래 측으로 돌아옵니다.
    const back = applyStudioMannequinHandPresetMirrored(preset, "right");
    expect(Object.keys(back.angles)).toEqual(["leftHand"]);
    expect(back.angles.leftHand?.[0]).toBeCloseTo(preset.wrist[0], 10);
    expect(back.angles.leftHand?.[1]).toBeCloseTo(preset.wrist[1], 10);
    expect(back.angles.leftHand?.[2]).toBeCloseTo(preset.wrist[2], 10);
  });

  it("curl 슬라이더 값은 0~100으로 정규화되고 보간됩니다", () => {
    expect(clampStudioHandCurlValue(150)).toBe(100);
    expect(clampStudioHandCurlValue(-5)).toBe(0);
    expect(clampStudioHandCurlValue(Number.NaN)).toBe(0);

    const normalized = normalizeStudioHandCurl({ thumb: 200, index: -10 });
    expect(normalized).toEqual({ thumb: 100, index: 0, middle: 0, ring: 0, little: 0 });

    const fist = getStudioMannequinHandPreset("fist");
    const open = getStudioMannequinHandPreset("open");
    expect(fist && open).toBeTruthy();
    if (!fist || !open) return;
    const half = blendStudioHandCurl(open.curl, fist.curl, 0.5);
    expect(half).toEqual({ thumb: 50, index: 50, middle: 50, ring: 50, little: 50 });
  });

  it("curl 오버라이드로 프리셋의 손가락 모양을 덮어쓸 수 있습니다", () => {
    const preset = getStudioMannequinHandPreset("open");
    expect(preset).toBeDefined();
    if (!preset) return;
    const applied = applyStudioMannequinHandPreset(preset, "right", { index: 80 });
    expect(applied.curl.index).toBe(80);
    expect(applied.curl.thumb).toBe(0);
  });

  it("포즈와 함께 저장 가능한 페이로드 구조를 만듭니다", () => {
    const preset = getStudioMannequinHandPreset("peace");
    expect(preset).toBeDefined();
    if (!preset) return;
    const payload = createStudioMannequinHandPosePayload(preset, "left", {
      intensity: 75,
      savedAt: "2026-09-30T00:00:00.000Z",
    });
    expect(payload.version).toBe(1);
    expect(payload.presetId).toBe("peace");
    expect(payload.side).toBe("left");
    expect(payload.wrist).toEqual(preset.wrist);
    expect(payload.curl).toEqual(preset.curl);
    expect(payload.intensity).toBe(75);
    expect(payload.savedAt).toBe("2026-09-30T00:00:00.000Z");
    // JSON 직렬화 왕복이 가능합니다.
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("웹툰 빈출 손 모양이 모두 포함되어 있습니다", () => {
    for (const id of ["fist", "point", "peace", "grab", "open", "thumbs-up", "ok", "salute"]) {
      expect(getStudioMannequinHandPreset(id), id).toBeDefined();
    }
    expect(getStudioMannequinHandPreset("no-such-preset")).toBeUndefined();
  });

  it("50종 프리셋에 모두 유효한 카테고리가 지정되어 있습니다", () => {
    const validIds = new Set(STUDIO_HAND_PRESET_CATEGORIES.map((meta) => meta.id));
    expect(STUDIO_MANNEQUIN_HAND_PRESETS).toHaveLength(STUDIO_HAND_PRESET_COUNT);
    for (const preset of STUDIO_MANNEQUIN_HAND_PRESETS) {
      expect(validIds.has(preset.category), preset.id).toBe(true);
    }
  });

  it("카테고리 메타가 5종(기본/제스처/숫자/잡기/감정)입니다", () => {
    expect(STUDIO_HAND_PRESET_CATEGORIES.map((meta) => meta.id)).toEqual([
      "basic",
      "gesture",
      "number",
      "grip",
      "emotion",
    ]);
    expect(STUDIO_HAND_PRESET_CATEGORIES.map((meta) => meta.label)).toEqual([
      "기본",
      "제스처",
      "숫자",
      "잡기",
      "감정",
    ]);
  });

  it("카테고리 필터로 프리셋이 좁혀집니다", () => {
    const numbers = filterStudioMannequinHandPresets({ category: "number" });
    expect(numbers.map((p) => p.id).sort()).toEqual(["five", "four", "one", "three", "two"]);
    const emotions = filterStudioMannequinHandPresets({ category: "emotion" });
    expect(emotions.length).toBeGreaterThan(0);
    expect(emotions.every((p) => p.category === "emotion")).toBe(true);
    // "all"이면 전체를 돌립니다.
    expect(filterStudioMannequinHandPresets({ category: "all" })).toHaveLength(
      STUDIO_HAND_PRESET_COUNT,
    );
  });

  it("검색어로 이름·ID·설명에서 프리셋을 찾습니다", () => {
    const hearts = filterStudioMannequinHandPresets({ query: "하트" });
    expect(hearts.map((p) => p.id)).toContain("finger-heart");
    expect(hearts.map((p) => p.id)).toContain("heart");
    const byId = filterStudioMannequinHandPresets({ query: "thumbs-up" });
    expect(byId.map((p) => p.id)).toEqual(["thumbs-up"]);
    // 카테고리와 검색어를 함께 쓸 수 있습니다.
    const gestureWave = filterStudioMannequinHandPresets({ category: "gesture", query: "인사" });
    expect(gestureWave.map((p) => p.id)).toContain("wave");
  });
});
