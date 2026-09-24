export const CHARACTER_GEOMETRY_STROKE_DOCUMENT_VERSION = 1 as const;

export type CharacterGeometryStrokeVector3 = readonly [number, number, number];

export type CharacterGeometryStrokeAnchor =
  | {
      readonly kind: "free";
      readonly position: CharacterGeometryStrokeVector3;
      readonly normal?: CharacterGeometryStrokeVector3;
    }
  | {
      readonly kind: "surface";
      readonly position: CharacterGeometryStrokeVector3;
      readonly normal: CharacterGeometryStrokeVector3;
      readonly meshAssetId: string;
      readonly topologyRevision: string;
      readonly primitiveIndex: number;
      readonly triangleIndex: number;
      readonly barycentric: CharacterGeometryStrokeVector3;
    };

export interface CharacterGeometryStrokePoint {
  readonly anchor: CharacterGeometryStrokeAnchor;
  readonly pressure: number;
  readonly width: number;
  readonly twist: number;
}

export interface CharacterGeometryStrokeStyle {
  readonly color: string;
  readonly baseWidth: number;
  readonly opacity: number;
  readonly taperStart: number;
  readonly taperEnd: number;
  readonly pressureWidth: number;
  readonly profile: "ribbon" | "round";
  readonly fill: boolean;
  readonly lineOnly: boolean;
}

export interface CharacterGeometryStroke {
  readonly strokeId: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly points: readonly CharacterGeometryStrokePoint[];
  readonly style: CharacterGeometryStrokeStyle;
  readonly status: "valid" | "needs-reprojection" | "orphaned";
}

export interface CharacterGeometryStrokeDocument {
  readonly version: typeof CHARACTER_GEOMETRY_STROKE_DOCUMENT_VERSION;
  readonly strokes: readonly CharacterGeometryStroke[];
}

export interface CharacterGeometryStrokeMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

export class CharacterGeometryStrokeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterGeometryStrokeError";
  }
}

const EPSILON = 1e-7;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu;

function vector(value: readonly number[]): value is CharacterGeometryStrokeVector3 {
  return value.length === 3 && value.every(Number.isFinite);
}

function add(a: CharacterGeometryStrokeVector3, b: CharacterGeometryStrokeVector3): CharacterGeometryStrokeVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: CharacterGeometryStrokeVector3, b: CharacterGeometryStrokeVector3): CharacterGeometryStrokeVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function multiply(a: CharacterGeometryStrokeVector3, scalar: number): CharacterGeometryStrokeVector3 {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

function magnitude(a: CharacterGeometryStrokeVector3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(
  a: CharacterGeometryStrokeVector3,
  fallback: CharacterGeometryStrokeVector3 = [0, 1, 0],
): CharacterGeometryStrokeVector3 {
  const length = magnitude(a);
  return length > EPSILON ? [a[0] / length, a[1] / length, a[2] / length] : fallback;
}

function cross(a: CharacterGeometryStrokeVector3, b: CharacterGeometryStrokeVector3): CharacterGeometryStrokeVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function distance(a: CharacterGeometryStrokeVector3, b: CharacterGeometryStrokeVector3): number {
  return magnitude(subtract(a, b));
}

function rotate(
  value: CharacterGeometryStrokeVector3,
  axisValue: CharacterGeometryStrokeVector3,
  angle: number,
): CharacterGeometryStrokeVector3 {
  const axis = normalize(axisValue);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dot = value[0] * axis[0] + value[1] * axis[1] + value[2] * axis[2];
  return add(
    add(multiply(value, cosine), multiply(cross(axis, value), sine)),
    multiply(axis, dot * (1 - cosine)),
  );
}

function validateAnchor(anchor: CharacterGeometryStrokeAnchor): CharacterGeometryStrokeAnchor {
  if (!vector(anchor.position)) {
    throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_ANCHOR_INVALID", "Geometry stroke 위치가 올바르지 않습니다.");
  }
  if (anchor.normal && !vector(anchor.normal)) {
    throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_ANCHOR_INVALID", "Geometry stroke 노멀이 올바르지 않습니다.");
  }
  if (anchor.kind === "free") {
    return Object.freeze({
      ...anchor,
      position: Object.freeze([...anchor.position] as [number, number, number]),
      ...(anchor.normal ? { normal: Object.freeze([...anchor.normal] as [number, number, number]) } : {}),
    });
  }
  if (!ID.test(anchor.meshAssetId) || !ID.test(anchor.topologyRevision)
    || !Number.isSafeInteger(anchor.primitiveIndex) || anchor.primitiveIndex < 0
    || !Number.isSafeInteger(anchor.triangleIndex) || anchor.triangleIndex < 0
    || !vector(anchor.barycentric)) {
    throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_ANCHOR_INVALID", "Geometry stroke 표면 앵커가 올바르지 않습니다.");
  }
  const sum = anchor.barycentric[0] + anchor.barycentric[1] + anchor.barycentric[2];
  if (anchor.barycentric.some((item) => item < -1e-6) || Math.abs(sum - 1) > 1e-4) {
    throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_ANCHOR_INVALID", "표면 barycentric 좌표의 합은 1이어야 합니다.");
  }
  return Object.freeze({
    ...anchor,
    position: Object.freeze([...anchor.position] as [number, number, number]),
    normal: Object.freeze([...anchor.normal] as [number, number, number]),
    barycentric: Object.freeze([...anchor.barycentric] as [number, number, number]),
  });
}

function validateStyle(style: CharacterGeometryStrokeStyle): CharacterGeometryStrokeStyle {
  if (!HEX.test(style.color)
    || !Number.isFinite(style.baseWidth) || style.baseWidth <= 0 || style.baseWidth > 10
    || !Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1
    || !Number.isFinite(style.taperStart) || style.taperStart < 0 || style.taperStart > 1
    || !Number.isFinite(style.taperEnd) || style.taperEnd < 0 || style.taperEnd > 1
    || !Number.isFinite(style.pressureWidth) || style.pressureWidth < 0 || style.pressureWidth > 1) {
    throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_STYLE_INVALID", "Geometry stroke 스타일 범위가 올바르지 않습니다.");
  }
  return Object.freeze({ ...style });
}

export function createEmptyCharacterGeometryStrokeDocument(): CharacterGeometryStrokeDocument {
  return Object.freeze({ version: CHARACTER_GEOMETRY_STROKE_DOCUMENT_VERSION, strokes: Object.freeze([]) });
}

export function validateCharacterGeometryStrokeDocument(
  input: CharacterGeometryStrokeDocument,
): CharacterGeometryStrokeDocument {
  if (input.version !== CHARACTER_GEOMETRY_STROKE_DOCUMENT_VERSION) {
    throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_VERSION_UNSUPPORTED", "지원하지 않는 Geometry stroke 버전입니다.");
  }
  if (!Array.isArray(input.strokes) || input.strokes.length > 100_000) {
    throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_LIMIT", "Geometry stroke 수가 허용 범위를 벗어났습니다.");
  }
  const ids = new Set<string>();
  const strokes = input.strokes.map((stroke) => {
    if (!ID.test(stroke.strokeId) || ids.has(stroke.strokeId)) {
      throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_ID_INVALID", `Geometry stroke ID가 중복되거나 올바르지 않습니다: ${stroke.strokeId}`);
    }
    ids.add(stroke.strokeId);
    if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 8192) {
      throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_POINT_LIMIT", `${stroke.strokeId}에는 2~8192개의 점이 필요합니다.`);
    }
    const points = stroke.points.map((point: CharacterGeometryStrokePoint) => {
      if (!Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1
        || !Number.isFinite(point.width) || point.width <= 0 || point.width > 10
        || !Number.isFinite(point.twist) || Math.abs(point.twist) > Math.PI * 16) {
        throw new CharacterGeometryStrokeError("GEOMETRY_STROKE_POINT_INVALID", "Geometry stroke 점 속성이 올바르지 않습니다.");
      }
      return Object.freeze({ ...point, anchor: validateAnchor(point.anchor) });
    });
    return Object.freeze({
      ...stroke,
      points: Object.freeze(points),
      style: validateStyle(stroke.style),
    });
  });
  return Object.freeze({ version: CHARACTER_GEOMETRY_STROKE_DOCUMENT_VERSION, strokes: Object.freeze(strokes) });
}

function taper(progress: number, start: number, end: number): number {
  const startValue = start <= 0 ? 1 : Math.min(1, progress / start);
  const endValue = end <= 0 ? 1 : Math.min(1, (1 - progress) / end);
  return startValue * endValue;
}

export function buildCharacterGeometryStrokeMesh(
  stroke: CharacterGeometryStroke,
): CharacterGeometryStrokeMesh {
  const validated = validateCharacterGeometryStrokeDocument({ version: 1, strokes: [stroke] }).strokes[0]!;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lengths: number[] = [];
  let travelled = 0;
  validated.points.forEach((point, index) => {
    if (index > 0) travelled += distance(validated.points[index - 1]!.anchor.position, point.anchor.position);
    lengths.push(travelled);
  });
  const total = Math.max(EPSILON, travelled);
  validated.points.forEach((point, index) => {
    const before = validated.points[Math.max(0, index - 1)]!.anchor.position;
    const after = validated.points[Math.min(validated.points.length - 1, index + 1)]!.anchor.position;
    const tangent = normalize(subtract(after, before));
    const normalHint = point.anchor.normal ?? [0, 0, 1];
    let side = normalize(cross(tangent, normalize(normalHint)), [1, 0, 0]);
    side = normalize(rotate(side, tangent, point.twist), side);
    const progress = index / Math.max(1, validated.points.length - 1);
    const pressure = 1 + (point.pressure - 0.5) * 2 * validated.style.pressureWidth;
    const halfWidth = validated.style.baseWidth * point.width
      * taper(progress, validated.style.taperStart, validated.style.taperEnd)
      * Math.max(0.05, pressure) / 2;
    const centre = point.anchor.position;
    const left = subtract(centre, multiply(side, halfWidth));
    const right = add(centre, multiply(side, halfWidth));
    const normal = normalize(cross(side, tangent), normalize(normalHint));
    positions.push(...left, ...right);
    normals.push(...normal, ...normal);
    const u = lengths[index]! / total;
    uvs.push(u, 0, u, 1);
    if (index < validated.points.length - 1) {
      const offset = index * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 2, offset + 3, offset + 1);
    }
  });
  return Object.freeze({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  });
}

export function markCharacterGeometryStrokeTopology(
  document: CharacterGeometryStrokeDocument,
  topologyRevision: string,
): CharacterGeometryStrokeDocument {
  return validateCharacterGeometryStrokeDocument({
    version: 1,
    strokes: document.strokes.map((stroke) => ({
      ...stroke,
      status: stroke.points.some((point) =>
        point.anchor.kind === "surface" && point.anchor.topologyRevision !== topologyRevision
      ) ? "needs-reprojection" : stroke.status === "orphaned" ? "orphaned" : "valid",
    })),
  });
}
