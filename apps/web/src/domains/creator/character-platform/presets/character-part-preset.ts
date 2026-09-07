import type { CharacterSlotKind } from "../../character-shaper/character-shaper-contract";
import type {
  CharacterDocumentV2,
  CharacterSlotSelectionV2,
} from "../document/character-document-v2";

export const CHARACTER_PART_PRESET_VERSION = 1 as const;
export type CharacterPresetScope = "personal" | "project" | "team";
export type CharacterPresetKind =
  | "slot"
  | "palette"
  | "outfit"
  | "expression"
  | "partial-pose"
  | "full-pose"
  | "hand-grip"
  | "character-variant"
  | "camera-shot";

export interface CharacterPartPresetCompatibility {
  readonly topologyFamilies: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly allowPartial: boolean;
}

export interface CharacterPartPresetPayload {
  readonly slot?: CharacterSlotKind;
  readonly selections?: readonly CharacterSlotSelectionV2[];
  readonly controls?: Readonly<Record<string, number>>;
  readonly colors?: Readonly<Record<string, string | null>>;
  readonly expression?: CharacterDocumentV2["expression"];
  readonly pose?: CharacterDocumentV2["pose"];
  readonly cameraShotId?: string | null;
}

export interface CharacterPartPresetV1 {
  readonly schemaVersion: typeof CHARACTER_PART_PRESET_VERSION;
  readonly presetId: string;
  readonly version: number;
  readonly kind: CharacterPresetKind;
  readonly name: string;
  readonly description: string;
  readonly sourceModel: {
    readonly assetId: string;
    readonly assetVersion: string;
    readonly topologyFamily: string | null;
  };
  readonly payload: CharacterPartPresetPayload;
  readonly compatibility: CharacterPartPresetCompatibility;
  readonly tags: readonly string[];
  readonly scope: CharacterPresetScope;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateCharacterPartPresetInput {
  readonly presetId: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: CharacterPresetKind;
  readonly scope: CharacterPresetScope;
  readonly document: CharacterDocumentV2;
  readonly slot?: CharacterSlotKind;
  readonly includeColors?: boolean;
  readonly includeControls?: boolean;
  readonly tags?: readonly string[];
  readonly now?: string;
}

export interface ApplyCharacterPartPresetResult {
  readonly ok: boolean;
  readonly document: CharacterDocumentV2;
  readonly applied: readonly string[];
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
}

export class CharacterPartPresetError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterPartPresetError";
  }
}

function cleanText(value: string, maximum: number): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, maximum);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isString(value: unknown, maximum = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneSelection(value: CharacterSlotSelectionV2): CharacterSlotSelectionV2 {
  return Object.freeze({
    ...value,
    overrides: value.overrides ? Object.freeze({ ...value.overrides }) : undefined,
  });
}

function selectionForSlot(document: CharacterDocumentV2, slot: CharacterSlotKind): readonly CharacterSlotSelectionV2[] {
  if (slot === "accessory") return document.recipe.accessories.map(cloneSelection);
  if (slot === "hand-pose") {
    const values = [document.recipe.handPose.left, document.recipe.handPose.right].filter(
      (value): value is CharacterSlotSelectionV2 => value !== undefined,
    );
    return values.map(cloneSelection);
  }
  const value = document.recipe.slots[slot as keyof CharacterDocumentV2["recipe"]["slots"]];
  return value ? [cloneSelection(value)] : [];
}

function controlsForSlot(
  document: CharacterDocumentV2,
  slot: CharacterSlotKind | undefined,
): Readonly<Record<string, number>> {
  if (!slot) return Object.freeze({ ...document.customControls });
  const prefixes: Readonly<Record<string, readonly string[]>> = {
    "face-shape": ["face."],
    eyes: ["morph.eye", "face.eye"],
    irises: ["morph.iris"],
    nose: ["morph.nose"],
    mouth: ["morph.mouth", "morph.lip"],
    ears: ["morph.ear"],
    hair: ["hair."],
    body: ["body.", "proportion."],
  };
  const allowed = prefixes[slot] ?? [];
  return Object.freeze(Object.fromEntries(
    Object.entries(document.customControls).filter(([key]) => allowed.some((prefix) => key.startsWith(prefix))),
  ));
}

function colorKeysForSlot(slot: CharacterSlotKind | undefined): readonly string[] {
  if (!slot) return ["skin", "hairBase", "hairTip", "iris", "top", "bottom", "shoes"];
  const map: Partial<Record<CharacterSlotKind, readonly string[]>> = {
    "face-shape": ["skin"],
    eyes: ["iris"],
    irises: ["iris"],
    hair: ["hairBase", "hairTip"],
    top: ["top"],
    bottom: ["bottom"],
    shoes: ["shoes"],
  };
  return map[slot] ?? [];
}

function colorsForPreset(
  document: CharacterDocumentV2,
  slot: CharacterSlotKind | undefined,
): Readonly<Record<string, string | null>> {
  const keys = new Set(colorKeysForSlot(slot));
  return Object.freeze(Object.fromEntries(
    Object.entries(document.colors).filter(([key]) => keys.has(key)),
  ));
}

export function createCharacterPartPreset(
  input: CreateCharacterPartPresetInput,
): CharacterPartPresetV1 {
  const presetId = cleanText(input.presetId, 128);
  const name = cleanText(input.name, 60);
  if (!presetId || !name) {
    throw new CharacterPartPresetError("CHARACTER_PRESET_NAME", "프리셋 이름과 식별자가 필요합니다.");
  }
  if (input.kind === "slot" && !input.slot) {
    throw new CharacterPartPresetError("CHARACTER_PRESET_SLOT", "파츠 프리셋에는 슬롯이 필요합니다.");
  }
  const now = input.now ?? new Date().toISOString();
  const payload: CharacterPartPresetPayload = Object.freeze({
    slot: input.slot,
    selections: input.slot ? Object.freeze(selectionForSlot(input.document, input.slot)) : undefined,
    controls: input.includeControls === false ? undefined : controlsForSlot(input.document, input.slot),
    colors: input.includeColors === false ? undefined : colorsForPreset(input.document, input.slot),
    expression: input.kind === "expression" ? input.document.expression : undefined,
    pose: input.kind === "partial-pose" || input.kind === "full-pose" || input.kind === "hand-grip"
      ? input.document.pose
      : undefined,
    cameraShotId: input.kind === "camera-shot" ? input.document.camera.activeShotId : undefined,
  });
  return Object.freeze({
    schemaVersion: CHARACTER_PART_PRESET_VERSION,
    presetId,
    version: 1,
    kind: input.kind,
    name,
    description: cleanText(input.description ?? "", 240),
    sourceModel: Object.freeze({
      assetId: input.document.model.assetId,
      assetVersion: input.document.model.assetVersion,
      topologyFamily: input.document.model.topologyFamily ?? null,
    }),
    payload,
    compatibility: Object.freeze({
      topologyFamilies: Object.freeze(input.document.model.topologyFamily ? [input.document.model.topologyFamily] : []),
      requiredCapabilities: Object.freeze(input.document.compatibility.supported.slice().sort()),
      allowPartial: input.document.model.mode === "compatible",
    }),
    tags: Object.freeze((input.tags ?? []).map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 32)),
    scope: input.scope,
    createdAt: now,
    updatedAt: now,
  });
}

function validateSelection(value: unknown): value is CharacterSlotSelectionV2 {
  return isRecord(value)
    && isString(value.entryId)
    && isString(value.entryVersion)
    && isString(value.providerId)
    && isString(value.catalogRevision);
}

export function isCharacterPartPresetV1(value: unknown): value is CharacterPartPresetV1 {
  if (!isRecord(value) || value.schemaVersion !== CHARACTER_PART_PRESET_VERSION) return false;
  if (!isString(value.presetId, 128) || !Number.isSafeInteger(value.version) || Number(value.version) < 1) return false;
  if (!["slot", "palette", "outfit", "expression", "partial-pose", "full-pose", "hand-grip", "character-variant", "camera-shot"].includes(String(value.kind))) return false;
  if (!isString(value.name, 60) || typeof value.description !== "string" || value.description.length > 240) return false;
  if (!isRecord(value.sourceModel) || !isString(value.sourceModel.assetId) || !isString(value.sourceModel.assetVersion)) return false;
  if (value.sourceModel.topologyFamily !== null && !isString(value.sourceModel.topologyFamily)) return false;
  if (!isRecord(value.payload)) return false;
  if (value.payload.selections !== undefined && (!Array.isArray(value.payload.selections) || !value.payload.selections.every(validateSelection))) return false;
  if (value.payload.controls !== undefined && (!isRecord(value.payload.controls) || !Object.values(value.payload.controls).every(isFiniteNumber))) return false;
  if (value.payload.colors !== undefined && (!isRecord(value.payload.colors) || !Object.values(value.payload.colors).every((item) => item === null || typeof item === "string"))) return false;
  if (!isRecord(value.compatibility) || !Array.isArray(value.compatibility.topologyFamilies) || !Array.isArray(value.compatibility.requiredCapabilities)) return false;
  if (typeof value.compatibility.allowPartial !== "boolean") return false;
  if (!Array.isArray(value.tags) || value.tags.length > 32 || !value.tags.every((item) => isString(item, 40))) return false;
  if (!["personal", "project", "team"].includes(String(value.scope))) return false;
  return isString(value.createdAt) && isString(value.updatedAt);
}

export function parseCharacterPartPresetV1(value: unknown): CharacterPartPresetV1 {
  if (!isCharacterPartPresetV1(value)) {
    throw new CharacterPartPresetError("CHARACTER_PRESET_INVALID", "캐릭터 프리셋 형식이 올바르지 않습니다.");
  }
  return value;
}

function compatibleWithDocument(preset: CharacterPartPresetV1, document: CharacterDocumentV2): boolean {
  const families = preset.compatibility.topologyFamilies;
  if (families.length === 0) return true;
  return Boolean(document.model.topologyFamily && families.includes(document.model.topologyFamily));
}

export function applyCharacterPartPreset(
  document: CharacterDocumentV2,
  presetInput: CharacterPartPresetV1,
): ApplyCharacterPartPresetResult {
  const preset = parseCharacterPartPresetV1(presetInput);
  const skipped: { path: string; reason: string }[] = [];
  if (!compatibleWithDocument(preset, document) && !preset.compatibility.allowPartial) {
    return Object.freeze({
      ok: false,
      document,
      applied: Object.freeze([]),
      skipped: Object.freeze([{ path: "model.topologyFamily", reason: "대상 캐릭터 계열과 호환되지 않습니다." }]),
    });
  }

  const applied: string[] = [];
  let recipe = document.recipe;
  const slot = preset.payload.slot;
  const selections = preset.payload.selections ?? [];
  if (slot) {
    if (slot === "accessory") {
      recipe = { ...recipe, accessories: selections.map(cloneSelection) };
      applied.push("recipe.accessories");
    } else if (slot === "hand-pose") {
      const first = selections[0];
      if (first) {
        recipe = { ...recipe, handPose: { left: cloneSelection(first), right: cloneSelection(first) } };
        applied.push("recipe.handPose");
      } else {
        skipped.push({ path: "recipe.handPose", reason: "저장된 손 포즈가 없습니다." });
      }
    } else {
      const first = selections[0];
      if (first) {
        recipe = { ...recipe, slots: { ...recipe.slots, [slot]: cloneSelection(first) } };
        applied.push(`recipe.slots.${slot}`);
      } else {
        skipped.push({ path: `recipe.slots.${slot}`, reason: "저장된 파츠 선택이 없습니다." });
      }
    }
  }

  const customControls = { ...document.customControls };
  for (const [key, value] of Object.entries(preset.payload.controls ?? {})) {
    if (!Number.isFinite(value)) {
      skipped.push({ path: `customControls.${key}`, reason: "유효하지 않은 수치입니다." });
      continue;
    }
    customControls[key] = value;
    applied.push(`customControls.${key}`);
  }

  const colors = { ...document.colors } as Record<string, string | null>;
  for (const [key, value] of Object.entries(preset.payload.colors ?? {})) {
    if (!(key in colors)) {
      skipped.push({ path: `colors.${key}`, reason: "대상 문서에 없는 색상 채널입니다." });
      continue;
    }
    colors[key] = value;
    applied.push(`colors.${key}`);
  }

  const next: CharacterDocumentV2 = Object.freeze({
    ...document,
    recipe: Object.freeze(recipe),
    customControls: Object.freeze(customControls),
    colors: Object.freeze(colors) as unknown as CharacterDocumentV2["colors"],
    expression: preset.payload.expression ?? document.expression,
    pose: preset.payload.pose ?? document.pose,
    camera: preset.payload.cameraShotId !== undefined
      ? { ...document.camera, activeShotId: preset.payload.cameraShotId }
      : document.camera,
    revision: document.revision + 1,
    updatedAt: new Date().toISOString(),
  });

  return Object.freeze({
    ok: applied.length > 0,
    document: next,
    applied: Object.freeze([...new Set(applied)].sort()),
    skipped: Object.freeze(skipped),
  });
}
