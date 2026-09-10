import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioBrushGoalStart } from "./StudioBrushGoalStart";

describe("StudioBrushGoalStart", () => {
  it("uses preset and destination together to identify one active goal", () => {
    render(
      <StudioBrushGoalStart
        activePresetId="ink-particle"
        activeSection="response"
        onSelectPreset={vi.fn()}
        onOpenSection={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /깔끔한 선화/u }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /그래픽 외곽선/u }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("opens the dry-media tip controls from the ink and pencil goal", () => {
    const onSelectPreset = vi.fn();
    const onOpenSection = vi.fn();
    render(
      <StudioBrushGoalStart
        activePresetId={null}
        activeSection="presets"
        onSelectPreset={onSelectPreset}
        onOpenSection={onOpenSection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /잉크 · 연필 질감/u }));

    expect(onSelectPreset).toHaveBeenCalledWith("dry-media");
    expect(onOpenSection).toHaveBeenCalledWith("tip");
    expect(onSelectPreset.mock.invocationCallOrder[0]).toBeLessThan(
      onOpenSection.mock.invocationCallOrder[0]!,
    );
  });

  it("opens the expert engine stack from the pattern goal", () => {
    const onSelectPreset = vi.fn();
    const onOpenSection = vi.fn();
    render(
      <StudioBrushGoalStart
        activePresetId={null}
        activeSection="presets"
        onSelectPreset={onSelectPreset}
        onOpenSection={onOpenSection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /패턴 · 산포 효과/u }));

    expect(onSelectPreset).toHaveBeenCalledWith("ink-particle");
    expect(onOpenSection).toHaveBeenCalledWith("engines");
  });
});
