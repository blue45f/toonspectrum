import {
  STUDIO_SCENE3D_COMMAND_MAX_TRANSACTION_STEPS,
  canonicalizeStudioScene3dCommandState,
  type StudioScene3dCommandSource,
  type StudioScene3dStateCommand,
} from "./studio-scene3d-command-core";
import {
  assertStudioScene3dDocument,
  type StudioScene3dCamera,
  type StudioScene3dDocumentV1,
  type StudioScene3dEntity,
  type StudioScene3dOutputSettings,
  type StudioScene3dTransform,
} from "./studio-scene3d-document";

export type StudioScene3dDocumentCommandErrorCode =
  | "DOCUMENT_ID_MISMATCH"
  | "DOCUMENT_REVISION_MISMATCH"
  | "ENTITY_NOT_FOUND"
  | "ENTITY_LOCKED"
  | "PARENT_NOT_FOUND"
  | "CYCLIC_PARENT"
  | "CAMERA_NOT_FOUND"
  | "EMPTY_TRANSACTION"
  | "TRANSACTION_TOO_LARGE";

export class StudioScene3dDocumentCommandError extends Error {
  constructor(
    readonly code: StudioScene3dDocumentCommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StudioScene3dDocumentCommandError";
  }
}

export interface StudioScene3dDocumentOperation {
  readonly id: string;
  readonly label: string;
  readonly apply: (document: Readonly<StudioScene3dDocumentV1>) => StudioScene3dDocumentV1;
}

export interface StudioScene3dDocumentCommandInput {
  readonly id: string;
  readonly label: string;
  readonly source?: StudioScene3dCommandSource;
  readonly operations: readonly StudioScene3dDocumentOperation[];
  readonly expectedDocumentId?: string;
  readonly expectedRevision?: number;
  /** Captured when the command is created so replay is deterministic. */
  readonly committedAt?: string;
}

function sameState<Value>(
  left: Readonly<Value>,
  right: Readonly<Value>,
): boolean {
  return canonicalizeStudioScene3dCommandState(left)
    === canonicalizeStudioScene3dCommandState(right);
}

function preserveDocumentIdentity(
  source: Readonly<StudioScene3dDocumentV1>,
  candidate: Readonly<StudioScene3dDocumentV1>,
): StudioScene3dDocumentV1 {
  return Object.freeze({
    ...candidate,
    kind: source.kind,
    version: source.version,
    documentId: source.documentId,
    revision: source.revision,
    coordinateSystem: source.coordinateSystem,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  });
}

function assertCommandPrecondition(
  document: Readonly<StudioScene3dDocumentV1>,
  input: StudioScene3dDocumentCommandInput,
): void {
  if (
    input.expectedDocumentId !== undefined
    && input.expectedDocumentId !== document.documentId
  ) {
    throw new StudioScene3dDocumentCommandError(
      "DOCUMENT_ID_MISMATCH",
      "다른 3D 장면을 대상으로 만든 명령이라 적용하지 않았습니다.",
    );
  }
  if (
    input.expectedRevision !== undefined
    && input.expectedRevision !== document.revision
  ) {
    throw new StudioScene3dDocumentCommandError(
      "DOCUMENT_REVISION_MISMATCH",
      "3D 장면이 명령 생성 이후 변경되어 적용하지 않았습니다.",
    );
  }
}

/**
 * Builds one replay-safe Scene3D command from one or more pure operations.
 *
 * All operations run before a document revision is published. A failure therefore leaves the
 * timeline untouched, while a successful multi-operation edit increments the document revision
 * exactly once.
 */
export function createStudioScene3dDocumentCommand(
  input: StudioScene3dDocumentCommandInput,
): StudioScene3dStateCommand<StudioScene3dDocumentV1> {
  if (input.operations.length === 0) {
    throw new StudioScene3dDocumentCommandError(
      "EMPTY_TRANSACTION",
      "3D 장면 명령에는 하나 이상의 작업이 필요합니다.",
    );
  }
  if (input.operations.length > STUDIO_SCENE3D_COMMAND_MAX_TRANSACTION_STEPS) {
    throw new StudioScene3dDocumentCommandError(
      "TRANSACTION_TOO_LARGE",
      `3D 장면 명령은 최대 ${STUDIO_SCENE3D_COMMAND_MAX_TRANSACTION_STEPS}개 작업을 포함할 수 있습니다.`,
    );
  }

  const operations = Object.freeze([...input.operations]);
  const committedAt = input.committedAt ?? new Date().toISOString();
  return Object.freeze({
    id: input.id,
    label: input.label,
    source: input.source,
    apply: (state: Readonly<StudioScene3dDocumentV1>) => {
      assertStudioScene3dDocument(state);
      assertCommandPrecondition(state, input);
      let next = state as StudioScene3dDocumentV1;
      for (const operation of operations) next = operation.apply(next);
      const candidate = preserveDocumentIdentity(state, next);
      assertStudioScene3dDocument(candidate);
      if (sameState(state, candidate)) return state as StudioScene3dDocumentV1;
      const committed = Object.freeze({
        ...candidate,
        revision: state.revision + 1,
        updatedAt: committedAt,
      });
      assertStudioScene3dDocument(committed);
      return committed;
    },
  });
}

function findEntity(
  document: Readonly<StudioScene3dDocumentV1>,
  entityId: string,
): StudioScene3dEntity {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (!entity) {
    throw new StudioScene3dDocumentCommandError(
      "ENTITY_NOT_FOUND",
      `3D 객체 ${entityId}를 찾을 수 없습니다.`,
    );
  }
  return entity;
}

function requireEditableEntity(
  document: Readonly<StudioScene3dDocumentV1>,
  entityId: string,
): StudioScene3dEntity {
  const entity = findEntity(document, entityId);
  if (entity.locked) {
    throw new StudioScene3dDocumentCommandError(
      "ENTITY_LOCKED",
      `${entity.name} 객체가 잠겨 있어 변경하지 않았습니다.`,
    );
  }
  return entity;
}

function ownTransformPatch(
  patch: Partial<StudioScene3dTransform>,
): Partial<StudioScene3dTransform> {
  return Object.freeze({
    ...(patch.position
      ? { position: Object.freeze([...patch.position] as [number, number, number]) }
      : {}),
    ...(patch.rotation
      ? { rotation: Object.freeze([...patch.rotation] as [number, number, number, number]) }
      : {}),
    ...(patch.scale
      ? { scale: Object.freeze([...patch.scale] as [number, number, number]) }
      : {}),
  });
}

export function createStudioScene3dTransformOperation(input: {
  readonly entityId: string;
  readonly patch: Partial<StudioScene3dTransform>;
}): StudioScene3dDocumentOperation {
  const patch = ownTransformPatch(input.patch);
  return Object.freeze({
    id: `scene3d.entity.transform/${input.entityId}`,
    label: "객체 변환",
    apply: (document: Readonly<StudioScene3dDocumentV1>) => {
      const current = requireEditableEntity(document, input.entityId);
      const transform = Object.freeze({ ...current.transform, ...patch });
      if (sameState(current.transform, transform)) return document as StudioScene3dDocumentV1;
      const entities = document.entities.map((entity) => entity.id === input.entityId
        ? Object.freeze({ ...entity, transform }) as StudioScene3dEntity
        : entity);
      return Object.freeze({ ...document, entities: Object.freeze(entities) });
    },
  });
}

export function createStudioScene3dBatchTransformCommand(input: {
  readonly id?: string;
  readonly label?: string;
  readonly patches: readonly {
    readonly entityId: string;
    readonly patch: Partial<StudioScene3dTransform>;
  }[];
  readonly source?: StudioScene3dCommandSource;
  readonly expectedDocumentId?: string;
  readonly expectedRevision?: number;
  readonly committedAt?: string;
}): StudioScene3dStateCommand<StudioScene3dDocumentV1> {
  return createStudioScene3dDocumentCommand({
    id: input.id ?? "scene3d.entity.batch-transform",
    label: input.label ?? "객체 변환",
    source: input.source ?? "canvas",
    expectedDocumentId: input.expectedDocumentId,
    expectedRevision: input.expectedRevision,
    committedAt: input.committedAt,
    operations: input.patches.map(createStudioScene3dTransformOperation),
  });
}

function wouldCreateParentCycle(
  document: Readonly<StudioScene3dDocumentV1>,
  entityId: string,
  parentId: string,
): boolean {
  const parentById = new Map(document.entities.map((entity) => [entity.id, entity.parentId]));
  let cursor: string | null = parentId;
  const visited = new Set<string>();
  while (cursor !== null) {
    if (cursor === entityId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}

export function createStudioScene3dReparentCommand(input: {
  readonly entityId: string;
  readonly parentId: string | null;
  readonly source?: StudioScene3dCommandSource;
  readonly expectedDocumentId?: string;
  readonly expectedRevision?: number;
  readonly committedAt?: string;
}): StudioScene3dStateCommand<StudioScene3dDocumentV1> {
  const operation: StudioScene3dDocumentOperation = Object.freeze({
    id: `scene3d.entity.reparent/${input.entityId}`,
    label: "객체 계층 변경",
    apply: (document: Readonly<StudioScene3dDocumentV1>) => {
      const entity = requireEditableEntity(document, input.entityId);
      if (entity.parentId === input.parentId) return document as StudioScene3dDocumentV1;
      if (input.parentId !== null) {
        if (!document.entities.some((candidate) => candidate.id === input.parentId)) {
          throw new StudioScene3dDocumentCommandError(
            "PARENT_NOT_FOUND",
            "부모로 지정한 3D 객체를 찾을 수 없습니다.",
          );
        }
        if (wouldCreateParentCycle(document, input.entityId, input.parentId)) {
          throw new StudioScene3dDocumentCommandError(
            "CYCLIC_PARENT",
            "자기 자신 또는 하위 객체를 부모로 지정할 수 없습니다.",
          );
        }
      }
      const entities = document.entities.map((candidate) => candidate.id === input.entityId
        ? Object.freeze({ ...candidate, parentId: input.parentId }) as StudioScene3dEntity
        : candidate);
      return Object.freeze({ ...document, entities: Object.freeze(entities) });
    },
  });
  return createStudioScene3dDocumentCommand({
    id: "scene3d.entity.reparent",
    label: "객체 계층 변경",
    source: input.source ?? "inspector",
    expectedDocumentId: input.expectedDocumentId,
    expectedRevision: input.expectedRevision,
    committedAt: input.committedAt,
    operations: [operation],
  });
}

function ownCameraPatch(
  patch: Partial<StudioScene3dCamera>,
): Partial<StudioScene3dCamera> {
  return Object.freeze({
    ...patch,
    ...(patch.position
      ? { position: Object.freeze([...patch.position] as [number, number, number]) }
      : {}),
    ...(patch.target
      ? { target: Object.freeze([...patch.target] as [number, number, number]) }
      : {}),
    ...(patch.up
      ? { up: Object.freeze([...patch.up] as [number, number, number]) }
      : {}),
    ...(patch.lensShift
      ? { lensShift: Object.freeze([...patch.lensShift] as [number, number]) }
      : {}),
  });
}

export function createStudioScene3dCameraCommand(input: {
  readonly cameraId: string;
  readonly patch: Partial<StudioScene3dCamera>;
  readonly activate?: boolean;
  readonly source?: StudioScene3dCommandSource;
  readonly expectedDocumentId?: string;
  readonly expectedRevision?: number;
  readonly committedAt?: string;
}): StudioScene3dStateCommand<StudioScene3dDocumentV1> {
  const patch = ownCameraPatch(input.patch);
  const operation: StudioScene3dDocumentOperation = Object.freeze({
    id: `scene3d.camera.patch/${input.cameraId}`,
    label: "카메라 변경",
    apply: (document: Readonly<StudioScene3dDocumentV1>) => {
      const current = document.cameras.find((camera) => camera.id === input.cameraId);
      if (!current) {
        throw new StudioScene3dDocumentCommandError(
          "CAMERA_NOT_FOUND",
          "변경할 3D 카메라를 찾을 수 없습니다.",
        );
      }
      const nextCamera = Object.freeze({ ...current, ...patch });
      const activeCameraId = input.activate ? input.cameraId : document.activeCameraId;
      if (sameState(current, nextCamera) && activeCameraId === document.activeCameraId) {
        return document as StudioScene3dDocumentV1;
      }
      const cameras = document.cameras.map((camera) => camera.id === input.cameraId
        ? nextCamera
        : camera);
      return Object.freeze({
        ...document,
        cameras: Object.freeze(cameras),
        activeCameraId,
      });
    },
  });
  return createStudioScene3dDocumentCommand({
    id: "scene3d.camera.patch",
    label: "카메라 변경",
    source: input.source ?? "inspector",
    expectedDocumentId: input.expectedDocumentId,
    expectedRevision: input.expectedRevision,
    committedAt: input.committedAt,
    operations: [operation],
  });
}

function ownOutputPatch(
  patch: Partial<StudioScene3dOutputSettings>,
): Partial<StudioScene3dOutputSettings> {
  return Object.freeze({
    ...patch,
    ...(patch.semanticPasses
      ? { semanticPasses: Object.freeze([...patch.semanticPasses]) }
      : {}),
  });
}

export function createStudioScene3dOutputCommand(input: {
  readonly patch: Partial<StudioScene3dOutputSettings>;
  readonly source?: StudioScene3dCommandSource;
  readonly expectedDocumentId?: string;
  readonly expectedRevision?: number;
  readonly committedAt?: string;
}): StudioScene3dStateCommand<StudioScene3dDocumentV1> {
  const patch = ownOutputPatch(input.patch);
  const operation: StudioScene3dDocumentOperation = Object.freeze({
    id: "scene3d.output.patch",
    label: "출력 설정 변경",
    apply: (document: Readonly<StudioScene3dDocumentV1>) => {
      const output = Object.freeze({ ...document.output, ...patch });
      if (sameState(document.output, output)) return document as StudioScene3dDocumentV1;
      return Object.freeze({ ...document, output });
    },
  });
  return createStudioScene3dDocumentCommand({
    id: "scene3d.output.patch",
    label: "출력 설정 변경",
    source: input.source ?? "inspector",
    expectedDocumentId: input.expectedDocumentId,
    expectedRevision: input.expectedRevision,
    committedAt: input.committedAt,
    operations: [operation],
  });
}
