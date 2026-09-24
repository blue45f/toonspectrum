import {
  createEmptyCharacterGroomDocument,
  validateCharacterGroomDocument,
  type CharacterGroomDocument,
} from "../groom/character-groom-document";
import {
  validateCharacterLinkedLayer,
  type CharacterLinkedLayerDocument,
} from "../linked-layer/character-linked-layer";
import {
  createEmptyCharacterSurfaceInkDocument,
  validateCharacterSurfaceInkDocument,
  type CharacterSurfaceInkDocument,
} from "../surface-ink/character-surface-ink";
import {
  createEmptyCharacterGeometryStrokeDocument,
  validateCharacterGeometryStrokeDocument,
  type CharacterGeometryStrokeDocument,
} from "../surface-ink/character-geometry-stroke";
import {
  validateCharacterPoseDocumentV3,
  type CharacterPoseDocumentV3,
} from "../pose-v3/character-pose-v3";

import type {
  CharacterCameraShotV2,
  CharacterCompatibilitySnapshotV2,
  CharacterDocumentV2,
  CharacterExpressionStateV2,
  CharacterModelReferenceV2,
  CharacterRecipeV2,
  QuaternionTuple,
  Vector3Tuple,
} from "./character-document-v2";

export const CHARACTER_DOCUMENT_SCHEMA_VERSION_V3 = 3 as const;

export type CharacterDeformationLayerV3 =
  | {
      readonly kind: "semantic-morph";
      readonly layerId: string;
      readonly name: string;
      readonly enabled: boolean;
      readonly values: Readonly<Record<string, number>>;
    }
  | {
      readonly kind: "proportion";
      readonly layerId: string;
      readonly name: string;
      readonly enabled: boolean;
      readonly measurements: Readonly<Record<string, number>>;
    }
  | {
      readonly kind: "control-cage";
      readonly layerId: string;
      readonly name: string;
      readonly enabled: boolean;
      readonly symmetric: boolean;
      readonly falloff: number;
      readonly controlPoints: Readonly<Record<string, Vector3Tuple>>;
    }
  | {
      readonly kind: "corrective";
      readonly layerId: string;
      readonly name: string;
      readonly enabled: boolean;
      readonly weights: Readonly<Record<string, number>>;
    }
  | {
      readonly kind: "sculpt-delta";
      readonly layerId: string;
      readonly name: string;
      readonly enabled: boolean;
      readonly topologyRevision: string;
      readonly resourceHash: string;
    };

export interface CharacterTopologyBindingV3 {
  readonly family: string;
  readonly revision: string;
  readonly rigRevision: string;
  readonly morphRevision: string;
  readonly rendererRevision: string;
  readonly stableSurfaceIds: readonly string[];
}

export interface CharacterMaterialOverrideV3 {
  readonly materialId: string;
  readonly baseColor?: string;
  readonly shadowColor?: string;
  readonly outlineColor?: string;
  readonly outlineWidth?: number;
  readonly opacity?: number;
}

export interface CharacterSurfacePaintLayerV3 {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay";
  readonly semanticPart: string | null;
  readonly atlasResourceHash: string | null;
}

export interface CharacterSemanticOutputRecipeV3 {
  readonly recipeId: string;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly transparent: boolean;
  readonly colorSpace: "srgb";
  readonly passes: readonly (
    | "beauty"
    | "base-color"
    | "cel-shadow"
    | "highlight"
    | "outer-outline"
    | "inner-line"
    | "hair-base"
    | "hair-shadow"
    | "hair-line"
    | "surface-paint"
    | "surface-ink"
    | "part-id"
    | "material-id"
    | "depth"
    | "normal"
    | "ambient-occlusion"
  )[];
}

export interface CharacterDocumentV3 {
  readonly schemaVersion: typeof CHARACTER_DOCUMENT_SCHEMA_VERSION_V3;
  readonly documentId: string;
  readonly model: CharacterModelReferenceV2;
  readonly compatibility: CharacterCompatibilitySnapshotV2;
  readonly topology: CharacterTopologyBindingV3;
  readonly recipe: CharacterRecipeV2;
  readonly deformation: {
    readonly layers: readonly CharacterDeformationLayerV3[];
  };
  readonly groom: CharacterGroomDocument;
  readonly look: {
    readonly colors: Readonly<Record<string, string | null>>;
    readonly materialOverrides: readonly CharacterMaterialOverrideV3[];
  };
  readonly expression: CharacterExpressionStateV2;
  readonly pose: CharacterPoseDocumentV3;
  readonly surfacePaint: {
    readonly layers: readonly CharacterSurfacePaintLayerV3[];
  };
  readonly surfaceInk: CharacterSurfaceInkDocument;
  readonly geometryStrokes: CharacterGeometryStrokeDocument;
  readonly linkedLayers: readonly CharacterLinkedLayerDocument[];
  readonly camera: {
    readonly activeShotId: string | null;
    readonly shots: Readonly<Record<string, CharacterCameraShotV2>>;
  };
  readonly output: CharacterSemanticOutputRecipeV3;
  readonly runtimeRequirements: {
    readonly browserRequired: true;
    readonly nativeRequired: false;
    readonly capabilities: readonly string[];
  };
  readonly sourceReceipts: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class CharacterDocumentV3Error extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterDocumentV3Error";
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu;
const HASH = /^(?:sha256:)?[a-f0-9]{8,128}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertId(value: string, field: string): void {
  if (!ID.test(value)) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_ID_INVALID", `${field} 형식이 올바르지 않습니다.`);
  }
}

function finiteRecord(value: Readonly<Record<string, number>>, field: string): void {
  for (const [key, item] of Object.entries(value)) {
    assertId(key, field);
    if (!Number.isFinite(item)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_NUMBER_INVALID", `${field}.${key} 값이 올바르지 않습니다.`);
    }
  }
}

function validateDeformationLayer(layer: CharacterDeformationLayerV3): CharacterDeformationLayerV3 {
  assertId(layer.layerId, "deformation.layerId");
  if (layer.name.trim().length === 0 || layer.name.length > 160) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_DEFORMATION_INVALID", "변형 레이어 이름이 올바르지 않습니다.");
  }
  if (layer.kind === "semantic-morph") {
    finiteRecord(layer.values, "deformation.morph");
    return Object.freeze({ ...layer, values: Object.freeze({ ...layer.values }) });
  }
  if (layer.kind === "proportion") {
    finiteRecord(layer.measurements, "deformation.measurement");
    return Object.freeze({ ...layer, measurements: Object.freeze({ ...layer.measurements }) });
  }
  if (layer.kind === "control-cage") {
    if (!Number.isFinite(layer.falloff) || layer.falloff < 0 || layer.falloff > 1) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_DEFORMATION_INVALID", "Control cage falloff은 0~1이어야 합니다.");
    }
    const points: Record<string, Vector3Tuple> = {};
    for (const [id, point] of Object.entries(layer.controlPoints)) {
      assertId(id, "deformation.controlPoint");
      if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
        throw new CharacterDocumentV3Error("CHARACTER_V3_DEFORMATION_INVALID", `Control point ${id}가 올바르지 않습니다.`);
      }
      points[id] = Object.freeze([...point] as [number, number, number]);
    }
    return Object.freeze({ ...layer, controlPoints: Object.freeze(points) });
  }
  if (layer.kind === "corrective") {
    finiteRecord(layer.weights, "deformation.corrective");
    return Object.freeze({ ...layer, weights: Object.freeze({ ...layer.weights }) });
  }
  assertId(layer.topologyRevision, "deformation.topologyRevision");
  if (!HASH.test(layer.resourceHash)) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_DEFORMATION_INVALID", "Sculpt delta resource hash가 올바르지 않습니다.");
  }
  return Object.freeze({ ...layer });
}

function validateLook(input: CharacterDocumentV3["look"]): CharacterDocumentV3["look"] {
  const colors: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(input.colors)) {
    assertId(key, "look.color");
    if (value !== null && !HEX.test(value)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_COLOR_INVALID", `${key} 색상 형식이 올바르지 않습니다.`);
    }
    colors[key] = value;
  }
  const ids = new Set<string>();
  const overrides = input.materialOverrides.map((override) => {
    assertId(override.materialId, "materialId");
    if (ids.has(override.materialId)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_DUPLICATE_MATERIAL", `중복 material override가 있습니다: ${override.materialId}`);
    }
    ids.add(override.materialId);
    for (const color of [override.baseColor, override.shadowColor, override.outlineColor]) {
      if (color !== undefined && !HEX.test(color)) {
        throw new CharacterDocumentV3Error("CHARACTER_V3_COLOR_INVALID", "Material override 색상 형식이 올바르지 않습니다.");
      }
    }
    if (override.outlineWidth !== undefined && (!Number.isFinite(override.outlineWidth) || override.outlineWidth < 0 || override.outlineWidth > 64)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_MATERIAL_INVALID", "Outline width 범위가 올바르지 않습니다.");
    }
    if (override.opacity !== undefined && (!Number.isFinite(override.opacity) || override.opacity < 0 || override.opacity > 1)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_MATERIAL_INVALID", "Material opacity는 0~1이어야 합니다.");
    }
    return Object.freeze({ ...override });
  });
  return Object.freeze({ colors: Object.freeze(colors), materialOverrides: Object.freeze(overrides) });
}

function validateSurfacePaint(
  input: CharacterDocumentV3["surfacePaint"],
): CharacterDocumentV3["surfacePaint"] {
  const ids = new Set<string>();
  const layers = input.layers.map((layer) => {
    assertId(layer.id, "surfacePaint.layerId");
    if (ids.has(layer.id)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_DUPLICATE_LAYER", `중복 surface paint layer가 있습니다: ${layer.id}`);
    }
    ids.add(layer.id);
    if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_SURFACE_PAINT_INVALID", "Surface paint opacity는 0~1이어야 합니다.");
    }
    if (layer.atlasResourceHash !== null && !HASH.test(layer.atlasResourceHash)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_SURFACE_PAINT_INVALID", "Surface paint atlas hash가 올바르지 않습니다.");
    }
    return Object.freeze({ ...layer });
  });
  return Object.freeze({ layers: Object.freeze(layers) });
}

function validateOutput(output: CharacterSemanticOutputRecipeV3): CharacterSemanticOutputRecipeV3 {
  assertId(output.recipeId, "output.recipeId");
  if (!Number.isSafeInteger(output.width) || !Number.isSafeInteger(output.height)
    || output.width < 1 || output.height < 1 || output.width > 16_384 || output.height > 16_384
    || !Number.isFinite(output.pixelRatio) || output.pixelRatio <= 0 || output.pixelRatio > 8) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_OUTPUT_INVALID", "출력 크기 또는 pixel ratio가 올바르지 않습니다.");
  }
  if (new Set(output.passes).size !== output.passes.length) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_OUTPUT_INVALID", "출력 pass에 중복 항목이 있습니다.");
  }
  return Object.freeze({ ...output, passes: Object.freeze([...output.passes]) });
}

export function validateCharacterDocumentV3(
  input: CharacterDocumentV3,
): CharacterDocumentV3 {
  if (input.schemaVersion !== CHARACTER_DOCUMENT_SCHEMA_VERSION_V3) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_VERSION_UNSUPPORTED", "지원하지 않는 CharacterDocument 버전입니다.");
  }
  assertId(input.documentId, "documentId");
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_REVISION_INVALID", "문서 revision이 올바르지 않습니다.");
  }
  for (const value of [input.topology.family, input.topology.revision, input.topology.rigRevision, input.topology.morphRevision, input.topology.rendererRevision]) {
    assertId(value, "topology");
  }
  if (new Set(input.topology.stableSurfaceIds).size !== input.topology.stableSurfaceIds.length) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_TOPOLOGY_INVALID", "Stable surface ID가 중복되었습니다.");
  }
  input.topology.stableSurfaceIds.forEach((id) => assertId(id, "stableSurfaceId"));
  const deformationIds = new Set<string>();
  const deformationLayers = input.deformation.layers.map((layer) => {
    const validated = validateDeformationLayer(layer);
    if (deformationIds.has(validated.layerId)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_DUPLICATE_LAYER", `중복 deformation layer가 있습니다: ${validated.layerId}`);
    }
    deformationIds.add(validated.layerId);
    return validated;
  });
  const groom = validateCharacterGroomDocument(input.groom);
  if (groom.topologyRevision !== input.topology.revision) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_GROOM_TOPOLOGY_MISMATCH", "Groom과 캐릭터 topology revision이 다릅니다.");
  }
  const linkedIds = new Set<string>();
  const linkedLayers = input.linkedLayers.map((layer) => {
    const validated = validateCharacterLinkedLayer(layer);
    if (validated.characterDocumentId !== input.documentId) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_LINKED_LAYER_MISMATCH", "Linked Layer 대상 문서가 다릅니다.");
    }
    if (linkedIds.has(validated.linkedLayerId)) {
      throw new CharacterDocumentV3Error("CHARACTER_V3_DUPLICATE_LAYER", `중복 Linked Layer가 있습니다: ${validated.linkedLayerId}`);
    }
    linkedIds.add(validated.linkedLayerId);
    return validated;
  });
  if (input.runtimeRequirements.browserRequired !== true || input.runtimeRequirements.nativeRequired !== false) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_RUNTIME_POLICY_INVALID", "CharacterDocument V3는 브라우저 실행을 필수로 하고 native 실행을 요구하지 않아야 합니다.");
  }
  return Object.freeze({
    ...input,
    topology: Object.freeze({
      ...input.topology,
      stableSurfaceIds: Object.freeze([...input.topology.stableSurfaceIds]),
    }),
    deformation: Object.freeze({ layers: Object.freeze(deformationLayers) }),
    groom,
    look: validateLook(input.look),
    expression: Object.freeze({
      ...input.expression,
      weights: Object.freeze({ ...input.expression.weights }),
    }),
    pose: validateCharacterPoseDocumentV3(input.pose),
    surfacePaint: validateSurfacePaint(input.surfacePaint),
    surfaceInk: validateCharacterSurfaceInkDocument(input.surfaceInk),
    geometryStrokes: validateCharacterGeometryStrokeDocument(input.geometryStrokes),
    linkedLayers: Object.freeze(linkedLayers),
    camera: Object.freeze({
      activeShotId: input.camera.activeShotId,
      shots: Object.freeze({ ...input.camera.shots }),
    }),
    output: validateOutput(input.output),
    runtimeRequirements: Object.freeze({
      browserRequired: true as const,
      nativeRequired: false as const,
      capabilities: Object.freeze([...new Set(input.runtimeRequirements.capabilities)]),
    }),
    sourceReceipts: Object.freeze(input.sourceReceipts.map((receipt) => Object.freeze({ ...receipt }))),
  });
}

function poseFromV2(document: CharacterDocumentV2): CharacterPoseDocumentV3 {
  const pose = document.pose;
  const source = pose.source ?? "manual";
  return validateCharacterPoseDocumentV3({
    schemaVersion: 3,
    poseId: pose.activeEntryId ?? `pose:${document.documentId}`,
    generationId: document.revision,
    source,
    root: pose.root,
    bones: pose.bones,
    confidence: {
      overall: Object.keys(pose.bones).length > 0 ? 1 : 0,
      regions: {},
      joints: Object.fromEntries(Object.keys(pose.bones).map((bone) => [bone, 1])),
    },
    effectors: [],
    contacts: [],
    fixedControllers: [],
    regionWeights: {},
    stylization: {
      exaggeration: 0,
      silhouetteWeight: 0,
      preserveFootPlant: true,
      dramaticImbalance: false,
    },
    sourceWarnings: [],
    solveReceipt: null,
  });
}

function semanticMorphLayer(document: CharacterDocumentV2): CharacterDeformationLayerV3 | null {
  const values = Object.fromEntries(
    Object.entries(document.customControls)
      .filter(([key, value]) => key.startsWith("morph.") && Number.isFinite(value))
      .map(([key, value]) => [key.slice("morph.".length), value]),
  );
  if (Object.keys(values).length === 0) return null;
  return {
    kind: "semantic-morph",
    layerId: "deform:semantic-morphs",
    name: "의미 기반 얼굴 변형",
    enabled: true,
    values,
  };
}

function controlCageLayer(document: CharacterDocumentV2): CharacterDeformationLayerV3 | null {
  const controls = Object.fromEntries(
    Object.entries(document.customControls)
      .filter(([key, value]) => key.startsWith("face.") && Number.isFinite(value))
      .map(([key, value]) => [key.slice("face.".length), [value, 0, 0] as const]),
  );
  if (Object.keys(controls).length === 0) return null;
  return {
    kind: "control-cage",
    layerId: "deform:face-controls",
    name: "얼굴 제어점",
    enabled: true,
    symmetric: true,
    falloff: 0.5,
    controlPoints: controls,
  };
}

export function migrateCharacterDocumentV2ToV3(
  document: CharacterDocumentV2,
): CharacterDocumentV3 {
  const topologyRevision = document.model.topologyRevision
    ?? `topology:${document.model.assetId}:${document.model.assetVersion}`;
  const deformationLayers = [semanticMorphLayer(document), controlCageLayer(document)]
    .filter((layer): layer is CharacterDeformationLayerV3 => layer !== null);
  return validateCharacterDocumentV3({
    schemaVersion: CHARACTER_DOCUMENT_SCHEMA_VERSION_V3,
    documentId: document.documentId,
    model: document.model,
    compatibility: document.compatibility,
    topology: {
      family: document.model.topologyFamily ?? "compatible-vrm",
      revision: topologyRevision,
      rigRevision: document.model.rigRevision ?? "rig:compatible-vrm",
      morphRevision: document.model.morphRevision ?? "morph:compatible-vrm",
      rendererRevision: document.model.rendererRevision ?? "renderer:three-vrm",
      stableSurfaceIds: [],
    },
    recipe: document.recipe,
    deformation: { layers: deformationLayers },
    groom: createEmptyCharacterGroomDocument(topologyRevision),
    look: {
      colors: { ...document.colors },
      materialOverrides: [],
    },
    expression: document.expression,
    pose: poseFromV2(document),
    surfacePaint: {
      layers: document.surfacePaint.layers.map((layer) => ({
        ...layer,
        blendMode: "normal" as const,
        semanticPart: null,
        atlasResourceHash: null,
      })),
    },
    surfaceInk: createEmptyCharacterSurfaceInkDocument(),
    geometryStrokes: createEmptyCharacterGeometryStrokeDocument(),
    linkedLayers: [],
    camera: document.camera,
    output: {
      recipeId: "output:webtoon-character",
      width: 2048,
      height: 2048,
      pixelRatio: 1,
      transparent: document.render.transparentBackground,
      colorSpace: "srgb",
      passes: [
        "beauty",
        "base-color",
        "cel-shadow",
        "highlight",
        "outer-outline",
        "inner-line",
        "surface-paint",
        "surface-ink",
      ],
    },
    runtimeRequirements: {
      browserRequired: true,
      nativeRequired: false,
      capabilities: [
        "interactive-renderer",
        "character-deformation",
        "groom",
        "pose-inference",
        "semantic-output",
        "persistent-storage",
      ],
    },
    sourceReceipts: [
      ...document.sourceReceipts,
      {
        kind: "character-document-migration",
        fromVersion: 2,
        toVersion: 3,
        sourceRevision: document.revision,
      },
    ],
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  });
}

export function isCharacterDocumentV3(value: unknown): value is CharacterDocumentV3 {
  if (!isRecord(value) || value.schemaVersion !== CHARACTER_DOCUMENT_SCHEMA_VERSION_V3) return false;
  try {
    validateCharacterDocumentV3(value as unknown as CharacterDocumentV3);
    return true;
  } catch {
    return false;
  }
}

export function parseCharacterDocumentV3(value: unknown): CharacterDocumentV3 {
  if (!isRecord(value)) {
    throw new CharacterDocumentV3Error("CHARACTER_V3_INVALID", "CharacterDocument V3 형식이 올바르지 않습니다.");
  }
  return validateCharacterDocumentV3(value as unknown as CharacterDocumentV3);
}

export function serializeCharacterDocumentV3(document: CharacterDocumentV3): string {
  return JSON.stringify(validateCharacterDocumentV3(document));
}

export function characterDocumentV3PoseTransform(document: CharacterDocumentV3): {
  readonly rootPosition: Vector3Tuple;
  readonly rootRotation: QuaternionTuple;
} {
  return Object.freeze({
    rootPosition: document.pose.root.position,
    rootRotation: document.pose.root.rotation,
  });
}
