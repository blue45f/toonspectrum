import { describe, expect, it } from "vitest";

import { SETTLE_DEFAULTS } from "../../../contracts";
import { capsuleSignedDistance, commitCapsuleSet, createCapsuleSet, writeCapsule } from "../collision/capsule";
import { chainInputFixture } from "../fixtures";

import { compileChainModel, createChainState } from "./chain-model";
import { settleChains } from "./chain-settle";
import { maxDistanceError } from "./chain-solver";

describe("physics/chain settle", () => {
  it("헤어 기본 파라미터는 120스텝 안에 수렴한다", () => {
    const compiled = compileChainModel([chainInputFixture({ segments: 8, direction: [0.5, -1, 0.2] })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const state = createChainState(compiled.compiled);
    const result = settleChains(compiled.compiled, state, { dt: SETTLE_DEFAULTS.dtSeconds, substeps: SETTLE_DEFAULTS.substeps });
    expect(result.receipt.settled).toBe(true);
    expect(result.receipt.steps).toBeLessThanOrEqual(SETTLE_DEFAULTS.defaultSteps);
    expect(result.receipt.maxVelocity).toBeLessThanOrEqual(SETTLE_DEFAULTS.velocityEpsilon / (SETTLE_DEFAULTS.dtSeconds * SETTLE_DEFAULTS.substeps) + 1e-9);
    expect(result.state.stepIndex).toBe(result.receipt.steps);
  });

  it("수렴 기준을 만족할 수 없으면 상한(600)에서 settled:false", () => {
    // 감쇠 0인 수평 진자: 중력 아래 영원히 흔들린다(rest 방향이 중력과 나란하면 처음부터 정지하므로 수평으로 둔다)
    const compiled = compileChainModel([chainInputFixture({ segments: 4, direction: [1, 0, 0], params: { dragForce: 0, gravityPower: 0.3, stiffness: 0 } })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const state = createChainState(compiled.compiled);
    const result = settleChains(compiled.compiled, state, { dt: 1 / 120, substeps: 2 }, { maxSteps: SETTLE_DEFAULTS.maxSteps, velocityEpsilon: 0 });
    expect(result.receipt.settled).toBe(false);
    expect(result.receipt.steps).toBe(600);
  });

  it("머리 캡슐 위에 드리운 체인은 settle 후 관통 0·길이 보존 ≤1%", () => {
    // 루트가 정수리 근처, rest 방향은 캡슐 안쪽으로 향해 충돌이 반드시 일어난다
    const compiled = compileChainModel([chainInputFixture({ segments: 8, root: [0.02, 1.76, 0.0], direction: [0.1, -1, 0], segmentLength: 0.04 })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const set = createCapsuleSet(1);
    writeCapsule(set, 0, [0, 1.55, 0], [0, 1.67, 0], 0.1);
    commitCapsuleSet(set);
    const result = settleChains(compiled.compiled, createChainState(compiled.compiled), { dt: 1 / 120, substeps: 2, capsules: set }, { maxSteps: 600 });
    expect(result.receipt.settled).toBe(true);
    const { model } = compiled.compiled;
    let worst = Number.POSITIVE_INFINITY;
    for (let i = 1; i < model.particleCount; i += 1) {
      const d = capsuleSignedDistance([result.state.pos[i * 3], result.state.pos[i * 3 + 1], result.state.pos[i * 3 + 2]], [0, 1.55, 0], [0, 1.67, 0], 0.1 + model.hitRadius[i]);
      worst = Math.min(worst, d);
    }
    expect(worst).toBeGreaterThanOrEqual(-1e-6);
    expect(maxDistanceError(model, result.state.pos)).toBeLessThanOrEqual(0.04 * 0.01);
  });
});
