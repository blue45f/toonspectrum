import { describe, expect, it } from "vitest";

import {
  isStudioBrushCatalogSelection,
  studioCoreBrushCatalogSelection,
} from "./studio-brush-selection";

describe("studio brush catalogue selection", () => {
  it("keeps catalogue and runtime identity explicit for core brushes", () => {
    const selection = studioCoreBrushCatalogSelection({
      id: "chalk",
      name: "초크",
      defaultWidth: 16,
      defaultOpacity: 0.8,
    });

    expect(selection).toMatchObject({
      catalogId: "chalk",
      catalogName: "초크",
      runtimeBrushId: "chalk",
    });
    expect(selection.brushDynamics?.tip.shape).toBe("sponge");
    expect(isStudioBrushCatalogSelection(selection)).toBe(true);
  });

  it("rejects incomplete or non-finite catalogue payloads", () => {
    expect(isStudioBrushCatalogSelection(null)).toBe(false);
    expect(isStudioBrushCatalogSelection({ catalogId: "pack-1" })).toBe(false);
    expect(isStudioBrushCatalogSelection({
      catalogId: "pack-1",
      catalogName: "프로 브러시",
      runtimeBrushId: "dry-media",
      defaultWidth: Number.NaN,
      defaultOpacity: 1,
      brushDynamics: null,
    })).toBe(false);
  });
});
