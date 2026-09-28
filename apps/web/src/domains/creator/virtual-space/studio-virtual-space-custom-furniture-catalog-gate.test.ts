import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { STUDIO_VIRTUAL_DECOR_TYPES } from "./studio-virtual-space-customization";

const panel = readFileSync(
  fileURLToPath(new URL("./StudioVirtualSpaceCustomizationPanel.tsx", import.meta.url)),
  "utf8",
);

/**
 * "custom" 은 내장 아트가 없다. 카탈로그에 그대로 두면 사용자에게 나무 그림이 붙은
 * "내 가구" 버튼이 보인다. 실제로 그랬다.
 */
describe("custom furniture never pretends to be a built-in", () => {
  it("is excluded from the built-in catalog even though it is a decor type", () => {
    expect(STUDIO_VIRTUAL_DECOR_TYPES).toContain("custom");
    expect(panel).toMatch(/type !== "custom"/);
  });

  it("gives the user their own upload section instead", () => {
    expect(panel).toContain("StudioVirtualSpaceCustomFurniturePicker");
  });
});
