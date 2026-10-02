import { describe, expect, it } from "vitest";

import { PHYSICS_BUDGET } from "../../../contracts";
import { stateHashSync } from "../core/receipt";

import { buildClothStripLayout, compileCloth, createClothState } from "./cloth-model";
import { maxClothEdgeError, stepCloth } from "./cloth-solver";

import type { ClothStripInput } from "./cloth-model";

function strip(id: string, columns = 4, rows = 8): ClothStripInput {
  const restPositions = buildClothStripLayout({ origin: [-0.06, 0.95, 0.1], right: [1, 0, 0], down: [0, -1, 0], width: 0.12, length: 0.35, columns, rows });
  const pins = Array.from({ length: columns }, (_, c) => ({ particle: c, bone: 0, offsetLocal: [restPositions[c * 3], restPositions[c * 3 + 1], restPositions[c * 3 + 2]] as const }));
  return { id, columns, rows, restPositions, pins };
}

describe("physics/cloth", () => {
  it("핀 입자는 pinWorld를 정확히 따르고 매달린 스트립은 수렴한다(굽힘·길이 ≤1%)", () => {
    const compiled = compileCloth([strip("skirt-front")]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const { model } = compiled.compiled;
    expect(model.edge.length / 2).toBeGreaterThan(0);
    expect(model.bendPair.length / 2).toBeGreaterThan(0);
    expect(model.tri.length).toBe((4 - 1) * (8 - 1) * 6);
    const pinWorld = new Float32Array(model.pin.length * 3);
    for (let k = 0; k < model.pin.length; k += 1) {
      const p = model.pin[k] * 3;
      pinWorld[k * 3] = compiled.compiled.restPositions[p] + 0.05;
      pinWorld[k * 3 + 1] = compiled.compiled.restPositions[p + 1];
      pinWorld[k * 3 + 2] = compiled.compiled.restPositions[p + 2] - 0.02;
    }
    let state = createClothState(compiled.compiled);
    let lastDelta = Number.POSITIVE_INFINITY;
    let converged = -1;
    for (let i = 0; i < 400; i += 1) {
      const next = stepCloth(compiled.compiled, state, { dt: 1 / 120, substeps: 2, pinWorld, wind: { dir: [0, 0, 1], strength: 0.5, seed: 4 } });
      let delta = 0;
      for (let k = 0; k < next.pos.length; k += 3) {
        delta = Math.max(delta, Math.hypot(next.pos[k] - state.pos[k], next.pos[k + 1] - state.pos[k + 1], next.pos[k + 2] - state.pos[k + 2]));
      }
      state = next;
      lastDelta = delta;
      if (delta < 1e-4 && converged < 0) converged = i;
    }
    for (let k = 0; k < model.pin.length; k += 1) {
      const p = model.pin[k] * 3;
      expect(state.pos[p]).toBe(pinWorld[k * 3]);
      expect(state.pos[p + 1]).toBe(pinWorld[k * 3 + 1]);
      expect(state.pos[p + 2]).toBe(pinWorld[k * 3 + 2]);
    }
    expect(converged).toBeGreaterThanOrEqual(0);
    expect(lastDelta).toBeLessThan(1e-4);
    expect(maxClothEdgeError(model, state.pos)).toBeLessThanOrEqual(0.05 * 0.01);
    // 아래쪽 입자는 핀보다 낮다(중력)
    const bottom = (8 - 1) * 4 * 3 + 1;
    expect(state.pos[bottom]).toBeLessThan(pinWorld[1]);
  });

  it("예산 초과(스트립 > 4, 입자 > 2048)는 budget-exceeded", () => {
    const many = Array.from({ length: PHYSICS_BUDGET.maxClothStrips + 1 }, (_, i) => strip(`s-${i}`, 2, 2));
    const r1 = compileCloth(many);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.failure.code).toBe("budget-exceeded");
    const big = strip("big", 46, 45);
    const r2 = compileCloth([big]);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.failure.code).toBe("budget-exceeded");
    const r3 = compileCloth([{ ...strip("bad"), pins: [{ particle: 999, bone: 0, offsetLocal: [0, 0, 0] }] }]);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.failure.code).toBe("cloth-invalid");
  });

  it("같은 입력은 같은 modelHash·stateHash를 낸다(스트립 순서 무관)", () => {
    const a = compileCloth([strip("b"), strip("a", 3, 5)]);
    const b = compileCloth([strip("a", 3, 5), strip("b")]);
    if (!a.ok || !b.ok) throw new Error("compile 실패");
    expect(a.compiled.model.modelHash).toBe(b.compiled.model.modelHash);
    expect(a.compiled.stripIds).toEqual(["a", "b"]);
    let s1 = createClothState(a.compiled);
    let s2 = createClothState(b.compiled);
    for (let i = 0; i < 30; i += 1) {
      s1 = stepCloth(a.compiled, s1, { dt: 1 / 120, substeps: 2 });
      s2 = stepCloth(b.compiled, s2, { dt: 1 / 120, substeps: 2 });
    }
    expect(stateHashSync(s1.pos)).toBe(stateHashSync(s2.pos));
  });
});
