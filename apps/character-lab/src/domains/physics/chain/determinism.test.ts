import { describe, expect, it } from "vitest";

import { createPrng } from "../../../shared/prng";
import { commitCapsuleSet, createCapsuleSet, writeCapsule } from "../collision/capsule";
import { stateHashSha256, stateHashSync } from "../core/receipt";
import { chainInputFixture } from "../fixtures";

import { compileChainModel, createChainState } from "./chain-model";
import { stepChains } from "./chain-solver";

import type { ChainCompileInput, CompiledChains } from "./chain-model";

function inputs(): ChainCompileInput[] {
  return [
    chainInputFixture({ id: "hair-b", root: [0.05, 1.7, -0.02], segments: 5, direction: [0.2, -1, 0] }),
    chainInputFixture({ id: "hair-a", root: [-0.05, 1.7, -0.02], segments: 7, direction: [-0.2, -1, 0.1] }),
    chainInputFixture({ id: "skirt-0", root: [0, 0.95, 0.1], segments: 4, role: "skirt", direction: [0, -1, 0.3] }),
  ];
}

function run(compiled: CompiledChains, steps: number): Float32Array {
  const set = createCapsuleSet(2);
  writeCapsule(set, 0, [0, 1.55, 0], [0, 1.67, 0], 0.1);
  writeCapsule(set, 1, [0, 0.8, 0], [0, 0.95, 0], 0.13);
  commitCapsuleSet(set);
  let state = createChainState(compiled);
  for (let i = 0; i < steps; i += 1) {
    state = stepChains(compiled, state, { dt: 1 / 120, substeps: 2, capsules: set, wind: { dir: [1, 0, 0], strength: 0.3, seed: 99 } });
  }
  return state.pos;
}

describe("physics/chain 결정성", () => {
  it("같은 입력으로 2회 실행하면 stateHash가 같고, 입력 순서를 섞어도 같다", async () => {
    const a = compileChainModel(inputs());
    const b = compileChainModel(inputs());
    const shuffled = createPrng(5).shuffle(inputs());
    const c = compileChainModel(shuffled);
    if (!a.ok || !b.ok || !c.ok) throw new Error("compile 실패");
    expect(a.compiled.model.modelHash).toBe(b.compiled.model.modelHash);
    expect(c.compiled.model.modelHash).toBe(a.compiled.model.modelHash);
    expect(c.compiled.chainIds).toEqual(["hair-a", "hair-b", "skirt-0"]);
    const p1 = run(a.compiled, 90);
    const p2 = run(b.compiled, 90);
    const p3 = run(c.compiled, 90);
    expect(stateHashSync(p1)).toBe(stateHashSync(p2));
    expect(stateHashSync(p1)).toBe(stateHashSync(p3));
    const sha = await stateHashSha256(p1);
    expect(sha).toMatch(/^[0-9a-f]{64}$/u);
    expect(await stateHashSha256(p3)).toBe(sha);
    for (let i = 0; i < p1.length; i += 1) expect(Number.isFinite(p1[i])).toBe(true);
  });

  it("바람 시드가 다르면 결과가 달라진다(바람이 실제로 적용됨)", () => {
    const a = compileChainModel([chainInputFixture({ segments: 6, params: { stiffness: 0.2, gravityPower: 0.02 } })]);
    if (!a.ok) throw new Error("compile 실패");
    let s1 = createChainState(a.compiled);
    let s2 = createChainState(a.compiled);
    for (let i = 0; i < 40; i += 1) {
      s1 = stepChains(a.compiled, s1, { dt: 1 / 120, substeps: 2, wind: { dir: [1, 0, 0], strength: 0.5, seed: 1 } });
      s2 = stepChains(a.compiled, s2, { dt: 1 / 120, substeps: 2, wind: { dir: [1, 0, 0], strength: 0.5, seed: 2 } });
    }
    expect(stateHashSync(s1.pos)).not.toBe(stateHashSync(s2.pos));
    expect(s1.pos[(a.compiled.model.chainLength[0] - 1) * 3]).toBeGreaterThan(0);
  });
});
