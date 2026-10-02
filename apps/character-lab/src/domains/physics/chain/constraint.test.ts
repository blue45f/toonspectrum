import { describe, expect, it } from "vitest";

import { chainInputFixture } from "../fixtures";

import { compileChainModel, createChainState } from "./chain-model";
import { maxDistanceError, stepChains } from "./chain-solver";

describe("physics/chain 거리 제약", () => {
  it("중력 아래 100스텝 후 길이 오차 ≤ 1e-6", () => {
    const compiled = compileChainModel([chainInputFixture({ segments: 8, params: { gravityPower: 0.3 } })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    let state = createChainState(compiled.compiled);
    for (let i = 0; i < 100; i += 1) state = stepChains(compiled.compiled, state, { dt: 1 / 120, substeps: 2 });
    expect(maxDistanceError(compiled.compiled.model, state.pos)).toBeLessThanOrEqual(1e-6);
    expect(state.stepIndex).toBe(100);
  });

  it("루트가 움직여도 길이를 유지하고 굽힘 제약이 체인을 접히지 않게 한다", () => {
    const compiled = compileChainModel([chainInputFixture({ segments: 6, params: { stiffness: 0, gravityPower: 0.2 } })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const { model } = compiled.compiled;
    let state = createChainState(compiled.compiled);
    const roots = new Float32Array([0.3, 1.7, 0.1]);
    for (let i = 0; i < 60; i += 1) state = stepChains(compiled.compiled, state, { dt: 1 / 120, substeps: 2, rootPositions: roots });
    expect(maxDistanceError(model, state.pos)).toBeLessThanOrEqual(1e-6);
    expect(state.pos[0]).toBeCloseTo(0.3, 6);
    // (i-2, i) 거리가 rest의 절반 아래로 꺾이지 않는다
    for (let j = 2; j < model.chainLength[0]; j += 1) {
      const a = (j - 2) * 3;
      const b = j * 3;
      const d = Math.hypot(state.pos[b] - state.pos[a], state.pos[b + 1] - state.pos[a + 1], state.pos[b + 2] - state.pos[a + 2]);
      expect(d).toBeGreaterThan(model.bendRestLength[j] * 0.5);
    }
  });

  it("예산 초과·정합성 위반은 LabFailure로 돌려준다", () => {
    const tooLong = chainInputFixture({ segments: 16 });
    const r1 = compileChainModel([tooLong]);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.failure.code).toBe("budget-exceeded");
    const many = Array.from({ length: 65 }, (_, i) => chainInputFixture({ id: `c-${String(i).padStart(2, "0")}`, segments: 2 }));
    const r2 = compileChainModel(many);
    if (!r2.ok) expect(r2.failure.code).toBe("budget-exceeded");
    expect(r2.ok).toBe(false);
    const dup = compileChainModel([chainInputFixture({ id: "same" }), chainInputFixture({ id: "same" })]);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.failure.code).toBe("chain-invalid");
    const bad = chainInputFixture({ segments: 3 });
    const r3 = compileChainModel([{ ...bad, restPoints: bad.restPoints.slice(0, 2) }]);
    expect(r3.ok).toBe(false);
  });
});
