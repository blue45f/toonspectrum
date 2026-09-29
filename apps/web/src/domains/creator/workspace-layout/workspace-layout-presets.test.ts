import { describe, expect, it } from "vitest";

import {
  WORKSPACE_PANEL_REGISTRY,
  validateWorkspaceLayout,
} from "./workspace-layout-model";
import {
  DEFAULT_WORKSPACE_PRESET_ID,
  findWorkspaceLayoutPreset,
  getWorkspaceLayoutPresets,
  getWorkspacePresetDescription,
  isWorkspaceLayoutPresetId,
  WORKSPACE_PRESET_COLORING_ID,
  WORKSPACE_PRESET_IDS,
  WORKSPACE_PRESET_INKING_ID,
  WORKSPACE_PRESET_MANGA_ID,
} from "./workspace-layout-presets";

describe("workspace-layout-presets", () => {
  it("잉킹용·채색용·만화용 3종 프리셋이 있다", () => {
    expect(WORKSPACE_PRESET_IDS).toEqual([
      WORKSPACE_PRESET_INKING_ID,
      WORKSPACE_PRESET_COLORING_ID,
      WORKSPACE_PRESET_MANGA_ID,
    ]);
    const presets = getWorkspaceLayoutPresets();
    expect(presets).toHaveLength(3);
    expect(presets.map((preset) => preset.name)).toEqual(["잉킹용", "채색용", "만화용"]);
    expect(DEFAULT_WORKSPACE_PRESET_ID).toBe(WORKSPACE_PRESET_INKING_ID);
  });

  it("모든 프리셋이 유효하고 모든 패널 ID가 레지스트리에 존재한다", () => {
    for (const preset of getWorkspaceLayoutPresets()) {
      const errors = validateWorkspaceLayout(preset, WORKSPACE_PANEL_REGISTRY);
      expect(errors).toEqual([]);
      for (const slot of Object.values(preset.slots)) {
        for (const panelId of slot.panelIds) {
          expect(
            WORKSPACE_PANEL_REGISTRY[panelId],
            `프리셋 ${preset.id}의 패널 ${panelId}`,
          ).toBeDefined();
        }
      }
    }
  });

  it("프리셋 id가 고유하고 preset- 접두사를 가진다", () => {
    const ids = getWorkspaceLayoutPresets().map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith("preset-")).toBe(true);
      expect(isWorkspaceLayoutPresetId(id)).toBe(true);
    }
    expect(isWorkspaceLayoutPresetId("layout-custom")).toBe(false);
  });

  it("id로 프리셋을 조회할 수 있다", () => {
    const inking = findWorkspaceLayoutPreset(WORKSPACE_PRESET_INKING_ID);
    expect(inking?.name).toBe("잉킹용");
    expect(findWorkspaceLayoutPreset("preset-unknown")).toBeUndefined();
  });

  it("각 프리셋에 설명이 있다", () => {
    for (const id of WORKSPACE_PRESET_IDS) {
      expect(getWorkspacePresetDescription(id).length).toBeGreaterThan(0);
    }
  });

  it("CSP 대응: 단계별 패널 구성이 다르다", () => {
    const inking = findWorkspaceLayoutPreset(WORKSPACE_PRESET_INKING_ID)!;
    const coloring = findWorkspaceLayoutPreset(WORKSPACE_PRESET_COLORING_ID)!;
    const manga = findWorkspaceLayoutPreset(WORKSPACE_PRESET_MANGA_ID)!;
    // 잉킹용은 브러시 중심
    expect(inking.slots["left-rail"].panelIds).toContain("brush");
    // 채색용은 색상 중심
    expect(coloring.slots["left-rail"].panelIds).toContain("color");
    // 만화용은 3D 플로팅 포함
    expect(manga.slots["floating"].panelIds).toContain("3d");
    expect(manga.slots["right-inspector"].panelIds).toContain("timeline");
  });
});
