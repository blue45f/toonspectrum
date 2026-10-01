/**
 * 헤어 빌더(스펙 §5.4 buildHair): HAIR_STYLE_SPECS를 두피 표면 위 카드(쿼드 스트립)·스트랜드 번들(원통 스윕)로
 * 결정적으로 생성하고, 체인 구역에는 보조 본 `hair_<style>_<i>_<j>`와 ChainAnchor를 만든다.
 *
 * 규약(index.ts 참조):
 * - jointIndices ≥ OUTFIT_AUX_BONE_INDEX_BASE(=55)는 이 결과의 `bones[index - 55]`를 가리킨다.
 * - 보조 루트 본의 parent는 "head"이며 restTranslation은 `assumedHeadPivot(scalp)` 기준이다(조립기는
 *   `rebaseAuxiliaryRoots`로 실제 head rest 위치에 맞춘다).
 * - 두피 앵커는 scalp.radius를 따르고, 머리 크기 morph(`param:headSize:±`)는 머리 중심 기준 ±10% 스케일 델타로 전파한다.
 */
import { CHAIN_HIT_RADIUS_DEFAULTS, CHAIN_PARAM_DEFAULTS, HUMANOID_BONE_NAMES, paramMorphName } from "../../contracts";
import { fnv1a32 } from "../../shared/hash";
import { degToRad, qFromAxisAngle, qRotateVec3, v3Add, v3Cross, v3Dot, v3Length, v3Normalize, v3Scale, v3Sub } from "../../shared/math";
import { createPrng } from "../../shared/prng";

import { MeshAccumulator, appendCardStrip, appendSphereShell, appendTube, singleJoint, sphericalDirection } from "./geometry";
import { HAIR_STYLE_SPECS } from "./hair-styles";

import type { MeshBuffers, SkinWeight4 } from "./geometry";
import type { HairSpec, HairZoneSpec } from "./hair-styles";
import type { BoneData, ChainAnchor, HairStyleId, MeshPartData, MorphDelta, OutfitBuildContext, OutfitBuildResult, ScalpSurface, Vec3 } from "../../contracts";

/** 보조 본 인덱스 기준(VRM 55본 뒤) */
export const OUTFIT_AUX_BONE_INDEX_BASE = HUMANOID_BONE_NAMES.length;
export const HEAD_BONE_INDEX = HUMANOID_BONE_NAMES.indexOf("head");
/** head 본 rest 위치 추정: 머리 중심에서 up 반대 방향으로 반경 × 비율 */
export const HEAD_PIVOT_RATIO = 1.0;
/** headSize morph ±1당 머리 중심 기준 스케일 변화 */
export const HEAD_SIZE_MORPH_SCALE = 0.1;
/** 두피 위 카드 시작 높이(반경 배수) */
const SCALP_LIFT = 1.012;
const CAP_LIFT = 1.016;
const CAP_RINGS = 6;
const CAP_SEGMENTS = 24;
const BUNDLE_SIDES = 6;

export function assumedHeadPivot(scalp: ScalpSurface): Vec3 {
  return v3Sub(scalp.center, v3Scale(v3Normalize(scalp.up), scalp.radius * HEAD_PIVOT_RATIO));
}

export interface HairStrand {
  readonly zone: string;
  readonly kind: HairZoneSpec["kind"];
  readonly points: readonly Vec3[];
  readonly outward: readonly Vec3[];
  readonly chain: boolean;
}

interface StrandSeed {
  readonly azimuth: number;
  readonly elevation: number;
  readonly lengthScale: number;
  readonly side: 1 | -1;
}

function horizontal(v: Vec3, up: Vec3): Vec3 {
  const h = v3Sub(v, v3Scale(up, v3Dot(v, up)));
  return v3Length(h) > 1e-9 ? v3Normalize(h) : [0, 0, 1];
}

/** 한 스트랜드의 곡선: 두피 법선에서 출발해 droop만큼 중력 방향으로 휘고 flare·curl을 더한다. 두피 안쪽은 밀어낸다. */
export function strandCurve(scalp: ScalpSurface, zone: HairZoneSpec, seed: StrandSeed, startOverride?: { readonly root: Vec3; readonly dir: Vec3 }): HairStrand {
  const up = v3Normalize(scalp.up);
  const forward = v3Normalize(scalp.forward);
  const down = v3Scale(up, -1);
  const rootDir = startOverride ? startOverride.dir : sphericalDirection(up, forward, seed.azimuth, seed.elevation);
  const root = startOverride ? startOverride.root : v3Add(scalp.center, v3Scale(rootDir, scalp.radius * SCALP_LIFT));
  const segments = Math.max(1, Math.floor(zone.segments));
  const totalLength = zone.length * scalp.radius * seed.lengthScale;
  const segLen = totalLength / segments;
  const radial = horizontal(rootDir, up);
  const curlRad = degToRad(zone.curl) * seed.side;
  const points: Vec3[] = [root];
  const outward: Vec3[] = [rootDir];
  let prev = root;
  for (let k = 1; k <= segments; k += 1) {
    const s = k / segments;
    const d = Math.min(1, zone.droop * (0.3 + 0.7 * s));
    let dir = v3Normalize(v3Add(v3Add(v3Scale(rootDir, 1 - d), v3Scale(down, d)), v3Scale(radial, zone.flare * s)));
    if (curlRad !== 0) dir = qRotateVec3(qFromAxisAngle(up, curlRad * s), dir);
    let p = v3Add(prev, v3Scale(dir, segLen));
    const fromCenter = v3Sub(p, scalp.center);
    const dist = v3Length(fromCenter);
    const minDist = scalp.radius * SCALP_LIFT;
    if (dist < minDist) p = v3Add(scalp.center, v3Scale(dist > 1e-9 ? v3Normalize(fromCenter) : rootDir, minDist));
    points.push(p);
    outward.push(v3Normalize(v3Sub(p, scalp.center)));
    prev = p;
  }
  return { zone: zone.id, kind: zone.kind, points, outward, chain: zone.chain };
}

/** 구역의 스트랜드 시드(균등 방위각 + 결정적 jitter) */
function zoneSeeds(zone: HairZoneSpec, random: () => number): StrandSeed[] {
  const seeds: StrandSeed[] = [];
  const span = degToRad(zone.azimuthEnd - zone.azimuthStart);
  const full = Math.abs(zone.azimuthEnd - zone.azimuthStart) >= 360;
  for (let i = 0; i < zone.count; i += 1) {
    const t = full ? i / zone.count : (i + 0.5) / zone.count;
    const jitterAz = (random() - 0.5) * zone.jitter * (span / Math.max(1, zone.count));
    const jitterEl = (random() - 0.5) * zone.jitter * degToRad(6);
    const lengthScale = 1 + (random() - 0.5) * zone.jitter;
    seeds.push({ azimuth: degToRad(zone.azimuthStart) + span * t + jitterAz, elevation: degToRad(zone.elevation) + jitterEl, lengthScale, side: i % 2 === 0 ? 1 : -1 });
  }
  return seeds;
}

/** 구역의 스트랜드 곡선 전부(번들은 묶음점에서 시작). buildHair·hairStrands가 같은 결과를 쓴다. */
export function zoneStrands(scalp: ScalpSurface, zone: HairZoneSpec, random: () => number): HairStrand[] {
  const up = v3Normalize(scalp.up);
  const forward = v3Normalize(scalp.forward);
  const gatherDir = zone.gather ? sphericalDirection(up, forward, degToRad(zone.gather.azimuth), degToRad(zone.gather.elevation)) : null;
  const gatherPoint = gatherDir ? v3Add(scalp.center, v3Scale(gatherDir, scalp.radius * 1.03)) : null;
  return zoneSeeds(zone, random).map((seed, i) => {
    if (zone.kind === "bundle" && gatherDir && gatherPoint) {
      const sideA = v3Normalize(v3Cross(gatherDir, up));
      const sideB = v3Normalize(v3Cross(sideA, gatherDir));
      const angle = (i / Math.max(1, zone.count)) * Math.PI * 2;
      const offset = v3Add(v3Scale(sideA, Math.cos(angle)), v3Scale(sideB, Math.sin(angle)));
      const root = v3Add(gatherPoint, v3Scale(offset, zone.width * scalp.radius * 0.5));
      return strandCurve(scalp, zone, seed, { root, dir: gatherDir });
    }
    return strandCurve(scalp, zone, seed);
  });
}

/** 번들 묶음점(헤어 타이 위치). 번들이 아니면 null */
export function gatherPointOf(scalp: ScalpSurface, zone: HairZoneSpec): Vec3 | null {
  if (!zone.gather) return null;
  const dir = sphericalDirection(v3Normalize(scalp.up), v3Normalize(scalp.forward), degToRad(zone.gather.azimuth), degToRad(zone.gather.elevation));
  return v3Add(scalp.center, v3Scale(dir, scalp.radius * 1.03));
}

/** 머리 중심 기준 스케일 morph 델타(headSize ±) */
export function headSizeMorphs(positions: Float32Array, center: Vec3): MorphDelta[] {
  const plus = new Float32Array(positions.length);
  const minus = new Float32Array(positions.length);
  for (let v = 0; v < positions.length; v += 3) {
    for (let k = 0; k < 3; k += 1) {
      const d = (positions[v + k] - center[k]) * HEAD_SIZE_MORPH_SCALE;
      plus[v + k] = d;
      minus[v + k] = -d;
    }
  }
  return [
    { name: paramMorphName("headSize", "+"), deltaPositions: plus },
    { name: paramMorphName("headSize", "-"), deltaPositions: minus },
  ];
}

/** 두피 캡: 앞 헤어라인은 낮고(짧고) 뒤는 길게 내려오는 부분 구면 격자 */
function appendScalpCap(acc: MeshAccumulator, scalp: ScalpSurface, spec: HairSpec, skin: SkinWeight4): void {
  const up = v3Normalize(scalp.up);
  const forward = v3Normalize(scalp.forward);
  const grid: number[][] = [];
  for (let r = 0; r <= CAP_RINGS; r += 1) {
    const row: number[] = [];
    for (let s = 0; s <= CAP_SEGMENTS; s += 1) {
      const az = (s / CAP_SEGMENTS) * Math.PI * 2;
      const back = (1 - Math.cos(az)) * 0.5;
      const elEnd = degToRad(spec.cap.frontHairline + (spec.cap.backHairline - spec.cap.frontHairline) * back);
      const el = (elEnd * r) / CAP_RINGS;
      const dir = sphericalDirection(up, forward, az, el);
      row.push(acc.pushVertex(v3Add(scalp.center, v3Scale(dir, scalp.radius * CAP_LIFT)), dir, [s / CAP_SEGMENTS, r / CAP_RINGS], skin));
    }
    grid.push(row);
  }
  for (let r = 0; r < CAP_RINGS; r += 1) {
    for (let s = 0; s < CAP_SEGMENTS; s += 1) {
      acc.pushQuad(grid[r][s], grid[r][s + 1], grid[r + 1][s + 1], grid[r + 1][s]);
    }
  }
}

function hairPart(id: string, buffers: MeshBuffers, center: Vec3): MeshPartData {
  return {
    id,
    role: "hair",
    partId: 0,
    materialId: 0,
    materialPreset: "hair-aniso",
    colorKey: "hair",
    positions: buffers.positions,
    normals: buffers.normals,
    uvs: buffers.uvs,
    indices: buffers.indices,
    jointIndices: buffers.jointIndices,
    jointWeights: buffers.jointWeights,
    morphs: headSizeMorphs(buffers.positions, center),
  };
}

/** 헤어 스타일 하나를 두피 위에 생성한다(결정적). */
export function buildHair(style: HairStyleId, scalp: ScalpSurface, context: OutfitBuildContext): OutfitBuildResult {
  const spec = HAIR_STYLE_SPECS[style];
  const random = createPrng((context.seed ^ fnv1a32(`hair:${style}`)) >>> 0).next;
  const up = v3Normalize(scalp.up);
  const forward = v3Normalize(scalp.forward);
  const headSkin = singleJoint(HEAD_BONE_INDEX);
  const cap = new MeshAccumulator();
  appendScalpCap(cap, scalp, spec, headSkin);
  const strands = new MeshAccumulator();
  const bones: BoneData[] = [];
  const chains: ChainAnchor[] = [];
  const headPivot = assumedHeadPivot(scalp);
  const hairDefaults = CHAIN_PARAM_DEFAULTS.hair;
  let strandIndex = 0;

  const registerChain = (strand: HairStrand, zone: HairZoneSpec): SkinWeight4[] => {
    const skins: SkinWeight4[] = [];
    const names: string[] = [];
    strand.points.forEach((point, j) => {
      const name = `hair_${style}_${strandIndex}_${j}`;
      const boneIndex = OUTFIT_AUX_BONE_INDEX_BASE + bones.length;
      bones.push({
        name,
        parent: j === 0 ? "head" : names[j - 1],
        restTranslation: j === 0 ? v3Sub(point, headPivot) : v3Sub(point, strand.points[j - 1]),
        restRotation: [0, 0, 0, 1],
        auxiliary: true,
      });
      names.push(name);
      skins.push(singleJoint(boneIndex));
    });
    chains.push({
      id: `hair_${style}_${strandIndex}`,
      role: "hair",
      boneNames: names,
      restPoints: strand.points,
      radius: CHAIN_HIT_RADIUS_DEFAULTS.hair,
      stiffness: zone.spring?.stiffness ?? hairDefaults.stiffness,
      damping: zone.spring?.damping ?? hairDefaults.dragForce,
      gravityScale: zone.spring?.gravityScale ?? hairDefaults.gravityPower,
    });
    return skins;
  };

  for (const zone of spec.zones) {
    const gatherPoint = gatherPointOf(scalp, zone);
    if (zone.kind === "bundle" && gatherPoint) {
      // 묶음 매듭(헤어 타이)
      appendSphereShell(strands, {
        center: gatherPoint,
        radius: zone.width * scalp.radius * 1.15,
        up,
        forward,
        elevationStart: 0,
        elevationEnd: Math.PI,
        azimuthStart: 0,
        azimuthEnd: Math.PI * 2,
        rings: 4,
        segments: 8,
        skin: headSkin,
      });
    }
    zoneStrands(scalp, zone, random).forEach((strand) => {
      const skins = zone.chain ? registerChain(strand, zone) : strand.points.map(() => headSkin);
      const n = strand.points.length;
      if (zone.kind === "bundle") {
        const r0 = zone.width * scalp.radius * 0.6;
        const radii = strand.points.map((_, k) => r0 * (1 - 0.75 * (k / Math.max(1, n - 1))));
        appendTube(strands, { points: strand.points, radii, sides: BUNDLE_SIDES, skins, capEnd: true, sideHint: forward });
      } else {
        const w0 = zone.width * scalp.radius;
        const widths = strand.points.map((_, k) => w0 * (1 - 0.45 * (k / Math.max(1, n - 1))));
        appendCardStrip(strands, { points: strand.points, widths, outward: strand.outward, skins });
      }
      strandIndex += 1;
    });
  }

  const parts: MeshPartData[] = [hairPart(`hair-cap-${style}`, cap.build(), scalp.center), hairPart(`hair-strands-${style}`, strands.build(), scalp.center)];
  return { parts, bones, chains };
}

/** 스타일별 스트랜드 곡선만(테스트·미리보기용) */
export function hairStrands(style: HairStyleId, scalp: ScalpSurface, seed: number): HairStrand[] {
  const spec = HAIR_STYLE_SPECS[style];
  const random = createPrng((seed ^ fnv1a32(`hair:${style}`)) >>> 0).next;
  const out: HairStrand[] = [];
  for (const zone of spec.zones) out.push(...zoneStrands(scalp, zone, random));
  return out;
}
