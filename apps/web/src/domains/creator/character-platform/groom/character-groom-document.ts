export const CHARACTER_GROOM_DOCUMENT_VERSION = 1 as const;

export type CharacterGroomVector2 = readonly [number, number];
export type CharacterGroomVector3 = readonly [number, number, number];

export interface CharacterGroomSurfaceAnchor {
  readonly meshAssetId: string;
  readonly topologyRevision: string;
  readonly primitiveIndex: number;
  readonly triangleIndex: number;
  readonly barycentric: CharacterGroomVector3;
  readonly localNormal: CharacterGroomVector3;
}

export interface CharacterGroomGuidePoint {
  readonly position: CharacterGroomVector3;
  readonly width: number;
  readonly twist: number;
  readonly surfaceAnchor?: CharacterGroomSurfaceAnchor;
}

export interface CharacterGroomGuideCurve {
  readonly guideId: string;
  readonly points: readonly CharacterGroomGuidePoint[];
  readonly status: "valid" | "needs-reprojection" | "orphaned";
}

export interface CharacterGroomProfile {
  readonly baseWidth: number;
  readonly taper: number;
  readonly lengthScale: number;
  readonly curl: number;
  readonly wave: number;
  readonly clump: number;
  readonly noise: number;
  readonly rootRotation: number;
  readonly lineOnly: boolean;
  readonly fill: boolean;
  readonly segmentsPerSpan: number;
}

export interface CharacterGroomGroup {
  readonly groupId: string;
  readonly name: string;
  readonly scalpRegionId: string;
  readonly materialId: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly profile: CharacterGroomProfile;
  readonly guides: readonly CharacterGroomGuideCurve[];
}

export interface CharacterGroomDocument {
  readonly version: typeof CHARACTER_GROOM_DOCUMENT_VERSION;
  readonly topologyRevision: string;
  readonly groups: readonly CharacterGroomGroup[];
}

export interface CharacterGroomRibbon {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly bounds: {
    readonly minimum: CharacterGroomVector3;
    readonly maximum: CharacterGroomVector3;
  };
}

export class CharacterGroomDocumentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterGroomDocumentError";
  }
}

const EPSILON = 1e-7;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function finiteVector(value: readonly number[], length: number): boolean {
  return value.length === length && value.every(finite);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function add(left: CharacterGroomVector3, right: CharacterGroomVector3): CharacterGroomVector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: CharacterGroomVector3, right: CharacterGroomVector3): CharacterGroomVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(value: CharacterGroomVector3, scalar: number): CharacterGroomVector3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function magnitude(value: CharacterGroomVector3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(
  value: CharacterGroomVector3,
  fallback: CharacterGroomVector3 = [0, 1, 0],
): CharacterGroomVector3 {
  const length = magnitude(value);
  return length > EPSILON
    ? [value[0] / length, value[1] / length, value[2] / length]
    : fallback;
}

function cross(left: CharacterGroomVector3, right: CharacterGroomVector3): CharacterGroomVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function distance(left: CharacterGroomVector3, right: CharacterGroomVector3): number {
  return magnitude(subtract(left, right));
}

function freezePoint(point: CharacterGroomGuidePoint): CharacterGroomGuidePoint {
  return Object.freeze({
    ...point,
    position: Object.freeze([...point.position] as [number, number, number]),
    ...(point.surfaceAnchor
      ? {
          surfaceAnchor: Object.freeze({
            ...point.surfaceAnchor,
            barycentric: Object.freeze([...point.surfaceAnchor.barycentric] as [number, number, number]),
            localNormal: Object.freeze([...point.surfaceAnchor.localNormal] as [number, number, number]),
          }),
        }
      : {}),
  });
}

function assertId(value: string, field: string): void {
  if (!ID.test(value)) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_ID_INVALID", `${field} 형식이 올바르지 않습니다.`);
  }
}

function validatePoint(point: CharacterGroomGuidePoint): void {
  if (!finiteVector(point.position, 3)) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_POINT_INVALID", "헤어 가이드 위치가 올바르지 않습니다.");
  }
  if (!finite(point.width) || point.width <= 0 || point.width > 1) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_POINT_INVALID", "헤어 가이드 폭은 0보다 크고 1 이하여야 합니다.");
  }
  if (!finite(point.twist) || Math.abs(point.twist) > Math.PI * 16) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_POINT_INVALID", "헤어 가이드 회전값이 올바르지 않습니다.");
  }
  const anchor = point.surfaceAnchor;
  if (!anchor) return;
  assertId(anchor.meshAssetId, "surfaceAnchor.meshAssetId");
  assertId(anchor.topologyRevision, "surfaceAnchor.topologyRevision");
  if (!Number.isSafeInteger(anchor.primitiveIndex) || anchor.primitiveIndex < 0
    || !Number.isSafeInteger(anchor.triangleIndex) || anchor.triangleIndex < 0
    || !finiteVector(anchor.barycentric, 3)
    || !finiteVector(anchor.localNormal, 3)) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_ANCHOR_INVALID", "헤어 루트 표면 앵커가 올바르지 않습니다.");
  }
}

function validateProfile(profile: CharacterGroomProfile): void {
  const zeroToOne = [profile.taper, profile.curl, profile.wave, profile.clump, profile.noise];
  if (!zeroToOne.every((value) => finite(value) && value >= 0 && value <= 1)) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_PROFILE_INVALID", "헤어 프로필 가중치는 0~1이어야 합니다.");
  }
  if (!finite(profile.baseWidth) || profile.baseWidth <= 0 || profile.baseWidth > 1
    || !finite(profile.lengthScale) || profile.lengthScale <= 0 || profile.lengthScale > 8
    || !finite(profile.rootRotation) || Math.abs(profile.rootRotation) > Math.PI * 16
    || !Number.isSafeInteger(profile.segmentsPerSpan)
    || profile.segmentsPerSpan < 1 || profile.segmentsPerSpan > 32) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_PROFILE_INVALID", "헤어 프로필 범위가 올바르지 않습니다.");
  }
}

export function createEmptyCharacterGroomDocument(
  topologyRevision = "unbound-topology",
): CharacterGroomDocument {
  return Object.freeze({
    version: CHARACTER_GROOM_DOCUMENT_VERSION,
    topologyRevision,
    groups: Object.freeze([]),
  });
}

export function validateCharacterGroomDocument(
  input: CharacterGroomDocument,
): CharacterGroomDocument {
  if (input.version !== CHARACTER_GROOM_DOCUMENT_VERSION) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_VERSION_UNSUPPORTED", "지원하지 않는 Groom 문서 버전입니다.");
  }
  assertId(input.topologyRevision, "topologyRevision");
  if (!Array.isArray(input.groups) || input.groups.length > 256) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_GROUP_LIMIT", "Groom 그룹 수가 허용 범위를 벗어났습니다.");
  }
  const groupIds = new Set<string>();
  const guideIds = new Set<string>();
  const groups = input.groups.map((group) => {
    assertId(group.groupId, "groupId");
    assertId(group.scalpRegionId, "scalpRegionId");
    assertId(group.materialId, "materialId");
    if (groupIds.has(group.groupId)) {
      throw new CharacterGroomDocumentError("CHARACTER_GROOM_DUPLICATE_ID", `중복 Groom 그룹 ID가 있습니다: ${group.groupId}`);
    }
    groupIds.add(group.groupId);
    validateProfile(group.profile);
    if (!Array.isArray(group.guides) || group.guides.length > 20_000) {
      throw new CharacterGroomDocumentError("CHARACTER_GROOM_GUIDE_LIMIT", `${group.name} 가이드 수가 허용 범위를 벗어났습니다.`);
    }
    const guides = group.guides.map((guide: CharacterGroomGuideCurve) => {
      assertId(guide.guideId, "guideId");
      if (guideIds.has(guide.guideId)) {
        throw new CharacterGroomDocumentError("CHARACTER_GROOM_DUPLICATE_ID", `중복 Groom 가이드 ID가 있습니다: ${guide.guideId}`);
      }
      guideIds.add(guide.guideId);
      if (!Array.isArray(guide.points) || guide.points.length < 2 || guide.points.length > 2048) {
        throw new CharacterGroomDocumentError("CHARACTER_GROOM_POINT_LIMIT", `${guide.guideId} 가이드는 2~2048개의 점이 필요합니다.`);
      }
      guide.points.forEach(validatePoint);
      return Object.freeze({
        ...guide,
        points: Object.freeze(guide.points.map(freezePoint)),
      });
    });
    return Object.freeze({
      ...group,
      profile: Object.freeze({ ...group.profile }),
      guides: Object.freeze(guides),
    });
  });
  return Object.freeze({
    version: CHARACTER_GROOM_DOCUMENT_VERSION,
    topologyRevision: input.topologyRevision,
    groups: Object.freeze(groups),
  });
}

export function resampleCharacterGroomGuide(
  guide: CharacterGroomGuideCurve,
  spacing: number,
): CharacterGroomGuideCurve {
  if (!finite(spacing) || spacing <= 0) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_SPACING_INVALID", "Groom 재샘플 간격은 0보다 커야 합니다.");
  }
  if (!Array.isArray(guide.points) || guide.points.length < 2 || guide.points.length > 2048) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_POINT_LIMIT", "Groom 원본은 2~2048개의 점이 필요합니다.");
  }
  guide.points.forEach(validatePoint);
  let totalLength = 0;
  for (let index = 1; index < guide.points.length; index += 1) {
    const before = guide.points[index - 1];
    const point = guide.points[index];
    if (before && point) totalLength += distance(before.position, point.position);
  }
  if (!Number.isFinite(totalLength) || Math.ceil(totalLength / spacing) + 1 > 2048) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_POINT_LIMIT", "Groom 재샘플 결과는 2048개 점을 넘을 수 없습니다. 간격을 늘려 주세요.");
  }
  const result: CharacterGroomGuidePoint[] = [freezePoint(guide.points[0]!)];
  let previous = guide.points[0]!;
  let carry = 0;
  for (let index = 1; index < guide.points.length; index += 1) {
    const target = guide.points[index]!;
    const segment = subtract(target.position, previous.position);
    const segmentLength = magnitude(segment);
    if (segmentLength <= EPSILON) continue;
    let walked = spacing - carry;
    while (walked <= segmentLength + EPSILON) {
      const ratio = clamp(walked / segmentLength, 0, 1);
      result.push(freezePoint({
        position: add(previous.position, multiply(segment, ratio)),
        width: previous.width + (target.width - previous.width) * ratio,
        twist: previous.twist + (target.twist - previous.twist) * ratio,
        ...(ratio < 0.5 && previous.surfaceAnchor ? { surfaceAnchor: previous.surfaceAnchor } : {}),
      }));
      walked += spacing;
    }
    carry = Math.max(0, segmentLength - (walked - spacing));
    previous = target;
  }
  const last = guide.points.at(-1)!;
  const lastDistance = distance(result.at(-1)!.position, last.position);
  if (lastDistance > EPSILON) result.push(freezePoint(last));
  else result[result.length - 1] = freezePoint(last);
  return Object.freeze({ ...guide, points: Object.freeze(result) });
}

function rotateAroundAxis(
  vector: CharacterGroomVector3,
  axis: CharacterGroomVector3,
  angle: number,
): CharacterGroomVector3 {
  const normalizedAxis = normalize(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dot = vector[0] * normalizedAxis[0] + vector[1] * normalizedAxis[1] + vector[2] * normalizedAxis[2];
  return add(
    add(multiply(vector, cosine), multiply(cross(normalizedAxis, vector), sine)),
    multiply(normalizedAxis, dot * (1 - cosine)),
  );
}

function sampledGuidePoints(
  guide: CharacterGroomGuideCurve,
  profile: CharacterGroomProfile,
): readonly CharacterGroomGuidePoint[] {
  const root = guide.points[0];
  if (!root) return [];
  const samples: CharacterGroomGuidePoint[] = [];
  const interpolate = (a: number, b: number, c: number, d: number, t: number) =>
    0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t
      + (-a + 3 * b - 3 * c + d) * t * t * t);
  let totalLength = 0;
  for (let index = 1; index < guide.points.length; index += 1) {
    const before = guide.points[index - 1];
    const current = guide.points[index];
    if (before && current) totalLength += distance(before.position, current.position);
  }
  if (!Number.isFinite(totalLength) || totalLength <= EPSILON) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_CURVE_EMPTY", "헤어 가이드의 길이가 너무 짧습니다. 제어점을 이동해 주세요.");
  }
  const normal = normalize(root.surfaceAnchor?.localNormal ?? [0, 0, 1]);
  const tip = guide.points.at(-1) ?? root;
  const tangent = normalize(subtract(tip.position, root.position), [0, -1, 0]);
  const side = normalize(cross(tangent, normal), [1, 0, 0]);
  const spanCount = guide.points.length - 1;
  for (let span = 0; span < spanCount; span += 1) {
    const before = guide.points[Math.max(0, span - 1)] ?? root;
    const from = guide.points[span] ?? root;
    const to = guide.points[span + 1] ?? tip;
    const after = guide.points[Math.min(guide.points.length - 1, span + 2)] ?? tip;
    for (let step = 0; step < profile.segmentsPerSpan; step += 1) {
      const t = step / profile.segmentsPerSpan;
      const progress = (span + t) / spanCount;
      const source: CharacterGroomVector3 = [
        interpolate(before.position[0], from.position[0], to.position[0], after.position[0], t),
        interpolate(before.position[1], from.position[1], to.position[1], after.position[1], t),
        interpolate(before.position[2], from.position[2], to.position[2], after.position[2], t),
      ];
      const relative = subtract(source, root.position);
      const axisPoint = multiply(tangent, relative[0] * tangent[0] + relative[1] * tangent[1] + relative[2] * tangent[2]);
      const clumped = add(multiply(relative, 1 - profile.clump * progress), multiply(axisPoint, profile.clump * progress));
      const angle = progress * Math.PI * 4;
      const amplitude = totalLength * profile.lengthScale * 0.12 * progress;
      const lateral = amplitude * (profile.wave * Math.sin(angle)
        + profile.curl * Math.sin(angle * 2)
        + profile.noise * Math.sin(progress * 91.7) * Math.sin(progress * 43.1));
      const outward = amplitude * profile.curl * (1 - Math.cos(angle * 2));
      samples.push({
        ...from,
        position: add(add(root.position, multiply(clumped, profile.lengthScale)), add(multiply(side, lateral), multiply(normal, outward))),
        width: from.width + (to.width - from.width) * t,
        twist: from.twist + (to.twist - from.twist) * t,
      });
    }
  }
  const relativeTip = subtract(tip.position, root.position);
  const axialTip = multiply(tangent, magnitude(relativeTip));
  samples.push({
    ...tip,
    position: add(root.position, multiply(add(multiply(relativeTip, 1 - profile.clump), multiply(axialTip, profile.clump)), profile.lengthScale)),
  });
  return samples;
}

export function buildCharacterGroomRibbon(
  guide: CharacterGroomGuideCurve,
  profile: CharacterGroomProfile,
): CharacterGroomRibbon {
  if (guide.points.length < 2) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_RIBBON_EMPTY", "리본 생성에는 두 개 이상의 가이드 점이 필요합니다.");
  }
  if (guide.points.length > 2048) {
    throw new CharacterGroomDocumentError("CHARACTER_GROOM_POINT_LIMIT", "헤어 가이드는 2048개 점을 넘을 수 없습니다.");
  }
  validateProfile(profile);
  guide.points.forEach(validatePoint);
  const points = sampledGuidePoints(guide, profile);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lengths: number[] = [];
  let travelled = 0;
  points.forEach((point, index) => {
    if (index > 0) travelled += distance(points[index - 1]!.position, point.position);
    lengths.push(travelled);
  });
  const total = Math.max(EPSILON, travelled);
  let minimum: CharacterGroomVector3 = [Infinity, Infinity, Infinity];
  let maximum: CharacterGroomVector3 = [-Infinity, -Infinity, -Infinity];

  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)]!.position;
    const after = points[Math.min(points.length - 1, index + 1)]!.position;
    const tangent = normalize(subtract(after, before), [0, 1, 0]);
    const rootNormal = point.surfaceAnchor?.localNormal ?? [0, 0, 1];
    let side = normalize(cross(tangent, normalize(rootNormal)), [1, 0, 0]);
    side = normalize(rotateAroundAxis(side, tangent, point.twist + profile.rootRotation), side);
    const progress = points.length <= 1 ? 0 : index / (points.length - 1);
    const taper = 1 - clamp(profile.taper, 0, 1) * progress;
    const halfWidth = Math.max(EPSILON, point.width * profile.baseWidth * taper) / 2;
    const centre = point.position;
    const left = subtract(centre, multiply(side, halfWidth));
    const right = add(centre, multiply(side, halfWidth));
    const normal = normalize(cross(side, tangent), normalize(rootNormal));
    for (const value of [left, right] as const) {
      positions.push(...value);
      normals.push(...normal);
      minimum = [
        Math.min(minimum[0], value[0]),
        Math.min(minimum[1], value[1]),
        Math.min(minimum[2], value[2]),
      ];
      maximum = [
        Math.max(maximum[0], value[0]),
        Math.max(maximum[1], value[1]),
        Math.max(maximum[2], value[2]),
      ];
    }
    const u = lengths[index]! / total;
    uvs.push(u, 0, u, 1);
    if (index < points.length - 1) {
      const offset = index * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 2, offset + 3, offset + 1);
    }
  });
  return Object.freeze({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    bounds: Object.freeze({ minimum, maximum }),
  });
}

export function markCharacterGroomTopology(
  document: CharacterGroomDocument,
  topologyRevision: string,
): CharacterGroomDocument {
  return validateCharacterGroomDocument({
    ...document,
    topologyRevision,
    groups: document.groups.map((group) => ({
      ...group,
      guides: group.guides.map((guide) => ({
        ...guide,
        status: guide.points.some((point) =>
          point.surfaceAnchor && point.surfaceAnchor.topologyRevision !== topologyRevision
        ) ? "needs-reprojection" : guide.status === "orphaned" ? "orphaned" : "valid",
      })),
    })),
  });
}
