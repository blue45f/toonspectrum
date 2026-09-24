import {
  assertStudioScene3dDocument,
  type StudioScene3dDocumentV1,
  type StudioScene3dEntity,
} from "../scene3d/studio-scene3d-document";
import {
  validateCharacterDocumentV3,
  type CharacterDocumentV3,
} from "../character-platform/document/character-document-v3";

export const STUDIO_WEB_AUTHORING_PROJECT_VERSION = 3 as const;

export type StudioWebGeometryAuthority =
  | "editable-mesh"
  | "brep-feature-graph"
  | "procedural-graph"
  | "sculpt-volume"
  | "rigged-character"
  | "garment-pattern"
  | "external-reference";

export interface StudioWebAuthoringResourceDescriptor {
  readonly resourceId: string;
  readonly authority: StudioWebGeometryAuthority;
  readonly revision: string;
  readonly contentHash: string;
  readonly mime: string;
  readonly byteLength: number;
  readonly blobRef: string;
  readonly sourceResourceId?: string;
  readonly losses?: readonly string[];
}

export type StudioWebFeatureKind =
  | "sketch"
  | "extrude"
  | "revolve"
  | "sweep"
  | "loft"
  | "boolean"
  | "fillet"
  | "chamfer"
  | "shell"
  | "draft"
  | "pattern"
  | "mirror"
  | "direct-face-edit"
  | "modifier"
  | "procedural-generator";

export interface StudioWebTopologyReference {
  readonly persistentName: string;
  readonly sourceFeatureId: string;
  readonly semanticRole?: string;
  readonly ancestry: readonly string[];
  readonly geometricSignature: {
    readonly surfaceType: string;
    readonly centroid: readonly [number, number, number];
    readonly normal?: readonly [number, number, number];
    readonly measureRange: readonly [number, number];
  };
}

export interface StudioWebFeatureNode {
  readonly featureId: string;
  readonly kind: StudioWebFeatureKind;
  readonly name: string;
  readonly enabled: boolean;
  readonly inputFeatureIds: readonly string[];
  readonly inputResourceIds: readonly string[];
  readonly parameters: Readonly<Record<string, string | number | boolean | readonly number[]>>;
  readonly topologyRefs: readonly StudioWebTopologyReference[];
  readonly outputResourceId: string;
  readonly status: "clean" | "dirty" | "failed" | "suppressed";
  readonly errorMessage: string | null;
}

export interface StudioWebFeatureGraph {
  readonly graphId: string;
  readonly authority: "brep-feature-graph" | "procedural-graph" | "editable-mesh";
  readonly revision: number;
  readonly rootResourceId: string;
  readonly nodes: readonly StudioWebFeatureNode[];
}

export interface StudioWebAuthoringProjectV3 {
  readonly schemaVersion: typeof STUDIO_WEB_AUTHORING_PROJECT_VERSION;
  readonly projectId: string;
  readonly title: string;
  readonly revision: number;
  readonly scene: StudioScene3dDocumentV1;
  readonly characters: Readonly<Record<string, CharacterDocumentV3>>;
  readonly resources: Readonly<Record<string, StudioWebAuthoringResourceDescriptor>>;
  readonly featureGraphs: Readonly<Record<string, StudioWebFeatureGraph>>;
  readonly runtime: {
    readonly primaryEnvironment: "browser";
    readonly browserRequired: true;
    readonly nativeRequired: false;
    readonly storage: "sqlite-wasm-opfs" | "indexeddb";
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class StudioWebAuthoringProjectError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "StudioWebAuthoringProjectError";
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const HASH = /^(?:sha256:)?[a-f0-9]{64}$/iu;
const MIME = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/iu;
const BLOB_REF = /^sha256:[a-f0-9]{64}$/iu;

function assertId(value: string, field: string): void {
  if (!ID.test(value)) {
    throw new StudioWebAuthoringProjectError("PROJECT_ID_INVALID", `${field} 형식이 올바르지 않습니다.`);
  }
}

function finiteTuple(value: readonly number[], length: number): boolean {
  return value.length === length && value.every(Number.isFinite);
}

function validateResource(
  resource: StudioWebAuthoringResourceDescriptor,
): StudioWebAuthoringResourceDescriptor {
  assertId(resource.resourceId, "resourceId");
  assertId(resource.revision, "resource.revision");
  if (!HASH.test(resource.contentHash) || !MIME.test(resource.mime)
    || !Number.isSafeInteger(resource.byteLength) || resource.byteLength < 0
    || !BLOB_REF.test(resource.blobRef)) {
    throw new StudioWebAuthoringProjectError("PROJECT_RESOURCE_INVALID", `리소스 ${resource.resourceId} 형식이 올바르지 않습니다.`);
  }
  if (resource.sourceResourceId) assertId(resource.sourceResourceId, "sourceResourceId");
  return Object.freeze({
    ...resource,
    losses: resource.losses ? Object.freeze([...new Set(resource.losses)]) : undefined,
  });
}

function validateTopologyRef(ref: StudioWebTopologyReference): StudioWebTopologyReference {
  assertId(ref.persistentName, "topologyRef.persistentName");
  assertId(ref.sourceFeatureId, "topologyRef.sourceFeatureId");
  ref.ancestry.forEach((value) => assertId(value, "topologyRef.ancestry"));
  if (ref.semanticRole) assertId(ref.semanticRole, "topologyRef.semanticRole");
  const signature = ref.geometricSignature;
  if (!ID.test(signature.surfaceType)
    || !finiteTuple(signature.centroid, 3)
    || (signature.normal !== undefined && !finiteTuple(signature.normal, 3))
    || !finiteTuple(signature.measureRange, 2)
    || signature.measureRange[0] > signature.measureRange[1]) {
    throw new StudioWebAuthoringProjectError("PROJECT_TOPOLOGY_REF_INVALID", "Persistent topology reference가 올바르지 않습니다.");
  }
  return Object.freeze({
    ...ref,
    ancestry: Object.freeze([...ref.ancestry]),
    geometricSignature: Object.freeze({
      ...signature,
      centroid: Object.freeze([...signature.centroid] as [number, number, number]),
      ...(signature.normal
        ? { normal: Object.freeze([...signature.normal] as [number, number, number]) }
        : {}),
      measureRange: Object.freeze([...signature.measureRange] as [number, number]),
    }),
  });
}

function validateFeatureGraph(
  graph: StudioWebFeatureGraph,
  resources: Readonly<Record<string, StudioWebAuthoringResourceDescriptor>>,
): StudioWebFeatureGraph {
  assertId(graph.graphId, "featureGraph.graphId");
  assertId(graph.rootResourceId, "featureGraph.rootResourceId");
  if (!Number.isSafeInteger(graph.revision) || graph.revision < 0) {
    throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_GRAPH_INVALID", "Feature graph revision이 올바르지 않습니다.");
  }
  if (!resources[graph.rootResourceId]) {
    throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_RESOURCE_MISSING", `Feature graph 원본 리소스가 없습니다: ${graph.rootResourceId}`);
  }
  const byId = new Map<string, StudioWebFeatureNode>();
  for (const node of graph.nodes) {
    assertId(node.featureId, "featureId");
    assertId(node.outputResourceId, "feature.outputResourceId");
    if (byId.has(node.featureId)) {
      throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_DUPLICATE", `중복 feature ID가 있습니다: ${node.featureId}`);
    }
    if (!resources[node.outputResourceId]) {
      throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_RESOURCE_MISSING", `Feature 출력 리소스가 없습니다: ${node.outputResourceId}`);
    }
    for (const resourceId of node.inputResourceIds) {
      assertId(resourceId, "feature.inputResourceId");
      if (!resources[resourceId]) {
        throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_RESOURCE_MISSING", `Feature 입력 리소스가 없습니다: ${resourceId}`);
      }
    }
    if (node.status === "failed" && (!node.errorMessage || node.errorMessage.length > 512)) {
      throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_ERROR_INVALID", `실패 feature ${node.featureId}에 오류 설명이 없습니다.`);
    }
    byId.set(node.featureId, node);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (featureId: string): void => {
    if (visited.has(featureId)) return;
    if (visiting.has(featureId)) {
      throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_CYCLE", `Feature graph에 순환 의존성이 있습니다: ${featureId}`);
    }
    const node = byId.get(featureId);
    if (!node) {
      throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_MISSING", `참조한 feature가 없습니다: ${featureId}`);
    }
    visiting.add(featureId);
    for (const inputId of node.inputFeatureIds) visit(inputId);
    visiting.delete(featureId);
    visited.add(featureId);
  };
  for (const featureId of byId.keys()) visit(featureId);
  const nodes = graph.nodes.map((node) => Object.freeze({
    ...node,
    inputFeatureIds: Object.freeze([...node.inputFeatureIds]),
    inputResourceIds: Object.freeze([...node.inputResourceIds]),
    parameters: Object.freeze({ ...node.parameters }),
    topologyRefs: Object.freeze(node.topologyRefs.map(validateTopologyRef)),
  }));
  return Object.freeze({ ...graph, nodes: Object.freeze(nodes) });
}

function characterEntityReferences(scene: StudioScene3dDocumentV1): readonly Extract<StudioScene3dEntity, { kind: "character" }>[] {
  return scene.entities.filter(
    (entity): entity is Extract<StudioScene3dEntity, { kind: "character" }> => entity.kind === "character",
  );
}

export function validateStudioWebAuthoringProjectV3(
  input: StudioWebAuthoringProjectV3,
): StudioWebAuthoringProjectV3 {
  if (input.schemaVersion !== STUDIO_WEB_AUTHORING_PROJECT_VERSION) {
    throw new StudioWebAuthoringProjectError("PROJECT_VERSION_UNSUPPORTED", "지원하지 않는 웹 3D 프로젝트 버전입니다.");
  }
  assertId(input.projectId, "projectId");
  if (input.title.trim().length === 0 || input.title.length > 256
    || !Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new StudioWebAuthoringProjectError("PROJECT_METADATA_INVALID", "프로젝트 이름 또는 revision이 올바르지 않습니다.");
  }
  if (input.runtime.primaryEnvironment !== "browser"
    || input.runtime.browserRequired !== true
    || input.runtime.nativeRequired !== false) {
    throw new StudioWebAuthoringProjectError("PROJECT_RUNTIME_INVALID", "웹 3D 프로젝트는 브라우저 실행을 필수로 하고 native 실행을 요구하지 않아야 합니다.");
  }
  assertStudioScene3dDocument(input.scene);
  if (input.scene.documentId !== input.projectId) {
    throw new StudioWebAuthoringProjectError("PROJECT_SCENE_ID_MISMATCH", "Scene document ID와 project ID가 다릅니다.");
  }
  const characters: Record<string, CharacterDocumentV3> = {};
  for (const [documentId, document] of Object.entries(input.characters)) {
    assertId(documentId, "characters.documentId");
    const validated = validateCharacterDocumentV3(document);
    if (validated.documentId !== documentId) {
      throw new StudioWebAuthoringProjectError("PROJECT_CHARACTER_ID_MISMATCH", `Character map key와 문서 ID가 다릅니다: ${documentId}`);
    }
    characters[documentId] = validated;
  }
  for (const entity of characterEntityReferences(input.scene)) {
    const character = characters[entity.characterDocumentId];
    if (!character) {
      throw new StudioWebAuthoringProjectError("PROJECT_CHARACTER_MISSING", `Scene 캐릭터 ${entity.id}의 문서가 없습니다.`);
    }
    if (character.revision !== entity.characterRevision) {
      throw new StudioWebAuthoringProjectError(
        "PROJECT_CHARACTER_REVISION_MISMATCH",
        `Scene 캐릭터 ${entity.id}는 revision ${entity.characterRevision}을 요구하지만 문서는 ${character.revision}입니다.`,
      );
    }
  }
  const resources: Record<string, StudioWebAuthoringResourceDescriptor> = {};
  for (const [resourceId, resource] of Object.entries(input.resources)) {
    const validated = validateResource(resource);
    if (validated.resourceId !== resourceId) {
      throw new StudioWebAuthoringProjectError("PROJECT_RESOURCE_ID_MISMATCH", `Resource map key와 ID가 다릅니다: ${resourceId}`);
    }
    resources[resourceId] = validated;
  }
  const featureGraphs: Record<string, StudioWebFeatureGraph> = {};
  for (const [graphId, graph] of Object.entries(input.featureGraphs)) {
    const validated = validateFeatureGraph(graph, resources);
    if (validated.graphId !== graphId) {
      throw new StudioWebAuthoringProjectError("PROJECT_FEATURE_GRAPH_ID_MISMATCH", `Feature graph map key와 ID가 다릅니다: ${graphId}`);
    }
    featureGraphs[graphId] = validated;
  }
  return Object.freeze({
    ...input,
    scene: input.scene,
    characters: Object.freeze(characters),
    resources: Object.freeze(resources),
    featureGraphs: Object.freeze(featureGraphs),
    runtime: Object.freeze({ ...input.runtime }),
  });
}

export function createStudioWebAuthoringProjectV3(input: {
  readonly projectId: string;
  readonly title: string;
  readonly scene: StudioScene3dDocumentV1;
  readonly characters?: Readonly<Record<string, CharacterDocumentV3>>;
  readonly resources?: Readonly<Record<string, StudioWebAuthoringResourceDescriptor>>;
  readonly featureGraphs?: Readonly<Record<string, StudioWebFeatureGraph>>;
  readonly storage?: "sqlite-wasm-opfs" | "indexeddb";
  readonly revision?: number;
  readonly now?: string;
}): StudioWebAuthoringProjectV3 {
  const now = input.now ?? new Date().toISOString();
  return validateStudioWebAuthoringProjectV3({
    schemaVersion: STUDIO_WEB_AUTHORING_PROJECT_VERSION,
    projectId: input.projectId,
    title: input.title,
    revision: input.revision ?? 0,
    scene: input.scene,
    characters: input.characters ?? {},
    resources: input.resources ?? {},
    featureGraphs: input.featureGraphs ?? {},
    runtime: {
      primaryEnvironment: "browser",
      browserRequired: true,
      nativeRequired: false,
      storage: input.storage ?? "sqlite-wasm-opfs",
    },
    createdAt: now,
    updatedAt: now,
  });
}

export function serializeStudioWebAuthoringProjectV3(
  project: StudioWebAuthoringProjectV3,
): string {
  return JSON.stringify(validateStudioWebAuthoringProjectV3(project));
}

export function parseStudioWebAuthoringProjectV3(
  raw: string | unknown,
): StudioWebAuthoringProjectV3 {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StudioWebAuthoringProjectError("PROJECT_INVALID", "웹 3D 프로젝트 형식이 올바르지 않습니다.");
  }
  return validateStudioWebAuthoringProjectV3(value as StudioWebAuthoringProjectV3);
}
