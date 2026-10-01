// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_SPACE_COMMAND_BAR_PRIMARY,
  STUDIO_VIRTUAL_SPACE_HUD_INVENTORY,
  studioVirtualSpaceCommandBarOverflow,
  studioVirtualSpaceHudCategory,
  type StudioVirtualSpaceHudCategory,
} from "./studio-virtual-space-hud-inventory";

describe("HUD 인벤토리 분류", () => {
  it("모든 오버레이가 always/contextual/hidden 중 하나에 속한다", () => {
    const valid: readonly StudioVirtualSpaceHudCategory[] = ["always", "contextual", "hidden"];
    expect(STUDIO_VIRTUAL_SPACE_HUD_INVENTORY.length).toBeGreaterThan(0);
    for (const overlay of STUDIO_VIRTUAL_SPACE_HUD_INVENTORY) {
      expect(valid).toContain(overlay.category);
      expect(overlay.ko.trim().length).toBeGreaterThan(0);
      expect(overlay.en.trim().length).toBeGreaterThan(0);
      expect(overlay.visibilityKo.trim().length).toBeGreaterThan(0);
      expect(overlay.visibilityEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("오버레이 id가 중복되지 않는다", () => {
    const ids = STUDIO_VIRTUAL_SPACE_HUD_INVENTORY.map((overlay) => overlay.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("분류 조회가 인벤토리와 일치하고 모르는 id는 null이다", () => {
    expect(studioVirtualSpaceHudCategory("minimap")).toBe("always");
    expect(studioVirtualSpaceHudCategory("desktop-core-toolbar")).toBe("always");
    expect(studioVirtualSpaceHudCategory("mobile-joystick")).toBe("always");
    expect(studioVirtualSpaceHudCategory("mobile-interact-button")).toBe("always");
    expect(studioVirtualSpaceHudCategory("mobile-room-pill")).toBe("always");
    expect(studioVirtualSpaceHudCategory("live-event-banner")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("movement-status-banner")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("social-notice")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("space-ui-banner")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("action-sheet")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("npc-dialogue")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("mini-tour")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("follow-button")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("mobile-reaction-bar")).toBe("contextual");
    expect(studioVirtualSpaceHudCategory("control-hint-chips")).toBe("hidden");
    expect(studioVirtualSpaceHudCategory("guide-panel")).toBe("hidden");
    expect(studioVirtualSpaceHudCategory("experience-settings")).toBe("hidden");
    expect(studioVirtualSpaceHudCategory("unknown-overlay")).toBeNull();
  });

  it("조작 힌트 칩과 리액션 바는 자동 숨김 규칙을 문서화한다", () => {
    const chips = STUDIO_VIRTUAL_SPACE_HUD_INVENTORY.find((overlay) => overlay.id === "control-hint-chips")!;
    expect(chips.category).toBe("hidden");
    expect(chips.visibilityKo).toContain("미니 투어");
    const reactions = STUDIO_VIRTUAL_SPACE_HUD_INVENTORY.find((overlay) => overlay.id === "mobile-reaction-bar")!;
    expect(reactions.visibilityKo).toContain("토글");
  });
});

describe("커맨드바 단순화", () => {
  it("우선순위 3개는 작업 시작·방 찾기·제작 공간이다", () => {
    expect(STUDIO_VIRTUAL_SPACE_COMMAND_BAR_PRIMARY.map((item) => item.panel)).toEqual([
      "office",
      "search",
      "town",
    ]);
  });

  it("오버플로우는 우선순위와 겹치지 않고 개인 모드에서는 오늘을 뺀다", () => {
    const primary = new Set(STUDIO_VIRTUAL_SPACE_COMMAND_BAR_PRIMARY.map((item) => item.panel));
    for (const personal of [false, true]) {
      const overflow = studioVirtualSpaceCommandBarOverflow(personal);
      for (const item of overflow) {
        expect(primary.has(item.panel)).toBe(false);
        expect(item.ko.trim().length).toBeGreaterThan(0);
        expect(item.en.trim().length).toBeGreaterThan(0);
        expect(item.descriptionKo.trim().length).toBeGreaterThan(0);
        expect(item.descriptionEn.trim().length).toBeGreaterThan(0);
      }
    }
    expect(studioVirtualSpaceCommandBarOverflow(false).map((item) => item.panel)).toEqual(["today", "space"]);
    expect(studioVirtualSpaceCommandBarOverflow(true).map((item) => item.panel)).toEqual(["space"]);
  });

  it("5개 패널이 빠짐없이 배치된다", () => {
    const placed = new Set([
      ...STUDIO_VIRTUAL_SPACE_COMMAND_BAR_PRIMARY.map((item) => item.panel),
      ...studioVirtualSpaceCommandBarOverflow(false).map((item) => item.panel),
    ]);
    expect(placed).toEqual(new Set(["office", "search", "town", "today", "space"]));
  });
});
