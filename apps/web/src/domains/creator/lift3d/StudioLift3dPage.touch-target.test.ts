import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioLift3dPage.tsx", import.meta.url), "utf8");

describe("Studio Lift3D preview touch targets", () => {
  it("keeps every preview tab at least 44px tall and wide", () => {
    const tabClasses = [...source.matchAll(/role="tab"[\s\S]*?className=\{`([^`]+)`\}/g)];
    expect(tabClasses.length).toBeGreaterThan(0);
    for (const [, className] of tabClasses) {
      const classes = className.split(/\s+/);
      expect(classes).toContain("min-h-11");
      expect(classes).toContain("min-w-11");
      expect(classes).not.toContain("min-h-9");
    }
  });
});
