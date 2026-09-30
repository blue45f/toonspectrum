import { describe, expect, it } from "vitest";

import {
  STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS,
  STUDIO_MANNEQUIN_TIME_OF_DAY_UI,
} from "./studio-mannequin-lighting";
import {
  STUDIO_MANNEQUIN_CAMERA_PRESET_UI,
} from "./studio-mannequin-scene";
import {
  WEBTOON_SHOT_ANGLE_PRESETS,
  getWebtoonShotAngleUi,
} from "./studio-3d-camera-cinematic-director";
import {
  CAMERA_LENS_PRESET_UI,
  getCameraLensPresetUi,
  type CameraLensPreset,
} from "./studio-3d-camera-perspective-lens";
import {
  CAMERA_TEMPO_EASING_UI,
  getCameraTempoEasingUi,
} from "./studio-3d-cinematography-rail";
import {
  TOON_PASS_TYPE_UI,
  TOON_RENDER_QUALITY_PRESET_UI,
} from "./studio-3d-toon-pass-pipeline";
import {
  CUT_ASPECT_RATIO_UI,
  getCutAspectRatioUi,
} from "./studio-3d-storyboard-cut-strip";
import {
  BUBBLE_KIND_UI,
  CHARACTER_ANCHOR_SOCKET_UI,
  EMOTE_KIND_UI,
} from "./studio-3d-billboard-bubble-anchor";
import {
  EDGE_DETECTION_ALGORITHM_UI,
  getEdgeDetectionAlgorithmUi,
} from "./studio-3d-line-art-extractor";

function expectCompleteUi(entry: unknown, name: string) {
  const e = entry as Record<string, unknown>;
  expect(typeof e.labelKo, name).toBe("string");
  expect((e.labelKo as string).length, name).toBeGreaterThan(0);
  expect(typeof e.labelEn, name).toBe("string");
  expect((e.labelEn as string).length, name).toBeGreaterThan(0);
  expect(typeof e.tooltipKo, name).toBe("string");
  expect((e.tooltipKo as string).length, name).toBeGreaterThan(0);
  expect(typeof e.tooltipEn, name).toBe("string");
  expect((e.tooltipEn as string).length, name).toBeGreaterThan(0);
}

describe("studio-3d UI metadata", () => {
  it("covers every mannequin time-of-day preset", () => {
    const labelIds = Object.keys(STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS);
    expect(Object.keys(STUDIO_MANNEQUIN_TIME_OF_DAY_UI).sort()).toEqual(
      labelIds.sort(),
    );
    for (const presetId of labelIds) {
      const id = presetId as keyof typeof STUDIO_MANNEQUIN_TIME_OF_DAY_UI;
      const ui = STUDIO_MANNEQUIN_TIME_OF_DAY_UI[id];
      expect(ui, presetId).toBeDefined();
      // 한국어 라벨은 기존 LABELS 권위를 재사용하고, 나머지는 UI 메타데이터에서 검증합니다.
      expectCompleteUi(
        { labelKo: STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS[id], ...ui },
        presetId,
      );
      expect(ui.descriptionKo.length).toBeGreaterThan(0);
      expect(ui.descriptionEn.length).toBeGreaterThan(0);
      expect(Object.isFrozen(ui)).toBe(true);
    }
    expect(Object.isFrozen(STUDIO_MANNEQUIN_TIME_OF_DAY_UI)).toBe(true);
  });

  it("covers every mannequin camera preset", () => {
    const presetIds = Object.keys(STUDIO_MANNEQUIN_CAMERA_PRESET_UI);
    expect(presetIds).toHaveLength(7);
    for (const presetId of presetIds) {
      const ui =
        STUDIO_MANNEQUIN_CAMERA_PRESET_UI[
          presetId as keyof typeof STUDIO_MANNEQUIN_CAMERA_PRESET_UI
        ];
      expect(ui, presetId).toBeDefined();
      expectCompleteUi(ui, presetId);
      expect(ui.descriptionKo.length).toBeGreaterThan(0);
      expect(ui.descriptionEn.length).toBeGreaterThan(0);
    }
  });

  it("covers every cinematic director shot angle", () => {
    for (const preset of WEBTOON_SHOT_ANGLE_PRESETS) {
      const ui = getWebtoonShotAngleUi(preset.kind);
      expect(ui, preset.kind).toBeDefined();
      expect(ui!.shortKo).toBeDefined();
      expect(ui!.shortEn).toBeDefined();
      expectCompleteUi(
        { labelKo: ui!.shortKo, labelEn: ui!.shortEn, ...ui },
        preset.kind,
      );
    }
  });

  it("covers every camera lens preset", () => {
    const presetIds = Object.keys(CAMERA_LENS_PRESET_UI) as CameraLensPreset[];
    expect(presetIds).toHaveLength(5);
    for (const preset of presetIds) {
      const ui = getCameraLensPresetUi(preset);
      expect(ui, preset).toBeDefined();
      expectCompleteUi(ui, preset);
      expect(ui!.descriptionKo.length).toBeGreaterThan(0);
      expect(ui!.descriptionEn.length).toBeGreaterThan(0);
    }
    expect(getCameraLensPresetUi("50mm-natural-dialogue")!.labelEn).toBe(
      "50mm Standard",
    );
  });

  it("covers every camera tempo easing", () => {
    for (const easing of Object.keys(CAMERA_TEMPO_EASING_UI) as Array<
      keyof typeof CAMERA_TEMPO_EASING_UI
    >) {
      expectCompleteUi(getCameraTempoEasingUi(easing), easing);
    }
  });

  it("covers every toon pass type and quality preset", () => {
    for (const entry of Object.values(TOON_PASS_TYPE_UI)) {
      expectCompleteUi(entry, entry.labelEn);
      expect(entry.descriptionKo.length).toBeGreaterThan(0);
      expect(entry.descriptionEn.length).toBeGreaterThan(0);
    }
    for (const entry of Object.values(TOON_RENDER_QUALITY_PRESET_UI)) {
      expectCompleteUi(entry, entry.labelEn);
    }
    expect(Object.isFrozen(TOON_PASS_TYPE_UI)).toBe(true);
  });

  it("covers every cut aspect ratio", () => {
    for (const aspect of Object.keys(CUT_ASPECT_RATIO_UI) as Array<
      keyof typeof CUT_ASPECT_RATIO_UI
    >) {
      const ui = getCutAspectRatioUi(aspect)!;
      expectCompleteUi(ui, aspect);
      expect(ui.descriptionKo.length).toBeGreaterThan(0);
      expect(ui.descriptionEn.length).toBeGreaterThan(0);
    }
  });

  it("covers bubble kinds, emote kinds and anchor sockets", () => {
    for (const entry of Object.values(BUBBLE_KIND_UI)) {
      expectCompleteUi(entry, entry.labelEn);
    }
    for (const entry of Object.values(EMOTE_KIND_UI)) {
      expectCompleteUi(entry, entry.labelEn);
    }
    for (const entry of Object.values(CHARACTER_ANCHOR_SOCKET_UI)) {
      expectCompleteUi(entry, entry.labelEn);
    }
    expect(Object.keys(EMOTE_KIND_UI)).toHaveLength(7);
  });

  it("covers every edge detection algorithm", () => {
    for (const algo of Object.keys(EDGE_DETECTION_ALGORITHM_UI) as Array<
      keyof typeof EDGE_DETECTION_ALGORITHM_UI
    >) {
      const ui = getEdgeDetectionAlgorithmUi(algo)!;
      expectCompleteUi(ui, algo);
      expect(ui.descriptionKo.length).toBeGreaterThan(0);
      expect(ui.descriptionEn.length).toBeGreaterThan(0);
    }
  });
});
