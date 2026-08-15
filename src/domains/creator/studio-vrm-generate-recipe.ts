import {
  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,
  sanitizeAvatarForgeState,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  serializeStudioVrmExport,
  type StudioVrmExportNode,
  type StudioVrmExportPrimitive,
  type StudioVrmExportSceneSnapshot,
} from "./studio-vrm-export-plan";
import {
  STUDIO_VRM_EXPORT_REQUIRED_BONES,
  type StudioVrmExportHumanoidBones,
} from "./studio-vrm-export-vrm-extension";

export const STUDIO_VRM_GENERATE_RECIPE_VERSION = 1 as const;
export const STUDIO_VRM_GENERATE_GENERATOR = "ToonSpectrum Studio VRM Generate";

const HIPS_NODE = 1;
const BONE_COUNT = STUDIO_VRM_EXPORT_REQUIRED_BONES.length;
const MESH_NODE = BONE_COUNT + 1;
const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

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

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(value)) return [0.92, 0.78, 0.72];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function humanoidBones(): StudioVrmExportHumanoidBones {
  return Object.fromEntries(
    STUDIO_VRM_EXPORT_REQUIRED_BONES.map((bone, index) => [bone, index + HIPS_NODE]),
  ) as StudioVrmExportHumanoidBones;
}

function boxPrimitive(
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  joint: number,
): StudioVrmExportPrimitive {
  const corners: Array<readonly [number, number, number]> = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  for (const [dx, dy, dz] of corners) {
    positions.push(cx + dx, cy + dy, cz + dz);
    const length = Math.hypot(dx, dy, dz) || 1;
    normals.push(dx / length, dy / length, dz / length);
    joints.push(joint, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  return {
    positions,
    normals,
    joints,
    weights,
    indices: [
      0, 1, 2, 0, 2, 3,
      4, 6, 5, 4, 7, 6,
      0, 4, 5, 0, 5, 1,
      3, 2, 6, 3, 6, 7,
      0, 3, 7, 0, 7, 4,
      1, 5, 6, 1, 6, 2,
    ],
    material: 0,
  };
}

function boneTranslation(
  bone: (typeof STUDIO_VRM_EXPORT_REQUIRED_BONES)[number],
  state: AvatarForgeState,
): readonly [number, number, number] {
  const { face, proportions } = state;
  const torso = proportions.torsoLength;
  const leg = proportions.legLength;
  const arm = proportions.armLength;
  const shoulder = proportions.shoulderWidth;
  switch (bone) {
    case "hips":
      return [0, 0, 0];
    case "spine":
      return [0, 0.12 * torso, 0];
    case "head":
      return [0, 0.16 * torso * face.headHeight, 0];
    case "leftUpperLeg":
      return [-0.07 * shoulder, -0.04 * leg, 0];
    case "leftLowerLeg":
      return [0, -0.22 * leg, 0];
    case "leftFoot":
      return [0, -0.2 * leg, 0.04];
    case "rightUpperLeg":
      return [0.07 * shoulder, -0.04 * leg, 0];
    case "rightLowerLeg":
      return [0, -0.22 * leg, 0];
    case "rightFoot":
      return [0, -0.2 * leg, 0.04];
    case "leftUpperArm":
      return [-0.14 * shoulder, 0.08 * torso, 0];
    case "leftLowerArm":
      return [-0.16 * arm, 0, 0];
    case "leftHand":
      return [-0.14 * arm, 0, 0];
    case "rightUpperArm":
      return [0.14 * shoulder, 0.08 * torso, 0];
    case "rightLowerArm":
      return [0.16 * arm, 0, 0];
    case "rightHand":
      return [0.14 * arm, 0, 0];
    default:
      return [0, 0, 0];
  }
}

/**
 * Turns a generation recipe into the headless VRM export snapshot. Distinct face/hair/body
 * params change bone rest poses and the skinned mesh tint so two presets never collide.
 */
export function buildStudioVrmGenerateAuthoringSnapshot(
  recipe: StudioVrmGenerateRecipe,
): StudioVrmExportSceneSnapshot {
  const { state, label } = recipe;
  const width = 0.18 * state.face.headWidth * state.hair.volume;
  const depth = 0.1 * state.face.headDepth;
  const skin = hexToRgb(state.hair.baseColor);
  const shade = hexToRgb(state.hair.tipColor);
  const nodes: StudioVrmExportNode[] = [
    { name: "Armature", children: [HIPS_NODE, MESH_NODE] },
  ];
  STUDIO_VRM_EXPORT_REQUIRED_BONES.forEach((bone, index) => {
    nodes.push({
      name: bone,
      translation: boneTranslation(bone, state),
      scale: bone === "head"
        ? [state.face.headWidth, state.face.headHeight, state.face.headDepth]
        : undefined,
      ...(index === 0
        ? { children: Array.from({ length: BONE_COUNT - 1 }, (_unused, child) => child + HIPS_NODE + 1) }
        : {}),
    });
  });
  nodes.push({ name: "Body", mesh: 0, skin: 0 });

  const shoulder = state.proportions.shoulderWidth;
  const torso = state.proportions.torsoLength;
  const leg = state.proportions.legLength;
  const arm = state.proportions.armLength;
  const primitives = [
    boxPrimitive(0, 0.04 * torso, 0, 0.11 * shoulder, 0.05 * torso, 0.07, 0),
    boxPrimitive(0, 0.16 * torso, 0, 0.13 * shoulder, 0.14 * torso, 0.08, 1),
    boxPrimitive(
      0,
      0.16 * torso + 0.12 * torso * state.face.headHeight,
      0,
      width,
      0.09 * state.face.headHeight,
      Math.max(0.05, depth),
      2,
    ),
    boxPrimitive(-0.05 * shoulder, -0.12 * leg, 0, 0.045, 0.11 * leg, 0.045, 3),
    boxPrimitive(-0.05 * shoulder, -0.32 * leg, 0, 0.04, 0.1 * leg, 0.04, 4),
    boxPrimitive(-0.05 * shoulder, -0.44 * leg, 0.03, 0.04, 0.025, 0.07, 5),
    boxPrimitive(0.05 * shoulder, -0.12 * leg, 0, 0.045, 0.11 * leg, 0.045, 6),
    boxPrimitive(0.05 * shoulder, -0.32 * leg, 0, 0.04, 0.1 * leg, 0.04, 7),
    boxPrimitive(0.05 * shoulder, -0.44 * leg, 0.03, 0.04, 0.025, 0.07, 8),
    boxPrimitive(-0.2 * shoulder, 0.2 * torso, 0, 0.1 * arm, 0.035, 0.035, 9),
    boxPrimitive(-0.34 * arm, 0.2 * torso, 0, 0.09 * arm, 0.03, 0.03, 10),
    boxPrimitive(-0.46 * arm, 0.2 * torso, 0, 0.04, 0.025, 0.03, 11),
    boxPrimitive(0.2 * shoulder, 0.2 * torso, 0, 0.1 * arm, 0.035, 0.035, 12),
    boxPrimitive(0.34 * arm, 0.2 * torso, 0, 0.09 * arm, 0.03, 0.03, 13),
    boxPrimitive(0.46 * arm, 0.2 * torso, 0, 0.04, 0.025, 0.03, 14),
  ];
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
    nodes,
    meshes: [
      {
        name: "Body",
        primitives: primitives.map((primitive, index) => {
          const smile = new Array(primitive.positions.length).fill(0);
          if (index === 2) {
            for (let offset = 1; offset < smile.length; offset += 3) smile[offset] = 0.012;
          }
          return { ...primitive, targets: [{ name: "smile", positions: smile }] };
        }),
      },
    ],
    skins: [
      {
        joints: Array.from({ length: BONE_COUNT }, (_unused, index) => index + HIPS_NODE),
        skeleton: HIPS_NODE,
        inverseBindMatrices: Array.from({ length: BONE_COUNT }, () => [...IDENTITY_MATRIX]).flat(),
      },
    ],
    materials: [
      {
        name: "Skin",
        baseColorFactor: [skin[0], skin[1], skin[2], 1],
        metallicFactor: 0,
        roughnessFactor: Math.max(0.2, 1 - state.hair.shine),
        mtoon: {
          shadeColorFactor: [shade[0], shade[1], shade[2]],
          shadingToonyFactor: 0.95,
          outlineWidthMode: "worldCoordinates",
          outlineWidthFactor: 0.008,
        },
      },
    ],
    expressions: {
      preset: {
        happy: { morphTargetBinds: [{ node: MESH_NODE, index: 0, weight: 1 }] },
      },
    },
    firstPerson: [{ node: MESH_NODE, type: "auto" }],
  };
}

/** Headless export used by tests and by the generate MCP host. */
export function exportStudioVrmFromGenerateRecipe(
  recipe: StudioVrmGenerateRecipe,
): Uint8Array<ArrayBuffer> {
  return serializeStudioVrmExport(buildStudioVrmGenerateAuthoringSnapshot(recipe));
}
