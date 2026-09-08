import { describe, expect, it } from "vitest";

import { defaultStudioAppSettings } from "./studio-app-settings";
import {
  STUDIO_APP_SETTINGS_EXPORT_KIND,
  STUDIO_APP_SETTINGS_IMPORT_MAX_BYTES,
  applyStudioAppSettingsProfile,
  countStudioAppSettingsDifferences,
  countStudioAppSettingsTabDifferences,
  detectStudioSettingsEnvironment,
  importStudioAppSettings,
  resetStudioAppSettingsTab,
  searchStudioAppSettings,
  serializeStudioAppSettings,
} from "./studio-app-settings-management";

describe("Studio application settings management", () => {
  it("프로필은 사용자 단축키와 도구막대를 보존하면서 실제 입력 설정만 조정한다", () => {
    const base = defaultStudioAppSettings();
    const current = {
      ...base,
      shortcuts: { ...base.shortcuts, "tool-pen": "K" },
      toolbar: { visibleIds: base.toolbar.visibleIds.slice().reverse() },
    };
    const next = applyStudioAppSettingsProfile(current, "pen-display");

    expect(next.shortcuts["tool-pen"]).toBe("K");
    expect(next.toolbar.visibleIds).toEqual(current.toolbar.visibleIds);
    expect(next.general.showStrokeGuide).toBe(true);
    expect(next.touch.oneFingerDrag).toBe("pan");
    expect(next.touch.palmRejection).toBe(true);
  });

  it("탭 초기화는 다른 카테고리의 사용자 설정을 유지한다", () => {
    const base = defaultStudioAppSettings();
    const current = {
      ...base,
      mouse: { ...base.mouse, wheel: "brush-size" as const },
      other: { ...base.other, reduceMotion: true },
    };
    const next = resetStudioAppSettingsTab(current, "mouse");

    expect(next.mouse).toEqual(base.mouse);
    expect(next.other.reduceMotion).toBe(true);
  });

  it("한국어·영문 키워드로 설정 카테고리를 검색한다", () => {
    expect(searchStudioAppSettings("필압")[0]).toMatchObject({ tab: "other", id: "pressure" });
    expect(searchStudioAppSettings("gesture").some((entry) => entry.tab === "touch")).toBe(true);
    expect(searchStudioAppSettings("없는설정")).toEqual([]);
  });

  it("기본값과 다른 leaf 설정 및 탭별 변경량을 계산한다", () => {
    const base = defaultStudioAppSettings();
    const current = {
      ...base,
      general: { ...base.general, showStrokeGuide: true },
      other: { ...base.other, reduceMotion: true },
    };

    expect(countStudioAppSettingsDifferences(current)).toBe(2);
    expect(countStudioAppSettingsTabDifferences(current, "general")).toBe(1);
    expect(countStudioAppSettingsTabDifferences(current, "mouse")).toBe(0);
  });

  it("버전형 JSON 백업을 왕복하고 이전 plain-object 형식도 정규화한다", () => {
    const base = defaultStudioAppSettings();
    const settings = {
      ...base,
      general: { ...base.general, densityMode: "full" as const },
      other: { ...base.other, pressureCurve: 1.4 },
    };
    const raw = serializeStudioAppSettings(settings, "2026-09-09T00:00:00.000Z");
    const parsed = JSON.parse(raw) as { kind: string; exportedAt: string };
    const imported = importStudioAppSettings(raw);

    expect(parsed.kind).toBe(STUDIO_APP_SETTINGS_EXPORT_KIND);
    expect(parsed.exportedAt).toBe("2026-09-09T00:00:00.000Z");
    expect(imported).toMatchObject({ ok: true, source: "envelope" });
    if (imported.ok) expect(imported.settings).toEqual(settings);

    const legacy = importStudioAppSettings(JSON.stringify({
      general: { densityMode: "focus", unknown: "discard-me" },
      unknownRoot: { secret: "discard-me" },
    }));
    expect(legacy).toMatchObject({ ok: true, source: "legacy" });
    if (legacy.ok) {
      expect(legacy.settings.general.densityMode).toBe("focus");
      expect(legacy.settings).not.toHaveProperty("unknownRoot");
    }
  });

  it("손상·미지원·과대 설정 파일을 거부한다", () => {
    expect(importStudioAppSettings("not-json")).toMatchObject({ ok: false, reason: "invalid-json" });
    expect(importStudioAppSettings(JSON.stringify({
      kind: STUDIO_APP_SETTINGS_EXPORT_KIND,
      version: 999,
      settings: {},
    }))).toMatchObject({ ok: false, reason: "unsupported-version" });
    expect(importStudioAppSettings("x".repeat(STUDIO_APP_SETTINGS_IMPORT_MAX_BYTES + 1)))
      .toMatchObject({ ok: false, reason: "too-large" });
  });

  it("환경 진단은 주어진 capability만 보고한다", () => {
    const environment = detectStudioSettingsEnvironment({
      navigator: { maxTouchPoints: 5, storage: { persist: () => Promise.resolve(true) } },
      PointerEvent: class PointerEvent {},
      showOpenFilePicker: () => undefined,
      showSaveFilePicker: () => undefined,
      matchMedia: (query) => ({ matches: query.includes("reduced-motion") }),
    });

    expect(environment).toEqual({
      touchPoints: 5,
      pointerEvents: true,
      coarsePointer: false,
      reducedMotionRequested: true,
      fileSystemAccess: true,
      persistentStorageApi: true,
    });
  });
});
