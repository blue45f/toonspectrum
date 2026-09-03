import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../StudioInspectorSelectionSection.tsx", import.meta.url),
  "utf8",
);

describe("lettering inspector priority", () => {
  it("renders one essential edit action before appearance and typography controls", () => {
    const action = source.indexOf('data-studio-inspector-primary-action="edit-text"');
    const appearance = source.indexOf("<StudioInspectorBubbleAppearanceControls");
    const typography = source.indexOf("<StudioInspectorTypographySection");

    expect(action).toBeGreaterThan(-1);
    expect(action).toBeLessThan(appearance);
    expect(action).toBeLessThan(typography);
    expect(source.match(/startEditText\(selected\.id\)/g)).toHaveLength(1);
    expect(source).toContain('data-inspector-priority="essential"');
    expect(source).toContain('data-inspector-control-id="element.edit-text"');
    expect(source).toContain('selected.type === "bubble" ? "대사 편집" : "글자 편집"');
  });
});
