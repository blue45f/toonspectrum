// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STUDIO_VIRTUAL_EXPERIENCE } from "./studio-virtual-space-experience-preference";
import { StudioVirtualSpaceExperiencePanel } from "./StudioVirtualSpaceExperiencePanel";

describe("StudioVirtualSpaceExperiencePanel", () => {
  it("changes bounded play preferences and exposes local-only runtime health", () => {
    const onChange = vi.fn();
    const onCapture = vi.fn();
    render(<StudioVirtualSpaceExperiencePanel value={DEFAULT_STUDIO_VIRTUAL_EXPERIENCE}
      metrics={{ fps: 57, frameTimeMs: 17.5, qualityTier: "high", peerCount: 2, visiblePeerCount: 2, npcCount: 8, visibleNpcCount: 6, routeWaypoints: 0, failedTextures: 0, updatedAt: 1 }}
      onChange={onChange} onCapture={onCapture} />);
    fireEvent.click(screen.getByRole("button", { name: "탭 이동" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ controlMode: "tap" }));
    expect(screen.getByText(/57\.0 FPS/u)).toBeTruthy();
    expect(screen.getByText(/닉네임·채팅·문서 내용/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "현재 월드 PNG 저장" }));
    expect(onCapture).toHaveBeenCalledOnce();
  });
});
