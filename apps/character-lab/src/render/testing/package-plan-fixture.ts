/**
 * render 테스트용 제작 패키지 플랜 fixture: 실제 GLB 바이트의 JSON 청크만 읽어 AuthoredPackagePlan을 만든다.
 * 매핑(본·shape key·메시 역할)은 authored 작업자 모듈 대신 계약의 별칭 표 + 최소 Mixamo 표로 만든다
 * (render 디렉터리는 domains/authored를 import하지 않는다). 플랜 생성·SHA 검증은 authored 작업자 소관이다.
 */
import { BLENDER_SHAPE_KEY_ALIASES, CHARACTER_PACKAGE_KIND, CHARACTER_PACKAGE_SCHEMA_VERSION, FACS_SHAPE_KEY_ALIASES, facsMorphName, paramMorphName, parseAuthoredHairMeshName, parseCharacterPackageManifest } from "../../contracts";

import type { AuthoredPackagePlan, HumanoidBoneName, MorphTargetName, PartRole, SlotCapabilityMap } from "../../contracts";

const GLB_MAGIC = 0x46546c67;
const GLB_CHUNK_JSON = 0x4e4f534a;
const DECODER = new TextDecoder();

export interface GlbSummary {
  readonly nodeNames: readonly string[];
  readonly meshNodeNames: readonly string[];
  readonly targetNames: readonly string[];
  readonly jointCount: number;
  readonly primitiveCountByNode: Readonly<Record<string, number>>;
}

interface GltfNode {
  readonly name?: string;
  readonly mesh?: number;
}

interface GltfMesh {
  readonly name?: string;
  readonly primitives?: ReadonlyArray<{ readonly targets?: readonly unknown[] }>;
  readonly extras?: { readonly targetNames?: readonly string[] };
}

interface GltfJson {
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: readonly GltfMesh[];
  readonly skins?: ReadonlyArray<{ readonly joints?: readonly number[] }>;
}

/** GLB JSON 청크 요약(노드·메시 노드·morph 이름·본 수). 형식이 틀리면 throw. */
export function summarizeGlb(bytes: Uint8Array): GlbSummary {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error("GLB magic이 아닙니다.");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== GLB_CHUNK_JSON) throw new Error("첫 청크가 JSON이 아닙니다.");
  const json = JSON.parse(DECODER.decode(bytes.subarray(20, 20 + jsonLength))) as GltfJson;
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const nodeNames = nodes.map((node) => node.name ?? "");
  const meshNodeNames: string[] = [];
  const primitiveCountByNode: Record<string, number> = {};
  const targetNames = new Set<string>();
  for (const node of nodes) {
    if (node.mesh === undefined) continue;
    const name = node.name ?? "";
    meshNodeNames.push(name);
    const mesh = meshes[node.mesh];
    primitiveCountByNode[name] = mesh?.primitives?.length ?? 0;
    for (const target of mesh?.extras?.targetNames ?? []) targetNames.add(target);
  }
  const jointCount = json.skins?.[0]?.joints?.length ?? 0;
  return { nodeNames, meshNodeNames, targetNames: [...targetNames], jointCount, primitiveCountByNode };
}

/** Mixamo 손가락 이름 → VRM 이름 조각(Thumb1 = 중수골, Index1 = 기절골 …, 끝마디 `4`는 보조 본) */
const MIXAMO_FINGERS: ReadonlyArray<{ readonly mixamo: string; readonly vrm: string; readonly segments: readonly string[] }> = [
  { mixamo: "Thumb", vrm: "Thumb", segments: ["Metacarpal", "Proximal", "Distal"] },
  { mixamo: "Index", vrm: "Index", segments: ["Proximal", "Intermediate", "Distal"] },
  { mixamo: "Middle", vrm: "Middle", segments: ["Proximal", "Intermediate", "Distal"] },
  { mixamo: "Ring", vrm: "Ring", segments: ["Proximal", "Intermediate", "Distal"] },
  { mixamo: "Pinky", vrm: "Little", segments: ["Proximal", "Intermediate", "Distal"] },
];

/** Mixamo·ToonStudio 본 이름 → 휴머노이드 본(테스트용, 역방향 유일). 몸통·팔·다리·눈·손가락 30개를 모두 매핑한다. */
function buildMixamoBones(): Readonly<Record<string, HumanoidBoneName>> {
  const map: Record<string, HumanoidBoneName> = {
    "mixamorig:Hips": "hips",
    "mixamorig:Spine": "spine",
    "mixamorig:Spine1": "chest",
    "mixamorig:Spine2": "upperChest",
    "mixamorig:Neck": "neck",
    "mixamorig:Head": "head",
    "TS_OrionEye.L": "leftEye",
    "TS_OrionEye.R": "rightEye",
  };
  const limbs: ReadonlyArray<readonly [string, string]> = [
    ["Shoulder", "Shoulder"],
    ["Arm", "UpperArm"],
    ["ForeArm", "LowerArm"],
    ["Hand", "Hand"],
    ["UpLeg", "UpperLeg"],
    ["Leg", "LowerLeg"],
    ["Foot", "Foot"],
    ["ToeBase", "Toes"],
  ];
  for (const [side, vrmSide] of [["Left", "left"], ["Right", "right"]] as const) {
    for (const [mixamo, vrm] of limbs) map[`mixamorig:${side}${mixamo}`] = `${vrmSide}${vrm}` as HumanoidBoneName;
    for (const finger of MIXAMO_FINGERS) {
      finger.segments.forEach((segment, index) => {
        map[`mixamorig:${side}Hand${finger.mixamo}${index + 1}`] = `${vrmSide}${finger.vrm}${segment}` as HumanoidBoneName;
      });
    }
  }
  return map;
}

const MIXAMO_BONES = buildMixamoBones();

function roleForMeshNode(name: string): PartRole | null {
  if (parseAuthoredHairMeshName(name)) return "hair";
  const lower = name.toLowerCase();
  if (lower.includes("brow")) return "brow";
  if (lower.includes("pupil")) return "pupil";
  if (lower.includes("eye")) return "eyeball";
  if (lower.includes("head")) return "head";
  if (lower.includes("body") || lower.includes("bust") || lower.includes("neck")) return "skin";
  return null;
}

function allAvailable(): SlotCapabilityMap {
  const map = {} as Record<string, { status: "available" }>;
  for (const slot of ["face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair", "body", "top", "bottom", "shoes", "accessory", "expression", "pose", "hand-pose"]) map[slot] = { status: "available" };
  return map as unknown as SlotCapabilityMap;
}

export interface PackagePlanFixtureOptions {
  readonly characterId: string;
  readonly glbUrl: string;
  readonly preferredLod?: number;
  readonly bytes: Uint8Array;
}

/** 실제 GLB에서 플랜을 만든다. SHA는 검증하지 않는다(render 테스트는 로드·매핑만 본다). */
export function createPackagePlanFixture(options: PackagePlanFixtureOptions): AuthoredPackagePlan {
  const summary = summarizeGlb(options.bytes);
  const shapeKeyMap: Record<string, MorphTargetName> = {};
  for (const name of summary.targetNames) {
    const blender = BLENDER_SHAPE_KEY_ALIASES[name];
    if (blender) {
      shapeKeyMap[name] = paramMorphName(blender.key, blender.sign);
      continue;
    }
    const facs = FACS_SHAPE_KEY_ALIASES[name];
    if (facs) shapeKeyMap[name] = facsMorphName(facs);
  }
  const boneMap: Record<string, HumanoidBoneName> = {};
  for (const node of summary.nodeNames) {
    const mapped = MIXAMO_BONES[node];
    if (mapped) boneMap[node] = mapped;
  }
  const meshRoles: Record<string, PartRole> = {};
  for (const node of summary.meshNodeNames) {
    const role = roleForMeshNode(node);
    if (role) meshRoles[node] = role;
  }
  const parsed = parseCharacterPackageManifest({
    schemaVersion: CHARACTER_PACKAGE_SCHEMA_VERSION,
    kind: CHARACTER_PACKAGE_KIND,
    characterId: options.characterId,
    displayName: options.characterId,
    configDigest: "fixture",
    pipelineVersion: 1,
    capabilities: {
      authoredHair: { enabled: true, style: null, lodTriangles: [], replacedSourceMeshes: [] },
      semanticFaceShapes: { mode: "fixture", confidence: 1, objects: summary.meshNodeNames, shapeKeys: summary.targetNames },
      mtoonReady: false,
      vrmCustomExpressions: { status: "none", names: [] },
      lods: true,
    },
    quality: { score: 100, passed: true, minimumScore: 0, report: "fixture" },
    files: { glb: { path: options.glbUrl.slice(options.glbUrl.lastIndexOf("/") + 1), bytes: options.bytes.byteLength, sha256: "0".repeat(64) } },
    provenance: { license: "CC0-1.0" },
  });
  if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
  return {
    manifest: parsed.manifest,
    baseUrl: options.glbUrl.slice(0, options.glbUrl.lastIndexOf("/")),
    glbUrl: options.glbUrl,
    glbSha256: "0".repeat(64),
    glbBytes: options.bytes.byteLength,
    shapeKeyMap,
    boneMap,
    meshRoles,
    hairLodPolicy: { preferredLod: options.preferredLod ?? 0 },
    capabilities: allAvailable(),
    licenseNote: "CC0-1.0 (fixture)",
  };
}
