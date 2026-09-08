import { describe, expect, it, vi } from "vitest";

import { compareCodeUnitStrings } from "./compare-code-unit-strings";

describe("locale-independent metadata ordering", () => {
  it("keeps identifier distinctions and their historical serialized order", () => {
    const locale = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {
      throw new Error("Persisted identifier ordering must not depend on locale");
    });
    try {
      const ids = ["é", "e\u0301", "a", "A", "2", "10", "😀", "a"];
      expect(ids.toSorted(compareCodeUnitStrings)).toEqual(["10", "2", "A", "a", "a", "e\u0301", "é", "😀"]);
      expect(ids[0]).toBe("é");
      expect(compareCodeUnitStrings("é", "e\u0301")).not.toBe(0);
      expect(compareCodeUnitStrings("same", "same")).toBe(0);
      expect(compareCodeUnitStrings("A", "a")).toBeLessThan(0);
    } finally {
      locale.mockRestore();
    }
  });
});
