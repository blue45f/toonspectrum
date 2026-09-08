import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioLift3dPage.tsx", import.meta.url), "utf8");

describe("Studio Lift3D preview touch targets", () => {
  it("keeps every preview tab at least 44px tall", () => {
    expect(source).toContain('className={`min-h-11 flex-1 rounded-md');
    expect(source).not.toContain('className={`min-h-9 flex-1 rounded-md');
  });
});
