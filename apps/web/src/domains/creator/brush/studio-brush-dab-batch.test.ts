import { describe, expect, it } from "vitest";

import {
  countStudioDabBatchStateChanges,
  countStudioDabNaiveStateChanges,
  flushStudioDabBatch,
  planStudioDabBatch,
  sanitizeStudioDabBatchItem,
  studioDabBatchHash,
  studioDabBatchPencilVariant,
  studioDabBatchQuantizeAlpha,
  STUDIO_DAB_BATCH_PENCIL_VARIANTS,
} from "./studio-brush-dab-batch";

function makeItem(overrides: Record<string, number | string> = {}) {
  return {
    x: 10,
    y: 20,
    radius: 5,
    alpha: 0.8,
    tipKey: "ink:r5",
    tipWidth: 12,
    tipHeight: 12,
    ...overrides,
  };
}

describe("studio-brush-dab-batch", () => {
  it("알파 런을 그룹핑해 setAlpha 호출을 줄인다", () => {
    const ops = planStudioDabBatch([
      makeItem({ alpha: 0.5 }),
      makeItem({ alpha: 0.5 }),
      makeItem({ alpha: 0.5 }),
      makeItem({ alpha: 0.9 }),
      makeItem({ alpha: 0.9 }),
    ]);
    const counts = countStudioDabBatchStateChanges(ops);
    expect(counts.setAlpha).toBe(2);
    expect(counts.blit).toBe(5);
  });

  it("회전 팁은 setTransform 2호출로 처리한다", () => {
    const ops = planStudioDabBatch([makeItem({ tipRotationRadians: Math.PI / 4 })]);
    const kinds = ops.map((op) => op.op);
    expect(kinds).toEqual(["setAlpha", "setTransform", "blit", "resetTransform"]);
    const transform = ops[1];
    expect(transform.op).toBe("setTransform");
    if (transform.op === "setTransform") {
      expect(transform.a).toBeCloseTo(Math.cos(Math.PI / 4), 10);
      expect(transform.b).toBeCloseTo(Math.sin(Math.PI / 4), 10);
      expect(transform.e).toBe(10);
      expect(transform.f).toBe(20);
    }
  });

  it("비회전 팁은 blit 1-op이다", () => {
    const ops = planStudioDabBatch([makeItem()]);
    expect(ops.map((op) => op.op)).toEqual(["setAlpha", "blit"]);
    const blit = ops[1];
    if (blit.op === "blit") {
      expect(blit.dx).toBe(10 - 6);
      expect(blit.dy).toBe(20 - 6);
    }
  });

  it("flush는 팁 조회를 고유 키당 1회로 배치한다", () => {
    const ops = planStudioDabBatch([
      makeItem({ tipKey: "a" }),
      makeItem({ tipKey: "a" }),
      makeItem({ tipKey: "b" }),
    ]);
    let resolveCount = 0;
    const calls: string[] = [];
    const context = {
      globalAlpha: 1,
      setTransform: () => undefined,
      drawImage: () => undefined,
    };
    const result = flushStudioDabBatch(context, ops, {
      resolveTip: (key: string) => {
        resolveCount += 1;
        calls.push(key);
        return { key };
      },
    });
    expect(resolveCount).toBe(2);
    expect(calls).toEqual(["a", "b"]);
    expect(result.drawn).toBe(3);
    expect(result.uniqueTips).toBe(2);
    expect(result.skippedMissingTip).toBe(0);
  });

  it("팁이 없으면 건너뛰고 카운트한다", () => {
    const ops = planStudioDabBatch([makeItem({ tipKey: "missing" })]);
    const context = {
      globalAlpha: 1,
      setTransform: () => undefined,
      drawImage: () => undefined,
    };
    const result = flushStudioDabBatch(context, ops, { resolveTip: () => null });
    expect(result.drawn).toBe(0);
    expect(result.skippedMissingTip).toBe(1);
  });

  it("연필 변형은 결정적이고 8개 범위 안이다", () => {
    for (let index = 0; index < 200; index += 1) {
      const variant = studioDabBatchPencilVariant(index);
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(STUDIO_DAB_BATCH_PENCIL_VARIANTS);
      expect(studioDabBatchPencilVariant(index)).toBe(variant);
    }
    const variants = new Set(Array.from({ length: 200 }, (_, i) => studioDabBatchPencilVariant(i)));
    expect(variants.size).toBeGreaterThan(1);
  });

  it("해시는 [0,1) 범위의 결정적 값이다", () => {
    expect(studioDabBatchHash(0, 0)).toBe(studioDabBatchHash(0, 0));
    expect(studioDabBatchHash(1, 0)).not.toBe(studioDabBatchHash(0, 0));
    const value = studioDabBatchHash(42, 77);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it("알파는 1/255 단위로 양자화된다", () => {
    expect(studioDabBatchQuantizeAlpha(0.5)).toBeCloseTo(Math.round(0.5 * 255) / 255, 10);
    expect(studioDabBatchQuantizeAlpha(2)).toBe(1);
    expect(studioDabBatchQuantizeAlpha(-1)).toBe(0);
    expect(studioDabBatchQuantizeAlpha(Number.NaN)).toBe(0);
  });

  it("배치는 naive 방식보다 상태 변경이 적다", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      makeItem({ alpha: i < 50 ? 0.5 : 0.9, tipKey: `k${i % 4}` }),
    );
    const ops = planStudioDabBatch(items);
    const batched = countStudioDabBatchStateChanges(ops);
    const naive = countStudioDabNaiveStateChanges(items.length);
    expect(batched.setAlpha).toBeLessThan(naive.setAlpha);
    expect(batched.blit).toBe(100);
  });

  it("잘못된 dab은 sanitize에서 null이다", () => {
    expect(sanitizeStudioDabBatchItem({ tipKey: "a", x: Number.NaN, y: 1, radius: 2, tipWidth: 4, tipHeight: 4 })).toBeNull();
    expect(sanitizeStudioDabBatchItem({ tipKey: "a", x: 1, y: 1, radius: 0, tipWidth: 4, tipHeight: 4 })).toBeNull();
    const ok = sanitizeStudioDabBatchItem({ tipKey: "a", x: 1, y: 2, radius: 3, tipWidth: 8, tipHeight: 8, alpha: 0.3 });
    expect(ok).not.toBeNull();
    expect(ok?.alpha).toBeCloseTo(Math.round(0.3 * 255) / 255, 10);
  });

  it("빈 입력은 빈 op 시퀀스다", () => {
    expect(planStudioDabBatch([])).toEqual([]);
  });
});
