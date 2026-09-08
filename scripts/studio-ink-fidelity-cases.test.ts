import { describe, expect, it } from "vitest";

import { STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS } from "../apps/web/src/domains/creator/brush/studio-brush-catalog";

import { FIDELITY_CASES, resolveCase } from "./studio-ink-fidelity-cases";

describe("ink fidelity cases use the shipped brush picker", () => {
  it("keeps both required fidelity IDs reachable with their shipped width and operation", () => {
    expect(FIDELITY_CASES.map((definition) => resolveCase(definition))).toMatchObject([
      { id: "inkwash-pen", brushWidth: 8, brushOperation: "paint" },
      { id: "pen", brushWidth: 6, brushOperation: "paint" },
    ]);
    for (const definition of FIDELITY_CASES) {
      const shipped = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.find((item) => item.id === definition.id);
      expect(shipped).toBeDefined();
      expect(resolveCase(definition).brushName).toBe(shipped?.name);
    }
  });

  it("follows a renamed and reconfigured catalogue entry using its saved ID", () => {
    const definition = FIDELITY_CASES[0];
    const catalogue = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id === definition.id
      ? { ...item, name: "새 브러시 이름", defaultWidth: 13, operation: "erase" as const }
      : item);

    expect(resolveCase(definition, catalogue)).toEqual({
      ...definition,
      brushName: "새 브러시 이름",
      brushWidth: 13,
      brushOperation: "erase",
    });
  });

  it.each(FIDELITY_CASES)("rejects delisted $id before a browser can select a stale label", (definition) => {
    const catalogue = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.id !== definition.id);
    expect(() => resolveCase(definition, catalogue))
      .toThrow(`fidelity case "${definition.id}" is not listed in the shipped brush picker`);
  });
});
