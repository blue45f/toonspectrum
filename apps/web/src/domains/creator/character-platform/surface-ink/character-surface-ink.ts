export type CharacterInkVector2 = readonly [number, number];
export type CharacterInkVector3 = readonly [number, number, number];
export type CharacterInkVector4 = readonly [number, number, number, number];

export interface CharacterSurfaceInkAnchor {
  readonly meshAssetId: string;
  readonly topologyRevision: string;
  readonly primitiveIndex: number;
  readonly triangleIndex: number;
  readonly barycentric: CharacterInkVector3;
  readonly localNormal: CharacterInkVector3;
  readonly localTangent: CharacterInkVector3;
  readonly skinIndices: CharacterInkVector4;
  readonly skinWeights: CharacterInkVector4;
  readonly pressure: number;
  readonly width: number;
}

export interface CharacterSurfaceInkStyle {
  readonly color: string;
  readonly widthMode: "surface" | "screen";
  readonly baseWidth: number;
  readonly opacity: number;
  readonly taperStart: number;
  readonly taperEnd: number;
  readonly pressureWidth: number;
  readonly pressureOpacity: number;
  readonly smoothing: number;
  readonly surfaceOffset: number;
  readonly cap: "round" | "square";
  readonly join: "round" | "bevel";
  readonly frontFacesOnly: boolean;
}

export interface CharacterSurfaceInkStroke {
  readonly strokeId: string;
  readonly meshAssetId: string;
  readonly topologyRevision: string;
  readonly anchors: readonly CharacterSurfaceInkAnchor[];
  readonly style: CharacterSurfaceInkStyle;
  readonly status: "valid" | "needs-reprojection" | "orphaned";
}

export interface CharacterSurfaceInkLayer {
  readonly layerId: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: "normal" | "multiply";
  readonly strokes: readonly CharacterSurfaceInkStroke[];
}

export interface CharacterSurfaceInkDocument {
  readonly version: 1;
  readonly layers: readonly CharacterSurfaceInkLayer[];
}

export interface CharacterTriangleSurface {
  readonly positions: readonly [CharacterInkVector3, CharacterInkVector3, CharacterInkVector3];
  readonly normals: readonly [CharacterInkVector3, CharacterInkVector3, CharacterInkVector3];
  readonly skinIndices: readonly [CharacterInkVector4, CharacterInkVector4, CharacterInkVector4];
  readonly skinWeights: readonly [CharacterInkVector4, CharacterInkVector4, CharacterInkVector4];
}

export interface CharacterSurfaceInkRibbon {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly skinIndices: Uint16Array;
  readonly skinWeights: Float32Array;
  readonly indices: Uint32Array;
  readonly bounds: {
    readonly minimum: CharacterInkVector3;
    readonly maximum: CharacterInkVector3;
  };
}

const EPSILON = 1e-7;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function add(left: CharacterInkVector3, right: CharacterInkVector3): CharacterInkVector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: CharacterInkVector3, right: CharacterInkVector3): CharacterInkVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(value: CharacterInkVector3, scalar: number): CharacterInkVector3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function length(value: CharacterInkVector3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: CharacterInkVector3, fallback: CharacterInkVector3 = [0, 1, 0]): CharacterInkVector3 {
  const magnitude = length(value);
  return magnitude < EPSILON || !Number.isFinite(magnitude)
    ? fallback
    : [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
}

function cross(left: CharacterInkVector3, right: CharacterInkVector3): CharacterInkVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function distance(left: CharacterInkVector3, right: CharacterInkVector3): number {
  return length(subtract(left, right));
}

function barycentricVector3(values: readonly [CharacterInkVector3, CharacterInkVector3, CharacterInkVector3], barycentric: CharacterInkVector3): CharacterInkVector3 {
  return [
    values[0][0] * barycentric[0] + values[1][0] * barycentric[1] + values[2][0] * barycentric[2],
    values[0][1] * barycentric[0] + values[1][1] * barycentric[1] + values[2][1] * barycentric[2],
    values[0][2] * barycentric[0] + values[1][2] * barycentric[1] + values[2][2] * barycentric[2],
  ];
}

function normalizedBarycentric(value: CharacterInkVector3): CharacterInkVector3 {
  const clamped: CharacterInkVector3 = [
    Math.max(0, value[0]),
    Math.max(0, value[1]),
    Math.max(0, value[2]),
  ];
  const total = clamped[0] + clamped[1] + clamped[2];
  return total < EPSILON
    ? [1, 0, 0]
    : [clamped[0] / total, clamped[1] / total, clamped[2] / total];
}

function mergeSkinInfluences(
  triangle: CharacterTriangleSurface,
  barycentric: CharacterInkVector3,
): { readonly indices: CharacterInkVector4; readonly weights: CharacterInkVector4 } {
  const influence = new Map<number, number>();
  for (let vertex = 0; vertex < 3; vertex += 1) {
    for (let channel = 0; channel < 4; channel += 1) {
      const index = Math.max(0, Math.floor(triangle.skinIndices[vertex][channel]));
      const weight = triangle.skinWeights[vertex][channel] * barycentric[vertex];
      if (weight <= EPSILON) continue;
      influence.set(index, (influence.get(index) ?? 0) + weight);
    }
  }
  const sorted = [...influence.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4);
  const total = sorted.reduce((sum, [, weight]) => sum + weight, 0);
  const indices = [0, 0, 0, 0];
  const weights = [0, 0, 0, 0];
  sorted.forEach(([index, weight], channel) => {
    indices[channel] = index;
    weights[channel] = total > EPSILON ? weight / total : channel === 0 ? 1 : 0;
  });
  if (total <= EPSILON) weights[0] = 1;
  return {
    indices: indices as unknown as CharacterInkVector4,
    weights: weights as unknown as CharacterInkVector4,
  };
}

export function evaluateCharacterSurfaceInkAnchor(
  anchor: CharacterSurfaceInkAnchor,
  triangle: CharacterTriangleSurface,
): CharacterSurfaceInkAnchor & { readonly position: CharacterInkVector3 } {
  const barycentric = normalizedBarycentric(anchor.barycentric);
  const position = barycentricVector3(triangle.positions, barycentric);
  const normal = normalize(barycentricVector3(triangle.normals, barycentric), normalize(anchor.localNormal));
  const skin = mergeSkinInfluences(triangle, barycentric);
  return Object.freeze({
    ...anchor,
    barycentric,
    localNormal: normal,
    skinIndices: skin.indices,
    skinWeights: skin.weights,
    position,
  });
}

export function createEmptyCharacterSurfaceInkDocument(): CharacterSurfaceInkDocument {
  return Object.freeze({ version: 1, layers: Object.freeze([]) });
}

export function addCharacterSurfaceInkStroke(
  document: CharacterSurfaceInkDocument,
  layerId: string,
  stroke: CharacterSurfaceInkStroke,
): CharacterSurfaceInkDocument {
  const layers = document.layers.map((layer) => layer.layerId === layerId
    ? Object.freeze({ ...layer, strokes: Object.freeze([...layer.strokes, stroke]) })
    : layer);
  if (!layers.some((layer) => layer.layerId === layerId)) {
    layers.push(Object.freeze({
      layerId,
      name: "3D 펜선",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      strokes: Object.freeze([stroke]),
    }));
  }
  return Object.freeze({ version: 1, layers: Object.freeze(layers) });
}

export function removeCharacterSurfaceInkStroke(
  document: CharacterSurfaceInkDocument,
  strokeId: string,
): CharacterSurfaceInkDocument {
  return Object.freeze({
    version: 1,
    layers: Object.freeze(document.layers.map((layer) => Object.freeze({
      ...layer,
      strokes: Object.freeze(layer.strokes.filter((stroke) => stroke.strokeId !== strokeId)),
    }))),
  });
}

export function resampleCharacterInkPositions(
  positions: readonly CharacterInkVector3[],
  spacing: number,
): readonly CharacterInkVector3[] {
  if (positions.length <= 1) return Object.freeze([...positions]);
  const safeSpacing = Math.max(0.0001, spacing);
  const result: CharacterInkVector3[] = [positions[0]!];
  let previous = positions[0]!;
  let carry = 0;
  for (let index = 1; index < positions.length; index += 1) {
    const target = positions[index]!;
    const segment = subtract(target, previous);
    const segmentLength = length(segment);
    if (segmentLength < EPSILON) continue;
    let walked = safeSpacing - carry;
    while (walked <= segmentLength + EPSILON) {
      const ratio = clamp(walked / segmentLength, 0, 1);
      result.push(add(previous, multiply(segment, ratio)));
      walked += safeSpacing;
    }
    carry = Math.max(0, segmentLength - (walked - safeSpacing));
    previous = target;
  }
  const last = positions.at(-1)!;
  if (distance(result.at(-1)!, last) > safeSpacing * 0.2) result.push(last);
  return Object.freeze(result);
}

function widthAt(style: CharacterSurfaceInkStyle, anchor: CharacterSurfaceInkAnchor, index: number, count: number): number {
  const progress = count <= 1 ? 0 : index / (count - 1);
  const start = style.taperStart <= 0 ? 1 : clamp(progress / style.taperStart, 0, 1);
  const end = style.taperEnd <= 0 ? 1 : clamp((1 - progress) / style.taperEnd, 0, 1);
  const pressure = 1 + (clamp(anchor.pressure, 0, 1) - 0.5) * 2 * clamp(style.pressureWidth, 0, 1);
  return Math.max(0.00001, anchor.width * style.baseWidth * start * end * pressure);
}

function pushVector3(target: number[], value: CharacterInkVector3): void {
  target.push(value[0], value[1], value[2]);
}

function pushVector4(target: number[], value: CharacterInkVector4): void {
  target.push(value[0], value[1], value[2], value[3]);
}

export function buildCharacterSurfaceInkRibbon(
  stroke: CharacterSurfaceInkStroke,
  triangles: ReadonlyMap<number, CharacterTriangleSurface>,
): CharacterSurfaceInkRibbon {
  const evaluated = stroke.anchors.map((anchor) => {
    const triangle = triangles.get(anchor.triangleIndex);
    if (!triangle) throw new Error(`3D 펜선 삼각형 ${anchor.triangleIndex}을 찾지 못했습니다.`);
    return evaluateCharacterSurfaceInkAnchor(anchor, triangle);
  });
  if (evaluated.length < 2) throw new Error("3D 펜선에는 두 개 이상의 표면 점이 필요합니다.");

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];
  let travelled = 0;
  const lengths = evaluated.map((anchor, index) => {
    if (index > 0) travelled += distance(evaluated[index - 1]!.position, anchor.position);
    return travelled;
  });
  const total = Math.max(EPSILON, travelled);
  let minimum: CharacterInkVector3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let maximum: CharacterInkVector3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  evaluated.forEach((anchor, index) => {
    const before = evaluated[Math.max(0, index - 1)]!.position;
    const after = evaluated[Math.min(evaluated.length - 1, index + 1)]!.position;
    const tangent = normalize(subtract(after, before), normalize(anchor.localTangent, [1, 0, 0]));
    const normal = normalize(anchor.localNormal);
    const bitangent = normalize(cross(normal, tangent), [1, 0, 0]);
    const halfWidth = widthAt(stroke.style, anchor, index, evaluated.length) / 2;
    const centre = add(anchor.position, multiply(normal, stroke.style.surfaceOffset));
    const left = subtract(centre, multiply(bitangent, halfWidth));
    const right = add(centre, multiply(bitangent, halfWidth));
    for (const position of [left, right] as const) {
      pushVector3(positions, position);
      pushVector3(normals, normal);
      pushVector4(skinIndices, anchor.skinIndices);
      pushVector4(skinWeights, anchor.skinWeights);
      minimum = [
        Math.min(minimum[0], position[0]),
        Math.min(minimum[1], position[1]),
        Math.min(minimum[2], position[2]),
      ];
      maximum = [
        Math.max(maximum[0], position[0]),
        Math.max(maximum[1], position[1]),
        Math.max(maximum[2], position[2]),
      ];
    }
    const u = lengths[index]! / total;
    uvs.push(u, 0, u, 1);
    if (index < evaluated.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  });

  return Object.freeze({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    skinIndices: new Uint16Array(skinIndices.map((value) => Math.max(0, Math.floor(value)))),
    skinWeights: new Float32Array(skinWeights),
    indices: new Uint32Array(indices),
    bounds: Object.freeze({ minimum, maximum }),
  });
}

export function markCharacterSurfaceInkTopology(
  document: CharacterSurfaceInkDocument,
  topologyRevision: string,
): CharacterSurfaceInkDocument {
  return Object.freeze({
    version: 1,
    layers: Object.freeze(document.layers.map((layer) => Object.freeze({
      ...layer,
      strokes: Object.freeze(layer.strokes.map((stroke) => Object.freeze({
        ...stroke,
        status: stroke.topologyRevision === topologyRevision ? "valid" : "needs-reprojection",
      }))),
    }))),
  });
}
