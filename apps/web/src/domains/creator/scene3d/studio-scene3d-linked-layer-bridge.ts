import {
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import {
  parseStudioLinked3dRenderDocument,
  validateStudioLinked3dRenderDocumentAgainstPage,
  type StudioLinked3dRenderDocument,
  type StudioLinked3dRenderElementLike,
  type StudioLinked3dRenderLink,
} from "../studio-linked-3d-render-document";
import {
  createStudioShared3dSceneSessionForStage,
  type StudioShared3dStagePersistedState,
} from "../studio-shared-3d-stage-collection";
import type { StudioShared3dStageElementSource } from "../studio-shared-3d-stage-document";
import {
  createStudioScene3dAuthority,
  projectStudioScene3dAuthorityToSources,
  type StudioScene3dAuthorityProjection,
  type StudioScene3dAuthoritySnapshot,
} from "./studio-scene3d-authority";
import type { StudioScene3dDocumentV1 } from "./studio-scene3d-document";

export type StudioScene3dLinkedLayerBridgeFailureCode =
  | "invalid-linked-document"
  | "missing-link"
  | "page-cross-reference-invalid"
  | "missing-canonical-scene"
  | "scene-revision-diverged"
  | "shot-mismatch";

export interface StudioScene3dLinkedLayerBridgeFailure {
  readonly ok: false;
  readonly code: StudioScene3dLinkedLayerBridgeFailureCode;
  readonly message: string;
}

export interface StudioScene3dLinkedLayerRoundTrip {
  readonly ok: true;
  readonly bundleId: string;
  readonly shotId: string;
  readonly sourceShotId: string | null;
  readonly stageSourceHash: `sha256:${string}`;
  readonly authority: StudioScene3dAuthoritySnapshot;
  readonly link: StudioLinked3dRenderLink;
  readonly layerElementIds: readonly string[];
  readonly correctionElementIds: readonly string[];
  readonly pageDocument: StudioLinked3dRenderDocument;
}

export type StudioScene3dLinkedLayerBridgeResult =
  | StudioScene3dLinkedLayerRoundTrip
  | StudioScene3dLinkedLayerBridgeFailure;

type LinkedLayerElement = StudioLinked3dRenderElementLike & StudioShared3dStageElementSource;

function failure(
  code: StudioScene3dLinkedLayerBridgeFailureCode,
  message: string,
): StudioScene3dLinkedLayerBridgeFailure {
  return Object.freeze({ ok: false as const, code, message });
}
function canonicalSceneForBundle(
  elements: readonly StudioLinked3dRenderElementLike[],
  bundleId: string,
): StudioBg3dSceneDocument | null {
  const scenes = elements
    .filter((element) =>
      element.type === "image"
      && element.bg3dLtBundleId === bundleId
      && element.bg3dScene !== undefined)
    .map((element) => element.bg3dScene!);
  if (scenes.length === 0) return null;
  const serialized = scenes.map(serializeStudioBg3dSceneDocument);
  const first = serialized[0];
  if (!first || serialized.some((candidate) => candidate !== first)) return null;
  return scenes[0] ?? null;
}

export function resolveStudioScene3dLinkedLayerRoundTrip(input: {
  readonly bundleId: string;
  readonly linked3dRender: unknown;
  readonly shared3dStage: StudioShared3dStagePersistedState;
  readonly elements: readonly LinkedLayerElement[];
  readonly authorityId?: string;
}): StudioScene3dLinkedLayerBridgeResult {
  const pageDocument = parseStudioLinked3dRenderDocument(input.linked3dRender);
  if (!pageDocument) {
    return failure("invalid-linked-document", "Linked 3D sidecar 문서가 손상되었습니다.");
  }
  const link = pageDocument.links.find(({ bundleId }) => bundleId === input.bundleId);
  if (!link) return failure("missing-link", "선택한 3D bundle의 연결 정보를 찾지 못했습니다.");
  const crossReference = validateStudioLinked3dRenderDocumentAgainstPage({
    value: pageDocument,
    elements: input.elements,
    shared3dStage: input.shared3dStage,
  });
  if (!crossReference.ok) {
    return failure(
      "page-cross-reference-invalid",
      "Canvas 레이어·3D Stage·pass receipt 교차참조가 일치하지 않습니다.",
    );
  }
  const scene = canonicalSceneForBundle(input.elements, input.bundleId);
  if (!scene) {
    return failure(
      "missing-canonical-scene",
      "연결된 레이어에서 하나의 canonical BG3D SceneDocument를 복원하지 못했습니다.",
    );
  }
  if (scene.activeShotId !== link.shotId) {
    return failure(
      "shot-mismatch",
      "Canvas에 연결된 Shot과 SceneDocument의 활성 Shot이 다릅니다.",
    );
  }
  if (link.passRevision.sceneHash !== link.passRevision.sourceHash) {
    return failure(
      "scene-revision-diverged",
      "저장된 line pass가 다른 SceneDocument revision을 가리킵니다.",
    );
  }
  const sharedSceneSession = createStudioShared3dSceneSessionForStage(
    input.shared3dStage,
    input.elements,
    input.bundleId,
  );
  const authority = createStudioScene3dAuthority({
    authorityId: input.authorityId ?? `linked3d:${input.bundleId}`,
    bg3d: scene,
    sharedSceneSession,
    viewportAspectRatio: scene.output.exportAspectRatio,
    revision: link.passRevision.revision,
  });
  return Object.freeze({
    ok: true as const,
    bundleId: input.bundleId,
    shotId: link.shotId,
    sourceShotId: link.sourceShotId,
    stageSourceHash: link.stageSourceHash,
    authority,
    link,
    layerElementIds: Object.freeze(link.layers.map(({ elementId }) => elementId)),
    correctionElementIds: Object.freeze(link.corrections.map(({ elementId }) => elementId)),
    pageDocument,
  });
}

export interface StudioScene3dLinkedLayerEditProjection {
  readonly ok: boolean;
  readonly projection: StudioScene3dAuthorityProjection;
  readonly preservesShotIdentity: boolean;
  readonly correctionCount: number;
  readonly blockingMessages: readonly string[];
}

export function projectStudioScene3dLinkedLayerEdit(
  roundTrip: StudioScene3dLinkedLayerRoundTrip,
  editedDocument: StudioScene3dDocumentV1,
): StudioScene3dLinkedLayerEditProjection {
  const projection = projectStudioScene3dAuthorityToSources(
    roundTrip.authority,
    editedDocument,
  );
  const preservesShotIdentity = projection.bg3d.activeShotId === roundTrip.shotId;
  const blockingMessages = [
    ...projection.issues.map(({ message }) => message),
    ...(preservesShotIdentity
      ? []
      : ["Linked 3D round-trip은 Canvas와 결박된 Shot ID를 변경할 수 없습니다."]),
  ];
  return Object.freeze({
    ok: blockingMessages.length === 0,
    projection,
    preservesShotIdentity,
    correctionCount: roundTrip.correctionElementIds.length,
    blockingMessages: Object.freeze(blockingMessages),
  });
}
