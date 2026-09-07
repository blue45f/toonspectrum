import { describe, expect, it } from "vitest";

import {
  catalogShortcutIndex,
  STUDIO_COMMAND_CATALOG,
} from "./studio-command-catalog";

describe("Studio public command shortcut migrations", () => {
  it("keeps crop on C and advertises transparent ink on Shift+C", () => {
    const transparent = STUDIO_COMMAND_CATALOG.find(
      ({ id }) => id === "color.toggle-transparent",
    );
    expect(transparent?.shortcut).toBe("Shift+C");
    expect(transparent?.origins.find(({ source }) => source === "keymap")?.shortcut)
      .toBe("Shift+C");

    const index = catalogShortcutIndex();
    expect(index.get("Shift+C")).toContain("color.toggle-transparent");
    expect(index.get("C")).not.toContain("color.toggle-transparent");
  });
});
