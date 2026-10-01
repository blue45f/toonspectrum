/**
 * render 테스트용 절차 소스 fixture: 파츠 4개(머리·몸·헤어·상의), 휴머노이드 본 6 + 보조 헤어 체인 3,
 * morph 2개(param·facs), 헤어 체인 1개, 머리 캡슐 1개. humanoid 작업자 결과와 같은 계약(HumanoidModelData)만 쓴다.
 */
import { allocatePartIds, validateMeshPartData } from "../../contracts";

import type { BoneData, CapsuleCollider, ChainAnchor, HumanoidModelData, MeshPartData, MorphDelta, Vec3 } from "../../contracts";

interface BoxGeometry {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

/** 면별 법선을 가진 24정점 상자 */
export function boxGeometry(center: Vec3, size: Vec3): BoxGeometry {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const faces: Array<{ n: Vec3; corners: Vec3[] }> = [
    { n: [0, 0, 1], corners: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], corners: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [1, 0, 0], corners: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], corners: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 1, 0], corners: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], corners: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
  ];
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const indices = new Uint32Array(36);
  faces.forEach((face, f) => {
    face.corners.forEach((corner, c) => {
      const v = f * 4 + c;
      positions[v * 3] = cx + corner[0];
      positions[v * 3 + 1] = cy + corner[1];
      positions[v * 3 + 2] = cz + corner[2];
      normals[v * 3] = face.n[0];
      normals[v * 3 + 1] = face.n[1];
      normals[v * 3 + 2] = face.n[2];
      uvs[v * 2] = c === 1 || c === 2 ? 1 : 0;
      uvs[v * 2 + 1] = c >= 2 ? 1 : 0;
    });
    const base = f * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], f * 6);
  });
  return { positions, normals, uvs, indices };
}

const BONES: readonly BoneData[] = [
  { name: "hips", parent: null, restTranslation: [0, 0.95, 0], restRotation: [0, 0, 0, 1] },
  { name: "spine", parent: "hips", restTranslation: [0, 0.15, 0], restRotation: [0, 0, 0, 1] },
  { name: "chest", parent: "spine", restTranslation: [0, 0.15, 0], restRotation: [0, 0, 0, 1] },
  { name: "upperChest", parent: "chest", restTranslation: [0, 0.12, 0], restRotation: [0, 0, 0, 1] },
  { name: "neck", parent: "upperChest", restTranslation: [0, 0.1, 0], restRotation: [0, 0, 0, 1] },
  { name: "head", parent: "neck", restTranslation: [0, 0.08, 0], restRotation: [0, 0, 0, 1] },
  { name: "hair_0", parent: "head", restTranslation: [0, 0.12, -0.05], restRotation: [0, 0, 0, 1], auxiliary: true },
  { name: "hair_1", parent: "hair_0", restTranslation: [0, -0.08, -0.04], restRotation: [0, 0, 0, 1], auxiliary: true },
  { name: "hair_2", parent: "hair_1", restTranslation: [0, -0.08, -0.03], restRotation: [0, 0, 0, 1], auxiliary: true },
];

function boneIndex(name: string): number {
  const index = BONES.findIndex((bone) => bone.name === name);
  if (index < 0) throw new Error(`fixture: 본 ${name} 없음`);
  return index;
}

/** 본 rest 월드 위치(회전 없는 fixture라 평행이동 누적) */
export function fixtureBoneWorldPosition(name: string): Vec3 {
  let cursor: string | null = name;
  const out: [number, number, number] = [0, 0, 0];
  while (cursor !== null) {
    const bone: BoneData | undefined = BONES[boneIndex(cursor)];
    if (!bone) break;
    out[0] += bone.restTranslation[0];
    out[1] += bone.restTranslation[1];
    out[2] += bone.restTranslation[2];
    cursor = bone.parent;
  }
  return out;
}

function skinTo(vertexCount: number, bone: string, secondary?: { bone: string; weight: number; selector: (vertex: number) => boolean }): { jointIndices: Uint16Array; jointWeights: Float32Array } {
  const jointIndices = new Uint16Array(vertexCount * 4);
  const jointWeights = new Float32Array(vertexCount * 4);
  const primary = boneIndex(bone);
  for (let v = 0; v < vertexCount; v += 1) {
    jointIndices[v * 4] = primary;
    jointWeights[v * 4] = 1;
    if (secondary && secondary.selector(v)) {
      jointIndices[v * 4 + 1] = boneIndex(secondary.bone);
      jointWeights[v * 4] = 1 - secondary.weight;
      jointWeights[v * 4 + 1] = secondary.weight;
    }
  }
  return { jointIndices, jointWeights };
}

function morph(name: string, geometry: BoxGeometry, delta: (x: number, y: number, z: number) => Vec3): MorphDelta {
  const vertexCount = geometry.positions.length / 3;
  const deltaPositions = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v += 1) {
    const d = delta(geometry.positions[v * 3] ?? 0, geometry.positions[v * 3 + 1] ?? 0, geometry.positions[v * 3 + 2] ?? 0);
    deltaPositions[v * 3] = d[0];
    deltaPositions[v * 3 + 1] = d[1];
    deltaPositions[v * 3 + 2] = d[2];
  }
  return { name, deltaPositions };
}

export const FIXTURE_MORPH_NAMES: readonly string[] = ["param:eyeSize:+", "facs:jawOpen"];

export function createProceduralFixture(): HumanoidModelData {
  const headGeometry = boxGeometry([0, 1.63, 0], [0.22, 0.24, 0.22]);
  const bodyGeometry = boxGeometry([0, 1.05, 0], [0.4, 0.9, 0.25]);
  const hairGeometry = boxGeometry([0, 1.76, -0.02], [0.26, 0.1, 0.26]);
  const topGeometry = boxGeometry([0, 1.25, 0], [0.44, 0.4, 0.29]);
  const roles = [
    { role: "head" as const, materialPreset: "skin-sss" as const, colorKey: "skin" as const },
    { role: "skin" as const, materialPreset: "skin-sss" as const, colorKey: "skin" as const },
    { role: "hair" as const, materialPreset: "hair-aniso" as const, colorKey: "hair" as const },
    { role: "top" as const, materialPreset: "cloth-cotton" as const, colorKey: "top" as const },
  ];
  const palette = allocatePartIds(roles);
  const parts: MeshPartData[] = [
    {
      id: "head",
      role: "head",
      partId: 1,
      materialId: 0,
      materialPreset: "skin-sss",
      colorKey: "skin",
      ...headGeometry,
      ...skinTo(24, "head"),
      morphs: [
        morph("param:eyeSize:+", headGeometry, (x) => [x > 0 ? 0.02 : -0.02, 0, 0]),
        morph("facs:jawOpen", headGeometry, (_x, y) => [0, y < 1.63 ? -0.03 : 0, 0]),
      ],
    },
    {
      id: "body",
      role: "skin",
      partId: 2,
      materialId: 1,
      materialPreset: "skin-sss",
      colorKey: "skin",
      ...bodyGeometry,
      ...skinTo(24, "hips", { bone: "spine", weight: 0.5, selector: (v) => (bodyGeometry.positions[v * 3 + 1] ?? 0) > 1.05 }),
      morphs: [],
    },
    {
      id: "hair",
      role: "hair",
      partId: 3,
      materialId: 2,
      materialPreset: "hair-aniso",
      colorKey: "hair",
      ...hairGeometry,
      ...skinTo(24, "head"),
      morphs: [],
    },
    {
      id: "top",
      role: "top",
      partId: 4,
      materialId: 3,
      materialPreset: "cloth-cotton",
      colorKey: "top",
      ...topGeometry,
      ...skinTo(24, "chest"),
      morphs: [],
    },
  ];
  for (const part of parts) {
    const failure = validateMeshPartData(part, 0);
    if (failure) throw new Error(`fixture 파츠 ${part.id} 검증 실패: ${failure.reasonKo}`);
  }
  const chains: ChainAnchor[] = [
    {
      id: "hair-main",
      role: "hair",
      boneNames: ["hair_0", "hair_1", "hair_2"],
      restPoints: [fixtureBoneWorldPosition("hair_0"), fixtureBoneWorldPosition("hair_1"), fixtureBoneWorldPosition("hair_2")],
      radius: 0.02,
      stiffness: 1,
      damping: 0.5,
      gravityScale: 0.05,
    },
  ];
  const colliders: CapsuleCollider[] = [{ bone: "head", a: [0, -0.1, 0], b: [0, 0.1, 0], radius: 0.12 }];
  return { parts, skeleton: { bones: BONES }, morphNames: FIXTURE_MORPH_NAMES, chains, colliders, partIdPalette: palette };
}
