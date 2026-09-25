// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceCustomizationPanel } from "./StudioVirtualSpaceCustomizationPanel";
import {
  DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
  studioVirtualDecorationPreset,
} from "./studio-virtual-space-customization";

describe("StudioVirtualSpaceCustomizationPanel", () => {
  it("shows ImageGen-backed district and decor previews and updates the selected district", () => {
    const onDecorations = vi.fn();
    render(<StudioVirtualSpaceCustomizationPanel
      character={DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION}
      decorations={studioVirtualDecorationPreset("minimal")}
      selfPoint={{ x: 780, y: 700 }}
      onCharacter={vi.fn()}
      onDecorations={onDecorations}
    />);

    const district = screen.getByRole("button", { name: /리뷰 폭포/ });
    expect((district.querySelector(".studio-vspace-customization-district-preview") as HTMLElement).style.backgroundImage)
      .toContain("district-preview-sheet.webp");
    fireEvent.click(district);
    expect(onDecorations).toHaveBeenCalledWith(expect.objectContaining({ districtKey: "review-falls" }));

    const fountain = screen.getByRole("button", { name: /분수/ });
    expect((fountain.querySelector(".studio-vspace-customization-decor-preview") as HTMLElement).style.backgroundImage)
      .toContain("decor-sheet.webp");
    fireEvent.click(fountain);
    expect(onDecorations).toHaveBeenLastCalledWith(expect.objectContaining({
      placements: [expect.objectContaining({ type: "fountain" })],
    }));
  });
});
