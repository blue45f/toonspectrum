import { describe, expect, it } from "vitest";

import { evalCurve } from "../core/curve";

import {
  BINS_BYTES,
  BINS_OFFSETS,
  DABS_BYTES,
  documentBytes,
  edgeCurveLength,
  encodeParams,
  INDIRECT_BYTES,
  INDIRECT_MEMBERS,
  INDIRECT_OFFSETS,
  INST_PARAMS_BYTES,
  INST_PARAMS_SCALARS,
  isIdentityEdgeCurve,
  MAX_DABS_PER_BATCH,
  MAX_SCAN_BLOCKS,
  MAX_TILES,
  packEdgeCurve,
  PARAMS_BYTES,
  PARAMS_EDGE_CURVE_OFFSET,
  PARAMS_EDGE_CURVE_SAMPLES,
  PARAMS_SCALARS,
  sampleCurveLinear,
  strokePoolBytes,
  TABLE_ARRAY_MEMBERS,
  TABLE_BYTES,
  TABLE_HEADER_MEMBERS,
  TABLE_OFFSETS,
  tileGrid,
  tipAtlasLevelSize,
  wetPoolBytes,
  workgroupsFor,
  alignedBytesPerRow,
} from "./layout";

import type { ParamsValues } from "./layout";

/** WGSL 호스트 공유 가능 구조체 규칙으로 멤버 오프셋을 계산한다(u32 4/4, atomic<u32> 4/4, vec3<u32> 12/16). */
function wgslStructOffsets(members: readonly (readonly [string, string, string])[]): Map<string, number> {
  const sizeAlign = (type: string): [number, number] => {
    if (type === "u32" || type === "atomic<u32>" || type === "f32") return [4, 4];
    if (type === "vec3<u32>") return [12, 16];
    if (type.startsWith("array<")) return [MAX_TILES * 4, 4];
    throw new Error(`unknown WGSL type ${type}`);
  };
  const out = new Map<string, number>();
  let offset = 0;
  for (const [name, type] of members) {
    const [size, align] = sizeAlign(type);
    offset = Math.ceil(offset / align) * align;
    out.set(name, offset);
    offset += size;
  }
  return out;
}

describe("gpu/layout TileTable 오프셋", () => {
  it("TABLE_OFFSETS가 WGSL 구조체 규칙으로 계산한 오프셋과 같다", () => {
    const offsets = wgslStructOffsets([...TABLE_HEADER_MEMBERS, ...TABLE_ARRAY_MEMBERS]);
    for (const [name, , key] of [...TABLE_HEADER_MEMBERS, ...TABLE_ARRAY_MEMBERS]) {
      expect(offsets.get(name), name).toBe(TABLE_OFFSETS[key]);
    }
  });

  it("헤더 크기·배열 수·전체 크기가 일관된다", () => {
    const lastHeader = TABLE_HEADER_MEMBERS[TABLE_HEADER_MEMBERS.length - 1]!;
    expect(TABLE_OFFSETS[lastHeader[2]] + 4).toBe(TABLE_OFFSETS.header);
    expect(TABLE_OFFSETS.header % 16).toBe(0);
    expect(TABLE_BYTES).toBe(TABLE_OFFSETS.header + MAX_TILES * 4 * TABLE_ARRAY_MEMBERS.length);
    expect(TABLE_BYTES % 4).toBe(0);
  });

  it("영역 경계: 프레임 초기화 ⊂ 획 영역 < 습식 영역", () => {
    // 프레임 초기화 영역은 dirty_count·refs_total만 덮는다(overflow 계수는 획 동안 누적).
    expect(TABLE_OFFSETS.frameClearBytes).toBe(8);
    expect(TABLE_OFFSETS.dabOverflow).toBeGreaterThanOrEqual(TABLE_OFFSETS.frameClearBytes);
    // 획 영역은 습식 영역 앞에서 끝난다.
    expect(TABLE_OFFSETS.poolOverflow).toBeLessThan(TABLE_OFFSETS.strokeResetBytes);
    expect(TABLE_OFFSETS.wetCursor).toBeGreaterThanOrEqual(TABLE_OFFSETS.strokeResetBytes);
    expect(TABLE_OFFSETS.strokeResetBytes % 4).toBe(0);
  });

  it("간접 디스패치 인자는 TileTable이 아닌 별도 버퍼이고 vec3<u32>가 16 B 간격이다", () => {
    const offsets = wgslStructOffsets(INDIRECT_MEMBERS);
    expect(offsets.get("dirty")).toBe(INDIRECT_OFFSETS.dirty);
    expect(offsets.get("stroke")).toBe(INDIRECT_OFFSETS.stroke);
    expect(offsets.get("wet")).toBe(INDIRECT_OFFSETS.wet);
    for (const off of Object.values(INDIRECT_OFFSETS)) expect(off % 16).toBe(0);
    expect(INDIRECT_BYTES).toBe(48);
    // dispatchWorkgroupsIndirect 인자는 TileTable 멤버에 없다(usage scope 규칙: INDIRECT와 쓰기 storage 겸용 금지).
    for (const [name] of TABLE_HEADER_MEMBERS) expect(name).not.toMatch(/indirect/);
  });

  it("Bins 버퍼 오프셋·크기", () => {
    expect(BINS_OFFSETS.counts).toBe(0);
    expect(BINS_OFFSETS.offsets).toBe(MAX_TILES * 4);
    expect(BINS_OFFSETS.blockSums).toBe(MAX_TILES * 8);
    // smudge 상태(2 × vec4)·dab별 운반 색(vec4 배열)은 모두 16 B 정렬이다.
    expect(BINS_OFFSETS.smudgeState).toBe(MAX_TILES * 8 + MAX_SCAN_BLOCKS * 4);
    expect(BINS_OFFSETS.picks).toBe(BINS_OFFSETS.smudgeState + 32);
    expect(BINS_OFFSETS.smudgeState % 16).toBe(0);
    expect(BINS_OFFSETS.picks % 16).toBe(0);
    expect(BINS_BYTES).toBe(BINS_OFFSETS.picks + MAX_DABS_PER_BATCH * 16);
    expect(DABS_BYTES).toBe(MAX_DABS_PER_BATCH * 64);
  });
});

describe("gpu/layout Params 인코딩", () => {
  const values = (): ParamsValues => {
    const base = {} as Record<string, number>;
    PARAMS_SCALARS.forEach(([name], i) => {
      base[name] = i + 0.5;
    });
    return { ...(base as Record<(typeof PARAMS_SCALARS)[number][0], number>), edgeCurve: [0, 0.25, 1] };
  };

  it("크기는 16의 배수이고 스칼라 뒤에 edge_curve 64샘플이 온다", () => {
    expect(PARAMS_BYTES % 16).toBe(0);
    expect(PARAMS_EDGE_CURVE_OFFSET % 16).toBe(0);
    expect(PARAMS_BYTES).toBe(PARAMS_EDGE_CURVE_OFFSET + PARAMS_EDGE_CURVE_SAMPLES * 4);
    expect(INST_PARAMS_BYTES).toBe(Math.ceil((INST_PARAMS_SCALARS.length * 4) / 16) * 16 + PARAMS_EDGE_CURVE_SAMPLES * 4);
  });

  it("u32는 절삭, f32는 fround로 기록된다", () => {
    const buf = encodeParams(values());
    const view = new DataView(buf);
    PARAMS_SCALARS.forEach(([, type], i) => {
      if (type === "u32") expect(view.getUint32(i * 4, true)).toBe(i);
      else expect(view.getFloat32(i * 4, true)).toBe(Math.fround(i + 0.5));
    });
    expect(view.getFloat32(PARAMS_EDGE_CURVE_OFFSET + 4, true)).toBe(0.25);
    expect(view.getFloat32(PARAMS_EDGE_CURVE_OFFSET + 8, true)).toBe(1);
    expect(view.getFloat32(PARAMS_EDGE_CURVE_OFFSET + 12, true)).toBe(0);
  });

  it("edge_curve: 64점 이하는 그대로, 초과는 64점 재표본", () => {
    const short = packEdgeCurve([0, 1]);
    expect(short[0]).toBe(0);
    expect(short[1]).toBe(1);
    expect(short[2]).toBe(0);
    const long = Array.from({ length: 100 }, (_, i) => i / 99);
    const packed = packEdgeCurve(long);
    expect(packed.length).toBe(PARAMS_EDGE_CURVE_SAMPLES);
    expect(packed[0]).toBe(0);
    expect(packed[63]).toBeCloseTo(1, 6);
    expect(edgeCurveLength(long)).toBe(64);
    expect(edgeCurveLength([0, 1])).toBe(2);
  });

  it("sampleCurveLinear는 core/curve evalCurve와 같다", () => {
    const curve = [0, 0.1, 0.5, 0.55, 1];
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      expect(sampleCurveLinear(curve, t)).toBe(evalCurve(curve, t));
    }
    expect(sampleCurveLinear([], 0.5)).toBe(0);
    expect(sampleCurveLinear([0.7], 0.5)).toBe(0.7);
  });

  it("항등 곡선 판정", () => {
    expect(isIdentityEdgeCurve([0, 1])).toBe(true);
    expect(isIdentityEdgeCurve([0, 0.5, 1])).toBe(true);
    expect(isIdentityEdgeCurve([0, 0.6, 1])).toBe(false);
  });
});

describe("gpu/layout 산식", () => {
  it("타일 격자·워크그룹·풀 크기", () => {
    expect(tileGrid(256, 256)).toEqual({ tilesX: 16, tilesY: 16, tileCount: 256 });
    expect(tileGrid(100, 50)).toEqual({ tilesX: 7, tilesY: 4, tileCount: 28 });
    expect(workgroupsFor(0, 256)).toBe(1);
    expect(workgroupsFor(257, 256)).toBe(2);
    expect(strokePoolBytes(10)).toBe(10 * 256 * 16);
    expect(wetPoolBytes(10)).toBe(10 * 12 * 256 * 4 * 2);
    expect(documentBytes(64, 32)).toBe(64 * 32 * 16);
  });

  it("bytesPerRow 256 정렬·팁 아틀라스 레벨 크기", () => {
    expect(alignedBytesPerRow(1)).toBe(256);
    expect(alignedBytesPerRow(64)).toBe(256);
    expect(alignedBytesPerRow(65)).toBe(512);
    expect(tipAtlasLevelSize(0)).toEqual({ width: 512, height: 64, tile: 64 });
    expect(tipAtlasLevelSize(6)).toEqual({ width: 8, height: 1, tile: 1 });
  });
});
