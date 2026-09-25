// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { studioVirtualDecorationPreset } from "./studio-virtual-space-customization";
import { StudioVirtualSpaceTownProgramPanel } from "./StudioVirtualSpaceTownProgramPanel";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

const operations: StudioVirtualOperationsSnapshot = {
  phase: "ready",
  project: null,
  inbox: [],
  calendar: [],
  error: null,
};

function props() {
  return {
    operations,
    manifest: DEFAULT_STUDIO_WORLD_MANIFEST,
    decorations: studioVirtualDecorationPreset("minimal"),
    rewards: { version: 1 as const, unlocked: [] as const },
    spotlightActive: false,
    onDecorations: vi.fn(),
    onClaimReward: vi.fn(),
    onEquipReward: vi.fn(),
    onMoveToRoom: vi.fn(),
    onOpenPeople: vi.fn(),
    onOpenAnnotation: vi.fn(),
    onOpenSessions: vi.fn(),
    onStartSpotlight: vi.fn(),
    onStopSpotlight: vi.fn(),
  };
}

describe("StudioVirtualSpaceTownProgramPanel", () => {
  it("claims a completed quest reward without currency or chance", () => {
    const value = props();
    render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    const buttons = screen.getAllByRole("button", { name: "보상 받기" });
    fireEvent.click(buttons[0]!);
    expect(value.onClaimReward).toHaveBeenCalledWith("navigator-badge");
  });

  it("shows and equips unlocked cosmetic rewards", () => {
    const value = {
      ...props(),
      rewards: { version: 1 as const, unlocked: ["review-sparkle" as const] },
    };
    render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    fireEvent.click(screen.getByRole("tab", { name: "보상" }));
    const equip = screen.getAllByRole("button", { name: "내 캐릭터에 적용" })
      .find((button) => !button.hasAttribute("disabled"));
    expect(equip).toBeTruthy();
    fireEvent.click(equip!);
    expect(value.onEquipReward).toHaveBeenCalledWith("review-sparkle");
  });
});
