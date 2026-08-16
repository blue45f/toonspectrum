/**
 * The frozen diameter table must reproduce the checksum it replaced, exactly.
 *
 * `studioBrushAliasEffectiveDiameter` used to multiply the diameter of every id containing "--" by
 * an FNV-1a hash of that id. The hash is gone from the runtime and its output is written down, so
 * this recomputes the historical formula and asserts the table still equals it. That keeps the
 * provenance checkable and stops the table drifting by accident — while leaving a deliberate edit
 * to any single row a one-line, reviewable change, which is the whole reason for baking it.
 */
import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_ALIAS_DIAMETER_MULTIPLIERS,
  studioBrushAliasEffectiveDiameter,
} from "./studio-brush-alias-profile";
import { STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS } from "./studio-brush-engine-lane-catalog";
import { STUDIO_BRUSH_RUNTIME_CONTRACT } from "./studio-brush-runtime-contract";

/** The exact expression that used to run per render call. */
function historicalDiameterHashScale(brushId: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < brushId.length; index += 1) {
    hash ^= brushId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return 0.84 + (((hash >>> 0) % 10_000) / 10_000) * 0.52;
}

const VARIANT_IDS = [...new Set([
  ...STUDIO_BRUSH_RUNTIME_CONTRACT.map(({ id }) => id),
  ...STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS.map(({ id }) => id),
])].filter((id) => id.includes("--")).sort();

describe("studio brush alias diameter table", () => {
  it("reproduces the checksum it replaced for every variant id", () => {
    expect(VARIANT_IDS.length).toBeGreaterThan(0);
    for (const id of VARIANT_IDS) {
      expect(STUDIO_BRUSH_ALIAS_DIAMETER_MULTIPLIERS[id], id)
        .toBe(historicalDiameterHashScale(id));
    }
  });

  it("covers every variant id a document can hold, and nothing else", () => {
    // A "--" id missing from the table would silently take 1 and render at a different size than
    // it did before, which is the one way this refactor could change a saved document.
    expect(Object.keys(STUDIO_BRUSH_ALIAS_DIAMETER_MULTIPLIERS).sort()).toEqual(VARIANT_IDS);
  });

  it("keeps canonical ids on their profile scale alone", () => {
    // No "--", so the table must not touch them — `pen` and `brush` never carried the hash either.
    for (const id of ["pen", "brush", "watercolor", "screentone"]) {
      expect(STUDIO_BRUSH_ALIAS_DIAMETER_MULTIPLIERS[id], id).toBeUndefined();
    }
  });

  it("renders every variant at a bounded diameter, and records the spread", () => {
    for (const id of VARIANT_IDS) {
      const rendered = studioBrushAliasEffectiveDiameter(id, 24);
      expect(Number.isFinite(rendered), id).toBe(true);
      expect(rendered, id).toBeGreaterThan(0);
    }
    // Stated so the still-open width contract has a starting point rather than a rediscovery.
    const values = VARIANT_IDS.map((id) => STUDIO_BRUSH_ALIAS_DIAMETER_MULTIPLIERS[id]!);
    expect(Math.min(...values)).toBeCloseTo(0.8478, 4);
    expect(Math.max(...values)).toBeCloseTo(1.3368, 4);
  });
});
