import type {
  CharacterHandSide,
  CharacterRecipe,
  CharacterSlotKind,
} from "../../character-shaper/character-shaper-contract";

export const CHARACTER_DOCUMENT_SCHEMA_VERSION = 2 as const;
export const CHARACTER_RECIPE_SCHEMA_VERSION = 2 as const;
export const CHARACTER_SLOT_ENTRY_VERSION_FALLBACK = "1" as const;
export const CHARACTER_SLOT_CATALOG_REVISION_FALLBACK = "character-slot-catalog-v1" as const;

export const CHARACTER_RECIPE_SLOT_KINDS_V2 = [
  "face-shape",
  "eyes",
  "irises",
  "nose",
  "mouth",
  "ears",
  "hair",
  "body",
  "top",
  "bottom",
  "shoes",
  "expression",
  "pose",
] as const satisfies readonly CharacterSlotKind[];

export type CharacterRecipeSlotKindV2 = (typeof CHARACTER_RECIPE_SLOT_KINDS_V2)[number];
export type CharacterCompatibilityGrade = "canonical" | "A" | "B" | "C" | "viewer";
export type CharacterModelMode = "canonical" | "compatible";
export type QuaternionTuple = readonly [number, number, number, number];
export type Vector3Tuple = readonly [number, number, number];

export interface CharacterModelReferenceV2 {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly contentSha256: string | null;
  readonly mode: CharacterModelMode;
  readonly topologyFamily?: string;
  readonly topologyRevision?: string;
  readonly rigRevision?: string;
  readonly morphRevision?: string;
  readonly rendererRevision?: string;
}

export interface CharacterCompatibilitySnapshotV2 {
  readonly grade: CharacterCompatibilityGrade;
  readonly supported: readonly string[];
  readonly partial: readonly string[];
  readonly unsupported: readonly string[];
  readonly sourceRevision: string;
}

export interface CharacterSlotSelectionV2 {
  readonly entryId: string;
  readonly entryVersion: string;
  readonly providerId: string;
  readonly catalogRevision: string;
  readonly overrides?: Readonly<Record<string, string | number | boolean>>;
}

export interface CharacterRecipeV2 {
  readonly version: typeof CHARACTER_RECIPE_SCHEMA_VERSION;
  readonly slots: Readonly<Partial<Record<CharacterRecipeSlotKindV2, CharacterSlotSelectionV2>>>;
  readonly accessories: readonly CharacterSlotSelectionV2[];
  readonly handPose: Readonly<Partial<Record<Exclude<CharacterHandSide, "both">, CharacterSlotSelectionV2>>>;
}

export interface CharacterExpressionStateV2 {
  readonly activeEntryId: string | null;
  readonly weights: Readonly<Record<string, number>>;
}

export interface CharacterPoseStateV2 {
  readonly activeEntryId: string | null;
  readonly root: {
    readonly position: Vector3Tuple;
    readonly rotation: QuaternionTuple;
  };
  readonly bones: Readonly<Record<string, QuaternionTuple>>;
  readonly fingers: Readonly<Record<string, QuaternionTuple>>;
  readonly source: "preset" | "manual" | "photo" | "webcam" | null;
}

export interface CharacterSurfaceLayerV2 {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
}

export interface CharacterCameraShotV2 {
  readonly id: string;
  readonly name: string;
  readonly position: Vector3Tuple;
  readonly target: Vector3Tuple;
  readonly projection: "perspective" | "orthographic";
  readonly focalLengthMm?: number;
  readonly orthoScale?: number;
}

export interface CharacterDocumentV2 {
  readonly schemaVersion: typeof CHARACTER_DOCUMENT_SCHEMA_VERSION;
  readonly documentId: string;
  readonly model: CharacterModelReferenceV2;
  readonly compatibility: CharacterCompatibilitySnapshotV2;
  readonly recipe: CharacterRecipeV2;
  readonly customControls: Readonly<Record<string, number>>;
  readonly colors: CharacterRecipe["colors"];
  readonly expression: CharacterExpressionStateV2;
  readonly pose: CharacterPoseStateV2;
  readonly surfacePaint: { readonly layers: readonly CharacterSurfaceLayerV2[] };
  readonly surfaceInk: { readonly layers: readonly CharacterSurfaceLayerV2[] };
  readonly camera: {
    readonly activeShotId: string | null;
    readonly shots: Readonly<Record<string, CharacterCameraShotV2>>;
  };
  readonly render: {
    readonly transparentBackground: boolean;
    readonly backgroundColor: string;
  };
  readonly sourceReceipts: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectCharacterRecipeV1Options {
  readonly providerId?: string;
  readonly entryVersion?: string;
  readonly catalogRevision?: string;
}

export interface CreateCharacterDocumentV2Input {
  readonly documentId: string;
  readonly model: CharacterModelReferenceV2;
  readonly compatibility: CharacterCompatibilitySnapshotV2;
  readonly recipe: CharacterRecipeV2;
  readonly colors: CharacterRecipe["colors"];
  readonly customControls?: Readonly<Record<string, number>>;
  readonly expression?: Partial<CharacterExpressionStateV2>;
  readonly pose?: Partial<CharacterPoseStateV2>;
  readonly transparentBackground?: boolean;
  readonly backgroundColor?: string;
  readonly revision?: number;
  readonly now?: string;
}

export class CharacterDocumentValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterDocumentValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isQuaternion(value: unknown): value is QuaternionTuple {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

function isVector3(value: unknown): value is Vector3Tuple {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isSelection(value: unknown): value is CharacterSlotSelectionV2 {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyString(value.entryId)
    || !isNonEmptyString(value.entryVersion)
    || !isNonEmptyString(value.providerId)
    || !isNonEmptyString(value.catalogRevision)
  ) return false;
  if (value.overrides === undefined) return true;
  if (!isRecord(value.overrides)) return false;
  return Object.values(value.overrides).every((item) =>
    typeof item === "string" || typeof item === "boolean" || isFiniteNumber(item)
  );
}

function selectionFor(entryId: string, options: Required<ProjectCharacterRecipeV1Options>): CharacterSlotSelectionV2 {
  return Object.freeze({
    entryId,
    entryVersion: options.entryVersion,
    providerId: options.providerId,
    catalogRevision: options.catalogRevision,
  });
}

export function projectCharacterRecipeV1(
  recipe: CharacterRecipe,
  options: ProjectCharacterRecipeV1Options = {},
): CharacterRecipeV2 {
  const resolved: Required<ProjectCharacterRecipeV1Options> = {
    providerId: options.providerId ?? "toonstudio-builtin",
    entryVersion: options.entryVersion ?? CHARACTER_SLOT_ENTRY_VERSION_FALLBACK,
    catalogRevision: options.catalogRevision ?? CHARACTER_SLOT_CATALOG_REVISION_FALLBACK,
  };
  const slots: Partial<Record<CharacterRecipeSlotKindV2, CharacterSlotSelectionV2>> = {};
  for (const slot of CHARACTER_RECIPE_SLOT_KINDS_V2) {
    const entryId = recipe.slots[slot];
    if (typeof entryId === "string" && entryId.length > 0) slots[slot] = selectionFor(entryId, resolved);
  }
  const accessories = recipe.slots.accessory.map((entryId) => selectionFor(entryId, resolved));
  const handPoseEntryId = recipe.slots["hand-pose"];
  const handPose: Partial<Record<"left" | "right", CharacterSlotSelectionV2>> = {};
  if (typeof handPoseEntryId === "string" && handPoseEntryId.length > 0) {
    const selection = selectionFor(handPoseEntryId, resolved);
    if (recipe.handSide === "left" || recipe.handSide === "both") handPose.left = selection;
    if (recipe.handSide === "right" || recipe.handSide === "both") handPose.right = selection;
  }
  return Object.freeze({
    version: CHARACTER_RECIPE_SCHEMA_VERSION,
    slots: Object.freeze(slots),
    accessories: Object.freeze(accessories),
    handPose: Object.freeze(handPose),
  });
}

export function createCharacterDocumentV2(input: CreateCharacterDocumentV2Input): CharacterDocumentV2 {
  const now = input.now ?? new Date().toISOString();
  const revision = input.revision ?? 0;
  const document: CharacterDocumentV2 = {
    schemaVersion: CHARACTER_DOCUMENT_SCHEMA_VERSION,
    documentId: input.documentId,
    model: { ...input.model },
    compatibility: {
      ...input.compatibility,
      supported: [...input.compatibility.supported],
      partial: [...input.compatibility.partial],
      unsupported: [...input.compatibility.unsupported],
    },
    recipe: input.recipe,
    customControls: { ...(input.customControls ?? {}) },
    colors: { ...input.colors },
    expression: {
      activeEntryId: input.expression?.activeEntryId ?? null,
      weights: { ...(input.expression?.weights ?? {}) },
    },
    pose: {
      activeEntryId: input.pose?.activeEntryId ?? null,
      root: input.pose?.root ?? { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      bones: { ...(input.pose?.bones ?? {}) },
      fingers: { ...(input.pose?.fingers ?? {}) },
      source: input.pose?.source ?? null,
    },
    surfacePaint: { layers: [] },
    surfaceInk: { layers: [] },
    camera: { activeShotId: null, shots: {} },
    render: {
      transparentBackground: input.transparentBackground ?? true,
      backgroundColor: input.backgroundColor ?? "#ffffff",
    },
    sourceReceipts: [],
    revision,
    createdAt: now,
    updatedAt: now,
  };
  return parseCharacterDocumentV2(document);
}

export function isCharacterDocumentV2(value: unknown): value is CharacterDocumentV2 {
  if (!isRecord(value) || value.schemaVersion !== CHARACTER_DOCUMENT_SCHEMA_VERSION) return false;
  if (!isNonEmptyString(value.documentId)) return false;
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0) return false;
  if (!isNonEmptyString(value.createdAt) || !isNonEmptyString(value.updatedAt)) return false;

  const model = value.model;
  if (!isRecord(model)) return false;
  if (!isNonEmptyString(model.assetId) || !isNonEmptyString(model.assetVersion)) return false;
  if (model.contentSha256 !== null && !isNonEmptyString(model.contentSha256)) return false;
  if (model.mode !== "canonical" && model.mode !== "compatible") return false;

  const compatibility = value.compatibility;
  if (!isRecord(compatibility)) return false;
  if (!["canonical", "A", "B", "C", "viewer"].includes(String(compatibility.grade))) return false;
  if (!Array.isArray(compatibility.supported) || !compatibility.supported.every(isNonEmptyString)) return false;
  if (!Array.isArray(compatibility.partial) || !compatibility.partial.every(isNonEmptyString)) return false;
  if (!Array.isArray(compatibility.unsupported) || !compatibility.unsupported.every(isNonEmptyString)) return false;
  if (!isNonEmptyString(compatibility.sourceRevision)) return false;

  const recipe = value.recipe;
  if (!isRecord(recipe) || recipe.version !== CHARACTER_RECIPE_SCHEMA_VERSION) return false;
  if (!isRecord(recipe.slots) || !Object.values(recipe.slots).every(isSelection)) return false;
  if (!Array.isArray(recipe.accessories) || !recipe.accessories.every(isSelection)) return false;
  if (!isRecord(recipe.handPose) || !Object.values(recipe.handPose).every(isSelection)) return false;

  if (!isRecord(value.customControls) || !Object.values(value.customControls).every(isFiniteNumber)) return false;
  if (!isRecord(value.colors)) return false;

  const expression = value.expression;
  if (!isRecord(expression) || (expression.activeEntryId !== null && typeof expression.activeEntryId !== "string")) return false;
  if (!isRecord(expression.weights) || !Object.values(expression.weights).every(isFiniteNumber)) return false;

  const pose = value.pose;
  if (!isRecord(pose) || (pose.activeEntryId !== null && typeof pose.activeEntryId !== "string")) return false;
  if (!isRecord(pose.root) || !isVector3(pose.root.position) || !isQuaternion(pose.root.rotation)) return false;
  if (!isRecord(pose.bones) || !Object.values(pose.bones).every(isQuaternion)) return false;
  if (!isRecord(pose.fingers) || !Object.values(pose.fingers).every(isQuaternion)) return false;
  if (![null, "preset", "manual", "photo", "webcam"].includes(pose.source as null | string)) return false;

  if (!isRecord(value.surfacePaint) || !Array.isArray(value.surfacePaint.layers)) return false;
  if (!isRecord(value.surfaceInk) || !Array.isArray(value.surfaceInk.layers)) return false;
  if (!isRecord(value.camera) || !isRecord(value.camera.shots)) return false;
  if (!isRecord(value.render) || typeof value.render.transparentBackground !== "boolean") return false;
  if (!isNonEmptyString(value.render.backgroundColor)) return false;
  return Array.isArray(value.sourceReceipts);
}

export function parseCharacterDocumentV2(value: unknown): CharacterDocumentV2 {
  if (!isCharacterDocumentV2(value)) {
    throw new CharacterDocumentValidationError(
      "CHARACTER_DOCUMENT_INVALID",
      "캐릭터 문서 형식이 올바르지 않습니다.",
    );
  }
  return value;
}
