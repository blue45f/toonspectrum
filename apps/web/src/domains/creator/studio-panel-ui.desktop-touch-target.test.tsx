import { describe, expect, it } from "vitest";

import { studioToolButtonClass } from "./studio-panel-ui";

describe("studioToolButtonClass desktop touch targets", () => {
  it("keeps dense toolbar controls at least 44px tall on every pointer type", () => {
    const tokens = studioToolButtonClass(false, { dense: true }).split(/\s+/);

    expect(tokens).toEqual(expect.arrayContaining(["h-11", "min-h-11"]));
    expect(tokens).not.toContain("h-9");
    expect(tokens).not.toContain("max-lg:h-11");
  });
});
