// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEnvironmentPanel } from "./StudioVirtualSpaceEnvironmentPanel";
import { DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT } from "./studio-virtual-space-environment-preference";

afterEach(() => cleanup());

describe("StudioVirtualSpaceEnvironmentPanel", () => {
  it("changes backdrop, day phase and weather without carrying arbitrary data", () => {
    const onChange = vi.fn();
    const { rerender } = render(<StudioVirtualSpaceEnvironmentPanel value={DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /정원 숲/u }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT, backdrop: "forest" });

    const forest = { ...DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT, backdrop: "forest" as const };
    rerender(<StudioVirtualSpaceEnvironmentPanel value={forest} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "노을" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...forest, dayPhase: "dusk" });

    const dusk = { ...forest, dayPhase: "dusk" as const };
    rerender(<StudioVirtualSpaceEnvironmentPanel value={dusk} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "꽃잎" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...dusk, weather: "petals" });
  });
});
