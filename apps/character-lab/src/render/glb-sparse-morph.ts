/**
 * GLB morph target 용량 정리(순수 후처리). Babylon `GLTF2Export`는 morph target 델타를 **dense** accessor(정점 수 × 12바이트)로 쓰는데,
 * 체형·얼굴·표정 morph는 영향 영역이 국소적이라 대부분의 정점이 변하지 않는다. 변경량이 0인 정점을 glTF 2.0 core의 **sparse accessor**
 * (`accessor.sparse` = 변경 정점 인덱스 + 값, 나머지는 0)로 바꾸고 전부 0인 타깃은 bufferView 없는 accessor(= 0 초기화)로 만든 뒤,
 * 더 이상 참조되지 않는 dense bufferView를 BIN 청크에서 빼 파일 크기를 줄인다.
 *
 * 실측(2026-10-01): 제작 패키지 Orion 원본 GLB는 4.05 MB(sparse accessor 166개, Blender 내보내기)인데 엔진에서 다시 내보내면 12.96 MB(sparse 0)였고,
 * 이 정리 뒤에는 원본 크기에 가깝다(`glb-sparse-morph.test.ts`가 실제 Orion 왕복으로 수치를 단언).
 *
 * 보장·한계
 * - 기본(threshold 0)은 **무손실**이다: 델타가 정확히 0인 정점만 뺀다. `threshold > 0`이면 그 이하 델타를 0으로 버리는 손실 모드이며 min/max를 다시 계산한다.
 * - 변환 대상: buffer 0(GLB 내장), float VEC3, 비정규화, bufferView가 압축 확장(EXT_meshopt_compression 등)이 아니고 다른 용도(속성·인덱스·애니메이션·스킨)로 쓰이지 않는 morph target accessor.
 * - 안 되는 것(건너뛰고 사유를 report.skipped에 남긴다): 이미 sparse인 accessor, bufferView를 다른 accessor와 공유(바이트를 뺄 수 없어 이득 없음),
 *   압축 확장 bufferView, 외부 buffer(uri)·다중 buffer GLB 전체, 알 수 없는 청크가 있는 GLB 전체. 이득이 없으면(변경 정점이 많아 sparse가 더 큼) dense로 둔다.
 * - 정점 속성(위치·법선 등)·인덱스·텍스처·스킨은 건드리지 않는다. 바이트 그대로 복사한 뒤 bufferView 번호만 다시 매긴다.
 * - 정리는 export 직후 한 번 하며 같은 입력은 같은 바이트를 낸다(결정적).
 */

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_SHORT = 5123;
const COMPONENT_UNSIGNED_INT = 5125;
const VEC3_BYTES = 12;
const ALIGN = 4;

export interface SparseMorphOptions {
  /** 이 값 이하의 |델타|는 0으로 본다(기본 0 = 무손실). */
  readonly threshold?: number;
}

export interface SparseMorphSkip {
  /** 건너뛴 accessor 번호(전체 건너뜀이면 -1) */
  readonly accessor: number;
  readonly reasonKo: string;
}

export interface SparseMorphReport {
  readonly inputBytes: number;
  readonly outputBytes: number;
  /** morph target이 참조하는 서로 다른 accessor 수 */
  readonly morphAccessors: number;
  /** sparse로 바꾼 수 */
  readonly sparsified: number;
  /** 전부 0이라 bufferView 없는 accessor로 바꾼 수 */
  readonly zeroed: number;
  /** 변경 정점이 많아 sparse가 더 크거나 같아 dense로 둔 수 */
  readonly keptDense: number;
  readonly skipped: readonly SparseMorphSkip[];
  /** 변환 대상 morph accessor의 dense 바이트 합(정리 전) */
  readonly morphDenseBytesBefore: number;
  /** 같은 accessor들의 정리 후 바이트 합(sparse 인덱스·값) */
  readonly morphBytesAfter: number;
  /** 변환 대상 정점 수 합과 그중 변경 정점 수 합 */
  readonly totalVertices: number;
  readonly changedVertices: number;
  /** 입력이 이미 정리 대상이 아니거나 건너뛰어 바이트를 바꾸지 않았는지 */
  readonly unchanged: boolean;
}

export interface SparseMorphResult {
  readonly glb: Uint8Array;
  readonly report: SparseMorphReport;
}

interface GltfSparse {
  count: number;
  indices: { bufferView: number; componentType: number; byteOffset?: number };
  values: { bufferView: number; byteOffset?: number };
}

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
  sparse?: GltfSparse;
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
  extensions?: Record<string, unknown>;
}

interface GltfPrimitive {
  attributes?: Record<string, number>;
  indices?: number;
  targets?: Array<Record<string, number>>;
}

interface GltfDocument {
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: Array<{ byteLength: number; uri?: string }>;
  meshes?: Array<{ primitives?: GltfPrimitive[] }>;
  skins?: Array<{ inverseBindMatrices?: number }>;
  animations?: Array<{ samplers?: Array<{ input: number; output: number }> }>;
  [key: string]: unknown;
}

interface ParsedContainer {
  readonly json: GltfDocument;
  readonly bin: Uint8Array;
}

function pad(length: number): number {
  return (length + (ALIGN - 1)) & ~(ALIGN - 1);
}

/** GLB 컨테이너를 JSON·BIN으로 나눈다. 구조가 이 정리가 다룰 수 있는 형태가 아니면 사유 문자열을 돌려준다. */
function parseContainer(bytes: Uint8Array): ParsedContainer | string {
  if (bytes.byteLength < 20) return "GLB가 너무 짧습니다.";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return "GLB magic이 아닙니다.";
  if (view.getUint32(4, true) !== GLB_VERSION) return `지원하지 않는 GLB 버전(${view.getUint32(4, true)})입니다.`;
  if (view.getUint32(8, true) !== bytes.byteLength) return "GLB 헤더 길이가 실제 길이와 다릅니다.";
  let offset = 12;
  let jsonText: string | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > bytes.byteLength) return "GLB 청크가 파일 끝을 넘습니다.";
    if (type === CHUNK_JSON && jsonText === null) jsonText = new TextDecoder().decode(bytes.subarray(start, start + length));
    else if (type === CHUNK_BIN && bin === null) bin = bytes.subarray(start, start + length);
    else return "알 수 없는 GLB 청크가 있어 정리하지 않습니다.";
    offset = start + length;
  }
  if (jsonText === null) return "GLB에 JSON 청크가 없습니다.";
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return "GLB JSON을 읽지 못했습니다.";
  }
  if (typeof parsed !== "object" || parsed === null) return "GLB JSON이 객체가 아닙니다.";
  return { json: parsed as GltfDocument, bin: bin ?? new Uint8Array(0) };
}

/** accessor → 참조 횟수가 morph target 밖에서 쓰이는지(속성·인덱스·스킨·애니메이션) */
function nonTargetAccessorRefs(json: GltfDocument): Set<number> {
  const used = new Set<number>();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const index of Object.values(primitive.attributes ?? {})) used.add(index);
      if (primitive.indices !== undefined) used.add(primitive.indices);
    }
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) used.add(skin.inverseBindMatrices);
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      used.add(sampler.input);
      used.add(sampler.output);
    }
  }
  return used;
}

/** 문서 전체에서 `bufferView` 키로 참조되는 번호(accessor·sparse·images·확장 포함) */
function collectBufferViewRefs(node: unknown, out: Map<number, number>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectBufferViewRefs(item, out);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "bufferView" && typeof value === "number") out.set(value, (out.get(value) ?? 0) + 1);
    else collectBufferViewRefs(value, out);
  }
}

function remapBufferViewRefs(node: unknown, map: ReadonlyMap<number, number>): void {
  if (Array.isArray(node)) {
    for (const item of node) remapBufferViewRefs(item, map);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === "bufferView" && typeof value === "number") {
      const mapped = map.get(value);
      if (mapped === undefined) throw new Error(`bufferView ${value}가 제거됐는데 참조가 남아 있습니다.`);
      record[key] = mapped;
    } else {
      remapBufferViewRefs(value, map);
    }
  }
}

interface Conversion {
  readonly accessorIndex: number;
  readonly kind: "sparse" | "zero";
  readonly indices: Uint32Array;
  /** 변경 정점의 값(정점 × 3 float32) */
  readonly values: Float32Array;
  readonly denseBytes: number;
}

function readDense(bin: Uint8Array, accessor: GltfAccessor, view: GltfBufferView): { nonzero: Uint32Array; values: Float32Array } | string {
  const stride = view.byteStride ?? VEC3_BYTES;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = base + (accessor.count - 1) * stride + VEC3_BYTES;
  if (accessor.count < 1 || end > bin.byteLength || base < 0) return "accessor 범위가 BIN 청크를 벗어납니다.";
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const indices: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const at = base + i * stride;
    const x = data.getFloat32(at, true);
    const y = data.getFloat32(at + 4, true);
    const z = data.getFloat32(at + 8, true);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return "NaN·무한대 델타가 있어 변환하지 않습니다.";
    if (x !== 0 || y !== 0 || z !== 0) {
      indices.push(i);
      values.push(x, y, z);
    }
  }
  return { nonzero: Uint32Array.from(indices), values: Float32Array.from(values) };
}

/** threshold 이하 델타를 가진 정점을 변경 목록에서 뺀다(손실 모드). */
function applyThreshold(found: { nonzero: Uint32Array; values: Float32Array }, threshold: number): { nonzero: Uint32Array; values: Float32Array } {
  if (!(threshold > 0)) return found;
  const indices: number[] = [];
  const values: number[] = [];
  found.nonzero.forEach((index, k) => {
    const x = found.values[k * 3] ?? 0;
    const y = found.values[k * 3 + 1] ?? 0;
    const z = found.values[k * 3 + 2] ?? 0;
    if (Math.abs(x) > threshold || Math.abs(y) > threshold || Math.abs(z) > threshold) {
      indices.push(index);
      values.push(x, y, z);
    }
  });
  return { nonzero: Uint32Array.from(indices), values: Float32Array.from(values) };
}

function recomputeMinMax(accessor: GltfAccessor, found: { nonzero: Uint32Array; values: Float32Array }): void {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  if (found.nonzero.length < accessor.count) {
    for (let c = 0; c < 3; c += 1) {
      min[c] = 0;
      max[c] = 0;
    }
  }
  for (let k = 0; k < found.nonzero.length; k += 1) {
    for (let c = 0; c < 3; c += 1) {
      const value = found.values[k * 3 + c] ?? 0;
      min[c] = Math.min(min[c] ?? Infinity, value);
      max[c] = Math.max(max[c] ?? -Infinity, value);
    }
  }
  accessor.min = min.map((value) => (Number.isFinite(value) ? value : 0));
  accessor.max = max.map((value) => (Number.isFinite(value) ? value : 0));
}

function emptyReport(inputBytes: number, outputBytes: number, skipped: readonly SparseMorphSkip[], morphAccessors = 0): SparseMorphReport {
  return { inputBytes, outputBytes, morphAccessors, sparsified: 0, zeroed: 0, keptDense: 0, skipped, morphDenseBytesBefore: 0, morphBytesAfter: 0, totalVertices: 0, changedVertices: 0, unchanged: true };
}

/**
 * GLB의 morph target dense accessor를 sparse로 정리한다. 변환할 것이 없으면 입력 바이트를 그대로 돌려준다(`report.unchanged`).
 * 형식 오류·지원 밖 구조는 throw하지 않고 원본을 돌려주며 사유를 `report.skipped`에 남긴다(내보내기가 실패하지 않게).
 */
export function sparsifyGlbMorphTargets(glb: Uint8Array, options: SparseMorphOptions = {}): SparseMorphResult {
  const threshold = options.threshold ?? 0;
  const container = parseContainer(glb);
  if (typeof container === "string") return { glb, report: emptyReport(glb.byteLength, glb.byteLength, [{ accessor: -1, reasonKo: container }]) };
  const { json, bin } = container;
  const accessors = json.accessors ?? [];
  const views = json.bufferViews ?? [];
  const skipAll = (reasonKo: string): SparseMorphResult => ({ glb, report: emptyReport(glb.byteLength, glb.byteLength, [{ accessor: -1, reasonKo }]) });
  if ((json.buffers?.length ?? 0) > 1) return skipAll("buffer가 둘 이상이라 정리하지 않습니다.");
  if (json.buffers?.[0]?.uri !== undefined) return skipAll("외부 buffer(uri)를 쓰는 glTF라 정리하지 않습니다(GLB 내장 buffer만 대상).");
  if (views.some((view) => view.buffer !== 0)) return skipAll("buffer 0이 아닌 bufferView가 있어 정리하지 않습니다.");

  // ---- morph target accessor 수집
  const targetAccessors = new Set<number>();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) for (const target of primitive.targets ?? []) for (const index of Object.values(target)) targetAccessors.add(index);
  }
  if (targetAccessors.size === 0) return { glb, report: emptyReport(glb.byteLength, glb.byteLength, [], 0) };
  const otherUse = nonTargetAccessorRefs(json);
  const viewUseByAccessor = new Map<number, number[]>();
  accessors.forEach((accessor, index) => {
    if (accessor.bufferView === undefined) return;
    const list = viewUseByAccessor.get(accessor.bufferView) ?? [];
    list.push(index);
    viewUseByAccessor.set(accessor.bufferView, list);
  });
  const refCounts = new Map<number, number>();
  collectBufferViewRefs(json, refCounts);

  const skipped: SparseMorphSkip[] = [];
  const conversions: Conversion[] = [];
  let keptDense = 0;
  let morphDenseBytesBefore = 0;
  let totalVertices = 0;
  let changedVertices = 0;
  const sortedTargets = [...targetAccessors].sort((a, b) => a - b);
  for (const index of sortedTargets) {
    const accessor = accessors[index];
    const skip = (reasonKo: string): void => {
      skipped.push({ accessor: index, reasonKo });
    };
    if (!accessor) {
      skip("accessor 번호가 범위를 벗어납니다.");
      continue;
    }
    if (accessor.sparse !== undefined) {
      skip("이미 sparse accessor입니다.");
      continue;
    }
    if (accessor.bufferView === undefined) continue; // 이미 0 초기화 accessor
    if (accessor.componentType !== COMPONENT_FLOAT || accessor.type !== "VEC3" || accessor.normalized === true) {
      skip(`float VEC3가 아니라 변환하지 않습니다(${accessor.type}/${accessor.componentType}).`);
      continue;
    }
    if (otherUse.has(index)) {
      skip("morph target 밖에서도 쓰이는 accessor라 변환하지 않습니다.");
      continue;
    }
    const view = views[accessor.bufferView];
    if (!view) {
      skip("bufferView 번호가 범위를 벗어납니다.");
      continue;
    }
    if (view.extensions && Object.keys(view.extensions).length > 0) {
      skip(`압축·확장 bufferView(${Object.keys(view.extensions).join(", ")})라 변환하지 않습니다.`);
      continue;
    }
    const sharedBy = viewUseByAccessor.get(accessor.bufferView) ?? [];
    if (sharedBy.length > 1 || (refCounts.get(accessor.bufferView) ?? 0) > 1) {
      skip("bufferView를 다른 accessor·이미지와 공유해 바이트를 뺄 수 없습니다.");
      continue;
    }
    const dense = readDense(bin, accessor, view);
    if (typeof dense === "string") {
      skip(dense);
      continue;
    }
    const found = applyThreshold(dense, threshold);
    const denseBytes = accessor.count * VEC3_BYTES;
    morphDenseBytesBefore += denseBytes;
    totalVertices += accessor.count;
    changedVertices += found.nonzero.length;
    if (found.nonzero.length === 0) {
      conversions.push({ accessorIndex: index, kind: "zero", indices: found.nonzero, values: found.values, denseBytes });
      continue;
    }
    const indexBytes = accessor.count <= 0xffff ? 2 : 4;
    const sparseBytes = pad(found.nonzero.length * indexBytes) + pad(found.nonzero.length * VEC3_BYTES);
    if (sparseBytes >= denseBytes) {
      keptDense += 1;
      continue;
    }
    conversions.push({ accessorIndex: index, kind: "sparse", indices: found.nonzero, values: found.values, denseBytes });
    if (threshold > 0) recomputeMinMax(accessor, found);
  }
  if (conversions.length === 0) {
    return { glb, report: { ...emptyReport(glb.byteLength, glb.byteLength, skipped, targetAccessors.size), keptDense, morphDenseBytesBefore, totalVertices, changedVertices } };
  }

  // ---- 새 bufferView(sparse 인덱스·값)를 뒤에 붙이고 accessor를 바꾼다.
  const newViews: GltfBufferView[] = [...views];
  const extraBytes: Array<{ viewIndex: number; data: Uint8Array }> = [];
  let sparsified = 0;
  let zeroed = 0;
  let morphBytesAfter = 0;
  for (const conversion of conversions) {
    const accessor = accessors[conversion.accessorIndex] as GltfAccessor;
    delete accessor.bufferView;
    delete accessor.byteOffset;
    if (conversion.kind === "zero") {
      zeroed += 1;
      // 전부 0이면 min/max도 0이다(손실 모드에서 비웠을 때 stale 값을 남기지 않는다).
      accessor.min = [0, 0, 0];
      accessor.max = [0, 0, 0];
      continue;
    }
    sparsified += 1;
    const useShort = accessor.count <= 0xffff;
    const indexData = new Uint8Array(pad(conversion.indices.length * (useShort ? 2 : 4)));
    const indexView = new DataView(indexData.buffer);
    conversion.indices.forEach((vertex, k) => {
      if (useShort) indexView.setUint16(k * 2, vertex, true);
      else indexView.setUint32(k * 4, vertex, true);
    });
    const valueData = new Uint8Array(pad(conversion.values.length * 4));
    const valueView = new DataView(valueData.buffer);
    conversion.values.forEach((value, k) => valueView.setFloat32(k * 4, value, true));
    const indexViewIndex = newViews.length;
    newViews.push({ buffer: 0, byteOffset: 0, byteLength: conversion.indices.length * (useShort ? 2 : 4) });
    extraBytes.push({ viewIndex: indexViewIndex, data: indexData });
    const valueViewIndex = newViews.length;
    newViews.push({ buffer: 0, byteOffset: 0, byteLength: conversion.values.length * 4 });
    extraBytes.push({ viewIndex: valueViewIndex, data: valueData });
    accessor.sparse = {
      count: conversion.indices.length,
      indices: { bufferView: indexViewIndex, componentType: useShort ? COMPONENT_UNSIGNED_SHORT : COMPONENT_UNSIGNED_INT },
      values: { bufferView: valueViewIndex },
    };
    morphBytesAfter += indexData.byteLength + valueData.byteLength;
  }

  // ---- 참조가 남은 bufferView만 BIN에 다시 담는다(원래 순서 유지 → 새 view는 뒤).
  const finalRefs = new Map<number, number>();
  const docForRefs: GltfDocument = { ...json, bufferViews: undefined };
  collectBufferViewRefs(docForRefs, finalRefs);
  const keep: number[] = [];
  newViews.forEach((_view, index) => {
    if (finalRefs.has(index)) keep.push(index);
  });
  const map = new Map<number, number>();
  keep.forEach((oldIndex, newIndex) => map.set(oldIndex, newIndex));
  const extraByView = new Map(extraBytes.map((entry) => [entry.viewIndex, entry.data]));
  const segments: Array<{ view: GltfBufferView; data: Uint8Array }> = [];
  for (const oldIndex of keep) {
    const view = newViews[oldIndex] as GltfBufferView;
    const extra = extraByView.get(oldIndex);
    if (extra) {
      segments.push({ view: { ...view }, data: extra });
      continue;
    }
    const start = view.byteOffset ?? 0;
    if (start + view.byteLength > bin.byteLength) return skipAll("bufferView가 BIN 청크를 벗어나 정리하지 않습니다.");
    segments.push({ view: { ...view }, data: bin.subarray(start, start + view.byteLength) });
  }
  let cursor = 0;
  const placed = segments.map((segment) => {
    cursor = pad(cursor);
    const offset = cursor;
    cursor += segment.data.byteLength;
    return { ...segment, offset };
  });
  const newBin = new Uint8Array(pad(cursor));
  const nextViews: GltfBufferView[] = [];
  for (const entry of placed) {
    newBin.set(entry.data, entry.offset);
    nextViews.push({ ...entry.view, byteOffset: entry.offset, byteLength: entry.view.byteLength });
  }
  remapBufferViewRefs(json, map);
  json.bufferViews = nextViews;
  json.buffers = [{ byteLength: newBin.byteLength }];

  // ---- 컨테이너 직렬화(JSON 공백 패딩, BIN 0 패딩)
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad(jsonBytes.byteLength);
  const total = 12 + 8 + jsonLength + 8 + newBin.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, newBin.byteLength, true);
  view.setUint32(binHeader + 4, CHUNK_BIN, true);
  out.set(newBin, binHeader + 8);

  return {
    glb: out,
    report: {
      inputBytes: glb.byteLength,
      outputBytes: out.byteLength,
      morphAccessors: targetAccessors.size,
      sparsified,
      zeroed,
      keptDense,
      skipped,
      morphDenseBytesBefore,
      morphBytesAfter,
      totalVertices,
      changedVertices,
      unchanged: false,
    },
  };
}

/** 한글 한 줄 요약(능력 보고·문서용) */
export function describeSparseMorphReport(report: SparseMorphReport): string {
  const mb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (report.unchanged) {
    const reason = report.skipped[0]?.reasonKo;
    return report.morphAccessors === 0 ? "morph target가 없어 바꿀 것이 없습니다." : `정리하지 않았습니다(${reason ?? "이득이 없습니다"}).`;
  }
  const ratio = report.totalVertices > 0 ? Math.round((100 * report.changedVertices) / report.totalVertices) : 0;
  return `${mb(report.inputBytes)} → ${mb(report.outputBytes)} · sparse ${report.sparsified}개·전부 0 ${report.zeroed}개·dense 유지 ${report.keptDense}개·건너뜀 ${report.skipped.length}개 · 변경 정점 ${ratio}%`;
}
