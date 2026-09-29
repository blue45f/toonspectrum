// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioVirtualSpaceAmbientAudio } from "./StudioVirtualSpaceAmbientAudio";
import {
  selectStudioProximityPreset, setStudioProximityRadiusVisible, studioProximityDisplaySnapshot,
} from "./studio-virtual-space-acoustics";

afterEach(() => {
  cleanup();
  setStudioProximityRadiusVisible(false);
  selectStudioProximityPreset("whisper");
});

function renderPanel() {
  render(<StudioVirtualSpaceAmbientAudio scope={null} ready={false} focused={false} away={false} />);
}

describe("StudioVirtualSpaceAmbientAudio proximity section", () => {
  it("selects the conversation distance preset and reflects it in the radius readout", () => {
    renderPanel();
    const whisper = screen.getByRole("button", { name: "1:1 대화" });
    const group = screen.getByRole("button", { name: "그룹 대화" });
    expect(whisper.getAttribute("aria-pressed")).toBe("true");
    expect(group.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/대화 반경: 90px/)).toBeTruthy();

    fireEvent.click(group);
    expect(group.getAttribute("aria-pressed")).toBe("true");
    expect(whisper.getAttribute("aria-pressed")).toBe("false");
    expect(studioProximityDisplaySnapshot().presetId).toBe("group");
    expect(screen.getByText(/대화 반경: 200px/)).toBeTruthy();
  });

  it("toggles the whisper radius display with an accessible pressed state", () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: "속삭임 반경 표시" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(studioProximityDisplaySnapshot().radiusVisible).toBe(true);
    const hide = screen.getByRole("button", { name: "속삭임 반경 숨기기" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(hide);
    expect(studioProximityDisplaySnapshot().radiusVisible).toBe(false);
    expect(screen.getByRole("button", { name: "속삭임 반경 표시" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("reveals the distance-to-gain debug readout with curve parameters", () => {
    renderPanel();
    expect(document.querySelector("[data-proximity-debug=\"true\"]")).toBeNull();
    const debug = screen.getByRole("button", { name: "곡선 디버그" });
    expect(debug.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(debug);
    expect(debug.getAttribute("aria-pressed")).toBe("true");
    const panel = document.querySelector("[data-proximity-debug=\"true\"]");
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("data-proximity-preset")).toBe("whisper");
    expect(panel?.getAttribute("data-proximity-curve")).toBe("exponential");
    expect(panel?.getAttribute("data-proximity-near")).toBe("90");
    expect(panel?.getAttribute("data-proximity-far")).toBe("220");
    expect(screen.getByText(/거리 → 음량: 0px → 100%/)).toBeTruthy();
    expect(screen.getByText(/220px → 0%/)).toBeTruthy();

    fireEvent.click(debug);
    expect(document.querySelector("[data-proximity-debug=\"true\"]")).toBeNull();
  });
});
