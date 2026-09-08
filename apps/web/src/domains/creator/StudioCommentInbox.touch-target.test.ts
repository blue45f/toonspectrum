import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./studio-cuttoon-editor/StudioCuttoonEditorChrome.tsx", import.meta.url),
  "utf8",
);

describe("Studio comment inbox touch target", () => {
  it("keeps the desktop review trigger at least 44px tall", () => {
    const triggerStart = source.indexOf('data-studio-comments-inbox="true"');
    const triggerEnd = source.indexOf("</button>", triggerStart);

    expect(triggerStart).toBeGreaterThan(-1);
    expect(triggerEnd).toBeGreaterThan(triggerStart);
    const trigger = source.slice(triggerStart, triggerEnd);
    expect(trigger).toContain("min-h-11");
    expect(trigger).not.toContain("min-h-9");
  });
});
