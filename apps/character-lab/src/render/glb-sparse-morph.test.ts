/**
 * GLB morph sparse 정리(순수) — 합성 GLB로 무손실·결정성·멱등·건너뜀 사유를 확인한다.
 * 실제 Orion 패키지 왕복(엔진 export → 정리 → 다시 로드, 크기 수치)은 `babylon-glb-sparse-export.test.ts`가 한다.
 */
import { describe, expect, it } from "vitest";

import { parseGlb } from "../testing/minimal-glb";

import { describeSparseMorphReport, sparsifyGlbMorphTargets } from "./glb-sparse-morph";

const VERTICES = 120;

interface MorphSpec {
  readonly name: string;
  /** 정점 → 델타(없으면 0) */
  readonly deltas: ReadonlyMap<number, readonly [number, number, number]>;
}

interface BuildOptions {
  readonly morphs: readonly MorphSpec[];
  /** 위치 attribute를 morph accessor와 같은 accessor로 재사용(비-target 사용 시뮬레이션) */
  readonly reuseAccessorAsAttribute?: boolean;
  readonly externalUri?: boolean;
  readonly unknownChunk?: boolean;
  /** 이미지 bufferView(번호 재매김 확인용) */
  readonly embeddedImage?: boolean;
  readonly vertexCount?: number;
}

function pad4(length: number): number {
  return (length + 3) & ~3;
}

function buildGlb(options: BuildOptions): Uint8Array {
  const count = options.vertexCount ?? VERTICES;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) positions.set([i * 0.01, (i % 7) * 0.02, 0.5], i * 3);
  const indices = new Uint16Array(pad4((count - 2) * 3 * 2) / 2);
  for (let i = 0; i < count - 2; i += 1) indices.set([i, i + 1, i + 2], i * 3);
  const parts: Uint8Array[] = [];
  const views: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  let offset = 0;
  const push = (data: Uint8Array, extra: Record<string, unknown> = {}): number => {
    const start = pad4(offset);
    if (start > offset) parts.push(new Uint8Array(start - offset));
    parts.push(data);
    views.push({ buffer: 0, byteOffset: start, byteLength: data.byteLength, ...extra });
    offset = start + data.byteLength;
    return views.length - 1;
  };
  const posView = push(new Uint8Array(positions.buffer), { target: 34962 });
  accessors.push({ bufferView: posView, componentType: 5126, count, type: "VEC3", min: [0, 0, 0.5], max: [count * 0.01, 0.12, 0.5] });
  const idxView = push(new Uint8Array(indices.buffer), { target: 34963 });
  accessors.push({ bufferView: idxView, componentType: 5123, count: (count - 2) * 3, type: "SCALAR" });
  const targets: Array<{ POSITION: number }> = [];
  for (const morph of options.morphs) {
    const dense = new Float32Array(count * 3);
    for (const [vertex, delta] of morph.deltas) dense.set(delta, vertex * 3);
    const view = push(new Uint8Array(dense.buffer));
    const min = [0, 0, 0];
    const max = [0, 0, 0];
    for (let i = 0; i < count; i += 1) {
      for (let c = 0; c < 3; c += 1) {
        min[c] = Math.min(min[c] ?? 0, dense[i * 3 + c] ?? 0);
        max[c] = Math.max(max[c] ?? 0, dense[i * 3 + c] ?? 0);
      }
    }
    accessors.push({ bufferView: view, componentType: 5126, count, type: "VEC3", min, max });
    targets.push({ POSITION: accessors.length - 1 });
  }
  const attributes: Record<string, number> = { POSITION: options.reuseAccessorAsAttribute && targets[0] ? targets[0].POSITION : 0 };
  const images: Array<Record<string, unknown>> = [];
  if (options.embeddedImage) {
    const imageView = push(new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]));
    images.push({ bufferView: imageView, mimeType: "image/png" });
  }
  const json: Record<string, unknown> = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Body", mesh: 0 }],
    meshes: [{ name: "Body", primitives: [{ attributes, indices: 1, targets }], extras: { targetNames: options.morphs.map((morph) => morph.name) } }],
    accessors,
    bufferViews: views,
    buffers: [options.externalUri ? { byteLength: offset, uri: "x.bin" } : { byteLength: offset }],
    ...(images.length > 0 ? { images } : {}),
  };
  const bin = new Uint8Array(pad4(offset));
  let cursor = 0;
  for (const part of parts) {
    bin.set(part, cursor);
    cursor += part.byteLength;
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(jsonBytes.byteLength);
  const extraChunk = options.unknownChunk ? 12 : 0;
  const total = 12 + 8 + jsonLength + 8 + bin.byteLength + extraChunk;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  const binAt = 20 + jsonLength;
  view.setUint32(binAt, bin.byteLength, true);
  view.setUint32(binAt + 4, 0x004e4942, true);
  out.set(bin, binAt + 8);
  if (options.unknownChunk) {
    view.setUint32(binAt + 8 + bin.byteLength, 4, true);
    view.setUint32(binAt + 8 + bin.byteLength + 4, 0x12345678, true);
  }
  return out;
}

interface Doc {
  accessors: Array<{ bufferView?: number; count: number; min?: number[]; max?: number[]; byteOffset?: number; sparse?: { count: number; indices: { bufferView: number; componentType: number }; values: { bufferView: number } } }>;
  bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number; target?: number }>;
  buffers: Array<{ byteLength: number }>;
  images?: Array<{ bufferView?: number }>;
  meshes: Array<{ primitives: Array<{ targets: Array<{ POSITION: number }> }> }>;
}

/** accessor를 dense float 배열로 복원(sparse·0 초기화 포함) — 독립 구현(테스트 기준) */
function materialize(glb: Uint8Array, accessorIndex: number): Float32Array {
  const parsed = parseGlb(glb);
  const doc = parsed.json as unknown as Doc;
  const bin = parsed.bin ?? new Uint8Array(0);
  const accessor = doc.accessors[accessorIndex];
  if (!accessor) throw new Error(`accessor ${accessorIndex} 없음`);
  const out = new Float32Array(accessor.count * 3);
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  if (accessor.bufferView !== undefined) {
    const view = doc.bufferViews[accessor.bufferView];
    if (!view) throw new Error("bufferView 없음");
    const stride = view.byteStride ?? 12;
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let i = 0; i < accessor.count; i += 1) for (let c = 0; c < 3; c += 1) out[i * 3 + c] = data.getFloat32(base + i * stride + c * 4, true);
  }
  if (accessor.sparse) {
    const indexView = doc.bufferViews[accessor.sparse.indices.bufferView];
    const valueView = doc.bufferViews[accessor.sparse.values.bufferView];
    if (!indexView || !valueView) throw new Error("sparse bufferView 없음");
    const wide = accessor.sparse.indices.componentType === 5125;
    let previous = -1;
    for (let k = 0; k < accessor.sparse.count; k += 1) {
      const at = (indexView.byteOffset ?? 0) + k * (wide ? 4 : 2);
      const vertex = wide ? data.getUint32(at, true) : data.getUint16(at, true);
      if (vertex <= previous) throw new Error("sparse 인덱스가 증가하지 않습니다.");
      previous = vertex;
      for (let c = 0; c < 3; c += 1) out[vertex * 3 + c] = data.getFloat32((valueView.byteOffset ?? 0) + (k * 3 + c) * 4, true);
    }
  }
  return out;
}

function spec(name: string, entries: ReadonlyArray<readonly [number, readonly [number, number, number]]>): MorphSpec {
  return { name, deltas: new Map(entries) };
}

const SPARSE_ENTRIES: ReadonlyArray<readonly [number, readonly [number, number, number]]> = Array.from({ length: 10 }, (_, k) => [k * 11, [0.01 * (k + 1), -0.02, 0.003 * k]] as const);
const DENSE_ENTRIES: ReadonlyArray<readonly [number, readonly [number, number, number]]> = Array.from({ length: 110 }, (_, k) => [k, [0.001 * (k + 1), 0.002, -0.001]] as const);

function standardGlb(): Uint8Array {
  return buildGlb({ morphs: [spec("sparse", SPARSE_ENTRIES), spec("zero", []), spec("dense", DENSE_ENTRIES)] });
}

function doc(glb: Uint8Array): Doc {
  return parseGlb(glb).json as unknown as Doc;
}

describe("sparsifyGlbMorphTargets", () => {
  it("변경 정점이 적은 morph는 sparse로, 전부 0이면 bufferView 없는 accessor로, 변경이 많으면 dense로 둔다", () => {
    const input = standardGlb();
    const { glb, report } = sparsifyGlbMorphTargets(input);
    const json = doc(glb);
    const targets = json.meshes[0]?.primitives[0]?.targets ?? [];
    const [sparse, zero, dense] = targets.map((target) => json.accessors[target.POSITION]);
    expect(sparse?.bufferView).toBeUndefined();
    expect(sparse?.sparse?.count).toBe(10);
    expect(sparse?.sparse?.indices.componentType).toBe(5123);
    expect(zero?.bufferView).toBeUndefined();
    expect(zero?.sparse).toBeUndefined();
    expect(dense?.bufferView).toBeDefined();
    expect(dense?.sparse).toBeUndefined();
    expect(report).toMatchObject({ morphAccessors: 3, sparsified: 1, zeroed: 1, keptDense: 1, unchanged: false });
    expect(report.changedVertices).toBe(10 + 110);
    expect(glb.byteLength).toBeLessThan(input.byteLength);
    expect(report.outputBytes).toBe(glb.byteLength);
    expect(report.inputBytes).toBe(input.byteLength);
  });

  it("무손실: 정리한 accessor를 복원하면 원본 dense와 바이트 단위로 같다", () => {
    const input = standardGlb();
    const { glb } = sparsifyGlbMorphTargets(input);
    const before = doc(input).meshes[0]?.primitives[0]?.targets ?? [];
    const after = doc(glb).meshes[0]?.primitives[0]?.targets ?? [];
    expect(after).toHaveLength(before.length);
    before.forEach((target, i) => {
      const expected = materialize(input, target.POSITION);
      const actual = materialize(glb, after[i]?.POSITION ?? -1);
      expect(Array.from(actual)).toEqual(Array.from(expected));
    });
    // 정점 위치 attribute는 그대로
    expect(Array.from(materialize(glb, 0))).toEqual(Array.from(materialize(input, 0)));
  });

  it("컨테이너가 유효하다: 길이·4바이트 정렬·bufferView 범위·buffers 길이·참조 번호", () => {
    const { glb } = sparsifyGlbMorphTargets(standardGlb());
    const parsed = parseGlb(glb);
    const json = parsed.json as unknown as Doc;
    expect(glb.byteLength % 4).toBe(0);
    expect(json.buffers[0]?.byteLength).toBe(parsed.bin?.byteLength);
    for (const view of json.bufferViews) {
      expect((view.byteOffset ?? 0) % 4).toBe(0);
      expect((view.byteOffset ?? 0) + view.byteLength).toBeLessThanOrEqual(parsed.bin?.byteLength ?? 0);
      expect(view.byteStride).toBeUndefined();
    }
    for (const accessor of json.accessors) {
      for (const index of [accessor.bufferView, accessor.sparse?.indices.bufferView, accessor.sparse?.values.bufferView]) {
        if (index !== undefined) expect(json.bufferViews[index]).toBeDefined();
      }
    }
  });

  it("결정적이고 멱등이다(두 번 정리해도 같은 바이트, 이미 sparse면 unchanged)", () => {
    const input = standardGlb();
    const first = sparsifyGlbMorphTargets(input);
    const again = sparsifyGlbMorphTargets(input);
    expect(Array.from(again.glb)).toEqual(Array.from(first.glb));
    const second = sparsifyGlbMorphTargets(first.glb);
    expect(second.report.unchanged).toBe(true);
    expect(second.glb).toBe(first.glb);
  });

  it("이미지 등 다른 bufferView 참조를 새 번호로 다시 매기고 바이트를 보존한다", () => {
    const input = buildGlb({ morphs: [spec("sparse", SPARSE_ENTRIES)], embeddedImage: true });
    const { glb, report } = sparsifyGlbMorphTargets(input);
    expect(report.sparsified).toBe(1);
    const json = doc(glb);
    const imageView = json.bufferViews[json.images?.[0]?.bufferView ?? -1];
    expect(imageView).toBeDefined();
    const bin = parseGlb(glb).bin ?? new Uint8Array(0);
    expect(Array.from(bin.subarray(imageView?.byteOffset ?? 0, (imageView?.byteOffset ?? 0) + (imageView?.byteLength ?? 0)))).toEqual([137, 80, 78, 71, 1, 2, 3, 4]);
  });

  it("정점 수가 65535를 넘으면 인덱스를 UNSIGNED_INT로 쓴다", () => {
    const entries: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
      [3, [0.1, 0, 0]],
      [70000, [0, 0.2, 0]],
      [70001, [0, 0, 0.3]],
    ];
    const input = buildGlb({ morphs: [spec("big", entries)], vertexCount: 70010 });
    const { glb } = sparsifyGlbMorphTargets(input);
    const json = doc(glb);
    const accessor = json.accessors[json.meshes[0]?.primitives[0]?.targets[0]?.POSITION ?? -1];
    expect(accessor?.sparse?.indices.componentType).toBe(5125);
    expect(Array.from(materialize(glb, json.meshes[0]?.primitives[0]?.targets[0]?.POSITION ?? -1))).toEqual(Array.from(materialize(input, doc(input).meshes[0]?.primitives[0]?.targets[0]?.POSITION ?? -1)));
  });

  it("morph target가 없으면 입력을 그대로 돌려준다", () => {
    const input = buildGlb({ morphs: [] });
    const { glb, report } = sparsifyGlbMorphTargets(input);
    expect(glb).toBe(input);
    expect(report).toMatchObject({ unchanged: true, morphAccessors: 0 });
    expect(describeSparseMorphReport(report)).toContain("바꿀 것이 없습니다");
  });

  it("손실 모드(threshold)는 작은 델타를 버리고 min/max를 다시 계산한다", () => {
    const entries: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
      [1, [1e-9, 0, 0]],
      [2, [0.05, 0, 0]],
      [3, [0, -0.04, 0]],
    ];
    const input = buildGlb({ morphs: [spec("tiny", entries)] });
    const lossless = sparsifyGlbMorphTargets(input);
    expect(lossless.report.changedVertices).toBe(3);
    const lossy = sparsifyGlbMorphTargets(input, { threshold: 1e-6 });
    expect(lossy.report.changedVertices).toBe(2);
    const json = doc(lossy.glb);
    const accessor = json.accessors[json.meshes[0]?.primitives[0]?.targets[0]?.POSITION ?? -1];
    expect(accessor?.sparse?.count).toBe(2);
    expect(accessor?.max?.[0]).toBeCloseTo(0.05, 6);
    expect(accessor?.min?.[1]).toBeCloseTo(-0.04, 6);
    const values = materialize(lossy.glb, json.meshes[0]?.primitives[0]?.targets[0]?.POSITION ?? -1);
    expect(values[3]).toBe(0);
  });

  it("건너뜀: 비-target 사용·외부 buffer·알 수 없는 청크·GLB가 아닌 입력은 원본을 돌려주고 사유를 남긴다", () => {
    const shared = buildGlb({ morphs: [spec("sparse", SPARSE_ENTRIES)], reuseAccessorAsAttribute: true });
    const sharedResult = sparsifyGlbMorphTargets(shared);
    expect(sharedResult.glb).toBe(shared);
    expect(sharedResult.report.skipped[0]?.reasonKo).toContain("morph target 밖에서도");

    const external = buildGlb({ morphs: [spec("sparse", SPARSE_ENTRIES)], externalUri: true });
    expect(sparsifyGlbMorphTargets(external).report.skipped[0]?.reasonKo).toContain("외부 buffer");

    const unknown = buildGlb({ morphs: [spec("sparse", SPARSE_ENTRIES)], unknownChunk: true });
    const unknownResult = sparsifyGlbMorphTargets(unknown);
    expect(unknownResult.glb).toBe(unknown);
    expect(unknownResult.report.skipped[0]?.reasonKo).toContain("알 수 없는 GLB 청크");

    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const garbageResult = sparsifyGlbMorphTargets(garbage);
    expect(garbageResult.glb).toBe(garbage);
    expect(garbageResult.report.skipped[0]?.reasonKo).toContain("magic");
  });

  it("describeSparseMorphReport는 한글 요약을 만든다", () => {
    const { report } = sparsifyGlbMorphTargets(standardGlb());
    const text = describeSparseMorphReport(report);
    expect(text).toContain("sparse 1개");
    expect(text).toContain("전부 0 1개");
    expect(text).toContain("dense 유지 1개");
  });
});
