export const CHARACTER_LINKED_LAYER_VERSION = 1 as const;

export type CharacterLinkedLayerVector2 = readonly [number, number];
export type CharacterLinkedLayerVector3 = readonly [number, number, number];
export type CharacterLinkedLayerQuaternion = readonly [number, number, number, number];

export type CharacterLinkedLayerAnchor =
  | {
      readonly kind: "entity-local";
      readonly anchorId: string;
      readonly entityId: string;
      readonly position: CharacterLinkedLayerVector3;
      readonly rotation: CharacterLinkedLayerQuaternion;
    }
  | {
      readonly kind: "stable-topology";
      readonly anchorId: string;
      readonly meshAssetId: string;
      readonly topologyRevision: string;
      readonly persistentName: string;
      readonly localPosition: CharacterLinkedLayerVector3;
    }
  | {
      readonly kind: "triangle-barycentric";
      readonly anchorId: string;
      readonly meshAssetId: string;
      readonly topologyRevision: string;
      readonly primitiveIndex: number;
      readonly triangleIndex: number;
      readonly barycentric: CharacterLinkedLayerVector3;
    }
  | {
      readonly kind: "uv-material";
      readonly anchorId: string;
      readonly meshAssetId: string;
      readonly materialId: string;
      readonly uv: CharacterLinkedLayerVector2;
    }
  | {
      readonly kind: "object-mask";
      readonly anchorId: string;
      readonly entityId: string;
      readonly objectId: number;
    };

export interface CharacterLinkedLayerArtifacts {
  readonly beautyLayerId?: string;
  readonly vectorLineLayerId?: string;
  readonly toneLayerId?: string;
  readonly shadowLayerId?: string;
  readonly depthLayerId?: string;
  readonly normalLayerId?: string;
  readonly objectIdLayerId?: string;
}

export interface CharacterLinkedLayerDocument {
  readonly version: typeof CHARACTER_LINKED_LAYER_VERSION;
  readonly linkedLayerId: string;
  readonly characterDocumentId: string;
  readonly sourceRevision: number;
  readonly shotId: string;
  readonly renderRecipeId: string;
  readonly artifactRevision: string;
  readonly artifacts: CharacterLinkedLayerArtifacts;
  readonly anchors: readonly CharacterLinkedLayerAnchor[];
  readonly status: "current" | "needs-refresh" | "conflicted";
  readonly conflicts: readonly CharacterLinkedLayerConflict[];
}

export type CharacterLinkedLayerConflictCode =
  | "missing-entity"
  | "topology-revision-changed"
  | "invalid-object-id";

export interface CharacterLinkedLayerConflict {
  readonly anchorId: string;
  readonly code: CharacterLinkedLayerConflictCode;
  readonly message: string;
}

export interface CharacterLinkedLayerReconcileInput {
  readonly currentDocumentRevision: number;
  readonly currentTopologyRevision: string;
  readonly entityIds: ReadonlySet<string>;
}

export class CharacterLinkedLayerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterLinkedLayerError";
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const HEX = /^(?:sha256:)?[a-f0-9]{8,128}$/iu;

function assertId(value: string, field: string): void {
  if (!ID.test(value)) {
    throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ID_INVALID", `${field} 형식이 올바르지 않습니다.`);
  }
}

function finiteTuple(value: readonly number[], length: number): boolean {
  return value.length === length && value.every(Number.isFinite);
}

function validateAnchor(anchor: CharacterLinkedLayerAnchor): CharacterLinkedLayerAnchor {
  assertId(anchor.anchorId, "anchorId");
  if (anchor.kind === "entity-local") {
    assertId(anchor.entityId, "entityId");
    if (!finiteTuple(anchor.position, 3) || !finiteTuple(anchor.rotation, 4)) {
      throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ANCHOR_INVALID", "Entity anchor transform이 올바르지 않습니다.");
    }
    return Object.freeze({
      ...anchor,
      position: Object.freeze([...anchor.position] as [number, number, number]),
      rotation: Object.freeze([...anchor.rotation] as [number, number, number, number]),
    });
  }
  if (anchor.kind === "stable-topology") {
    assertId(anchor.meshAssetId, "meshAssetId");
    assertId(anchor.topologyRevision, "topologyRevision");
    assertId(anchor.persistentName, "persistentName");
    if (!finiteTuple(anchor.localPosition, 3)) {
      throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ANCHOR_INVALID", "Stable topology anchor 위치가 올바르지 않습니다.");
    }
    return Object.freeze({
      ...anchor,
      localPosition: Object.freeze([...anchor.localPosition] as [number, number, number]),
    });
  }
  if (anchor.kind === "triangle-barycentric") {
    assertId(anchor.meshAssetId, "meshAssetId");
    assertId(anchor.topologyRevision, "topologyRevision");
    if (!Number.isSafeInteger(anchor.primitiveIndex) || anchor.primitiveIndex < 0
      || !Number.isSafeInteger(anchor.triangleIndex) || anchor.triangleIndex < 0
      || !finiteTuple(anchor.barycentric, 3)) {
      throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ANCHOR_INVALID", "Barycentric anchor가 올바르지 않습니다.");
    }
    const sum = anchor.barycentric[0] + anchor.barycentric[1] + anchor.barycentric[2];
    if (anchor.barycentric.some((value) => value < -1e-6) || Math.abs(sum - 1) > 1e-4) {
      throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ANCHOR_INVALID", "Barycentric 좌표의 합은 1이어야 합니다.");
    }
    return Object.freeze({
      ...anchor,
      barycentric: Object.freeze([...anchor.barycentric] as [number, number, number]),
    });
  }
  if (anchor.kind === "uv-material") {
    assertId(anchor.meshAssetId, "meshAssetId");
    assertId(anchor.materialId, "materialId");
    if (!finiteTuple(anchor.uv, 2)) {
      throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ANCHOR_INVALID", "UV anchor가 올바르지 않습니다.");
    }
    return Object.freeze({ ...anchor, uv: Object.freeze([...anchor.uv] as [number, number]) });
  }
  assertId(anchor.entityId, "entityId");
  if (!Number.isSafeInteger(anchor.objectId) || anchor.objectId < 0 || anchor.objectId > 0xffffff) {
    throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ANCHOR_INVALID", "Object ID anchor가 올바르지 않습니다.");
  }
  return Object.freeze({ ...anchor });
}

export function validateCharacterLinkedLayer(
  input: CharacterLinkedLayerDocument,
): CharacterLinkedLayerDocument {
  if (input.version !== CHARACTER_LINKED_LAYER_VERSION) {
    throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_VERSION_UNSUPPORTED", "지원하지 않는 Linked Layer 버전입니다.");
  }
  assertId(input.linkedLayerId, "linkedLayerId");
  assertId(input.characterDocumentId, "characterDocumentId");
  assertId(input.shotId, "shotId");
  assertId(input.renderRecipeId, "renderRecipeId");
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 0) {
    throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_REVISION_INVALID", "Linked Layer 원본 버전이 올바르지 않습니다.");
  }
  if (!HEX.test(input.artifactRevision)) {
    throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ARTIFACT_INVALID", "Artifact revision은 해시 형식이어야 합니다.");
  }
  if (!Array.isArray(input.anchors) || input.anchors.length > 100_000) {
    throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_ANCHOR_LIMIT", "Linked Layer anchor 수가 허용 범위를 벗어났습니다.");
  }
  const ids = new Set<string>();
  const anchors = input.anchors.map((anchor) => {
    const validated = validateAnchor(anchor);
    if (ids.has(validated.anchorId)) {
      throw new CharacterLinkedLayerError("CHARACTER_LINKED_LAYER_DUPLICATE_ANCHOR", `중복 anchor ID가 있습니다: ${validated.anchorId}`);
    }
    ids.add(validated.anchorId);
    return validated;
  });
  return Object.freeze({
    ...input,
    artifacts: Object.freeze({ ...input.artifacts }),
    anchors: Object.freeze(anchors),
    conflicts: Object.freeze(input.conflicts.map((conflict) => Object.freeze({ ...conflict }))),
  });
}

export function createCharacterLinkedLayer(input: {
  readonly linkedLayerId: string;
  readonly characterDocumentId: string;
  readonly sourceRevision: number;
  readonly shotId: string;
  readonly renderRecipeId: string;
  readonly artifactRevision: string;
  readonly artifacts?: CharacterLinkedLayerArtifacts;
  readonly anchors?: readonly CharacterLinkedLayerAnchor[];
}): CharacterLinkedLayerDocument {
  return validateCharacterLinkedLayer({
    version: CHARACTER_LINKED_LAYER_VERSION,
    linkedLayerId: input.linkedLayerId,
    characterDocumentId: input.characterDocumentId,
    sourceRevision: input.sourceRevision,
    shotId: input.shotId,
    renderRecipeId: input.renderRecipeId,
    artifactRevision: input.artifactRevision,
    artifacts: input.artifacts ?? {},
    anchors: input.anchors ?? [],
    status: "current",
    conflicts: [],
  });
}

function conflict(
  anchorId: string,
  code: CharacterLinkedLayerConflictCode,
  message: string,
): CharacterLinkedLayerConflict {
  return Object.freeze({ anchorId, code, message });
}

export function reconcileCharacterLinkedLayer(
  layer: CharacterLinkedLayerDocument,
  input: CharacterLinkedLayerReconcileInput,
): CharacterLinkedLayerDocument {
  const conflicts: CharacterLinkedLayerConflict[] = [];
  for (const anchor of layer.anchors) {
    if (anchor.kind === "entity-local" || anchor.kind === "object-mask") {
      if (!input.entityIds.has(anchor.entityId)) {
        conflicts.push(conflict(
          anchor.anchorId,
          "missing-entity",
          `원본 객체 ${anchor.entityId}가 없어 2D 보정을 자동 연결하지 못했습니다.`,
        ));
      }
    }
    if ((anchor.kind === "stable-topology" || anchor.kind === "triangle-barycentric")
      && anchor.topologyRevision !== input.currentTopologyRevision) {
      conflicts.push(conflict(
        anchor.anchorId,
        "topology-revision-changed",
        `Topology가 ${anchor.topologyRevision}에서 ${input.currentTopologyRevision}(으)로 바뀌어 재투영이 필요합니다.`,
      ));
    }
    if (anchor.kind === "object-mask" && anchor.objectId > 0xffffff) {
      conflicts.push(conflict(anchor.anchorId, "invalid-object-id", "Object ID가 24비트 범위를 벗어났습니다."));
    }
  }
  const revisionChanged = layer.sourceRevision !== input.currentDocumentRevision;
  return validateCharacterLinkedLayer({
    ...layer,
    status: conflicts.length > 0 ? "conflicted" : revisionChanged ? "needs-refresh" : "current",
    conflicts,
  });
}

export function refreshCharacterLinkedLayerArtifacts(
  layer: CharacterLinkedLayerDocument,
  input: {
    readonly sourceRevision: number;
    readonly artifactRevision: string;
    readonly artifacts: CharacterLinkedLayerArtifacts;
  },
): CharacterLinkedLayerDocument {
  return validateCharacterLinkedLayer({
    ...layer,
    sourceRevision: input.sourceRevision,
    artifactRevision: input.artifactRevision,
    artifacts: input.artifacts,
    status: layer.conflicts.length > 0 ? "conflicted" : "current",
  });
}
