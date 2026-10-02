import { describe, expect, it } from "vitest";

import { chainInputFixture } from "../fixtures";

import { backSolveChainRotations, forwardKinematicsFromRotations } from "./back-solve";
import { compileChainModel, createChainState } from "./chain-model";
import { settleChains } from "./chain-settle";

describe("physics/chain 역산 회전", () => {
  it("역산 회전으로 FK를 돌리면 말단 오차 ≤ 1e-4", () => {
    const compiled = compileChainModel([
      chainInputFixture({ id: "a", segments: 7, direction: [0.6, -0.7, 0.3], params: { gravityPower: 0.2 } }),
      // 루트 rest 회전이 항등이 아닌 체인(Y축 45°)도 restDirLocal·FK 재구성이 맞아야 한다
      { ...chainInputFixture({ id: "b", segments: 5, root: [0.1, 1.7, 0.05], direction: [-0.4, -1, 0] }), rootRestRotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const },
    ]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const roots = new Float32Array([0.1, 1.65, -0.05, 0.15, 1.72, 0.05]);
    const result = settleChains(compiled.compiled, createChainState(compiled.compiled), { dt: 1 / 120, substeps: 2, rootPositions: roots }, { maxSteps: 300 });
    for (let c = 0; c < compiled.compiled.model.chainCount; c += 1) {
      const rotations = backSolveChainRotations(compiled.compiled, result.state, c);
      expect(rotations.length).toBe(compiled.compiled.model.chainLength[c]);
      for (const rot of rotations) {
        expect(Math.abs(Math.hypot(...rot.local) - 1)).toBeLessThan(1e-5);
        expect(rot.bone.length).toBeGreaterThan(0);
      }
      const fk = forwardKinematicsFromRotations(compiled.compiled, result.state, c, rotations);
      const start = compiled.compiled.model.chainOffset[c];
      const count = compiled.compiled.model.chainLength[c];
      const tip = (start + count - 1) * 3;
      const err = Math.hypot(fk[(count - 1) * 3] - result.state.pos[tip], fk[(count - 1) * 3 + 1] - result.state.pos[tip + 1], fk[(count - 1) * 3 + 2] - result.state.pos[tip + 2]);
      expect(err).toBeLessThanOrEqual(1e-4);
    }
  });

  it("rest 상태에서는 모든 로컬 회전이 항등이다", () => {
    const compiled = compileChainModel([chainInputFixture({ segments: 4, direction: [0.3, -1, 0.2] })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const rotations = backSolveChainRotations(compiled.compiled, createChainState(compiled.compiled), 0);
    for (const rot of rotations) {
      expect(Math.abs(rot.local[3])).toBeCloseTo(1, 5);
    }
  });
});
