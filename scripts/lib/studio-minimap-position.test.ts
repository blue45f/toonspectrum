import { describe, expect, it } from "vitest";

import { parseStudioMinimapPosition } from "./studio-minimap-position.mjs";

describe("public minimap runtime observation", () => {
  it("retains actual painted percentage coordinates", () => {
    expect(parseStudioMinimapPosition("0%", "100%")).toEqual([0, 100]);
    expect(parseStudioMinimapPosition("32.345%", "0.0001%")).toEqual([32.345, 0.0001]);
  });
  it.each([null, undefined, "", "%", "20px", "NaN%", "Infinity%", "-1%", "101%", "calc(20%)"])("rejects unavailable or invalid position %s instead of inventing zero", (value) => {
    expect(() => parseStudioMinimapPosition(value, "50%")).toThrow();
    expect(() => parseStudioMinimapPosition("50%", value)).toThrow();
  });
});
