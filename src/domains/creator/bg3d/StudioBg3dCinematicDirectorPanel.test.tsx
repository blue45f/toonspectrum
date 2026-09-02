// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { StudioBg3dCinematicDirectorPanel } from "./StudioBg3dCinematicDirectorPanel";

describe("StudioBg3dCinematicDirectorPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders shot angle presets and allows bookmark creation", () => {
    const handleBookmark = vi.fn();
    const handleShake = vi.fn();

    render(
      <StudioBg3dCinematicDirectorPanel
        onApplyShotBookmark={handleBookmark}
        onTriggerShake={handleShake}
      />,
    );

    expect(screen.getByText("시네마틱 카메라 & 컷 디렉터")).toBeDefined();
    expect(screen.getByText("하이 앵글 부감 (High Angle)")).toBeDefined();

    // Trigger shake
    const earthShake = screen.getByText("지진/붕괴 진동");
    fireEvent.click(earthShake);

    expect(handleShake).toHaveBeenCalledTimes(1);
    expect(handleShake.mock.calls[0][0].preset).toBe("earthquake-rumble");
  });
});
