/**
 * 절차 휴머노이드 조립기(스펙 §5.3 humanoid-model): 레시피 슬롯 → `HumanoidModelData`.
 *
 * 조립 규약
 * - 기준 형상은 **파라미터 0**에서 만들고 체형 9·얼굴 15 파라미터는 ± morph(36개)로, 표정은 FACS 16 morph로 제공한다.
 *   현재 파라미터 값은 적용 플랜(`paramToMorphWeights`)이 가중치로 적용하므로 여기서 다시 굽지 않는다(이중 적용 방지).
 *   따라서 결과는 `recipe.slots`(지오메트리 슬롯: eyes·irises·hair·top·bottom·shoes·accessory)와 세분 단계에만 의존한다.
 * - 파츠는 **역할당 최대 1개**를 `PART_ROLES` 순서로 낸다(기본 플래너 `DEFAULT_PART_LAYOUT`·페인트 레이어가 역할 단위).
 *   좌우 눈 파츠·헤어 캡/스트랜드처럼 같은 역할의 조각은 한 파츠로 병합한다.
 *   partId = `PART_ROLES` 인덱스 + 1, materialId = `PART_ROLES` 인덱스(역할 고정). 슬롯이 비어 파츠가 없는 역할이 있어도 나머지 partId가
 *   밀리지 않아야 `planApply`의 기본 레이아웃(partId = 역할 순서 + 1)과 가시성·색이 정렬된다. 모든 역할이 있으면 `allocatePartIds`와 같고,
 *   결손이 있으면 팔레트가 희소(sparse)하다(`partIdPalette`는 실제 파츠 id만 담는다).
 * - 기준 형상(몸·머리·스켈레톤·스킨 웨이트·체형 morph)은 슬롯과 무관하므로 세분 단계별로 한 번만 만들어 캐시하고, 호출마다 버퍼를 복제해 돌려준다
 *   (슬롯을 바꿔 소스를 다시 만들 때 수백 ms → 수십 ms). 결과는 캐시 유무와 무관하게 바이트 동일하다.
 * - outfit 포트 규약(docs/parity/outfit.md §1): 헤어·의상 결과를 합칠 때 두 번째 결과의 보조 본 인덱스(≥55)를 앞 결과의 본 수만큼
 *   밀고, 보조 루트 본의 restTranslation은 (추정 피벗 − 실제 rest 위치)로 보정한다. 도메인 교차 import가 금지돼
 *   같은 의미의 `combineOutfitResults`·`rebaseAuxiliaryRoots`를 여기서 재구현한다(추정 피벗 공식도 outfit과 동일).
 * - 헤어에는 머리 프레임 유사변환 기반 체형 morph 18개를 붙여 키·목 길이·머리 크기 변화를 머리와 똑같이 따르게 한다
 *   (outfit이 준 `param:headSize:±`는 같은 이름의 정확한 프레임 델타로 대체). 의상은 outfit이 전파한 체형 morph를 그대로 쓴다.
 * - 입: 머리 케이지에 입 구멍 + 입 안 주머니가 있고(`geometry/head-cage.ts`) 머리 파츠의 스킨 웨이트에 jaw 본이 들어간다
 *   (`skeleton/jaw-weights.ts`, FACS 턱 열림 필드와 같은 마스크). 치아·혀는 그 공동 안에 놓이며 표정·파라미터에서 피부를 뚫지 않는다.
 * - 관절 오프셋은 계약(`HumanoidModelData`)에 채널이 없어 `ProceduralHumanoidModel.jointOffsets`로 덧붙여 돌려준다.
 * - 모든 단계가 해석적·결정적이다(난수 없음; 시드는 outfit 포트에만 전달).
 */
import {
  ALL_FACS_MORPH_NAMES,
  BODY_PARAM_KEYS,
  EMPTY_OUTFIT_RESULT,
  FACE_PARAM_KEYS,
  HUMANOID_BONE_NAMES,
  PART_ROLES,
  PART_ROLE_LABELS_KO,
  SLOT_LABELS_KO,
  SLOT_PRESET_IDS,
  allParamMorphNames,
  bodyRegionIndex,
  failVisible,
  presetName,
  validateMeshPartData,
  type AccessoryStyleId,
  type BodySurface,
  type BoneData,
  type BottomStyleId,
  type CapsuleCollider,
  type ChainAnchor,
  type CharacterRecipe,
  type EyesStyleId,
  type GarmentSelection,
  type HairStyleId,
  type HumanoidModelData,
  type IrisStyleId,
  type MaterialPresetId,
  type MeshPartData,
  type MorphDelta,
  type OutfitBuildContext,
  type OutfitBuildResult,
  type OutfitBuilderPort,
  type ParamMorphTargetName,
  type PartIdPalette,
  type PartRole,
  type RecipeColorKey,
  type ScalpSurface,
  type ShoesStyleId,
  type SkeletonData,
  type SlotKind,
  type SlotPresetIds,
  type SurfaceSample,
  type TopStyleId,
  type Vec3,
} from "../../contracts";
import { fnv1a64Hex, fnv1a64HexBytes } from "../../shared/hash";
import { bytesOf } from "../../shared/typed-array";

import { buildBrows, buildLash } from "./geometry/brow-lash-builder";
import { buildBodyCage } from "./geometry/cage";
import { buildEyeHighlight, buildEyeball, buildIris, buildPupil } from "./geometry/eye-builder";
import { buildHeadCage, isScalpLocal } from "./geometry/head-cage";
import { buildTeeth, buildTongue, isLowerTeethPoint } from "./geometry/mouth-builder";
import { catmullClark, subdividedToTriMesh } from "./geometry/subdivision";
import { computeVertexNormals } from "./geometry/tri-mesh";
import { buildBodyMorphs, headAttachedBodyDelta } from "./morph/body-morphs";
import { buildFaceParamDeltas, buildFacsDeltas } from "./morph/face-morphs";
import { deltaNormals, expandDeltas, isNegligibleDelta } from "./morph/morph-utils";
import { worldToHeadLocal } from "./proportions";
import { blendJawWeights } from "./skeleton/jaw-weights";
import { collidersFromSkeleton } from "./skeleton/pose-math";
import { boneCapsuleRadii, boneCapsules, boneWorldPositions, buildHumanoidSkeleton } from "./skeleton/skeleton-builder";
import { buildAdjacency, computeSkinWeights, expandSkinWeights, rigidSkinWeights, selectSkinWeights } from "./skeleton/skin-weights";

import type { SplitTriMesh, SubdividedMesh } from "./geometry/subdivision";
import type { TriMesh } from "./geometry/tri-mesh";
import type { BodyMorphTarget, JointOffsets } from "./morph/body-morphs";
import type { FaceMorphScope } from "./morph/face-fields";
import type { BodyProportions, HeadFrame } from "./proportions";
import type { SkinWeights } from "./skeleton/skin-weights";

// ---------------------------------------------------------------- 공개 타입

export type SubdivisionLevels = 0 | 1 | 2;

export interface HumanoidBuildOptions {
  readonly subdivisionLevels: SubdivisionLevels;
  /** 결정성 시드(outfit 포트에 그대로 전달) */
  readonly seed: number;
  readonly outfit: OutfitBuilderPort;
}

/** 조립기가 읽는 레시피 필드(core는 CharacterRecipe 전체를 넘긴다) */
export type HumanoidModelRecipe = Pick<CharacterRecipe, "body" | "face" | "slots" | "colors">;

/** 절차 모델 지오메트리를 바꾸는 슬롯. core가 절차 소스 재생성 키에 포함해야 하는 집합이다. */
export const GEOMETRY_SLOT_KINDS = ["eyes", "irises", "hair", "top", "bottom", "shoes", "accessory"] as const satisfies readonly SlotKind[];
export type GeometrySlotKind = (typeof GEOMETRY_SLOT_KINDS)[number];

/** 미리보기 삼각형 예산(스펙) */
export const TRIANGLE_BUDGET = 140_000;
/** 보조 본 인덱스 기준(outfit 규약: VRM 55본 뒤) */
export const AUX_BONE_INDEX_BASE = HUMANOID_BONE_NAMES.length;
/** 눈 슬롯이 비어 있을 때 쓰는 기본 스타일(플래너가 파츠를 숨긴다) */
export const DEFAULT_EYES_STYLE: EyesStyleId = "almond";
export const DEFAULT_IRIS_STYLE: IrisStyleId = "round-large";

export interface ResolvedStyles {
  readonly eyes: EyesStyleId;
  readonly irises: IrisStyleId;
  readonly hair: HairStyleId | null;
  readonly top: TopStyleId | null;
  readonly bottom: BottomStyleId | null;
  readonly shoes: ShoesStyleId | null;
  readonly accessory: AccessoryStyleId | null;
}

export interface HumanoidBuildStats {
  readonly subdivisionLevels: SubdivisionLevels;
  readonly partCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly morphCount: number;
  readonly boneCount: number;
  readonly auxiliaryBoneCount: number;
  readonly chainCount: number;
}

/** 계약 모델 + 조립기만 아는 부가 정보(엔진은 무시한다) */
export interface ProceduralHumanoidModel extends HumanoidModelData {
  /** 체형 morph 이름 → 본별 rest 평행이동 오프셋(가중치 × 오프셋을 더하면 관절이 형상을 따른다) */
  readonly jointOffsets: Readonly<Partial<Record<ParamMorphTargetName, JointOffsets>>>;
  readonly styles: ResolvedStyles;
  readonly stats: HumanoidBuildStats;
}

// ---------------------------------------------------------------- 스타일 해석

function vocabularyName<S extends GeometrySlotKind>(recipe: HumanoidModelRecipe, slot: S, now: number): SlotPresetIds[S][number] | null {
  const id = recipe.slots[slot] ?? null;
  if (id === null) return null;
  const name = presetName(id);
  const names: readonly string[] = SLOT_PRESET_IDS[slot];
  if (!names.includes(name)) {
    throw failVisible("humanoid-unknown-style", `${SLOT_LABELS_KO[slot]} 슬롯 프리셋 "${id}"는 절차 소스 어휘에 없습니다.`, undefined, now);
  }
  return name as SlotPresetIds[S][number];
}

/** 레시피 슬롯에서 지오메트리 스타일을 고른다. 어휘 밖 프리셋은 fail-visible로 거부한다(무음 대체 없음). */
export function resolveStyles(recipe: HumanoidModelRecipe, now: number = Date.now()): ResolvedStyles {
  return {
    eyes: vocabularyName(recipe, "eyes", now) ?? DEFAULT_EYES_STYLE,
    irises: vocabularyName(recipe, "irises", now) ?? DEFAULT_IRIS_STYLE,
    hair: vocabularyName(recipe, "hair", now),
    top: vocabularyName(recipe, "top", now),
    bottom: vocabularyName(recipe, "bottom", now),
    shoes: vocabularyName(recipe, "shoes", now),
    accessory: vocabularyName(recipe, "accessory", now),
  };
}

// ---------------------------------------------------------------- 파츠 조각·병합

interface RawMorph {
  readonly name: string;
  readonly deltaPositions: Float32Array;
}

interface PartPiece {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly skin: SkinWeights;
  readonly morphs: readonly RawMorph[];
}

interface PartBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly skin: SkinWeights;
}

interface PartMeta {
  readonly id: string;
  readonly role: PartRole;
  readonly materialPreset: MaterialPresetId;
  readonly colorKey?: RecipeColorKey;
}

const ROLE_ORDER: ReadonlyMap<PartRole, number> = new Map(PART_ROLES.map((role, index) => [role, index]));

function boneIndexOf(name: (typeof HUMANOID_BONE_NAMES)[number]): number {
  return HUMANOID_BONE_NAMES.indexOf(name);
}

/** 조각들을 한 파츠 버퍼로 잇는다(인덱스 오프셋, morph는 이름별로 이어 붙이고 없는 조각은 0). */
function concatPieces(pieces: readonly PartPiece[]): PartBuffers & { readonly morphs: RawMorph[] } {
  let vertexTotal = 0;
  let indexTotal = 0;
  for (const piece of pieces) {
    vertexTotal += piece.positions.length / 3;
    indexTotal += piece.indices.length;
  }
  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const uvs = new Float32Array(vertexTotal * 2);
  const indices = new Uint32Array(indexTotal);
  const jointIndices = new Uint16Array(vertexTotal * 4);
  const jointWeights = new Float32Array(vertexTotal * 4);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const piece of pieces) {
    for (const morph of piece.morphs) {
      if (seen.has(morph.name)) continue;
      seen.add(morph.name);
      names.push(morph.name);
    }
  }
  const deltas = names.map(() => new Float32Array(vertexTotal * 3));
  let vOffset = 0;
  let iOffset = 0;
  for (const piece of pieces) {
    const count = piece.positions.length / 3;
    positions.set(piece.positions, vOffset * 3);
    normals.set(piece.normals, vOffset * 3);
    uvs.set(piece.uvs, vOffset * 2);
    jointIndices.set(piece.skin.jointIndices, vOffset * 4);
    jointWeights.set(piece.skin.jointWeights, vOffset * 4);
    for (let i = 0; i < piece.indices.length; i += 1) indices[iOffset + i] = piece.indices[i] + vOffset;
    const byName = new Map(piece.morphs.map((morph) => [morph.name, morph.deltaPositions]));
    names.forEach((name, m) => {
      const delta = byName.get(name);
      if (delta) deltas[m].set(delta, vOffset * 3);
    });
    vOffset += count;
    iOffset += piece.indices.length;
  }
  return { positions, normals, uvs, indices, skin: { jointIndices, jointWeights }, morphs: names.map((name, m) => ({ name, deltaPositions: deltas[m] })) };
}

/** 분할 정점 메시의 morph를 완성한다: 영 델타는 버리고 델타 법선을 붙인다. */
function finalizeSplitMorphs(buffers: PartBuffers, raw: readonly RawMorph[]): MorphDelta[] {
  const baseNormals = computeVertexNormals(buffers.positions, buffers.indices);
  const out: MorphDelta[] = [];
  for (const morph of raw) {
    if (isNegligibleDelta(morph.deltaPositions)) continue;
    out.push({ name: morph.name, deltaPositions: morph.deltaPositions, deltaNormals: deltaNormals(buffers.positions, morph.deltaPositions, buffers.indices, baseNormals) });
  }
  return out;
}

/** 용접 정점 델타를 분할 정점으로 확장하고 용접 토폴로지에서 델타 법선을 계산한다(UV 솔기에서도 매끈). */
function finalizeWeldedMorphs(sub: SubdividedMesh, tri: SplitTriMesh, raw: readonly RawMorph[]): MorphDelta[] {
  const weldedNormals = computeVertexNormals(sub.positions, tri.weldedTriangles);
  const out: MorphDelta[] = [];
  for (const morph of raw) {
    if (isNegligibleDelta(morph.deltaPositions)) continue;
    const normals = deltaNormals(sub.positions, morph.deltaPositions, tri.weldedTriangles, weldedNormals);
    out.push({ name: morph.name, deltaPositions: expandDeltas(morph.deltaPositions, tri.vertexSource), deltaNormals: expandDeltas(normals, tri.vertexSource) });
  }
  return out;
}

function toPart(meta: PartMeta, buffers: PartBuffers, morphs: readonly MorphDelta[]): MeshPartData {
  return {
    id: meta.id,
    role: meta.role,
    partId: 0,
    materialId: 0,
    materialPreset: meta.materialPreset,
    ...(meta.colorKey ? { colorKey: meta.colorKey } : {}),
    positions: buffers.positions,
    normals: buffers.normals,
    uvs: buffers.uvs,
    indices: buffers.indices,
    jointIndices: buffers.skin.jointIndices,
    jointWeights: buffers.skin.jointWeights,
    morphs,
  };
}

// ---------------------------------------------------------------- 머리 부속 파츠

interface HeadContext {
  readonly frame: HeadFrame;
  readonly bodyTargets: readonly BodyMorphTarget[];
}

/** 머리에 붙은 작은 파츠의 morph: 체형 18(머리 프레임 유사변환) + 얼굴 30 + FACS 16(스코프별 필드) */
function headAttachedMorphs(positions: Float32Array, ctx: HeadContext, scope: FaceMorphScope): RawMorph[] {
  const body = ctx.bodyTargets.map((target) => ({ name: target.name, deltaPositions: headAttachedBodyDelta(positions, ctx.frame, target.headFrame) }));
  const face = buildFaceParamDeltas(positions, ctx.frame, scope);
  const facs = buildFacsDeltas(positions, ctx.frame, scope);
  return [...body, ...face, ...facs];
}

function piece(mesh: TriMesh, skin: SkinWeights, morphs: readonly RawMorph[]): PartPiece {
  return { positions: mesh.positions, normals: mesh.normals, uvs: mesh.uvs, indices: mesh.indices, skin, morphs };
}

function sidedPieces(ctx: HeadContext, build: (side: "left" | "right") => TriMesh, scopeOf: (side: "left" | "right") => FaceMorphScope, boneOf: (side: "left" | "right") => number): PartPiece[] {
  return (["left", "right"] as const).map((side) => {
    const mesh = build(side);
    return piece(mesh, rigidSkinWeights(mesh.positions.length / 3, boneOf(side)), headAttachedMorphs(mesh.positions, ctx, scopeOf(side)));
  });
}

function buildHeadAttachedParts(ctx: HeadContext, styles: ResolvedStyles): MeshPartData[] {
  const head = boneIndexOf("head");
  const jaw = boneIndexOf("jaw");
  const eyeBone = (side: "left" | "right"): number => boneIndexOf(side === "left" ? "leftEye" : "rightEye");
  const eyeScope = (side: "left" | "right"): FaceMorphScope => (side === "left" ? "eye-left" : "eye-right");
  const frame = ctx.frame;
  const make = (meta: PartMeta, pieces: readonly PartPiece[]): MeshPartData => {
    const merged = concatPieces(pieces);
    return toPart(meta, merged, finalizeSplitMorphs(merged, merged.morphs));
  };
  const teeth = buildTeeth(frame);
  const tongue = buildTongue(frame);
  const brows = buildBrows(frame);
  return [
    make({ id: "eyeball", role: "eyeball", materialPreset: "eye-wet" }, sidedPieces(ctx, (side) => buildEyeball(frame, side, styles.eyes), eyeScope, eyeBone)),
    make({ id: "iris", role: "iris", materialPreset: "iris", colorKey: "iris" }, sidedPieces(ctx, (side) => buildIris(frame, side, styles.eyes, styles.irises), eyeScope, eyeBone)),
    make({ id: "pupil", role: "pupil", materialPreset: "iris", colorKey: "iris" }, sidedPieces(ctx, (side) => buildPupil(frame, side, styles.eyes, styles.irises), eyeScope, eyeBone)),
    make(
      { id: "eye-highlight", role: "eye-highlight", materialPreset: "unlit-highlight" },
      sidedPieces(ctx, (side) => buildEyeHighlight(frame, side, styles.eyes, styles.irises), eyeScope, eyeBone),
    ),
    make({ id: "brow", role: "brow", materialPreset: "hair-aniso", colorKey: "brow" }, [piece(brows, rigidSkinWeights(brows.positions.length / 3, head), headAttachedMorphs(brows.positions, ctx, "surface"))]),
    make(
      { id: "lash", role: "lash", materialPreset: "hair-aniso", colorKey: "brow" },
      sidedPieces(
        ctx,
        (side) => buildLash(frame, side, styles.eyes),
        () => "surface",
        () => head,
      ),
    ),
    make({ id: "teeth", role: "teeth", materialPreset: "plastic" }, [
      piece(teeth, selectSkinWeights(teeth.positions, (p) => (isLowerTeethPoint(frame, p) ? jaw : head)), headAttachedMorphs(teeth.positions, ctx, "teeth")),
    ]),
    make({ id: "tongue", role: "tongue", materialPreset: "skin-sss" }, [piece(tongue, rigidSkinWeights(tongue.positions.length / 3, jaw), headAttachedMorphs(tongue.positions, ctx, "tongue"))]),
  ];
}

// ---------------------------------------------------------------- 두피·몸 표면(outfit 입력)

interface SphereFit {
  readonly center: Vec3;
  readonly radius: number;
}

/** 4×4 선형계 가우스 소거(부분 피벗). 특이하면 null. */
function solveLinear4(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  const n = 4;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c += 1) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/**
 * 두피 샘플에 대수적(Kåsa) 구 적합 후 중심 x를 0으로 고정하고, 반경은 모든 샘플을 감싸는 최대 거리로 둔다
 * (헤어 캡·스트랜드가 두피 안으로 들어가지 않도록). 적합이 특이하면 머리 프레임 중심을 쓴다.
 */
export function fitScalpSphere(points: readonly Vec3[], fallbackCenter: Vec3): SphereFit {
  const m = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const b = [0, 0, 0, 0];
  for (const [x, y, z] of points) {
    const row = [x, y, z, 1];
    const s = -(x * x + y * y + z * z);
    for (let i = 0; i < 4; i += 1) {
      b[i] += row[i] * s;
      for (let j = 0; j < 4; j += 1) m[i][j] += row[i] * row[j];
    }
  }
  const solved = points.length >= 4 ? solveLinear4(m, b) : null;
  const center: Vec3 = solved && solved.every(Number.isFinite) ? [0, -solved[1] / 2, -solved[2] / 2] : fallbackCenter;
  let radius = 0;
  for (const p of points) radius = Math.max(radius, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]));
  return { center, radius };
}

/** 머리 삼각 메시에서 두피 표면(헤어 앵커 기준)을 만든다. 샘플은 정점 순서(결정적). */
export function buildScalpSurface(headTri: SplitTriMesh, frame: HeadFrame): ScalpSurface {
  const samples: SurfaceSample[] = [];
  const points: Vec3[] = [];
  const count = headTri.positions.length / 3;
  for (let v = 0; v < count; v += 1) {
    const p: Vec3 = [headTri.positions[v * 3], headTri.positions[v * 3 + 1], headTri.positions[v * 3 + 2]];
    if (!isScalpLocal(worldToHeadLocal(frame, p))) continue;
    points.push(p);
    samples.push({
      position: p,
      normal: [headTri.normals[v * 3], headTri.normals[v * 3 + 1], headTri.normals[v * 3 + 2]],
      uv: [headTri.uvs[v * 2], headTri.uvs[v * 2 + 1]],
    });
  }
  const fit = fitScalpSphere(points, frame.center);
  return { center: fit.center, radius: fit.radius, up: [0, 1, 0], forward: [0, 0, 1], samples };
}

/** outfit 규약(hair-builder.assumedHeadPivot): 머리 중심 − up × 반경 */
export function assumedHeadPivot(scalp: ScalpSurface): Vec3 {
  return [scalp.center[0], scalp.center[1] - scalp.radius, scalp.center[2]];
}

function regionCentroid(body: BodySurface, region: number): Vec3 | null {
  let n = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  const count = body.positions.length / 3;
  for (let v = 0; v < count; v += 1) {
    if (body.regionOfVertex[v] !== region) continue;
    n += 1;
    x += body.positions[v * 3];
    y += body.positions[v * 3 + 1];
    z += body.positions[v * 3 + 2];
  }
  return n > 0 ? [x / n, y / n, z / n] : null;
}

/** outfit 규약(garments.assumedBodyPivots): head = 머리 영역 중심 − 최대 반경(≥0.05), hips·chest = 영역 중심 */
export function assumedBodyPivots(body: BodySurface): Partial<Record<"head" | "hips" | "chest", Vec3>> {
  const out: Partial<Record<"head" | "hips" | "chest", Vec3>> = {};
  const headRegion = bodyRegionIndex("head");
  const head = regionCentroid(body, headRegion);
  if (head) {
    let radius = 0;
    const count = body.positions.length / 3;
    for (let v = 0; v < count; v += 1) {
      if (body.regionOfVertex[v] !== headRegion) continue;
      radius = Math.max(radius, Math.hypot(body.positions[v * 3] - head[0], body.positions[v * 3 + 1] - head[1], body.positions[v * 3 + 2] - head[2]));
    }
    out.head = [head[0], head[1] - Math.max(0.05, radius), head[2]];
  }
  const hips = regionCentroid(body, bodyRegionIndex("hips"));
  if (hips) out.hips = hips;
  const torso = regionCentroid(body, bodyRegionIndex("torso"));
  if (torso) out.chest = torso;
  return out;
}

/** 피부 파츠 + 머리 파츠를 이어 붙인 몸 표면(의상 오프셋 셸·액세서리 머리 프레임의 기준) */
export function buildBodySurface(skin: PartBuffers, skinRegions: Uint8Array, head: PartBuffers): BodySurface {
  const skinCount = skin.positions.length / 3;
  const headCount = head.positions.length / 3;
  const total = skinCount + headCount;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const indices = new Uint32Array(skin.indices.length + head.indices.length);
  const jointIndices = new Uint16Array(total * 4);
  const jointWeights = new Float32Array(total * 4);
  const regionOfVertex = new Uint8Array(total);
  positions.set(skin.positions, 0);
  positions.set(head.positions, skinCount * 3);
  normals.set(skin.normals, 0);
  normals.set(head.normals, skinCount * 3);
  uvs.set(skin.uvs, 0);
  uvs.set(head.uvs, skinCount * 2);
  indices.set(skin.indices, 0);
  for (let i = 0; i < head.indices.length; i += 1) indices[skin.indices.length + i] = head.indices[i] + skinCount;
  jointIndices.set(skin.skin.jointIndices, 0);
  jointIndices.set(head.skin.jointIndices, skinCount * 4);
  jointWeights.set(skin.skin.jointWeights, 0);
  jointWeights.set(head.skin.jointWeights, skinCount * 4);
  regionOfVertex.set(skinRegions, 0);
  regionOfVertex.fill(bodyRegionIndex("head"), skinCount);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < total; v += 1) {
    for (let k = 0; k < 3; k += 1) {
      const value = positions[v * 3 + k];
      if (value < min[k]) min[k] = value;
      if (value > max[k]) max[k] = value;
    }
  }
  return { positions, normals, uvs, indices, jointIndices, jointWeights, regionOfVertex, bounds: { min, max } };
}

// ---------------------------------------------------------------- outfit 결과 합치기(규약 재구현)

/** 파츠의 보조 본 인덱스(≥ AUX_BONE_INDEX_BASE)를 offset만큼 민 사본 */
export function offsetAuxiliaryJointIndices(part: MeshPartData, offset: number): MeshPartData {
  if (!part.jointIndices || offset === 0) return part;
  const jointIndices = new Uint16Array(part.jointIndices);
  for (let i = 0; i < jointIndices.length; i += 1) if (jointIndices[i] >= AUX_BONE_INDEX_BASE) jointIndices[i] = jointIndices[i] + offset;
  return { ...part, jointIndices };
}

/** 보조 루트 본(parent가 휴머노이드 본)의 restTranslation을 (추정 피벗 − 실제 rest 위치)만큼 보정한다. */
export function rebaseAuxiliaryRoots(bones: readonly BoneData[], actualParentRest: Readonly<Partial<Record<string, Vec3>>>, assumedParentRest: Readonly<Partial<Record<string, Vec3>>>): BoneData[] {
  return bones.map((bone) => {
    if (!bone.auxiliary || bone.parent === null) return bone;
    const actual = actualParentRest[bone.parent];
    const assumed = assumedParentRest[bone.parent];
    if (!actual || !assumed) return bone;
    return {
      ...bone,
      restTranslation: [bone.restTranslation[0] + assumed[0] - actual[0], bone.restTranslation[1] + assumed[1] - actual[1], bone.restTranslation[2] + assumed[2] - actual[2]],
    };
  });
}

/** 여러 outfit 결과를 하나로(뒤 결과의 보조 본 인덱스를 앞 결과의 본 수만큼 민다) */
export function combineOutfitResults(results: readonly OutfitBuildResult[]): OutfitBuildResult {
  const parts: MeshPartData[] = [];
  const bones: BoneData[] = [];
  const chains: ChainAnchor[] = [];
  for (const result of results) {
    const offset = bones.length;
    for (const part of result.parts) parts.push(offsetAuxiliaryJointIndices(part, offset));
    bones.push(...result.bones);
    chains.push(...result.chains);
  }
  return { parts, bones, chains };
}

function partToPiece(part: MeshPartData, fallbackBone: number): PartPiece {
  const count = part.positions.length / 3;
  const skin: SkinWeights =
    part.jointIndices && part.jointWeights ? { jointIndices: part.jointIndices, jointWeights: part.jointWeights } : rigidSkinWeights(count, fallbackBone);
  return { positions: part.positions, normals: part.normals, uvs: part.uvs, indices: part.indices, skin, morphs: part.morphs };
}

/** 같은 역할의 outfit 파츠를 한 파츠로 병합한다(재질·색 키는 첫 파츠 기준). */
function mergeOutfitRole(role: PartRole, parts: readonly MeshPartData[], id: string, extraMorphs?: (positions: Float32Array) => RawMorph[]): MeshPartData {
  const first = parts[0];
  const pieces = parts.map((part) => partToPiece(part, boneIndexOf("head")));
  const merged = concatPieces(pieces);
  let raw: RawMorph[] = merged.morphs;
  if (extraMorphs) {
    const extra = extraMorphs(merged.positions);
    const replaced = new Set(extra.map((morph) => morph.name));
    raw = [...extra, ...raw.filter((morph) => !replaced.has(morph.name))];
  }
  return toPart({ id, role, materialPreset: first.materialPreset, ...(first.colorKey ? { colorKey: first.colorKey } : {}) }, merged, finalizeSplitMorphs(merged, raw));
}

// ---------------------------------------------------------------- 조립

/** 캡슐 거리 웨이트 + 라플라시안 스무딩(스펙). 머리 케이지는 `afterWeights`로 jaw 본 웨이트를 더한다. */
function buildSkinnedCage(
  sub: SubdividedMesh,
  skeleton: SkeletonData,
  capsules: ReturnType<typeof boneCapsules>,
  afterWeights: (weights: SkinWeights) => SkinWeights = (weights) => weights,
): { tri: SplitTriMesh; buffers: PartBuffers } {
  const tri = subdividedToTriMesh(sub);
  const adjacency = buildAdjacency(sub.positions.length / 3, sub.faces);
  const welded = afterWeights(computeSkinWeights(sub.positions, skeleton, capsules, { regions: sub.regions, adjacency, smoothingIterations: 2 }));
  return { tri, buffers: { positions: tri.positions, normals: tri.normals, uvs: tri.uvs, indices: tri.indices, skin: expandSkinWeights(welded, tri.vertexSource) } };
}

const CANONICAL_MORPH_NAMES: readonly string[] = [...allParamMorphNames(BODY_PARAM_KEYS), ...allParamMorphNames(FACE_PARAM_KEYS), ...ALL_FACS_MORPH_NAMES];

/** 파츠에 있는 morph 이름을 규약 순서(체형 ± → 얼굴 ± → FACS)로, 규약 밖 이름은 등장 순으로 뒤에 둔다. */
export function collectMorphNames(parts: readonly MeshPartData[]): string[] {
  const present = new Set<string>();
  const extras: string[] = [];
  const canonical = new Set(CANONICAL_MORPH_NAMES);
  for (const part of parts) {
    for (const morph of part.morphs) {
      if (present.has(morph.name)) continue;
      present.add(morph.name);
      if (!canonical.has(morph.name)) extras.push(morph.name);
    }
  }
  return [...CANONICAL_MORPH_NAMES.filter((name) => present.has(name)), ...extras];
}

// ---------------------------------------------------------------- 기준 형상(슬롯 무관) 캐시

/** 슬롯·시드와 무관한 기준 형상. 세분 단계에만 의존한다(파라미터 0 기준 + ± morph). */
interface HumanoidBase {
  readonly proportions: BodyProportions;
  readonly frame: HeadFrame;
  readonly bones: readonly BoneData[];
  readonly colliders: readonly CapsuleCollider[];
  readonly skinPart: MeshPartData;
  readonly headPart: MeshPartData;
  readonly bodyTargets: readonly BodyMorphTarget[];
  readonly jointOffsets: Readonly<Partial<Record<ParamMorphTargetName, JointOffsets>>>;
  readonly scalp: ScalpSurface;
  readonly bodySurface: BodySurface;
  readonly bodySurfaceMorphs: readonly MorphDelta[];
  /** 실제 rest 본 위치(보조 루트 보정의 기준) */
  readonly actualPivots: Readonly<Record<"head" | "hips" | "chest", Vec3>>;
  /** outfit이 가정한 피벗(헤어: 머리, 의상: 머리·엉덩이·가슴) */
  readonly assumedHairPivots: Readonly<Partial<Record<string, Vec3>>>;
  readonly assumedBodyPivotMap: Readonly<Partial<Record<string, Vec3>>>;
}

const baseCache = new Map<SubdivisionLevels, HumanoidBase>();

function createBase(levels: SubdivisionLevels, now: number): HumanoidBase {
  // 1. 케이지 → 세분 → 삼각 메시(기준 형상은 파라미터 0)
  const bodyCage = buildBodyCage({});
  const headCage = buildHeadCage({});
  const proportions = bodyCage.proportions;
  const frame = headCage.frame;
  const bodySub = catmullClark(bodyCage.mesh, levels);
  const headSub = catmullClark(headCage.mesh, levels);

  // 2. 스켈레톤·캡슐·충돌체·스킨 웨이트
  const skeleton = buildHumanoidSkeleton(proportions);
  const capsules = boneCapsules(proportions);
  const colliders: CapsuleCollider[] = collidersFromSkeleton(skeleton, boneCapsuleRadii(proportions));
  const body = buildSkinnedCage(bodySub, skeleton, capsules);
  const head = buildSkinnedCage(headSub, skeleton, capsules, (weights) => blendJawWeights(headSub.positions, weights, frame, boneIndexOf("head"), boneIndexOf("jaw")));

  // 3. morph: 체형 18(케이지 재생성 → 스텐실 리프트) + 얼굴 30 + FACS 16(머리 표면 필드)
  const bodyMorphSet = buildBodyMorphs({ baseParams: {}, bodyCage, headCage, bodyPlan: bodySub.plan, headPlan: headSub.plan });
  const bodyTargets = bodyMorphSet.targets;
  const skinRaw: RawMorph[] = bodyTargets.map((target) => ({ name: target.name, deltaPositions: target.bodyDelta }));
  const headRaw: RawMorph[] = [
    ...bodyTargets.map((target) => ({ name: target.name, deltaPositions: target.headDelta })),
    ...buildFaceParamDeltas(headSub.positions, frame, "surface"),
    ...buildFacsDeltas(headSub.positions, frame, "surface"),
  ];
  const skinPart = toPart({ id: "skin", role: "skin", materialPreset: "skin-sss", colorKey: "skin" }, body.buffers, finalizeWeldedMorphs(bodySub, body.tri, skinRaw));
  const headPart = toPart({ id: "head", role: "head", materialPreset: "skin-sss", colorKey: "skin" }, head.buffers, finalizeWeldedMorphs(headSub, head.tri, headRaw));

  // 4. outfit 입력: 두피·몸 표면과 몸 표면 morph(피부 + 머리 정점 순서)
  const scalp = buildScalpSurface(head.tri, frame);
  const bodySurface = buildBodySurface(body.buffers, body.tri.regions, head.buffers);
  const bodySurfaceMorphs: MorphDelta[] = bodyTargets.map((target) => {
    const skinDelta = expandDeltas(target.bodyDelta, body.tri.vertexSource);
    const headDelta = expandDeltas(target.headDelta, head.tri.vertexSource);
    const delta = new Float32Array(skinDelta.length + headDelta.length);
    delta.set(skinDelta, 0);
    delta.set(headDelta, skinDelta.length);
    return { name: target.name, deltaPositions: delta };
  });
  const restWorld = boneWorldPositions(proportions);
  const jointOffsets: Partial<Record<ParamMorphTargetName, JointOffsets>> = {};
  for (const key of BODY_PARAM_KEYS) {
    const pair = bodyMorphSet.jointOffsets[key];
    jointOffsets[`param:${key}:+`] = pair.plus;
    jointOffsets[`param:${key}:-`] = pair.minus;
  }
  // partId는 조립 시 역할로 배정하므로(0) 검사에서는 역할 id를 임시로 붙인다.
  const failure = [skinPart, headPart].map((part) => validateMeshPartData({ ...part, partId: partIdOfRole(part.role) }, now)).find((item) => item !== null);
  if (failure) throw failVisible("humanoid-part-invalid", `절차 휴머노이드 기준 파츠 정합성 위반: ${failure.reasonKo}`, undefined, now);
  return {
    proportions,
    frame,
    bones: skeleton.bones,
    colliders,
    skinPart,
    headPart,
    bodyTargets,
    jointOffsets,
    scalp,
    bodySurface,
    bodySurfaceMorphs,
    actualPivots: { head: restWorld.head, hips: restWorld.hips, chest: restWorld.chest },
    assumedHairPivots: { head: assumedHeadPivot(scalp) },
    assumedBodyPivotMap: assumedBodyPivots(bodySurface),
  };
}

function getBase(levels: SubdivisionLevels, now: number): HumanoidBase {
  const cached = baseCache.get(levels);
  if (cached) return cached;
  const created = createBase(levels, now);
  baseCache.set(levels, created);
  return created;
}

/** 기준 형상 캐시를 비운다(메모리 회수, 캐시 투명성 테스트). 이후 첫 빌드가 다시 만든다. */
export function clearHumanoidBaseCache(): void {
  baseCache.clear();
}

function cloneMorph(morph: MorphDelta): MorphDelta {
  return { name: morph.name, deltaPositions: morph.deltaPositions.slice(), ...(morph.deltaNormals ? { deltaNormals: morph.deltaNormals.slice() } : {}) };
}

/** 캐시 버퍼가 호출자에게 새지 않도록 파츠 버퍼를 복제한다. */
function cloneMeshPart(part: MeshPartData): MeshPartData {
  return {
    ...part,
    positions: part.positions.slice(),
    normals: part.normals.slice(),
    uvs: part.uvs.slice(),
    indices: part.indices.slice(),
    ...(part.jointIndices ? { jointIndices: part.jointIndices.slice() } : {}),
    ...(part.jointWeights ? { jointWeights: part.jointWeights.slice() } : {}),
    morphs: part.morphs.map(cloneMorph),
  };
}

function cloneBone(bone: BoneData): BoneData {
  return { ...bone, restTranslation: [...bone.restTranslation], restRotation: [...bone.restRotation] };
}

function cloneJointOffsets(offsets: Readonly<Partial<Record<ParamMorphTargetName, JointOffsets>>>): Partial<Record<ParamMorphTargetName, JointOffsets>> {
  const out: Partial<Record<ParamMorphTargetName, JointOffsets>> = {};
  for (const [name, perBone] of Object.entries(offsets) as Array<[ParamMorphTargetName, JointOffsets | undefined]>) {
    if (!perBone) continue;
    const copy: JointOffsets = {};
    for (const [bone, offset] of Object.entries(perBone) as Array<[keyof JointOffsets, Vec3 | undefined]>) {
      if (offset) copy[bone] = [offset[0], offset[1], offset[2]];
    }
    out[name] = copy;
  }
  return out;
}

/**
 * 절차 모델의 지오메트리를 정하는 슬롯 id만 모은 키. 같은 키면 `buildHumanoidModel`은 같은 모델을 낸다(시드·세분 단계 동일 가정).
 * core(apply-loop)는 절차 소스의 재생성 키에 이 값을 포함해야 한다(헤어·의상·눈 스타일 변경 = 소스 재생성, 나머지 슬롯·파라미터·색은 플랜만).
 */
export function geometryKeyOf(recipe: Pick<CharacterRecipe, "slots">): string {
  return GEOMETRY_SLOT_KINDS.map((slot) => `${slot}=${recipe.slots[slot] ?? "-"}`).join(";");
}

/** 역할 → partId(PART_ROLES 인덱스 + 1). `state/apply-plan.ts`의 DEFAULT_PART_LAYOUT과 같은 규칙이다. */
export function partIdOfRole(role: PartRole): number {
  return (ROLE_ORDER.get(role) ?? PART_ROLES.length) + 1;
}

// ---------------------------------------------------------------- 조립

/**
 * 스펙 공개 API: 레시피와 outfit 포트로 절차 휴머노이드 전체를 조립한다(동기, 결정적).
 * core의 `HumanoidModelBuilder` 시그니처(`(recipe, { subdivisionLevels, seed, outfit })`)와 호환된다.
 */
export function buildHumanoidModel(recipe: HumanoidModelRecipe, options: HumanoidBuildOptions): ProceduralHumanoidModel {
  const now = Date.now();
  const styles = resolveStyles(recipe, now);
  const levels = options.subdivisionLevels;
  const base = getBase(levels, now);
  const headCtx: HeadContext = { frame: base.frame, bodyTargets: base.bodyTargets };

  // 눈·눈썹·속눈썹·치아·혀(슬롯 의존: 눈·홍채 스타일) + outfit(DI): 헤어·의상 → 보조 본 보정·인덱스 합치기
  const attached = buildHeadAttachedParts(headCtx, styles);
  const context: OutfitBuildContext = { seed: options.seed >>> 0, colors: recipe.colors, headSize: 1 };
  const hairResult = styles.hair ? options.outfit.buildHair(styles.hair, base.scalp, context) : EMPTY_OUTFIT_RESULT;
  const selection: GarmentSelection = { top: styles.top, bottom: styles.bottom, shoes: styles.shoes, accessory: styles.accessory };
  const garmentResult =
    selection.top || selection.bottom || selection.shoes || selection.accessory
      ? options.outfit.buildGarments(selection, base.bodySurface, base.bodySurfaceMorphs, context)
      : EMPTY_OUTFIT_RESULT;
  const hairRebased: OutfitBuildResult = { ...hairResult, bones: rebaseAuxiliaryRoots(hairResult.bones, base.actualPivots, base.assumedHairPivots) };
  const garmentsRebased: OutfitBuildResult = { ...garmentResult, bones: rebaseAuxiliaryRoots(garmentResult.bones, base.actualPivots, base.assumedBodyPivotMap) };
  const outfit = combineOutfitResults([hairRebased, garmentsRebased]);
  const outfitByRole = new Map<PartRole, MeshPartData[]>();
  for (const part of outfit.parts) {
    const list = outfitByRole.get(part.role) ?? [];
    list.push(part);
    outfitByRole.set(part.role, list);
  }
  const styleOfRole: Partial<Record<PartRole, string | null>> = { hair: styles.hair, top: styles.top, bottom: styles.bottom, shoes: styles.shoes, accessory: styles.accessory };
  const outfitParts: MeshPartData[] = [];
  for (const [role, list] of outfitByRole) {
    const style = styleOfRole[role] ?? "custom";
    const hairMorphs =
      role === "hair"
        ? (positions: Float32Array): RawMorph[] => base.bodyTargets.map((target) => ({ name: target.name, deltaPositions: headAttachedBodyDelta(positions, base.frame, target.headFrame) }))
        : undefined;
    outfitParts.push(mergeOutfitRole(role, list, `${role}-${style}`, hairMorphs));
  }

  // 파츠 순서(PART_ROLES) → 역할 고정 partId·materialId 배정(역할당 1개 보장)
  const ordered = [cloneMeshPart(base.skinPart), cloneMeshPart(base.headPart), ...attached, ...outfitParts].sort((a, b) => (ROLE_ORDER.get(a.role) ?? 99) - (ROLE_ORDER.get(b.role) ?? 99));
  const seenRoles = new Set<PartRole>();
  const parts: MeshPartData[] = ordered.map((part) => {
    if (seenRoles.has(part.role)) throw failVisible("humanoid-duplicate-role", `역할 "${part.role}" 파츠가 둘 이상입니다(역할당 1개 규약).`, undefined, now);
    seenRoles.add(part.role);
    return { ...part, partId: partIdOfRole(part.role), materialId: partIdOfRole(part.role) - 1 };
  });
  for (const part of parts) {
    const failure = validateMeshPartData(part, now);
    if (failure) throw failVisible("humanoid-part-invalid", `절차 휴머노이드 파츠 정합성 위반: ${failure.reasonKo}`, undefined, now);
  }
  const partIdPalette: Record<number, { role: PartRole; labelKo: string }> = {};
  for (const part of parts) partIdPalette[part.partId] = { role: part.role, labelKo: PART_ROLE_LABELS_KO[part.role] };

  // 스켈레톤(55 + 보조)·체인·morph 이름·관절 오프셋
  const bones: BoneData[] = [...base.bones.map(cloneBone), ...outfit.bones];
  const boneNames = new Set(bones.map((bone) => bone.name));
  for (const chain of outfit.chains) {
    for (const name of chain.boneNames) {
      if (!boneNames.has(name)) throw failVisible("humanoid-chain-bone-missing", `체인 ${chain.id}의 본 "${name}"이 스켈레톤에 없습니다.`, undefined, now);
    }
  }
  const maxJoint = bones.length;
  for (const part of parts) {
    if (!part.jointIndices) continue;
    for (let i = 0; i < part.jointIndices.length; i += 1) {
      if (part.jointIndices[i] >= maxJoint) throw failVisible("humanoid-joint-index-range", `파츠 ${part.id}의 본 인덱스 ${part.jointIndices[i]}가 본 수(${maxJoint})를 벗어납니다.`, undefined, now);
    }
  }
  const morphNames = collectMorphNames(parts);

  let vertexCount = 0;
  let triangleCount = 0;
  let morphCount = 0;
  for (const part of parts) {
    vertexCount += part.positions.length / 3;
    triangleCount += part.indices.length / 3;
    morphCount += part.morphs.length;
  }
  const palette: PartIdPalette = partIdPalette;
  return {
    parts,
    skeleton: { bones },
    morphNames,
    chains: outfit.chains,
    colliders: base.colliders.map((collider) => ({ bone: collider.bone, a: [...collider.a], b: [...collider.b], radius: collider.radius })),
    partIdPalette: palette,
    jointOffsets: cloneJointOffsets(base.jointOffsets),
    styles,
    stats: {
      subdivisionLevels: levels,
      partCount: parts.length,
      vertexCount,
      triangleCount,
      morphCount,
      boneCount: bones.length,
      auxiliaryBoneCount: outfit.bones.length,
      chainCount: outfit.chains.length,
    },
  };
}

// ---------------------------------------------------------------- 결정성 해시

function hashArray(view: Float32Array | Uint32Array | Uint16Array): string {
  return fnv1a64HexBytes(bytesOf(view));
}

/** 모델 전체(파츠 버퍼·morph·스켈레톤·체인·충돌체·이름)의 결정적 digest. 같은 입력이면 같은 값이다. */
export function humanoidModelDigest(model: HumanoidModelData): string {
  const lines: string[] = [];
  for (const part of model.parts) {
    lines.push(`part:${part.id}:${part.role}:${part.partId}:${part.materialId}:${part.materialPreset}:${part.colorKey ?? ""}`);
    lines.push(hashArray(part.positions), hashArray(part.normals), hashArray(part.uvs), hashArray(part.indices));
    if (part.jointIndices) lines.push(hashArray(part.jointIndices));
    if (part.jointWeights) lines.push(hashArray(part.jointWeights));
    for (const morph of part.morphs) {
      lines.push(`morph:${morph.name}`, hashArray(morph.deltaPositions));
      if (morph.deltaNormals) lines.push(hashArray(morph.deltaNormals));
    }
  }
  for (const bone of model.skeleton.bones) lines.push(`bone:${bone.name}:${bone.parent ?? ""}:${bone.restTranslation.join(",")}:${bone.restRotation.join(",")}:${bone.auxiliary ? 1 : 0}`);
  lines.push(`morphs:${model.morphNames.join("|")}`);
  for (const chain of model.chains) lines.push(`chain:${chain.id}:${chain.role}:${chain.boneNames.join("|")}:${chain.restPoints.map((p) => p.join(",")).join(";")}:${chain.radius}:${chain.stiffness}:${chain.damping}:${chain.gravityScale}`);
  for (const collider of model.colliders) lines.push(`collider:${collider.bone}:${collider.a.join(",")}:${collider.b.join(",")}:${collider.radius}`);
  lines.push(`palette:${JSON.stringify(model.partIdPalette)}`);
  return fnv1a64Hex(lines.join("\n"));
}
