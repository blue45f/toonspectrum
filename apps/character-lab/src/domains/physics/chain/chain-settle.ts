/**
 * settle(character-physics.md §4.5): 고정 dt로 반복 스텝하며 스텝당 최대 변위가 velocityEpsilon(m) 아래로
 * 내려오면 조기 종료, 상한(maxSteps) 도달이면 settled:false. 캡처는 항상 step 0부터 재실행한다.
 */
import { SETTLE_DEFAULTS } from "../../../contracts";

import { createChainScratch, stepChainsInto } from "./chain-solver";

import type { CompiledChains } from "./chain-model";
import type { ChainScratch, ChainStepInput } from "./chain-solver";
import type { ChainState, SettleReceipt } from "../../../contracts";

export interface SettleOptions {
  readonly maxSteps?: number;
  /** 스텝당 최대 변위(m) 수렴 기준 */
  readonly velocityEpsilon?: number;
}

export interface SettleResult {
  readonly state: ChainState;
  readonly receipt: SettleReceipt;
}

/**
 * state를 복사해 settle한 결과를 돌려준다. `input.rootPositions`는 settle 동안 고정이다.
 * maxVelocity는 마지막 스텝의 최대 변위 / (dt × substeps) (m/s).
 */
export function settleChains(compiled: CompiledChains, state: ChainState, input: ChainStepInput, options: SettleOptions = {}, scratch?: ChainScratch): SettleResult {
  const maxSteps = Math.max(0, Math.floor(options.maxSteps ?? SETTLE_DEFAULTS.defaultSteps));
  const eps = options.velocityEpsilon ?? SETTLE_DEFAULTS.velocityEpsilon;
  const work: ChainScratch = scratch ?? createChainScratch(compiled);
  const pos = new Float32Array(state.pos);
  const prev = new Float32Array(state.prev);
  let stepIndex = state.stepIndex;
  let lastDelta = Number.POSITIVE_INFINITY;
  let steps = 0;
  let settled = false;
  const frameSeconds = input.dt * Math.max(1, Math.floor(input.substeps));
  while (steps < maxSteps) {
    const current: ChainState = { pos, prev, stepIndex };
    const stats = stepChainsInto(compiled, current, input, { pos, prev }, work);
    stepIndex += 1;
    steps += 1;
    lastDelta = stats.maxDelta;
    if (lastDelta <= eps) {
      settled = true;
      break;
    }
  }
  const maxVelocity = Number.isFinite(lastDelta) ? lastDelta / frameSeconds : Number.POSITIVE_INFINITY;
  return {
    state: { pos, prev, stepIndex },
    receipt: { steps, settled, maxVelocity },
  };
}
