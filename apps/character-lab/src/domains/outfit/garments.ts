/**
 * 의상 절차 파츠(스펙 §5.4 garments): 상의 5·하의 5·신발 4·액세서리 6.
 *
 * - 몸판·소매·바지·신발 갑피는 **체형 케이지 오프셋 셸**(선택한 몸 삼각형을 법선 방향으로 밀어낸 사본)이며
 *   스킨 웨이트와 체형 morph 델타를 몸 정점에서 항등 매핑으로 상속한다.
 * - 후드·칼라·스커트·밑창·안경·리본 등 절차 조각은 최근접 4 몸 정점 매핑으로 가중치·morph를 상속한다.
 * - 스커트·리본(세일러 리본, 리본 액세서리, 귀걸이)은 보조 본 `skirt_<i>_<j>`·`ribbon_<i>_<j>`과 ChainAnchor를 만든다.
 * - 모든 파츠는 partId 0·materialId 0, 보조 본 인덱스는 OUTFIT_AUX_BONE_INDEX_BASE 기준(index.ts 규약).
 */
import { CHAIN_HIT_RADIUS_DEFAULTS, CHAIN_PARAM_DEFAULTS } from "../../contracts";
import { v3Add, v3Normalize, v3Scale, v3Sub } from "../../shared/math";

import { buildNearestMapping, extractOffsetShell, inheritSkinWeights, propagateBodyMorphs, regionBounds, regionCentroid, selectBodyVertices } from "./follow-body";
import { MeshAccumulator, appendBox, appendCardStrip, appendSphereShell, appendTube, arcPoints, blendJoints, circlePoints, singleJoint } from "./geometry";
import { OUTFIT_AUX_BONE_INDEX_BASE } from "./hair-builder";

import type { BodyMapping } from "./follow-body";
import type { MeshBuffers, SkinWeight4 } from "./geometry";
import type {
  AccessoryStyleId,
  BodyRegion,
  BodySurface,
  BoneData,
  BottomStyleId,
  ChainAnchor,
  ChainRole,
  GarmentSelection,
  MaterialPresetId,
  MeshPartData,
  MorphDelta,
  OutfitBuildContext,
  OutfitBuildResult,
  PartRole,
  RecipeColorKey,
  ShoesStyleId,
  TopStyleId,
  Vec3,
} from "../../contracts";

export interface GarmentBuild {
  readonly parts: readonly MeshPartData[];
  readonly bones: readonly BoneData[];
  readonly chains: readonly ChainAnchor[];
  /** parts와 같은 순서의 몸 매핑(테스트·검증용) */
  readonly mappings: readonly BodyMapping[];
}

/** 한 번의 buildGarments 호출이 공유하는 보조 본·체인 누적기 */
export interface GarmentEnv {
  readonly body: BodySurface;
  readonly bodyMorphs: readonly MorphDelta[];
  readonly context: OutfitBuildContext;
  readonly bones: BoneData[];
  readonly chains: ChainAnchor[];
  readonly counters: { ribbon: number; skirt: number };
}

export function createGarmentEnv(body: BodySurface, bodyMorphs: readonly MorphDelta[], context: OutfitBuildContext): GarmentEnv {
  return { body, bodyMorphs, context, bones: [], chains: [], counters: { ribbon: 0, skirt: 0 } };
}

interface Piece {
  readonly buffers: MeshBuffers;
  readonly mapping: BodyMapping;
}

const UP: Vec3 = [0, 1, 0];
const FORWARD: Vec3 = [0, 0, 1];
const RIGHT: Vec3 = [1, 0, 0];

// ---------------------------------------------------------------- 공통 조각 생성

function shellPiece(env: GarmentEnv, regions: readonly BodyRegion[], offset: number, predicate?: Parameters<typeof selectBodyVertices>[2], uvShift?: readonly [number, number]): Piece | null {
  const mask = selectBodyVertices(env.body, regions, predicate);
  const shell = extractOffsetShell(env.body, mask, { offset, rim: true, uvShift });
  return shell ? { buffers: shell.mesh, mapping: shell.mapping } : null;
}

/** 절차 조각: 최근접 매핑으로 morph를 전파하고, inheritSkin이면 스킨 웨이트도 몸에서 상속한다. */
function proceduralPiece(env: GarmentEnv, buffers: MeshBuffers, regions: readonly BodyRegion[], inheritSkin: boolean): Piece {
  const mask = selectBodyVertices(env.body, regions);
  const mapping = buildNearestMapping(buffers.positions, env.body, { mask });
  if (!inheritSkin) return { buffers, mapping };
  const skin = inheritSkinWeights(mapping, env.body);
  return { buffers: { ...buffers, jointIndices: skin.jointIndices, jointWeights: skin.jointWeights }, mapping };
}

function mergePieces(pieces: readonly Piece[]): Piece {
  const acc = new MeshAccumulator();
  const bodyVertex: number[] = [];
  const weight: number[] = [];
  for (const piece of pieces) {
    acc.append(piece.buffers);
    for (let i = 0; i < piece.mapping.bodyVertex.length; i += 1) {
      bodyVertex.push(piece.mapping.bodyVertex[i]);
      weight.push(piece.mapping.weight[i]);
    }
  }
  return { buffers: acc.build(), mapping: { bodyVertex: Uint32Array.from(bodyVertex), weight: Float32Array.from(weight) } };
}

function finishPart(env: GarmentEnv, id: string, role: PartRole, materialPreset: MaterialPresetId, colorKey: RecipeColorKey, pieces: readonly Piece[]): { part: MeshPartData; mapping: BodyMapping } | null {
  const valid = pieces.filter((piece) => piece.buffers.indices.length > 0);
  if (valid.length === 0) return null;
  const merged = mergePieces(valid);
  const vertexCount = merged.buffers.positions.length / 3;
  const part: MeshPartData = {
    id,
    role,
    partId: 0,
    materialId: 0,
    materialPreset,
    colorKey,
    positions: merged.buffers.positions,
    normals: merged.buffers.normals,
    uvs: merged.buffers.uvs,
    indices: merged.buffers.indices,
    jointIndices: merged.buffers.jointIndices,
    jointWeights: merged.buffers.jointWeights,
    morphs: propagateBodyMorphs(vertexCount, env.bodyMorphs, merged.mapping),
  };
  return { part, mapping: merged.mapping };
}

// ---------------------------------------------------------------- 몸 프레임

export interface HeadFrame {
  readonly center: Vec3;
  readonly radius: number;
}

/** 머리 영역 중심·반경(최대 거리). 머리 정점이 없으면 null. */
export function headFrameFromBody(body: BodySurface): HeadFrame | null {
  const center = regionCentroid(body, ["head"]);
  if (!center) return null;
  const bounds = regionBounds(body, ["head"]);
  if (!bounds) return null;
  let radius = 0;
  const count = body.positions.length / 3;
  for (let v = 0; v < count; v += 1) {
    if (body.regionOfVertex[v] !== 0) continue;
    const d = Math.hypot(body.positions[v * 3] - center[0], body.positions[v * 3 + 1] - center[1], body.positions[v * 3 + 2] - center[2]);
    if (d > radius) radius = d;
  }
  return { center, radius: Math.max(0.05, radius) };
}

/** 머리 본 rest 위치 추정(머리 중심 − 반경) */
export function assumedBodyPivots(body: BodySurface): Partial<Record<"head" | "hips" | "chest", Vec3>> {
  const out: Partial<Record<"head" | "hips" | "chest", Vec3>> = {};
  const head = headFrameFromBody(body);
  if (head) out.head = v3Sub(head.center, v3Scale(UP, head.radius));
  const hips = regionCentroid(body, ["hips"]);
  if (hips) out.hips = hips;
  const torso = regionCentroid(body, ["torso"]);
  if (torso) out.chest = torso;
  return out;
}

interface RingFrame {
  readonly center: Vec3;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly yMin: number;
  readonly yMax: number;
}

function ringFrame(body: BodySurface, regions: readonly BodyRegion[]): RingFrame | null {
  const bounds = regionBounds(body, regions);
  if (!bounds) return null;
  return {
    center: [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2],
    radiusX: (bounds.max[0] - bounds.min[0]) / 2,
    radiusZ: (bounds.max[2] - bounds.min[2]) / 2,
    yMin: bounds.min[1],
    yMax: bounds.max[1],
  };
}

// ---------------------------------------------------------------- 보조 본·체인 등록

function registerChain(env: GarmentEnv, role: ChainRole, prefix: string, index: number, points: readonly Vec3[], parent: string, pivot: Vec3, spring?: { stiffness?: number; damping?: number; gravityScale?: number }): SkinWeight4[] {
  const defaults = CHAIN_PARAM_DEFAULTS[role];
  const names: string[] = [];
  const skins: SkinWeight4[] = [];
  points.forEach((point, j) => {
    const name = `${prefix}_${index}_${j}`;
    skins.push(singleJoint(OUTFIT_AUX_BONE_INDEX_BASE + env.bones.length));
    env.bones.push({
      name,
      parent: j === 0 ? parent : names[j - 1],
      restTranslation: j === 0 ? v3Sub(point, pivot) : v3Sub(point, points[j - 1]),
      restRotation: [0, 0, 0, 1],
      auxiliary: true,
    });
    names.push(name);
  });
  env.chains.push({
    id: `${prefix}_${index}`,
    role,
    boneNames: names,
    restPoints: points,
    radius: CHAIN_HIT_RADIUS_DEFAULTS[role],
    stiffness: spring?.stiffness ?? defaults.stiffness,
    damping: spring?.damping ?? defaults.dragForce,
    gravityScale: spring?.gravityScale ?? defaults.gravityPower,
  });
  return skins;
}

/** 아래로 늘어지는 리본 꼬리 곡선(root에서 dir 방향으로 시작해 중력 쪽으로 휘는 segments 점열) */
function hangingCurve(root: Vec3, dir: Vec3, length: number, segments: number, droop: number): Vec3[] {
  const points: Vec3[] = [root];
  let prev = root;
  const segLen = length / segments;
  for (let k = 1; k <= segments; k += 1) {
    const s = k / segments;
    const d = Math.min(1, droop * (0.3 + 0.7 * s));
    const step = v3Normalize(v3Add(v3Scale(v3Normalize(dir), 1 - d), v3Scale([0, -1, 0], d)));
    prev = v3Add(prev, v3Scale(step, segLen));
    points.push(prev);
  }
  return points;
}

function ribbonTails(env: GarmentEnv, acc: MeshAccumulator, root: Vec3, parent: string, pivot: Vec3, outward: Vec3, width: number, length: number, spread: number): void {
  for (const side of [-1, 1] as const) {
    const dir: Vec3 = v3Normalize(v3Add(v3Scale(RIGHT, side * spread), v3Add(v3Scale(outward, 0.35), [0, -0.6, 0])));
    const points = hangingCurve(root, dir, length, 5, 0.85);
    const skins = registerChain(env, "ribbon", "ribbon", env.counters.ribbon, points, parent, pivot);
    env.counters.ribbon += 1;
    appendCardStrip(acc, { points, widths: points.map(() => width), outward: points.map(() => outward), skins });
  }
}

// ---------------------------------------------------------------- 상의

interface TopSpec {
  readonly labelKo: string;
  readonly material: MaterialPresetId;
  readonly offset: number;
  /** 소매 덮임(팔 위에서부터 비율) */
  readonly sleeve: number;
  readonly extra: "none" | "hood" | "collar" | "lapel" | "sailor";
}

export const TOP_SPECS: Readonly<Record<TopStyleId, TopSpec>> = {
  tee: { labelKo: "티셔츠", material: "cloth-cotton", offset: 0.006, sleeve: 0.35, extra: "none" },
  hoodie: { labelKo: "후디", material: "cloth-cotton", offset: 0.012, sleeve: 1, extra: "hood" },
  shirt: { labelKo: "셔츠", material: "cloth-cotton", offset: 0.007, sleeve: 1, extra: "collar" },
  blazer: { labelKo: "블레이저", material: "cloth-denim", offset: 0.014, sleeve: 1, extra: "lapel" },
  sailor: { labelKo: "세일러", material: "cloth-cotton", offset: 0.007, sleeve: 0.3, extra: "sailor" },
};

function limbCoverage(env: GarmentEnv, region: BodyRegion, coverage: number, fromTop: boolean): (y: number) => boolean {
  const bounds = regionBounds(env.body, [region]);
  if (!bounds) return () => false;
  const span = bounds.max[1] - bounds.min[1];
  return fromTop ? (y) => y >= bounds.max[1] - span * coverage - 1e-6 : (y) => y <= bounds.min[1] + span * coverage + 1e-6;
}

function torsoShell(env: GarmentEnv, offset: number, sleeve: number): Piece | null {
  const left = limbCoverage(env, "leftArm", sleeve, true);
  const right = limbCoverage(env, "rightArm", sleeve, true);
  return shellPiece(env, ["torso", "leftArm", "rightArm"], offset, (_, region, __, y) => {
    if (region === "leftArm") return left(y);
    if (region === "rightArm") return right(y);
    return true;
  });
}

export function buildTop(id: TopStyleId, env: GarmentEnv): GarmentBuild {
  const spec = TOP_SPECS[id];
  const pieces: Piece[] = [];
  const shell = torsoShell(env, spec.offset, spec.sleeve);
  if (shell) pieces.push(shell);
  const head = headFrameFromBody(env.body);
  const torso = ringFrame(env.body, ["torso"]);
  const neck = ringFrame(env.body, ["neck"]);
  const parts: MeshPartData[] = [];
  const mappings: BodyMapping[] = [];
  if (spec.extra === "hood" && head) {
    const acc = new MeshAccumulator();
    appendSphereShell(acc, {
      center: v3Add(head.center, [0, 0.01, -0.02]),
      radius: head.radius * 1.2,
      up: UP,
      forward: FORWARD,
      elevationStart: Math.PI * 0.08,
      elevationEnd: Math.PI * 0.6,
      azimuthStart: Math.PI * 0.55,
      azimuthEnd: Math.PI * 1.45,
      rings: 6,
      segments: 10,
      skin: singleJoint(0),
    });
    pieces.push(proceduralPiece(env, acc.build(), ["head", "neck", "torso"], true));
  }
  if (spec.extra === "collar" && neck) {
    const acc = new MeshAccumulator();
    const radius = Math.max(neck.radiusX, neck.radiusZ) + 0.014;
    const points = circlePoints([neck.center[0], neck.yMin + 0.012, neck.center[2]], UP, radius, 16);
    appendTube(acc, { points, radii: points.map(() => 0.011), sides: 6, skins: points.map(() => singleJoint(0)), sideHint: UP });
    pieces.push(proceduralPiece(env, acc.build(), ["neck", "torso"], true));
  }
  if (spec.extra === "lapel" && torso) {
    const acc = new MeshAccumulator();
    const frontZ = torso.center[2] + torso.radiusZ + spec.offset + 0.004;
    for (const side of [-1, 1] as const) {
      const top: Vec3 = [torso.center[0] + side * 0.012, torso.yMax - 0.015, frontZ];
      const bottom: Vec3 = [torso.center[0] + side * 0.075, torso.yMax - 0.17, frontZ - 0.004];
      appendCardStrip(acc, { points: [top, bottom], widths: [0.03, 0.05], outward: [FORWARD, FORWARD], skins: [singleJoint(0), singleJoint(0)] });
    }
    pieces.push(proceduralPiece(env, acc.build(), ["torso"], true));
  }
  if (spec.extra === "sailor" && torso) {
    const acc = new MeshAccumulator();
    const backZ = torso.center[2] - torso.radiusZ - spec.offset - 0.004;
    const back: Vec3 = [0, 0, -1];
    appendCardStrip(acc, {
      points: [
        [torso.center[0], torso.yMax - 0.01, backZ],
        [torso.center[0], torso.yMax - 0.15, backZ - 0.003],
      ],
      widths: [0.2, 0.26],
      outward: [back, back],
      skins: [singleJoint(0), singleJoint(0)],
    });
    pieces.push(proceduralPiece(env, acc.build(), ["torso", "neck"], true));
    // 앞 리본(세일러 타이): 보조 본 체인 2개, 별도 실크 파츠
    const ribbon = new MeshAccumulator();
    const frontZ = torso.center[2] + torso.radiusZ + spec.offset + 0.006;
    const root: Vec3 = [torso.center[0], torso.yMax - 0.06, frontZ];
    const pivot = assumedBodyPivots(env.body).chest ?? torso.center;
    ribbonTails(env, ribbon, root, "chest", pivot, FORWARD, 0.03, 0.16, 0.45);
    const ribbonPart = finishPart(env, `top-${id}-ribbon`, "top", "cloth-silk", "top", [proceduralPiece(env, ribbon.build(), ["torso"], false)]);
    if (ribbonPart) {
      parts.push(ribbonPart.part);
      mappings.push(ribbonPart.mapping);
    }
  }
  const main = finishPart(env, `top-${id}`, "top", spec.material, "top", pieces);
  if (main) {
    parts.unshift(main.part);
    mappings.unshift(main.mapping);
  }
  return { parts, bones: [], chains: [], mappings };
}

// ---------------------------------------------------------------- 하의

interface BottomSpec {
  readonly labelKo: string;
  readonly material: MaterialPresetId;
  readonly offset: number;
  /** 다리 덮임(위에서부터 비율). 스커트는 엉덩이 밴드만 */
  readonly legs: number;
  readonly skirt: { readonly columns: number; readonly rows: number; readonly length: number; readonly flare: number; readonly pleat: number; readonly strips: number } | null;
}

export const BOTTOM_SPECS: Readonly<Record<BottomStyleId, BottomSpec>> = {
  jeans: { labelKo: "청바지", material: "cloth-denim", offset: 0.007, legs: 1, skirt: null },
  shorts: { labelKo: "반바지", material: "cloth-denim", offset: 0.007, legs: 0.4, skirt: null },
  "pleated-skirt": { labelKo: "플리츠 스커트", material: "cloth-cotton", offset: 0.008, legs: 0, skirt: { columns: 24, rows: 6, length: 0.32, flare: 1.25, pleat: 0.012, strips: 12 } },
  "long-skirt": { labelKo: "롱 스커트", material: "cloth-silk", offset: 0.008, legs: 0, skirt: { columns: 20, rows: 10, length: 0.78, flare: 1.5, pleat: 0, strips: 10 } },
  slacks: { labelKo: "슬랙스", material: "cloth-cotton", offset: 0.011, legs: 1, skirt: null },
};

function skirtTube(env: GarmentEnv, spec: NonNullable<BottomSpec["skirt"]>, offset: number): Piece | null {
  const hips = ringFrame(env.body, ["hips"]);
  if (!hips) return null;
  const { columns, rows, strips } = spec;
  const waistY = hips.yMin + (hips.yMax - hips.yMin) * 0.35;
  const rx = hips.radiusX + offset + 0.004;
  const rz = hips.radiusZ + offset + 0.004;
  const pivot = assumedBodyPivots(env.body).hips ?? hips.center;
  // 스트립 체인: 열 cs = round(s × columns / strips)의 링 점열
  const ringPoint = (r: number, c: number): Vec3 => {
    const angle = (c / columns) * Math.PI * 2;
    const t = r / rows;
    const flare = 1 + (spec.flare - 1) * t;
    const pleat = spec.pleat > 0 ? spec.pleat * (c % 2 === 0 ? 1 : -1) * t : 0;
    return [hips.center[0] + Math.sin(angle) * (rx * flare + pleat), waistY - spec.length * t, hips.center[2] + Math.cos(angle) * (rz * flare + pleat)];
  };
  const boneIndexOf: number[][] = [];
  for (let s = 0; s < strips; s += 1) {
    const cs = Math.round((s * columns) / strips) % columns;
    const points: Vec3[] = [];
    for (let r = 0; r <= rows; r += 1) points.push(ringPoint(r, cs));
    const skins = registerChain(env, "skirt", "skirt", env.counters.skirt, points, "hips", pivot);
    env.counters.skirt += 1;
    boneIndexOf.push(skins.map((skin) => skin.joints[0]));
  }
  const acc = new MeshAccumulator();
  const grid: number[][] = [];
  for (let r = 0; r <= rows; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < columns; c += 1) {
      const p = ringPoint(r, c);
      const normal = v3Normalize([p[0] - hips.center[0], 0, p[2] - hips.center[2]]);
      const u = (c * strips) / columns;
      const s0 = Math.floor(u) % strips;
      const s1 = (s0 + 1) % strips;
      const skin = blendJoints(boneIndexOf[s0][r], boneIndexOf[s1][r], u - Math.floor(u));
      row.push(acc.pushVertex(p, normal, [c / columns, r / rows], skin));
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const c1 = (c + 1) % columns;
      acc.pushQuad(grid[r][c], grid[r + 1][c], grid[r + 1][c1], grid[r][c1]);
    }
  }
  return proceduralPiece(env, acc.build(), ["hips", "leftLeg", "rightLeg"], false);
}

export function buildBottom(id: BottomStyleId, env: GarmentEnv): GarmentBuild {
  const spec = BOTTOM_SPECS[id];
  const pieces: Piece[] = [];
  if (spec.skirt) {
    const band = shellPiece(env, ["hips"], spec.offset, (_, __, ___, y) => {
      const hips = regionBounds(env.body, ["hips"]);
      return hips ? y >= hips.min[1] + (hips.max[1] - hips.min[1]) * 0.3 - 1e-6 : true;
    });
    if (band) pieces.push(band);
    const tube = skirtTube(env, spec.skirt, spec.offset);
    if (tube) pieces.push(tube);
  } else {
    const left = limbCoverage(env, "leftLeg", spec.legs, true);
    const right = limbCoverage(env, "rightLeg", spec.legs, true);
    const shell = shellPiece(env, ["hips", "leftLeg", "rightLeg"], spec.offset, (_, region, __, y) => {
      if (region === "leftLeg") return left(y);
      if (region === "rightLeg") return right(y);
      return true;
    });
    if (shell) pieces.push(shell);
  }
  const main = finishPart(env, `bottom-${id}`, "bottom", spec.material, "bottom", pieces);
  return main ? { parts: [main.part], bones: [], chains: [], mappings: [main.mapping] } : { parts: [], bones: [], chains: [], mappings: [] };
}

// ---------------------------------------------------------------- 신발

interface ShoesSpec {
  readonly labelKo: string;
  readonly material: MaterialPresetId;
  /** 갑피 셸 오프셋(null이면 갑피 없음) */
  readonly upper: number | null;
  /** 종아리 덮임(아래에서부터 비율) */
  readonly shaft: number;
  readonly sole: number;
  readonly straps: boolean;
}

export const SHOES_SPECS: Readonly<Record<ShoesStyleId, ShoesSpec>> = {
  sneakers: { labelKo: "스니커즈", material: "plastic", upper: 0.012, shaft: 0, sole: 0.025, straps: false },
  loafers: { labelKo: "로퍼", material: "leather", upper: 0.008, shaft: 0, sole: 0.012, straps: false },
  boots: { labelKo: "부츠", material: "leather", upper: 0.012, shaft: 0.35, sole: 0.02, straps: false },
  sandals: { labelKo: "샌들", material: "leather", upper: null, shaft: 0, sole: 0.015, straps: true },
};

export function buildShoes(id: ShoesStyleId, env: GarmentEnv): GarmentBuild {
  const spec = SHOES_SPECS[id];
  const pieces: Piece[] = [];
  for (const side of ["left", "right"] as const) {
    const foot: BodyRegion = side === "left" ? "leftFoot" : "rightFoot";
    const leg: BodyRegion = side === "left" ? "leftLeg" : "rightLeg";
    if (spec.upper !== null) {
      const shaft = limbCoverage(env, leg, spec.shaft, false);
      const shell = shellPiece(env, spec.shaft > 0 ? [foot, leg] : [foot], spec.upper, (_, region, __, y) => (region === leg ? shaft(y) : true));
      if (shell) pieces.push(shell);
    }
    const bounds = regionBounds(env.body, [foot]);
    if (!bounds) continue;
    const acc = new MeshAccumulator();
    const pad = 0.008;
    const center: Vec3 = [(bounds.min[0] + bounds.max[0]) / 2, bounds.min[1] - spec.sole / 2 + 0.003, (bounds.min[2] + bounds.max[2]) / 2];
    appendBox(acc, center, [(bounds.max[0] - bounds.min[0]) / 2 + pad, spec.sole / 2, (bounds.max[2] - bounds.min[2]) / 2 + pad + 0.004], singleJoint(0));
    if (spec.straps) {
      const width = (bounds.max[0] - bounds.min[0]) / 2 + 0.006;
      for (const t of [0.35, 0.7]) {
        const z = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * t;
        const points = arcPoints([center[0], bounds.min[1] + 0.004, z], RIGHT, UP, width, 0, Math.PI, 8);
        appendTube(acc, { points, radii: points.map(() => 0.004), sides: 5, skins: points.map(() => singleJoint(0)), sideHint: FORWARD });
      }
    }
    pieces.push(proceduralPiece(env, acc.build(), [foot], true));
  }
  const main = finishPart(env, `shoes-${id}`, "shoes", spec.material, "shoes", pieces);
  return main ? { parts: [main.part], bones: [], chains: [], mappings: [main.mapping] } : { parts: [], bones: [], chains: [], mappings: [] };
}

// ---------------------------------------------------------------- 액세서리

interface AccessorySpec {
  readonly labelKo: string;
  readonly material: MaterialPresetId;
}

export const ACCESSORY_SPECS: Readonly<Record<AccessoryStyleId, AccessorySpec>> = {
  glasses: { labelKo: "안경", material: "plastic" },
  ribbon: { labelKo: "리본", material: "cloth-silk" },
  cap: { labelKo: "캡 모자", material: "cloth-cotton" },
  earrings: { labelKo: "귀걸이", material: "metal" },
  choker: { labelKo: "초커", material: "leather" },
  headphones: { labelKo: "헤드폰", material: "plastic" },
};

function tubeAlong(acc: MeshAccumulator, points: readonly Vec3[], radius: number, sides = 6, caps = false): void {
  appendTube(acc, { points, radii: points.map(() => radius), sides, skins: points.map(() => singleJoint(0)), capStart: caps, capEnd: caps, sideHint: UP });
}

export function buildAccessory(id: AccessoryStyleId, env: GarmentEnv): GarmentBuild {
  const spec = ACCESSORY_SPECS[id];
  const head = headFrameFromBody(env.body);
  const neck = ringFrame(env.body, ["neck"]);
  const pieces: Piece[] = [];
  const acc = new MeshAccumulator();
  const pivots = assumedBodyPivots(env.body);
  if (head) {
    const R = head.radius;
    const C = head.center;
    const eyeY = C[1] + R * 0.08;
    const frontZ = C[2] + R * 0.98;
    if (id === "glasses") {
      const lensR = R * 0.22;
      const inner: Vec3[] = [];
      for (const side of [-1, 1] as const) {
        const center: Vec3 = [C[0] + side * R * 0.33, eyeY, frontZ + 0.01];
        tubeAlong(acc, circlePoints(center, FORWARD, lensR, 12), 0.005);
        inner.push([center[0] - side * lensR, eyeY, frontZ + 0.01]);
        const outer: Vec3 = [center[0] + side * lensR, eyeY, frontZ + 0.006];
        const earTop: Vec3 = [C[0] + side * R * 0.98, eyeY + 0.01, C[2]];
        const earBack: Vec3 = [C[0] + side * R * 0.98, eyeY - 0.02, C[2] - R * 0.3];
        tubeAlong(acc, [outer, earTop, earBack], 0.004, 5);
      }
      tubeAlong(acc, inner, 0.004, 5);
      pieces.push(proceduralPiece(env, acc.build(), ["head"], true));
    } else if (id === "cap") {
      appendSphereShell(acc, { center: v3Add(C, [0, 0.012, 0]), radius: R * 1.1, up: UP, forward: FORWARD, elevationStart: 0, elevationEnd: Math.PI * 0.42, azimuthStart: 0, azimuthEnd: Math.PI * 2, rings: 5, segments: 16, skin: singleJoint(0) });
      // 챙: 앞쪽 부채꼴 2행
      const brimY = C[1] + 0.012 + R * 1.1 * Math.cos(Math.PI * 0.42);
      const rows: number[][] = [];
      for (const [ri, radius] of [R * 1.05, R * 1.6].entries()) {
        const row: number[] = [];
        for (let s = 0; s <= 12; s += 1) {
          const az = -Math.PI * 0.32 + (Math.PI * 0.64 * s) / 12;
          const p: Vec3 = [C[0] + Math.sin(az) * radius, brimY - ri * 0.012, C[2] + Math.cos(az) * radius];
          row.push(acc.pushVertex(p, UP, [s / 12, ri], singleJoint(0)));
        }
        rows.push(row);
      }
      for (let s = 0; s < 12; s += 1) acc.pushQuad(rows[0][s], rows[0][s + 1], rows[1][s + 1], rows[1][s]);
      pieces.push(proceduralPiece(env, acc.build(), ["head"], true));
    } else if (id === "headphones") {
      const band = arcPoints(C, RIGHT, UP, R * 1.12, 0, Math.PI, 14);
      tubeAlong(acc, band, 0.011, 6);
      for (const side of [-1, 1] as const) {
        const ear: Vec3 = [C[0] + side * R * 0.98, C[1] - 0.01, C[2]];
        const outer: Vec3 = [C[0] + side * (R * 0.98 + 0.03), C[1] - 0.01, C[2]];
        appendTube(acc, { points: [ear, outer], radii: [0.035, 0.035], sides: 12, skins: [singleJoint(0), singleJoint(0)], capStart: true, capEnd: true, sideHint: UP });
      }
      pieces.push(proceduralPiece(env, acc.build(), ["head"], true));
    } else if (id === "ribbon") {
      // 머리 왼쪽 위(방위각 60°, 고도 35°) 리본: 매듭 구 + 고리 2 + 늘어진 꼬리 2(체인)
      const az = Math.PI / 3;
      const el = Math.PI * 0.2;
      const dir: Vec3 = v3Normalize([Math.sin(az) * Math.sin(el), Math.cos(el), Math.cos(az) * Math.sin(el)]);
      const base = v3Add(C, v3Scale(dir, R * 1.05));
      appendSphereShell(acc, { center: base, radius: R * 0.09, up: UP, forward: FORWARD, elevationStart: 0, elevationEnd: Math.PI, azimuthStart: 0, azimuthEnd: Math.PI * 2, rings: 4, segments: 8, skin: singleJoint(0) });
      const sideAxis: Vec3 = v3Normalize([dir[2], 0, -dir[0]]);
      for (const side of [-1, 1] as const) {
        const loopCenter = v3Add(base, v3Scale(sideAxis, side * R * 0.14));
        tubeAlong(acc, circlePoints(loopCenter, dir, R * 0.11, 10), 0.006);
      }
      pieces.push(proceduralPiece(env, acc.build(), ["head"], true));
      const tails = new MeshAccumulator();
      ribbonTails(env, tails, base, "head", pivots.head ?? C, dir, 0.018, 0.14, 0.3);
      pieces.push(proceduralPiece(env, tails.build(), ["head"], false));
    } else if (id === "earrings") {
      for (const side of [-1, 1] as const) {
        const root: Vec3 = [C[0] + side * R * 0.98, eyeY - 0.02, C[2]];
        const points = hangingCurve(root, [0, -1, 0], 0.03, 2, 1);
        const skins = registerChain(env, "ribbon", "ribbon", env.counters.ribbon, points, "head", pivots.head ?? C, { stiffness: 2, damping: 0.7, gravityScale: 0.3 });
        env.counters.ribbon += 1;
        tubeAlong(acc, [root, points[1]], 0.0015, 4);
        for (let j = 1; j < points.length; j += 1) {
          appendSphereShell(acc, { center: points[j], radius: j === points.length - 1 ? 0.007 : 0.004, up: UP, forward: FORWARD, elevationStart: 0, elevationEnd: Math.PI, azimuthStart: 0, azimuthEnd: Math.PI * 2, rings: 3, segments: 6, skin: skins[j] });
        }
      }
      pieces.push(proceduralPiece(env, acc.build(), ["head"], false));
    }
  }
  if (id === "choker" && neck) {
    const radius = Math.max(neck.radiusX, neck.radiusZ) + 0.004;
    const points = circlePoints([neck.center[0], neck.center[1] + 0.005, neck.center[2]], UP, radius, 16);
    tubeAlong(acc, points, 0.006, 6);
    pieces.push(proceduralPiece(env, acc.build(), ["neck"], true));
  }
  const main = finishPart(env, `accessory-${id}`, "accessory", spec.material, "accessory", pieces);
  return main ? { parts: [main.part], bones: [], chains: [], mappings: [main.mapping] } : { parts: [], bones: [], chains: [], mappings: [] };
}

// ---------------------------------------------------------------- 전체

/** 선택된 상의·하의·신발·액세서리를 한 결과로 만든다(보조 본 인덱스는 결과 내부 순서). */
export function buildGarments(selection: GarmentSelection, body: BodySurface, bodyMorphs: readonly MorphDelta[], context: OutfitBuildContext): OutfitBuildResult {
  const env = createGarmentEnv(body, bodyMorphs, context);
  return buildGarmentsWithEnv(selection, env);
}

export function buildGarmentsWithEnv(selection: GarmentSelection, env: GarmentEnv): OutfitBuildResult & { readonly mappings: readonly BodyMapping[] } {
  const parts: MeshPartData[] = [];
  const mappings: BodyMapping[] = [];
  const collect = (build: GarmentBuild): void => {
    parts.push(...build.parts);
    mappings.push(...build.mappings);
  };
  if (selection.top) collect(buildTop(selection.top, env));
  if (selection.bottom) collect(buildBottom(selection.bottom, env));
  if (selection.shoes) collect(buildShoes(selection.shoes, env));
  if (selection.accessory) collect(buildAccessory(selection.accessory, env));
  return { parts, bones: env.bones, chains: env.chains, mappings };
}

/** 의상 셸의 유효 두께(검증용): 파츠 정점과 매핑된 몸 정점의 법선 방향 거리 최소값 */
export function minimumNormalOffset(part: MeshPartData, mapping: BodyMapping, body: BodySurface): number {
  const count = part.positions.length / 3;
  let worst = Number.POSITIVE_INFINITY;
  for (let v = 0; v < count; v += 1) {
    const b = mapping.bodyVertex[v * 4];
    const d =
      (part.positions[v * 3] - body.positions[b * 3]) * body.normals[b * 3] +
      (part.positions[v * 3 + 1] - body.positions[b * 3 + 1]) * body.normals[b * 3 + 1] +
      (part.positions[v * 3 + 2] - body.positions[b * 3 + 2]) * body.normals[b * 3 + 2];
    if (d < worst) worst = d;
  }
  return worst;
}
