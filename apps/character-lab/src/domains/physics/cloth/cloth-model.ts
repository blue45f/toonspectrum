/**
 * 클로스 스트립/그리드 compile(character-physics.md §4.1). rows × columns 입자 격자를
 * 구조(가로·세로)·전단(대각) 거리 제약과 (i, i+2) 굽힘 제약으로 컴파일한다. 핀 입자는 invMass 0이며
 * 본 월드 행렬 × pinOffsetLocal로 갱신한다. 예산 초과(스트립 > 4, 입자 > 2048)는 `budget-exceeded`.
 */
import { PHYSICS_BUDGET, failVisible } from "../../../contracts";
import { fnv1a64Hex } from "../../../shared/hash";
import { stableStringify } from "../../../shared/stable-json";

import type { ClothModel, LabFailure, Vec3 } from "../../../contracts";

const F = Math.fround;

export interface ClothPin {
  /** 스트립 로컬 입자 인덱스(row * columns + column) */
  readonly particle: number;
  /** 핀 본 인덱스(호출자 정의 본 목록 기준) */
  readonly bone: number;
  readonly offsetLocal: Vec3;
}

export interface ClothStripInput {
  readonly id: string;
  readonly columns: number;
  readonly rows: number;
  /** rows × columns × 3, row-major(위→아래) rest 위치 */
  readonly restPositions: Float32Array;
  readonly pins: readonly ClothPin[];
  /** 전단(대각) 제약 포함 여부(기본 true) */
  readonly shear?: boolean;
}

export interface ClothCompileOptions {
  readonly distanceCompliance?: number;
  readonly bendCompliance?: number;
}

export interface CompiledCloth {
  readonly model: ClothModel;
  readonly stripIds: readonly string[];
  readonly stripOffset: Uint32Array;
  readonly stripParticleCount: Uint32Array;
  readonly stripColumns: Uint32Array;
  readonly stripRows: Uint32Array;
  readonly restPositions: Float32Array;
  readonly distanceCompliance: number;
  readonly bendCompliance: number;
}

export type ClothCompileResult = { readonly ok: true; readonly compiled: CompiledCloth } | { readonly ok: false; readonly failure: LabFailure };

export interface ClothStripLayout {
  readonly origin: Vec3;
  /** 열 방향 단위 벡터(폭) */
  readonly right: Vec3;
  /** 행 방향 단위 벡터(길이, 보통 아래) */
  readonly down: Vec3;
  readonly width: number;
  readonly length: number;
  readonly columns: number;
  readonly rows: number;
}

/** 평면 격자 rest 위치(rows × columns × 3) */
export function buildClothStripLayout(layout: ClothStripLayout): Float32Array {
  const { columns, rows } = layout;
  const out = new Float32Array(rows * columns * 3);
  for (let r = 0; r < rows; r += 1) {
    const v = rows > 1 ? (r / (rows - 1)) * layout.length : 0;
    for (let c = 0; c < columns; c += 1) {
      const u = columns > 1 ? (c / (columns - 1)) * layout.width : 0;
      const i = (r * columns + c) * 3;
      out[i] = layout.origin[0] + layout.right[0] * u + layout.down[0] * v;
      out[i + 1] = layout.origin[1] + layout.right[1] * u + layout.down[1] * v;
      out[i + 2] = layout.origin[2] + layout.right[2] * u + layout.down[2] * v;
    }
  }
  return out;
}

function dist(positions: Float32Array, a: number, b: number): number {
  const dx = F(positions[b * 3] - positions[a * 3]);
  const dy = F(positions[b * 3 + 1] - positions[a * 3 + 1]);
  const dz = F(positions[b * 3 + 2] - positions[a * 3 + 2]);
  return F(Math.sqrt(F(F(F(dx * dx) + F(dy * dy)) + F(dz * dz))));
}

export function compileCloth(inputs: readonly ClothStripInput[], options: ClothCompileOptions = {}, now?: number): ClothCompileResult {
  const fail = (code: string, reasonKo: string): ClothCompileResult => ({ ok: false, failure: failVisible(code, reasonKo, undefined, now) });
  const sorted = [...inputs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (sorted.length > PHYSICS_BUDGET.maxClothStrips) {
    return fail("budget-exceeded", `클로스 스트립 수(${sorted.length})가 예산(${PHYSICS_BUDGET.maxClothStrips})을 넘습니다.`);
  }
  let total = 0;
  const seen = new Set<string>();
  for (const strip of sorted) {
    if (seen.has(strip.id)) return fail("cloth-invalid", `스트립 id "${strip.id}"가 중복됩니다.`);
    seen.add(strip.id);
    if (!Number.isInteger(strip.columns) || !Number.isInteger(strip.rows) || strip.columns < 2 || strip.rows < 2) {
      return fail("cloth-invalid", `스트립 "${strip.id}"의 격자(${strip.rows}×${strip.columns})는 2×2 이상이어야 합니다.`);
    }
    const count = strip.columns * strip.rows;
    if (strip.restPositions.length !== count * 3) {
      return fail("cloth-invalid", `스트립 "${strip.id}"의 restPositions 길이(${strip.restPositions.length})가 입자 수 ×3(${count * 3})과 다릅니다.`);
    }
    for (let i = 0; i < strip.restPositions.length; i += 1) {
      if (!Number.isFinite(strip.restPositions[i])) return fail("cloth-invalid", `스트립 "${strip.id}"의 restPositions에 NaN이 있습니다.`);
    }
    for (const pin of strip.pins) {
      if (!Number.isInteger(pin.particle) || pin.particle < 0 || pin.particle >= count) {
        return fail("cloth-invalid", `스트립 "${strip.id}"의 핀 입자 ${pin.particle}이 범위를 벗어납니다.`);
      }
      if (!Number.isInteger(pin.bone) || pin.bone < 0 || pin.bone > 0xffff) {
        return fail("cloth-invalid", `스트립 "${strip.id}"의 핀 본 인덱스 ${pin.bone}이 0..65535를 벗어납니다.`);
      }
    }
    total += count;
  }
  if (total > PHYSICS_BUDGET.maxClothParticles) {
    return fail("budget-exceeded", `클로스 입자 수(${total})가 예산(${PHYSICS_BUDGET.maxClothParticles})을 넘습니다.`);
  }
  const distanceCompliance = options.distanceCompliance ?? 0;
  const bendCompliance = options.bendCompliance ?? 1e-5;
  if (!(distanceCompliance >= 0) || !(bendCompliance >= 0)) return fail("cloth-invalid", "compliance는 0 이상이어야 합니다.");

  const invMass = new Float32Array(total);
  const restPositions = new Float32Array(total * 3);
  const edges: number[] = [];
  const edgeRest: number[] = [];
  const bendPairs: number[] = [];
  const bendRest: number[] = [];
  const pins: number[] = [];
  const pinBones: number[] = [];
  const pinOffsets: number[] = [];
  const tris: number[] = [];
  const stripIds: string[] = [];
  const stripOffset = new Uint32Array(sorted.length);
  const stripParticleCount = new Uint32Array(sorted.length);
  const stripColumns = new Uint32Array(sorted.length);
  const stripRows = new Uint32Array(sorted.length);

  let offset = 0;
  sorted.forEach((strip, s) => {
    const { columns, rows } = strip;
    const count = columns * rows;
    stripIds.push(strip.id);
    stripOffset[s] = offset;
    stripParticleCount[s] = count;
    stripColumns[s] = columns;
    stripRows[s] = rows;
    restPositions.set(strip.restPositions, offset * 3);
    for (let i = 0; i < count; i += 1) invMass[offset + i] = 1;
    const pinned = new Set<number>();
    const sortedPins = [...strip.pins].sort((a, b) => a.particle - b.particle);
    for (const pin of sortedPins) {
      if (pinned.has(pin.particle)) continue;
      pinned.add(pin.particle);
      invMass[offset + pin.particle] = 0;
      pins.push(offset + pin.particle);
      pinBones.push(pin.bone);
      pinOffsets.push(pin.offsetLocal[0], pin.offsetLocal[1], pin.offsetLocal[2]);
    }
    const index = (r: number, c: number): number => offset + r * columns + c;
    const shear = strip.shear ?? true;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const a = index(r, c);
        if (c + 1 < columns) {
          const b = index(r, c + 1);
          edges.push(a, b);
          edgeRest.push(dist(restPositions, a, b));
        }
        if (r + 1 < rows) {
          const b = index(r + 1, c);
          edges.push(a, b);
          edgeRest.push(dist(restPositions, a, b));
        }
        if (shear && r + 1 < rows && c + 1 < columns) {
          const d1 = index(r + 1, c + 1);
          edges.push(a, d1);
          edgeRest.push(dist(restPositions, a, d1));
          const a2 = index(r, c + 1);
          const d2 = index(r + 1, c);
          edges.push(a2, d2);
          edgeRest.push(dist(restPositions, a2, d2));
        }
        if (c + 2 < columns) {
          const b = index(r, c + 2);
          bendPairs.push(a, b);
          bendRest.push(dist(restPositions, a, b));
        }
        if (r + 2 < rows) {
          const b = index(r + 2, c);
          bendPairs.push(a, b);
          bendRest.push(dist(restPositions, a, b));
        }
        if (r + 1 < rows && c + 1 < columns) {
          const b = index(r, c + 1);
          const d = index(r + 1, c);
          const e = index(r + 1, c + 1);
          tris.push(a, d, b, b, d, e);
        }
      }
    }
    offset += count;
  });

  const modelHash = fnv1a64Hex(
    stableStringify({
      strips: sorted.map((strip) => ({
        id: strip.id,
        columns: strip.columns,
        rows: strip.rows,
        rest: Array.from(strip.restPositions, (v) => F(v)),
        pins: strip.pins,
        shear: strip.shear ?? true,
      })),
      distanceCompliance,
      bendCompliance,
    }),
  );

  return {
    ok: true,
    compiled: {
      model: {
        particleCount: total,
        invMass,
        edge: Uint32Array.from(edges),
        edgeRest: Float32Array.from(edgeRest),
        bendPair: Uint32Array.from(bendPairs),
        bendRest: Float32Array.from(bendRest),
        pin: Uint32Array.from(pins),
        pinBone: Uint16Array.from(pinBones),
        pinOffsetLocal: Float32Array.from(pinOffsets),
        tri: Uint32Array.from(tris),
        modelHash,
      },
      stripIds,
      stripOffset,
      stripParticleCount,
      stripColumns,
      stripRows,
      restPositions,
      distanceCompliance,
      bendCompliance,
    },
  };
}

export interface ClothState {
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  readonly stepIndex: number;
}

export function createClothState(compiled: CompiledCloth): ClothState {
  return { pos: new Float32Array(compiled.restPositions), prev: new Float32Array(compiled.restPositions), stepIndex: 0 };
}
