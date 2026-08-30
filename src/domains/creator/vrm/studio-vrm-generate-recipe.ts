import {
  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,
  sanitizeAvatarForgeState,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  serializeStudioVrmExport,
  type StudioVrmExportMesh,
  type StudioVrmExportNode,
  type StudioVrmExportSceneSnapshot,
} from "./studio-vrm-export-plan";
import {
  STUDIO_VRM_EXPORT_REQUIRED_BONES,
  type StudioVrmExportExpression,
  type StudioVrmExportExpressionPreset,
  type StudioVrmExportFirstPersonAnnotation,
  type StudioVrmExportHumanoidBones,
} from "./studio-vrm-export-vrm-extension";
import { buildStudioVrmHumanoidMesh } from "./studio-vrm-humanoid-mesh";
import {
  STUDIO_VRM_RIG_PARENTS,
  studioVrmRigInverseBindMatrices,
  type StudioVrmRig,
} from "./studio-vrm-humanoid-rig";

export const STUDIO_VRM_GENERATE_RECIPE_VERSION = 1 as const;
export const STUDIO_VRM_GENERATE_GENERATOR = "ToonSpectrum Studio VRM Generate";

/** 노드 0 은 아마추어, 1..15 는 본, 그 뒤가 스킨드 메시 노드다. */
const ARMATURE_NODE = 0;
const FIRST_BONE_NODE = 1;
const BONE_COUNT = STUDIO_VRM_EXPORT_REQUIRED_BONES.length;
const FIRST_MESH_NODE = FIRST_BONE_NODE + BONE_COUNT;

export type StudioVrmGenerateRecipe = {
  readonly version: typeof STUDIO_VRM_GENERATE_RECIPE_VERSION;
  readonly presetId: string | null;
  readonly label: string;
  readonly state: AvatarForgeState;
};

export function resolveStudioVrmGeneratePresetLabel(presetId: string | null): string {
  if (!presetId) return "커스텀 캐릭터";
  return AVATAR_FORGE_PRESETS.find((preset) => preset.id === presetId)?.label ?? "커스텀 캐릭터";
}

export function createStudioVrmGenerateRecipe(input: {
  readonly presetId?: string | null;
  readonly state?: unknown;
} = {}): StudioVrmGenerateRecipe {
  const presetId = typeof input.presetId === "string" && input.presetId.trim()
    ? input.presetId.trim()
    : null;
  const state = input.state === undefined
    ? createAvatarForgeState(presetId ?? undefined)
    : sanitizeAvatarForgeState(input.state);
  const resolvedPresetId = state.presetId ?? presetId;
  return {
    version: STUDIO_VRM_GENERATE_RECIPE_VERSION,
    presetId: resolvedPresetId ?? null,
    label: resolveStudioVrmGeneratePresetLabel(resolvedPresetId ?? null),
    state,
  };
}

/** 본 인덱스 맵. `humanBones` 와 노드 자식 배열이 같은 규약을 쓰도록 한 곳에서 만든다. */
function humanoidBones(): StudioVrmExportHumanoidBones {
  return Object.fromEntries(
    STUDIO_VRM_EXPORT_REQUIRED_BONES.map((bone, index) => [bone, index + FIRST_BONE_NODE]),
  ) as StudioVrmExportHumanoidBones;
}

/** 리그의 부모 체인을 glTF 노드 트리로 편다. */
function buildBoneNodes(rig: StudioVrmRig): StudioVrmExportNode[] {
  const childrenOf = new Map<string, number[]>();
  STUDIO_VRM_EXPORT_REQUIRED_BONES.forEach((bone, index) => {
    const parent = STUDIO_VRM_RIG_PARENTS[bone];
    if (parent === null) return;
    const siblings = childrenOf.get(parent) ?? [];
    siblings.push(index + FIRST_BONE_NODE);
    childrenOf.set(parent, siblings);
  });

  return STUDIO_VRM_EXPORT_REQUIRED_BONES.map((bone) => {
    const children = childrenOf.get(bone);
    const scale = rig.nodeScale[bone];
    return {
      name: bone,
      translation: rig.localTranslation[bone],
      ...(scale ? { scale } : {}),
      ...(children && children.length > 0 ? { children } : {}),
    } satisfies StudioVrmExportNode;
  });
}

/**
 * 레시피를 헤드리스 VRM 저작 스냅샷으로 바꾼다.
 *
 * 몸·머리·얼굴·헤어·의상은 studio-vrm-humanoid-mesh 가 절차적으로 만들고, 여기서는 그 결과를
 * 노드 트리·스킨·표정 바인딩으로 묶는 일만 한다.
 */
export function buildStudioVrmGenerateAuthoringSnapshot(
  recipe: StudioVrmGenerateRecipe,
): StudioVrmExportSceneSnapshot {
  const { state, label } = recipe;
  const humanoid = buildStudioVrmHumanoidMesh(state);
  const rig = humanoid.rig;

  const meshNodeIndex = (partIndex: number): number => FIRST_MESH_NODE + partIndex;
  const meshNodes: StudioVrmExportNode[] = humanoid.parts.map((part, index) => ({
    name: part.nodeName,
    mesh: index,
    skin: 0,
  }));

  const nodes: StudioVrmExportNode[] = [
    {
      name: "Armature",
      children: [
        FIRST_BONE_NODE,
        ...humanoid.parts.map((_part, index) => meshNodeIndex(index)),
      ],
    },
    ...buildBoneNodes(rig),
    ...meshNodes,
  ];

  const meshes: StudioVrmExportMesh[] = humanoid.parts.map((part) => ({
    name: part.meshName,
    primitives: part.primitives,
  }));

  // 표정 프리셋 이름과 모프 타깃 이름이 1:1이다 — 가중치 1로 같은 이름의 타깃 하나를 잡는다.
  const faceNode = meshNodeIndex(humanoid.facePartIndex);
  const preset: Partial<Record<StudioVrmExportExpressionPreset, StudioVrmExportExpression>> = {};
  humanoid.morphTargetNames.forEach((name, index) => {
    preset[name as StudioVrmExportExpressionPreset] = {
      morphTargetBinds: [{ node: faceNode, index, weight: 1 }],
    };
  });

  const firstPerson: StudioVrmExportFirstPersonAnnotation[] = humanoid.parts.map(
    (_part, index) => ({ node: meshNodeIndex(index), type: "auto" }),
  );

  return {
    meta: {
      name: label,
      authors: [STUDIO_VRM_GENERATE_GENERATOR],
      version: `generate-${recipe.presetId ?? "custom"}-v${STUDIO_VRM_GENERATE_RECIPE_VERSION}`,
      copyrightInformation: "Generated in ToonSpectrum Studio",
      avatarPermission: "onlyAuthor",
      commercialUsage: "personalNonProfit",
      creditNotation: "required",
      modification: "allowModification",
    },
    humanoidBones: humanoidBones(),
    roots: [ARMATURE_NODE],
    nodes,
    meshes,
    skins: [
      {
        joints: Array.from({ length: BONE_COUNT }, (_unused, index) => index + FIRST_BONE_NODE),
        skeleton: FIRST_BONE_NODE,
        inverseBindMatrices: studioVrmRigInverseBindMatrices(rig),
      },
    ],
    materials: humanoid.materials,
    expressions: { preset },
    firstPerson,
  };
}

/** Headless export used by tests and by the generate MCP host. */
export function exportStudioVrmFromGenerateRecipe(
  recipe: StudioVrmGenerateRecipe,
): Uint8Array<ArrayBuffer> {
  return serializeStudioVrmExport(buildStudioVrmGenerateAuthoringSnapshot(recipe));
}
