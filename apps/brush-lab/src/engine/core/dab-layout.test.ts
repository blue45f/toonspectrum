import { describe, expect, it } from "vitest";

import { COMMON_TYPES_WGSL } from "../gpu/wgsl/common.wgsl";

import {
  DAB_BYTES,
  DAB_FIELD,
  DAB_FLAG,
  DAB_FLOATS,
  DAB_WGSL_STRUCT_FIELDS,
  DabBatch,
  DEPOSITION_ID,
  packDab,
  packFlags,
  packTipSeed,
  TIP_KIND_ID,
  unpackDab,
} from "./dab-layout";

import type { DabInstance, DepositionModel, TipKind } from "./types";

const f = Math.fround;

function sampleDab(over: Partial<DabInstance> = {}): DabInstance {
  return {
    x: 123.456,
    y: -7.25,
    rx: 3.5,
    ry: 1.75,
    angle: 0.7853981,
    hardness: 0.65,
    flow: 0.3,
    shapeExp: 2.5,
    r: 0.25,
    g: 0.5,
    b: 0.75,
    a: 0.9,
    tipKind: "bristle-strands",
    seed: 0x00abcdef,
    grain: 0.4,
    wet: 0.6,
    pigmentMass: 0.33,
    erase: false,
    smudge: true,
    dualTip: false,
    lockAlpha: true,
    impasto: false,
    deposition: "wet-flow",
    ...over,
  };
}

describe("dab 64 B 레이아웃", () => {
  it("16 f32 = 64 B이며 필드 인덱스가 0..15를 한 번씩 덮는다", () => {
    expect(DAB_FLOATS).toBe(16);
    expect(DAB_BYTES).toBe(64);
    expect(DAB_FLOATS * 4).toBe(DAB_BYTES);
    const indices = Object.values(DAB_FIELD).sort((a, b) => a - b);
    expect(indices).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it("pack/unpack 왕복: f32 필드는 fround, pigmentMass는 u16 양자화 오차 이내", () => {
    const dab = sampleDab();
    const buf = new Float32Array(DAB_FLOATS * 2);
    packDab(dab, buf, 1);
    const back = unpackDab(buf, 1);
    for (const key of ["x", "y", "rx", "ry", "angle", "hardness", "flow", "shapeExp", "r", "g", "b", "a", "grain", "wet"] as const) {
      expect(back[key], key).toBe(f(dab[key]));
    }
    expect(Math.abs(back.pigmentMass - dab.pigmentMass)).toBeLessThanOrEqual(0.5 / 65535);
    expect(back.tipKind).toBe(dab.tipKind);
    expect(back.seed).toBe(dab.seed);
    expect(back.deposition).toBe(dab.deposition);
    expect([back.erase, back.smudge, back.dualTip, back.lockAlpha, back.impasto]).toEqual([false, true, false, true, false]);
    // 인덱스 0은 건드리지 않는다
    expect(Array.from(buf.subarray(0, DAB_FLOATS)).every((v) => v === 0)).toBe(true);
  });

  it("u32 필드는 Float32Array 위 bitcast로 기록된다(NaN 정규화 없음)", () => {
    const dab = sampleDab({ tipKind: "particle", seed: 0x00ffffff, deposition: "impasto", impasto: true, pigmentMass: 1 });
    const buf = new Float32Array(DAB_FLOATS);
    packDab(dab, buf, 0);
    const u32 = new Uint32Array(buf.buffer);
    expect(u32[DAB_FIELD.tipSeed]).toBe(packTipSeed("particle", 0x00ffffff));
    expect(u32[DAB_FIELD.tipSeed]).toBe(((TIP_KIND_ID.particle << 24) | 0x00ffffff) >>> 0);
    expect(u32[DAB_FIELD.flags]).toBe(packFlags(dab));
    expect((u32[DAB_FIELD.flags] ?? 0) >>> 24).toBe(DEPOSITION_ID.impasto);
    expect(((u32[DAB_FIELD.flags] ?? 0) & DAB_FLAG.impasto) !== 0).toBe(true);
    expect((u32[DAB_FIELD.flags] ?? 0) & 0xffff).toBe(0xffff);
  });

  it("모든 TipKind·DepositionModel이 왕복한다", () => {
    const kinds = Object.keys(TIP_KIND_ID) as TipKind[];
    const models = Object.keys(DEPOSITION_ID) as DepositionModel[];
    const buf = new Float32Array(DAB_FLOATS);
    for (const tipKind of kinds) {
      for (const deposition of models) {
        packDab(sampleDab({ tipKind, deposition }), buf, 0);
        const back = unpackDab(buf, 0);
        expect(back.tipKind).toBe(tipKind);
        expect(back.deposition).toBe(deposition);
      }
    }
    expect(new Set(Object.values(TIP_KIND_ID)).size).toBe(kinds.length);
    expect(new Set(Object.values(DEPOSITION_ID)).size).toBe(models.length);
  });

  it("DAB_WGSL_STRUCT_FIELDS 순서가 common.wgsl.ts의 struct Dab 필드 순서와 같다", () => {
    const m = /struct\s+Dab\s*\{([^}]*)\}/.exec(COMMON_TYPES_WGSL);
    expect(m).not.toBeNull();
    const fields = (m?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.split(":")[0]?.trim() ?? "");
    expect(fields).toEqual([...DAB_WGSL_STRUCT_FIELDS]);
  });

  it("DabBatch: stride 16, 용량 초과 시 false, at() 범위 검사, reset", () => {
    const batch = new DabBatch(2);
    expect(batch.push(sampleDab({ x: 1 }))).toBe(true);
    expect(batch.push(sampleDab({ x: 2 }))).toBe(true);
    expect(batch.push(sampleDab({ x: 3 }))).toBe(false);
    expect(batch.count).toBe(2);
    expect(batch.view().length).toBe(2 * DAB_FLOATS);
    expect(batch.at(1).x).toBe(2);
    expect(() => batch.at(2)).toThrow(RangeError);
    batch.reset();
    expect(batch.count).toBe(0);
    expect(batch.view().length).toBe(0);
    expect(() => new DabBatch(0)).toThrow(RangeError);
  });
});
