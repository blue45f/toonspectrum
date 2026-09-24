import {
  CHARACTER_AUTHORING_WORKER_MAX_INPUT_BYTES,
  CHARACTER_AUTHORING_WORKER_MAX_OUTPUT_BYTES,
  CHARACTER_AUTHORING_WORKER_MAX_POINTS,
  characterAuthoringTaskPointCount,
  estimateCharacterAuthoringTaskBytes,
  type CharacterAuthoringWorkerMeshPayload,
  type CharacterAuthoringWorkerResultPayload,
  type CharacterAuthoringWorkerTask,
} from "./character-authoring-worker-protocol";
import {
  migrateCharacterDocumentV2ToV3,
  validateCharacterDocumentV3,
} from "../document/character-document-v3";
import {
  buildCharacterGroomRibbon,
  resampleCharacterGroomGuide,
} from "../groom/character-groom-document";
import { buildCharacterGeometryStrokeMesh } from "../surface-ink/character-geometry-stroke";

export class CharacterAuthoringWorkerRuntimeError extends Error {
  constructor(
    readonly code: "input-too-large" | "output-too-large" | "point-budget-exceeded" | "task-failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CharacterAuthoringWorkerRuntimeError";
  }
}

function meshPayload(mesh: {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}): CharacterAuthoringWorkerMeshPayload {
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;
  const byteLength = mesh.positions.byteLength + mesh.normals.byteLength
    + mesh.uvs.byteLength + mesh.indices.byteLength;
  if (!Number.isSafeInteger(vertexCount) || vertexCount <= 0
    || !Number.isSafeInteger(triangleCount) || triangleCount < 0) {
    throw new CharacterAuthoringWorkerRuntimeError("task-failed", "3D 파생 메시의 크기가 올바르지 않습니다.");
  }
  if (byteLength <= 0 || byteLength > CHARACTER_AUTHORING_WORKER_MAX_OUTPUT_BYTES) {
    throw new CharacterAuthoringWorkerRuntimeError("output-too-large", "3D 파생 메시가 Worker 출력 한도를 넘었습니다.");
  }
  return Object.freeze({
    kind: "mesh" as const,
    vertexCount,
    triangleCount,
    byteLength,
    positions: mesh.positions.buffer.slice(
      mesh.positions.byteOffset,
      mesh.positions.byteOffset + mesh.positions.byteLength,
    ) as ArrayBuffer,
    normals: mesh.normals.buffer.slice(
      mesh.normals.byteOffset,
      mesh.normals.byteOffset + mesh.normals.byteLength,
    ) as ArrayBuffer,
    uvs: mesh.uvs.buffer.slice(
      mesh.uvs.byteOffset,
      mesh.uvs.byteOffset + mesh.uvs.byteLength,
    ) as ArrayBuffer,
    indices: mesh.indices.buffer.slice(
      mesh.indices.byteOffset,
      mesh.indices.byteOffset + mesh.indices.byteLength,
    ) as ArrayBuffer,
  });
}

export function executeCharacterAuthoringTask(
  task: CharacterAuthoringWorkerTask,
): CharacterAuthoringWorkerResultPayload {
  const bytes = estimateCharacterAuthoringTaskBytes(task);
  if (bytes <= 0 || bytes > CHARACTER_AUTHORING_WORKER_MAX_INPUT_BYTES) {
    throw new CharacterAuthoringWorkerRuntimeError("input-too-large", "3D 저작 작업이 Worker 입력 한도를 넘었습니다.");
  }
  if (characterAuthoringTaskPointCount(task) > CHARACTER_AUTHORING_WORKER_MAX_POINTS) {
    throw new CharacterAuthoringWorkerRuntimeError("point-budget-exceeded", "3D 저작 작업의 제어점 수가 안전 한도를 넘었습니다.");
  }
  try {
    switch (task.kind) {
      case "migrate-document-v2":
        return Object.freeze({
          kind: "document-v3" as const,
          document: migrateCharacterDocumentV2ToV3(task.document),
        });
      case "validate-document-v3":
        return Object.freeze({
          kind: "document-v3" as const,
          document: validateCharacterDocumentV3(task.document),
        });
      case "resample-groom-guide":
        return Object.freeze({
          kind: "groom-guide" as const,
          guide: resampleCharacterGroomGuide(task.guide, task.spacing),
        });
      case "build-groom-ribbon":
        return meshPayload(buildCharacterGroomRibbon(task.guide, task.profile));
      case "build-geometry-stroke":
        return meshPayload(buildCharacterGeometryStrokeMesh(task.stroke));
    }
  } catch (error) {
    if (error instanceof CharacterAuthoringWorkerRuntimeError) throw error;
    throw new CharacterAuthoringWorkerRuntimeError(
      "task-failed",
      error instanceof Error ? error.message : "3D 저작 Worker 작업을 실행하지 못했습니다.",
      { cause: error },
    );
  }
}
