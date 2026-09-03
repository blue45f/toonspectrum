import {
  sanitizeAvatarForgeSemanticFaceMorphs,
  type AvatarForgeSemanticFaceMorphId,
  type AvatarForgeSemanticFaceMorphState,
} from "./studio-vrm-avatar-forge";

import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

type MorphDirection = -1 | 1;

type InternalBinding = Readonly<{
  semanticId: AvatarForgeSemanticFaceMorphId;
  direction: MorphDirection;
  mesh: MorphMesh;
  targetIndex: number;
  targetName: string;
}>;

export type StudioVrmSemanticFaceMorphControl = Readonly<{
  id: AvatarForgeSemanticFaceMorphId;
  label: string;
  hint: string;
  minimum: -1 | 0;
  maximum: 0 | 1;
  positiveTargetCount: number;
  negativeTargetCount: number;
  targetNames: readonly string[];
}>;

export type StudioVrmSemanticFaceMorphProfile = Readonly<{
  status: "ready" | "unavailable";
  controls: readonly StudioVrmSemanticFaceMorphControl[];
  targetCount: number;
  message: string;
}>;

type SemanticSpec = Readonly<{
  id: AvatarForgeSemanticFaceMorphId;
  label: string;
  hint: string;
  positiveAliases: readonly string[];
  negativeAliases: readonly string[];
}>;

const SEMANTIC_SPECS: readonly SemanticSpec[] = Object.freeze([
  {
    id: "eyeSize",
    label: "눈 크기",
    hint: "모델이 제공하는 눈 크기 전용 morph만 사용합니다.",
    positiveAliases: [
      "eyeSizeBig", "eyesBig", "eyeBig", "eyeLarge", "eyesLarge",
      "eyeScaleUp", "eyesScaleUp", "eyeEnlarge",
    ],
    negativeAliases: [
      "eyeSizeSmall", "eyesSmall", "eyeSmall", "eyeScaleDown", "eyesScaleDown",
    ],
  },
  {
    id: "eyeSpacing",
    label: "눈 간격",
    hint: "양 눈 간격을 위해 명명된 morph가 있을 때만 활성화됩니다.",
    positiveAliases: [
      "eyeSpacingWide", "eyesWide", "eyeDistanceWide", "eyesApart",
    ],
    negativeAliases: [
      "eyeSpacingNarrow", "eyesNarrow", "eyeDistanceNarrow", "eyesClose",
    ],
  },
  {
    id: "eyeTilt",
    label: "눈꼬리",
    hint: "표정 morph가 아닌 고정 눈매 morph만 사용합니다.",
    positiveAliases: [
      "eyeTiltUp", "eyesTiltUp", "eyeUpturned", "eyesUpturned", "catEye",
    ],
    negativeAliases: [
      "eyeTiltDown", "eyesTiltDown", "eyeDownturned", "eyesDownturned", "droopyEye",
    ],
  },
  {
    id: "irisSize",
    label: "홍채 크기",
    hint: "홍채 또는 동공 크기 전용 morph가 확인된 모델에서만 사용합니다.",
    positiveAliases: [
      "irisSizeBig", "irisBig", "irisLarge", "pupilSizeBig", "pupilBig",
    ],
    negativeAliases: [
      "irisSizeSmall", "irisSmall", "pupilSizeSmall", "pupilSmall",
    ],
  },
  {
    id: "noseHeight",
    label: "코 높이",
    hint: "코 위치·높이 전용 morph를 사용하며 표정 채널은 건드리지 않습니다.",
    positiveAliases: [
      "noseHeightHigh", "noseHigh", "noseUp", "nosePositionUp",
    ],
    negativeAliases: [
      "noseHeightLow", "noseLow", "noseDown", "nosePositionDown",
    ],
  },
  {
    id: "noseWidth",
    label: "코 너비",
    hint: "코 폭 전용 morph가 존재할 때만 활성화됩니다.",
    positiveAliases: [
      "noseWidthWide", "noseWide", "noseBig",
    ],
    negativeAliases: [
      "noseWidthNarrow", "noseNarrow", "noseSmall",
    ],
  },
  {
    id: "mouthWidth",
    label: "입 너비",
    hint: "미소·발음 expression이 아닌 입 폭 전용 morph만 사용합니다.",
    positiveAliases: [
      "mouthWidthWide", "mouthWide", "lipWidthWide", "lipsWide",
    ],
    negativeAliases: [
      "mouthWidthNarrow", "mouthNarrow", "lipWidthNarrow", "lipsNarrow",
    ],
  },
  {
    id: "lipFullness",
    label: "입술 볼륨",
    hint: "입술 두께 전용 morph가 확인된 경우에만 활성화됩니다.",
    positiveAliases: [
      "lipFullnessHigh", "lipFull", "lipsFull", "lipThick", "lipsThick",
    ],
    negativeAliases: [
      "lipFullnessLow", "lipThin", "lipsThin",
    ],
  },
  {
    id: "earSize",
    label: "귀 크기",
    hint: "귀 크기 전용 morph만 사용하며 귀 모양을 임의로 추측하지 않습니다.",
    positiveAliases: [
      "earSizeBig", "earsBig", "earBig", "earLarge", "earsLarge",
    ],
    negativeAliases: [
      "earSizeSmall", "earsSmall", "earSmall",
    ],
  },
]);

const ALLOWED_PREFIXES = Object.freeze([
  "",
  "face",
  "facial",
  "avatar",
  "character",
  "morph",
  "blendshape",
  "shapekey",
]);

function normalizeTargetName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]/gu, "");
}

function aliasVariants(aliases: readonly string[]): ReadonlySet<string> {
  const variants = new Set<string>();
  for (const alias of aliases) {
    const normalized = normalizeTargetName(alias);
    for (const prefix of ALLOWED_PREFIXES) variants.add(`${prefix}${normalized}`);
  }
  return variants;
}

const MATCHERS = new Map(
  SEMANTIC_SPECS.map((spec) => [
    spec.id,
    {
      positive: aliasVariants(spec.positiveAliases),
      negative: aliasVariants(spec.negativeAliases),
    },
  ] as const),
);

function morphMesh(object: THREE.Object3D): MorphMesh | null {
  const candidate = object as MorphMesh;
  if (
    !candidate.isMesh
    || !candidate.morphTargetDictionary
    || !Array.isArray(candidate.morphTargetInfluences)
  ) return null;
  return candidate;
}

function discoverBindings(vrm: VRM | null | undefined): readonly InternalBinding[] {
  if (!vrm) return [];
  const bindings: InternalBinding[] = [];
  vrm.scene.traverse((object) => {
    const mesh = morphMesh(object);
    if (!mesh) return;
    const influences = mesh.morphTargetInfluences!;
    const claimed = new Set<number>();
    for (const [targetName, targetIndex] of Object.entries(mesh.morphTargetDictionary!)) {
      if (
        !Number.isSafeInteger(targetIndex)
        || targetIndex < 0
        || targetIndex >= influences.length
        || claimed.has(targetIndex)
      ) continue;
      const normalized = normalizeTargetName(targetName);
      for (const spec of SEMANTIC_SPECS) {
        const matcher = MATCHERS.get(spec.id);
        const direction: MorphDirection | null = matcher?.positive.has(normalized)
          ? 1
          : matcher?.negative.has(normalized)
            ? -1
            : null;
        if (direction === null) continue;
        bindings.push(Object.freeze({
          semanticId: spec.id,
          direction,
          mesh,
          targetIndex,
          targetName,
        }));
        claimed.add(targetIndex);
        break;
      }
    }
  });
  return Object.freeze(bindings);
}

export function inspectStudioVrmSemanticFaceMorphProfile(
  vrm: VRM | null | undefined,
): StudioVrmSemanticFaceMorphProfile {
  const bindings = discoverBindings(vrm);
  const controls = SEMANTIC_SPECS.flatMap((spec) => {
    const matching = bindings.filter((binding) => binding.semanticId === spec.id);
    const positiveTargetCount = matching.filter((binding) => binding.direction === 1).length;
    const negativeTargetCount = matching.length - positiveTargetCount;
    if (matching.length === 0) return [];
    return [Object.freeze({
      id: spec.id,
      label: spec.label,
      hint: spec.hint,
      minimum: negativeTargetCount > 0 ? -1 as const : 0 as const,
      maximum: positiveTargetCount > 0 ? 1 as const : 0 as const,
      positiveTargetCount,
      negativeTargetCount,
      targetNames: Object.freeze([...new Set(matching.map((binding) => binding.targetName))].sort()),
    })];
  });
  const targetCount = bindings.length;
  return Object.freeze({
    status: controls.length > 0 ? "ready" as const : "unavailable" as const,
    controls: Object.freeze(controls),
    targetCount,
    message: controls.length > 0
      ? `의미가 명확한 얼굴 morph ${controls.length}종 · 대상 ${targetCount}개를 확인했습니다.`
      : "이 VRM에는 안전하게 식별할 수 있는 눈·코·입·귀 조형 morph가 없습니다. 두상·턱 비율 편집은 계속 사용할 수 있습니다.",
  });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Applies only exact semantic shape-key bindings and returns a restoration lease.
 *
 * Expression channels (blink, phoneme, joy, etc.) are deliberately absent from the alias table,
 * so active facial animation remains under the VRM expression manager's authority.
 */
export function applyStudioVrmSemanticFaceMorphs(
  vrm: VRM | null | undefined,
  rawState: AvatarForgeSemanticFaceMorphState | null | undefined,
): () => void {
  const bindings = discoverBindings(vrm);
  if (bindings.length === 0) return () => undefined;
  const state = sanitizeAvatarForgeSemanticFaceMorphs(rawState) ?? {};
  const baselines = bindings.map((binding) => ({
    binding,
    value: binding.mesh.morphTargetInfluences?.[binding.targetIndex] ?? 0,
  }));

  for (const { binding, value: baseline } of baselines) {
    const semanticValue = state[binding.semanticId] ?? 0;
    const amount = binding.direction === 1
      ? Math.max(0, semanticValue)
      : Math.max(0, -semanticValue);
    const influences = binding.mesh.morphTargetInfluences;
    if (!influences) continue;
    influences[binding.targetIndex] = clamp01(
      baseline + (1 - clamp01(baseline)) * clamp01(amount),
    );
  }

  return () => {
    for (const { binding, value } of baselines) {
      const influences = binding.mesh.morphTargetInfluences;
      if (!influences || binding.targetIndex >= influences.length) continue;
      influences[binding.targetIndex] = value;
    }
  };
}
