import { describe, expect, it } from "vitest";

import { chainInputFixture } from "../fixtures";

import { compileChainModel, createChainState } from "./chain-model";
import { kineticEnergy, stepChains } from "./chain-solver";

import type { ChainState } from "../../../contracts";

describe("physics/chain 에너지", () => {
  it("외력 없이 감쇠만 있으면 운동 에너지가 단조 감소한다(f32 바닥 5e-9 허용)", () => {
    // 탄성 굽힘(compliance > 0)은 퍼텐셜을 저장했다 되돌리므로 강체 굽힘(0)으로 둔다
    const compiled = compileChainModel([chainInputFixture({ segments: 8, params: { stiffness: 0, gravityPower: 0, dragForce: 0.2, bendCompliance: 0 } })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const dt = 1 / 120;
    const base = createChainState(compiled.compiled);
    // 초기 속도: 아래쪽 입자일수록 +x 방향으로 빠르게(흔들림)
    const prev = new Float32Array(base.prev);
    const n = compiled.compiled.model.particleCount;
    for (let i = 1; i < n; i += 1) prev[i * 3] -= 0.004 * i;
    let state: ChainState = { pos: base.pos, prev, stepIndex: 0 };
    let last = kineticEnergy(compiled.compiled.model, state, dt);
    const initial = last;
    expect(initial).toBeGreaterThan(1);
    // f32 위치(≈1.7 m, ulp 1.2e-7)에서 속도 잡음 1.4e-5 m/s → 에너지 바닥 ≈ 수 e-9
    const floor = 5e-9;
    for (let step = 0; step < 240; step += 1) {
      state = stepChains(compiled.compiled, state, { dt, substeps: 1 });
      const energy = kineticEnergy(compiled.compiled.model, state, dt);
      expect(energy).toBeLessThanOrEqual(last * (1 + 1e-6) + floor);
      last = energy;
    }
    expect(last).toBeLessThan(initial * 1e-8);
  });
});
