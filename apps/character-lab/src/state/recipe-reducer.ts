/**
 * 레시피 reducer. 순수·불변이며 입력 레시피를 바꾸지 않는다.
 *
 * - `slot/apply`는 카탈로그 항목의 `patch`만 적용한다. `conflictsWith`는 적용하지 않는다(충돌은 플래너가
 *   partial 사유로 노출한다). `patch.parts`는 레시피에 저장하지 않고 플래너가 카탈로그에서 다시 읽는다.
 * - 잘못된 입력(어휘 밖 키·형식 틀린 색·비정규 쿼터니언 등)은 무음으로 넘기지 않고
 *   `RecipeCommandError`(code + 한글 사유)를 던진다. store가 이를 failure 이벤트로 바꾼다.
 * - 값이 바뀌지 않는 명령(같은 값의 param/color)은 같은 참조를 돌려줘 store가 history 단계를 만들지 않게 한다.
 */
import {
  PHYSICS_PROVIDER_LABELS_KO,
  RECIPE_COLOR_KEYS,
  SLOT_LABELS_KO,
  bonesInScope,
  clampExpression,
  clampParam,
  isBodyParamKey,
  isFaceParamKey,
  isPhysicsProviderId,
  isPresetId,
  mergeShadingProfile,
  normalizeParamValues,
  parseRecipe,
  presetSlot,
  recipeSourceSchema,
  shadingProfileSchema,
} from "../contracts";
import { normalizeHex } from "../shared/color";
import { qNormalize } from "../shared/math";

import type {
  BodyParamKey,
  CharacterRecipe,
  FaceParamKey,
  HandPosePair,
  HumanoidBoneName,
  LabCommand,
  Pose,
  PoseScope,
  PresetCatalog,
  Quat,
  RecipeColorKey,
  RecipeCommand,
  RecipePatch,
} from "../contracts";

/** reducer가 거부한 명령. `code`는 kebab-case, `message`는 사용자에게 보여줄 한글 사유다. */
export class RecipeCommandError extends Error {
  readonly code: string;

  constructor(code: string, reasonKo: string) {
    super(reasonKo);
    this.name = "RecipeCommandError";
    this.code = code;
  }
}

export function isRecipeCommand(command: LabCommand): command is RecipeCommand {
  return command.type !== "history/undo" && command.type !== "history/redo" && command.type !== "paint/stroke";
}

const COLOR_KEY_SET: ReadonlySet<string> = new Set(RECIPE_COLOR_KEYS);

/** 이보다 짧은 쿼터니언은 방향이 없으므로 거부한다(`qNormalize`는 0 길이에서 항등을 돌려주므로 직접 검사). */
export const QUAT_MIN_LENGTH = 1e-6;

function assertFiniteQuat(bone: string, quat: Quat): Quat {
  if (quat.length !== 4 || !quat.every(Number.isFinite)) {
    throw new RecipeCommandError("command-pose-quat", `${bone} 회전이 유한한 4성분 쿼터니언이 아닙니다.`);
  }
  if (Math.hypot(quat[0], quat[1], quat[2], quat[3]) < QUAT_MIN_LENGTH) {
    throw new RecipeCommandError("command-pose-quat", `${bone} 회전의 길이가 0이라 정규화할 수 없습니다.`);
  }
  return qNormalize(quat);
}

/** 포즈의 모든 회전을 정규화한 새 객체 */
export function normalizePose(pose: Pose): Pose {
  const result: Partial<Record<HumanoidBoneName, Quat>> = {};
  for (const [bone, quat] of Object.entries(pose) as Array<[HumanoidBoneName, Quat | undefined]>) {
    if (!quat) continue;
    result[bone] = assertFiniteQuat(bone, quat);
  }
  return result;
}

/**
 * 스코프 병합: 스코프 안의 본은 overlay 값으로 완전히 교체되고(overlay에 없으면 rest로 복귀),
 * 스코프 밖의 본은 base를 유지한다. overlay의 스코프 밖 본은 무시한다.
 */
export function mergePoseScoped(base: Pose, overlay: Pose, scope: PoseScope): Pose {
  const result: Partial<Record<HumanoidBoneName, Quat>> = { ...base };
  for (const bone of bonesInScope(scope)) {
    const quat = overlay[bone];
    if (quat) result[bone] = assertFiniteQuat(bone, quat);
    else delete result[bone];
  }
  return result;
}

function applyPatch(recipe: CharacterRecipe, patch: RecipePatch): CharacterRecipe {
  let next = recipe;
  if (patch.body) next = { ...next, body: normalizeParamValues({ ...next.body, ...patch.body }) };
  if (patch.face) next = { ...next, face: normalizeParamValues({ ...next.face, ...patch.face }) };
  if (patch.colors) {
    const colors = { ...next.colors };
    for (const [key, value] of Object.entries(patch.colors) as Array<[RecipeColorKey, string | undefined]>) {
      if (value === undefined) continue;
      const hex = normalizeHex(value);
      if (!hex) throw new RecipeCommandError("command-color-invalid", `프리셋 색 ${key}의 형식이 틀립니다: ${value}`);
      colors[key] = hex;
    }
    next = { ...next, colors };
  }
  if (patch.expression) next = { ...next, expression: clampExpression(patch.expression) };
  if (patch.pose) next = { ...next, pose: normalizePose(patch.pose) };
  if (patch.handPose) {
    const handPose: HandPosePair = { left: normalizePose(patch.handPose.left), right: normalizePose(patch.handPose.right) };
    next = { ...next, handPose };
  }
  return next;
}

function reduceSlotApply(recipe: CharacterRecipe, command: Extract<RecipeCommand, { type: "slot/apply" }>, catalog: PresetCatalog): CharacterRecipe {
  const { slot, presetId } = command;
  if (presetId === null) {
    if (recipe.slots[slot] === null) return recipe;
    return { ...recipe, slots: { ...recipe.slots, [slot]: null } };
  }
  if (!isPresetId(presetId) || presetSlot(presetId) !== slot) {
    throw new RecipeCommandError("command-slot-mismatch", `프리셋 ${String(presetId)}는 슬롯 ${SLOT_LABELS_KO[slot]}(${slot})에 적용할 수 없습니다.`);
  }
  const entry = catalog.get(presetId);
  if (!entry) throw new RecipeCommandError("command-preset-unknown", `카탈로그에 없는 프리셋입니다: ${presetId}`);
  return applyPatch({ ...recipe, slots: { ...recipe.slots, [slot]: presetId } }, entry.patch);
}

function reduceParamSet(recipe: CharacterRecipe, command: Extract<RecipeCommand, { type: "param/set" }>): CharacterRecipe {
  const { group, key, value } = command;
  const valid = group === "body" ? isBodyParamKey(key) : isFaceParamKey(key);
  if (!valid) throw new RecipeCommandError("command-param-key", `${group === "body" ? "체형" : "얼굴"} 파라미터가 아닙니다: ${key}`);
  if (!Number.isFinite(value)) throw new RecipeCommandError("command-param-value", `파라미터 ${key} 값이 숫자가 아닙니다.`);
  const clamped = clampParam(value);
  if (group === "body") {
    const bodyKey = key as BodyParamKey;
    if ((recipe.body[bodyKey] ?? 0) === clamped) return recipe;
    const body = { ...recipe.body };
    if (clamped === 0) delete body[bodyKey];
    else body[bodyKey] = clamped;
    return { ...recipe, body };
  }
  const faceKey = key as FaceParamKey;
  if ((recipe.face[faceKey] ?? 0) === clamped) return recipe;
  const face = { ...recipe.face };
  if (clamped === 0) delete face[faceKey];
  else face[faceKey] = clamped;
  return { ...recipe, face };
}

function reduceHandPoseSet(recipe: CharacterRecipe, command: Extract<RecipeCommand, { type: "hand-pose/set" }>, catalog: PresetCatalog): CharacterRecipe {
  const { side, presetId } = command;
  if (presetId === null) {
    return { ...recipe, slots: { ...recipe.slots, "hand-pose": null }, handPose: { ...recipe.handPose, [side]: {} } };
  }
  if (!isPresetId(presetId) || presetSlot(presetId) !== "hand-pose") {
    throw new RecipeCommandError("command-slot-mismatch", `손 포즈 슬롯에 적용할 수 없는 프리셋입니다: ${String(presetId)}`);
  }
  const entry = catalog.get(presetId);
  if (!entry) throw new RecipeCommandError("command-preset-unknown", `카탈로그에 없는 프리셋입니다: ${presetId}`);
  const sidePose = entry.patch.handPose?.[side];
  if (!sidePose) throw new RecipeCommandError("command-hand-pose-empty", `프리셋 ${presetId}에 ${side === "left" ? "왼손" : "오른손"} 포즈가 없습니다.`);
  return {
    ...recipe,
    slots: { ...recipe.slots, "hand-pose": presetId },
    handPose: { ...recipe.handPose, [side]: normalizePose(sidePose) },
  };
}

/**
 * 레시피 명령 하나를 적용한 새 레시피를 돌려준다. history/undo·redo·paint/stroke는 store가 처리한다.
 * 변경이 없으면 같은 참조를 돌려줄 수 있다.
 */
export function reduceRecipe(recipe: CharacterRecipe, command: RecipeCommand, catalog: PresetCatalog): CharacterRecipe {
  switch (command.type) {
    case "slot/apply":
      return reduceSlotApply(recipe, command, catalog);
    case "param/set":
      return reduceParamSet(recipe, command);
    case "color/set": {
      if (!COLOR_KEY_SET.has(command.key)) throw new RecipeCommandError("command-color-key", `레시피 색 키가 아닙니다: ${String(command.key)}`);
      const hex = normalizeHex(command.value);
      if (!hex) throw new RecipeCommandError("command-color-invalid", `색은 #rrggbb 형식이어야 합니다: ${command.value}`);
      if (recipe.colors[command.key] === hex) return recipe;
      return { ...recipe, colors: { ...recipe.colors, [command.key]: hex } };
    }
    case "expression/set": {
      const weights = command.merge ? { ...recipe.expression, ...command.weights } : command.weights;
      return { ...recipe, expression: clampExpression(weights) };
    }
    case "pose/set":
      return { ...recipe, pose: mergePoseScoped(recipe.pose, command.pose, command.scope) };
    case "hand-pose/set":
      return reduceHandPoseSet(recipe, command, catalog);
    case "shading/set": {
      const merged = mergeShadingProfile(recipe.shading, command.profile);
      const parsed = shadingProfileSchema.safeParse(merged);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new RecipeCommandError("command-shading-invalid", `셰이딩 프로파일이 올바르지 않습니다: ${issue?.path.map(String).join(".") ?? ""} ${issue?.message ?? ""}`);
      }
      return { ...recipe, shading: parsed.data };
    }
    case "physics/set-provider": {
      if (!isPhysicsProviderId(command.provider)) throw new RecipeCommandError("command-physics-provider", `알 수 없는 물리 provider입니다: ${String(command.provider)}`);
      if (recipe.physics.provider === command.provider) return recipe;
      return { ...recipe, physics: { provider: command.provider } };
    }
    case "source/set": {
      const parsed = recipeSourceSchema.safeParse(command.source);
      if (!parsed.success) throw new RecipeCommandError("command-source-invalid", "캐릭터 소스 형식이 올바르지 않습니다.");
      return { ...recipe, source: parsed.data };
    }
    case "recipe/load": {
      const parsed = parseRecipe(command.recipe);
      if (!parsed.ok) throw new RecipeCommandError(parsed.failure.code, parsed.failure.reasonKo);
      return parsed.recipe;
    }
    default: {
      const exhaustive: never = command;
      throw new RecipeCommandError("command-unknown", `알 수 없는 명령입니다: ${String((exhaustive as { type?: unknown }).type)}`);
    }
  }
}

/** history 항목 라벨(한글). 카탈로그가 있으면 프리셋 한글 이름을 쓴다. */
export function describeCommandKo(command: RecipeCommand, catalog?: PresetCatalog): string {
  switch (command.type) {
    case "slot/apply": {
      const label = command.presetId === null ? "없음" : (catalog?.get(command.presetId)?.labelKo ?? command.presetId);
      return `${SLOT_LABELS_KO[command.slot]}: ${label}`;
    }
    case "param/set":
      return `${command.group === "body" ? "체형" : "얼굴"} 파라미터 ${command.key}`;
    case "color/set":
      return `색 ${command.key}`;
    case "expression/set":
      return command.merge ? "표정 조정" : "표정 설정";
    case "pose/set":
      return command.labelKo || "포즈 변경";
    case "hand-pose/set": {
      const label = command.presetId === null ? "없음" : (catalog?.get(command.presetId)?.labelKo ?? command.presetId);
      return `${command.side === "left" ? "왼손" : "오른손"} 포즈: ${label}`;
    }
    case "shading/set":
      return "셰이딩 변경";
    case "physics/set-provider":
      return `물리 provider: ${PHYSICS_PROVIDER_LABELS_KO[command.provider] ?? command.provider}`;
    case "source/set":
      return command.source.kind === "package" ? `소스: 제작 패키지 ${command.source.characterId}` : "소스: 절차적";
    case "recipe/load":
      return "레시피 불러오기";
    default: {
      const exhaustive: never = command;
      return String((exhaustive as { type?: unknown }).type);
    }
  }
}
