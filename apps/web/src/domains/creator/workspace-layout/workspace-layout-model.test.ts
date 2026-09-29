import { describe, expect, it } from "vitest";

import {
  createEmptyWorkspaceSlots,
  createWorkspaceLayout,
  extendWorkspacePanelRegistry,
  isKnownWorkspacePanel,
  isValidWorkspaceLayout,
  normalizeWorkspaceLayout,
  validateWorkspaceLayout,
  WORKSPACE_PANEL_REGISTRY,
  WORKSPACE_SLOT_IDS,
  type WorkspaceLayout,
} from "./workspace-layout-model";

function validLayout(): WorkspaceLayout {
  return createWorkspaceLayout("테스트", {
    "left-rail": { panelIds: ["brush"] },
    "right-inspector": { panelIds: ["layers"] },
  });
}

describe("workspace-layout-model", () => {
  it("네 개의 고정 슬롯을 정의한다", () => {
    expect([...WORKSPACE_SLOT_IDS]).toEqual([
      "left-rail",
      "right-inspector",
      "bottom-dock",
      "floating",
    ]);
    const slots = createEmptyWorkspaceSlots();
    for (const slotId of WORKSPACE_SLOT_IDS) {
      expect(slots[slotId]).toBeDefined();
    }
  });

  it("패널 레지스트리에 기본 패널이 들어 있다", () => {
    for (const panelId of ["brush", "layers", "color", "tone", "3d", "timeline"]) {
      expect(isKnownWorkspacePanel(panelId)).toBe(true);
    }
    expect(isKnownWorkspacePanel("no-such-panel")).toBe(false);
    expect(Object.keys(WORKSPACE_PANEL_REGISTRY).length).toBeGreaterThanOrEqual(10);
  });

  it("레지스트리를 불변으로 확장할 수 있다", () => {
    const extended = extendWorkspacePanelRegistry([
      { id: "my-panel", label: "내 패널", description: "확장 테스트" },
    ]);
    expect(isKnownWorkspacePanel("my-panel", extended)).toBe(true);
    expect(isKnownWorkspacePanel("my-panel")).toBe(false);
  });

  it("유효한 레이아웃은 오류가 없다", () => {
    expect(validateWorkspaceLayout(validLayout())).toEqual([]);
    expect(isValidWorkspaceLayout(validLayout())).toBe(true);
  });

  it("알 수 없는 패널 ID를 검출한다", () => {
    const layout = validLayout();
    layout.slots["left-rail"].panelIds = ["ghost-panel"];
    const errors = validateWorkspaceLayout(layout);
    expect(errors.some((error) => error.includes("ghost-panel"))).toBe(true);
  });

  it("슬롯 간 패널 중복을 검출한다", () => {
    const layout = validLayout();
    layout.slots["right-inspector"].panelIds = ["brush"];
    const errors = validateWorkspaceLayout(layout);
    expect(errors.some((error) => error.includes("중복"))).toBe(true);
  });

  it("size 범위를 벗어나면 오류다", () => {
    const layout = validLayout();
    layout.slots["left-rail"].size = 1.5;
    expect(validateWorkspaceLayout(layout).length).toBeGreaterThan(0);
  });

  it("빈 이름은 오류다", () => {
    const layout = validLayout();
    layout.name = "   ";
    expect(validateWorkspaceLayout(layout).some((error) => error.includes("이름"))).toBe(true);
  });

  it("정규화는 size를 클램프하고 중복 패널을 제거한다", () => {
    const layout = validLayout();
    layout.slots["left-rail"] = { panelIds: ["brush", "layers"], collapsed: false, size: 2 };
    layout.slots["right-inspector"] = { panelIds: ["layers", "color"], collapsed: false, size: -1 };
    const normalized = normalizeWorkspaceLayout(layout);
    expect(normalized.slots["left-rail"].size).toBe(1);
    expect(normalized.slots["right-inspector"].size).toBe(0);
    // "layers"는 처음 등장한 left-rail에만 남는다
    expect(normalized.slots["left-rail"].panelIds).toEqual(["brush", "layers"]);
    expect(normalized.slots["right-inspector"].panelIds).toEqual(["color"]);
    // 원본은 변경되지 않는다 (불변)
    expect(layout.slots["left-rail"].size).toBe(2);
  });
});
