// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COSTUME_PRESETS } from "./studio-vrm-poser-catalogs";
import {
  SELECTABLE_WARDROBE_SETS,
  selectableWardrobeItemsBySlot,
} from "./studio-vrm-wardrobe";
import {
  StudioVrmCostumePresetVisual,
  StudioVrmWardrobeItemVisual,
  StudioVrmWardrobeSetVisual,
} from "./StudioVrmCatalogVisual";

describe("StudioVrmCatalogVisual", () => {
  it("renders deterministic product-owned visuals instead of OS emoji glyphs", () => {
    const item = selectableWardrobeItemsBySlot("outer")[0]!;
    const set = SELECTABLE_WARDROBE_SETS[0]!;
    const preset = COSTUME_PRESETS[0]!;
    render(<><StudioVrmWardrobeItemVisual item={item} /><StudioVrmWardrobeSetVisual set={set} /><StudioVrmCostumePresetVisual preset={preset} /></>);
    expect(screen.getByRole("img", { name: `${item.label} 3D 의상 미리보기` })).toBeTruthy();
    expect(screen.getByRole("img", { name: `${set.label} 코디 미리보기` })).toBeTruthy();
    expect(screen.getByRole("img", { name: `${preset.name} 색상 프리셋 미리보기` })).toBeTruthy();
  });
});
