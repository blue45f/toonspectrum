import {
  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,
  sanitizeAvatarForgeState,
  serializeAvatarForgeState,
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
  type StudioVrmExportSpringBoneConfig,
} from "./studio-vrm-export-vrm-extension";
import {
  studioVrmHairRigInverseBindMatrices,
  type StudioVrmHairRig,
} from "./studio-vrm-hair-rig";
import { buildStudioVrmHumanoidMesh } from "./studio-vrm-humanoid-mesh";
import {
  STUDIO_VRM_RIG_NEUTRAL_HEIGHT,
  STUDIO_VRM_RIG_PARENTS,
  studioVrmRigInverseBindMatrices,
  type StudioVrmRig,
} from "./studio-vrm-humanoid-rig";

export const STUDIO_VRM_GENERATE_RECIPE_VERSION = 1 as const;
export const STUDIO_VRM_GENERATE_GENERATOR = "ToonSpectrum Studio VRM Generate";

/**
 * 아무것도 고르지 않고 생성했을 때 대신 쓰는 스타일.
 *
 * 조형 상태의 헤어 기본값은 `style: "none"` 이고, 그건 **오버레이 쪽에서는 옳다** — 불러온
 * VRM 위에 절차형 헤어를 씌우지 않는다는 뜻이고, 뷰포트의 조형 오버레이에는 다른 게이트가
 * 없어서 이 값이 곧 스위치다. 하지만 같은 상태가 생성에도 쓰이므로, 패널을 열자마자
 * "VRM 생성"을 누르면 머리 없는 캐릭터가 나온다. 생성 경로에서만 기본 스타일을 씌운다.
 */
export const STUDIO_VRM_GENERATE_DEFAULT_PRESET_ID = "natural-short";

export type StudioVrmGenerateSeed = {
  readonly state: AvatarForgeState;
  readonly presetId: string | null;
  /** 순정 기본 상태라 기본 프리셋으로 갈아끼웠다면 그 id. 아니면 null. */
  readonly appliedDefaultPresetId: string | null;
};

/**
 * 조형 상태가 **손대지 않은 순정 기본값**인지 본다.
 *
 * `hair.style === "none"` 만으로는 판단할 수 없다 — "없음"은 헤어 실루엣 목록에 있는
 * 정식 선택지라, 사용자가 프리셋을 고른 뒤 일부러 머리를 지운 상태와 구분해야 한다.
 * 그래서 직렬화 결과 전체를 순정 기본값과 비교한다. 슬라이더 하나라도 움직였거나 프리셋을
 * 골랐다면 순정이 아니므로 그대로 존중한다.
 */
function isPristineAvatarForgeState(state: AvatarForgeState): boolean {
  return (
    JSON.stringify(serializeAvatarForgeState(state)) ===
    JSON.stringify(serializeAvatarForgeState(createAvatarForgeState()))
  );
}

/**
 * 생성에 쓸 조형 상태를 정한다. 명시적으로 고른 프리셋이나 사용자가 조정한 상태는 절대
 * 덮어쓰지 않고, 아무 흔적도 없는 순정 기본값일 때만 기본 프리셋을 대신 넣는다.
 */
export function resolveStudioVrmGenerateSeed(input: {
  readonly presetId?: string | null;
  readonly state?: unknown;
  /**
   * false 면 순정 기본 상태여도 기본 프리셋을 넣지 않는다.
   *
   * 상태 비교만으로는 "아직 아무것도 안 골랐다"와 "일부러 머리 없음을 골랐다"를 가를 수
   * 없다 — 기본 헤어가 이미 `none` 이라 목록에서 "없음"을 눌러도 상태가 그대로다. 그래서
   * 실제 선택 행위는 UI 가 알려 준다.
   */
  readonly allowDefaultPreset?: boolean;
} = {}): StudioVrmGenerateSeed {
  const requestedPresetId = typeof input.presetId === "string" && input.presetId.trim()
    ? input.presetId.trim()
    : null;
  const state = input.state === undefined
    ? createAvatarForgeState(requestedPresetId ?? undefined)
    : sanitizeAvatarForgeState(input.state);
  const presetId = state.presetId ?? requestedPresetId ?? null;

  if (
    presetId !== null ||
    input.allowDefaultPreset === false ||
    !isPristineAvatarForgeState(state)
  ) {
    return { state, presetId, appliedDefaultPresetId: null };
  }
  return {
    state: createAvatarForgeState(STUDIO_VRM_GENERATE_DEFAULT_PRESET_ID),
    presetId: STUDIO_VRM_GENERATE_DEFAULT_PRESET_ID,
    appliedDefaultPresetId: STUDIO_VRM_GENERATE_DEFAULT_PRESET_ID,
  };
}

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
  /** 순정 기본 상태라 기본 프리셋이 대신 적용됐다면 그 id. UI 가 이 사실을 알린다. */
  readonly appliedDefaultPresetId: string | null;
};

export function resolveStudioVrmGeneratePresetLabel(presetId: string | null): string {
  if (!presetId) return "커스텀 캐릭터";
  return AVATAR_FORGE_PRESETS.find((preset) => preset.id === presetId)?.label ?? "커스텀 캐릭터";
}

export function createStudioVrmGenerateRecipe(input: {
  readonly presetId?: string | null;
  readonly state?: unknown;
  readonly allowDefaultPreset?: boolean;
} = {}): StudioVrmGenerateRecipe {
  const seed = resolveStudioVrmGenerateSeed(input);
  return {
    version: STUDIO_VRM_GENERATE_RECIPE_VERSION,
    presetId: seed.presetId,
    label: resolveStudioVrmGeneratePresetLabel(seed.presetId),
    state: seed.state,
    appliedDefaultPresetId: seed.appliedDefaultPresetId,
  };
}

/**
 * 눈을 움직이는 감정 표정이 깜빡임과 **겹쳐 쌓이지 않게** 하는 VRM 메타데이터.
 *
 * 표정 가중치는 런타임에서 모프 델타로 더해진다. 그래서 웃으면서 깜빡이는 평범한 상황에서
 * `happy`(눈을 30% 높이로 접음)와 `blink`(6% 로 접음)의 델타가 합산돼, 눈꺼풀이 닫히는 게
 * 아니라 아래 가장자리를 지나쳐 뒤집힌다.
 *
 * 눈이 크게 변형되는 표정은 깜빡임을 아예 막고(`block`), 눈 변화가 완만한 표정은 표정 세기에
 * 비례해 깜빡임을 줄인다(`blend`). 둘 다 VRM 1.0 이 이 문제를 위해 둔 장치다.
 */
const STUDIO_VRM_GENERATE_BLINK_OVERRIDES: Readonly<Record<string, "block" | "blend" | undefined>> =
  Object.freeze({
    happy: "block",
    relaxed: "block",
    surprised: "block",
    angry: "blend",
    sad: "blend",
  });

/** 본 인덱스 맵. `humanBones` 와 노드 자식 배열이 같은 규약을 쓰도록 한 곳에서 만든다. */
function humanoidBones(): StudioVrmExportHumanoidBones {
  return Object.fromEntries(
    STUDIO_VRM_EXPORT_REQUIRED_BONES.map((bone, index) => [bone, index + FIRST_BONE_NODE]),
  ) as StudioVrmExportHumanoidBones;
}

/**
 * 리그의 부모 체인을 glTF 노드 트리로 편다.
 *
 * `headChildren` 은 `head` 에 추가로 달 노드(헤어 역스케일 피벗)다. 머리를 돌릴 때 체인이
 * 따라오려면 `head` 아래에 있어야 한다.
 */
function buildBoneNodes(
  rig: StudioVrmRig,
  headChildren: readonly number[] = [],
): StudioVrmExportNode[] {
  const childrenOf = new Map<string, number[]>();
  STUDIO_VRM_EXPORT_REQUIRED_BONES.forEach((bone, index) => {
    const parent = STUDIO_VRM_RIG_PARENTS[bone];
    if (parent === null) return;
    const siblings = childrenOf.get(parent) ?? [];
    siblings.push(index + FIRST_BONE_NODE);
    childrenOf.set(parent, siblings);
  });
  if (headChildren.length > 0) {
    childrenOf.set("head", [...(childrenOf.get("head") ?? []), ...headChildren]);
  }

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
 * 헤어 체인을 `VRMC_springBone` 으로 낸다.
 *
 * 콜라이더는 **몸통 캡슐 하나**다. 이게 없으면 긴 머리가 흔들릴 때마다 등을 그대로 통과한다.
 * 반지름은 가슴 단면의 앞뒤 반경(`0.076 · 신장단위`)에 맞춘다 — 뒷머리가 실제 등 표면에
 * 얹히는 값이다. 좌우로는 몸통이 더 넓으므로 어깨 옆에서는 살짝 파고들 수 있지만, 머리카락은
 * 대부분 뒤로 흐르므로 앞뒤를 기준으로 잡는 쪽이 눈에 덜 띈다.
 *
 * 캡슐이 붙는 노드는 `spine` 이고 오프셋·꼬리는 그 로컬 좌표다(rest 에서 회전이 없으므로
 * 월드 차이가 곧 로컬 차이다).
 */
function buildHairSpringBone(
  hairRig: StudioVrmHairRig,
  rig: StudioVrmRig,
  firstHairNode: number,
): StudioVrmExportSpringBoneConfig {
  const spine = rig.worldRest.spine;
  const unit = rig.heightScale * STUDIO_VRM_RIG_NEUTRAL_HEIGHT;
  const spineNode = STUDIO_VRM_EXPORT_REQUIRED_BONES.indexOf("spine") + FIRST_BONE_NODE;
  const bottomY = rig.worldRest.hips[1] - 0.02 * rig.heightScale;
  const topY = rig.worldRest.leftUpperArm[1] - 0.02 * rig.heightScale;

  return {
    colliders: [
      {
        node: spineNode,
        shape: "capsule",
        offset: [0, bottomY - spine[1], 0],
        radius: 0.076 * unit,
        tail: [0, topY - spine[1], 0],
      },
    ],
    colliderGroups: [{ name: "Torso", colliders: [0] }],
    springs: hairRig.chains.map((chain) => ({
      name: `Hair_${chain.id}`,
      colliderGroups: [0],
      joints: chain.joints.map((joint, index) => ({
        node: firstHairNode + chain.jointOffset + index,
        hitRadius: joint.hitRadius,
        stiffness: chain.stiffness,
        gravityPower: chain.gravityPower,
        dragForce: chain.dragForce,
      })),
    })),
  };
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

  // 헤어 노드는 메시 노드 **뒤에** 붙인다 — 앞에 끼우면 본·메시 노드 인덱스가 전부 밀려
  // 표정 바인딩·1인칭 주석이 함께 흔들린다.
  const hairPivotNode = FIRST_MESH_NODE + humanoid.parts.length;
  const firstHairJointNode = hairPivotNode + 1;
  const hairRig = humanoid.hairRig;
  const hairJointNodes: StudioVrmExportNode[] = (hairRig?.joints ?? []).map((joint, index) => {
    // 체인 안에서 다음 조인트가 자식이다. 체인의 마지막 마디만 자식이 없다 — VRM 1.0 에서
    // 체인의 끝은 꼬리(tail)라 스스로 회전하지 않고, 부모가 회전하면 위치가 따라 움직인다.
    const chain = hairRig?.chains.find(
      (entry) => index >= entry.jointOffset && index < entry.jointOffset + entry.joints.length,
    );
    const isLast = chain !== undefined && index === chain.jointOffset + chain.joints.length - 1;
    return {
      name: joint.name,
      translation: joint.localTranslation,
      ...(isLast ? {} : { children: [firstHairJointNode + index + 1] }),
    } satisfies StudioVrmExportNode;
  });

  /**
   * 헤어 체인이 매달리는 **역스케일 피벗**.
   *
   * `head` 노드에는 조형 스케일 S 가 붙어 있다(두신비 × 얼굴 비율). 체인을 그 밑에 바로
   * 달면 두 가지가 깨진다:
   *
   *  1. **rest 위치가 어긋난다.** 리그는 조인트 로컬 이동을 월드 차이로 계산하는데 부모의
   *     S 가 거기 곱해진다 — 두신비 1.5 에서 28cm, 2.5(SD)에서 81cm 어긋나 머리카락이
   *     캐릭터에서 이탈했다. 배포 프리셋에서도 1.5cm 떴다.
   *  2. **회전이 전단·이방성 신축을 받는다.** 리그가 세운 "스케일이 붙은 본은 말단"
   *     불변식을 깨는 경로다(얼굴 비율이 다르면 S 가 비균등하다 — 배포 프리셋 21개 중
   *     18개가 그렇고 최대 1.083배).
   *
   * 피벗은 S⁻¹ 스케일에 이동 0 이다. 스케일로 이동을 감싸면 이동만 남으므로
   * (`S · T(t) · S⁻¹ = T(S·t)`) 피벗 아래는 **선형부가 항등**이 된다 — rest 위치가
   * 정확해지고, 아래에서 일어나는 회전에 S 가 섞이지 않는다. 피벗 자신은 절대 회전하지
   * 않으므로 `head` 는 여전히 전단을 전파하지 않는다.
   */
  const headScale = rig.nodeScale.head ?? [1, 1, 1];
  const hairPivot: StudioVrmExportNode = {
    name: "HairRoot",
    scale: [1 / headScale[0], 1 / headScale[1], 1 / headScale[2]],
    children: (hairRig?.chains ?? []).map(
      (chain) => firstHairJointNode + chain.jointOffset,
    ),
  };

  const nodes: StudioVrmExportNode[] = [
    {
      name: "Armature",
      children: [
        FIRST_BONE_NODE,
        ...humanoid.parts.map((_part, index) => meshNodeIndex(index)),
      ],
    },
    ...buildBoneNodes(rig, hairRig ? [hairPivotNode] : []),
    ...meshNodes,
    ...(hairRig ? [hairPivot, ...hairJointNodes] : []),
  ];

  const meshes: StudioVrmExportMesh[] = humanoid.parts.map((part) => ({
    name: part.meshName,
    primitives: part.primitives,
  }));

  // 표정 프리셋 이름과 모프 타깃 이름이 1:1이다 — 가중치 1로 같은 이름의 타깃 하나를 잡는다.
  const faceNode = meshNodeIndex(humanoid.facePartIndex);
  const preset: Partial<Record<StudioVrmExportExpressionPreset, StudioVrmExportExpression>> = {};
  humanoid.morphTargetNames.forEach((name, index) => {
    const overrideBlink = STUDIO_VRM_GENERATE_BLINK_OVERRIDES[name];
    preset[name as StudioVrmExportExpressionPreset] = {
      morphTargetBinds: [{ node: faceNode, index, weight: 1 }],
      ...(overrideBlink ? { overrideBlink } : {}),
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
        joints: [
          ...Array.from({ length: BONE_COUNT }, (_unused, index) => index + FIRST_BONE_NODE),
          ...(hairRig?.joints ?? []).map((_joint, index) => firstHairJointNode + index),
        ],
        skeleton: FIRST_BONE_NODE,
        inverseBindMatrices: [
          ...studioVrmRigInverseBindMatrices(rig),
          ...(hairRig ? studioVrmHairRigInverseBindMatrices(hairRig) : []),
        ],
      },
    ],
    materials: humanoid.materials,
    expressions: { preset },
    firstPerson,
    ...(hairRig ? { springBone: buildHairSpringBone(hairRig, rig, firstHairJointNode) } : {}),
  };
}

/** Headless export used by tests and by the generate MCP host. */
export function exportStudioVrmFromGenerateRecipe(
  recipe: StudioVrmGenerateRecipe,
): Uint8Array<ArrayBuffer> {
  return serializeStudioVrmExport(buildStudioVrmGenerateAuthoringSnapshot(recipe));
}
