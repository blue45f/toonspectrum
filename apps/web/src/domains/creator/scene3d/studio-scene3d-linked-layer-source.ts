import {
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { studioBg3dFocalLengthToFovDegrees } from "../bg3d/studio-bg3d-lens";
import { isStudioLinked3dPassRevisionForScene } from "../studio-linked-3d-pass-transaction";
import {
  parseStudioLinked3dRenderDocument,
  validateStudioLinked3dRenderDocumentAgainstPage,
  type StudioLinked3dRenderElementLike,
} from "../studio-linked-3d-render-document";
import type { StudioShared3dStagePersistedState } from "../studio-shared-3d-stage-collection";
import type { StudioShared3dStageElementSource } from "../studio-shared-3d-stage-document";

type LinkedLayerElement = StudioLinked3dRenderElementLike & StudioShared3dStageElementSource;

/** 단일 PNG와 예전 bundle도 편집 중 원고의 승인 원본 객체를 직접 바꾸지 않는다. */
export function snapshotStudioScene3dLinkedLayerEditSource(
  scene: StudioBg3dSceneDocument,
): StudioBg3dSceneDocument | null {
  const serialized = serializeStudioBg3dSceneDocument(scene);
  return serialized ? parseStudioBg3dSceneDocument(serialized) : null;
}

export interface StudioScene3dLinkedLayerReviewState {
  readonly pinnedCutId: string | null;
  readonly pinnedSourceHash: string | null;
  readonly pinnedCutRevision: number | null;
  readonly pinnedApproval: "draft" | "approved" | "needs-review" | null;
  readonly cameraNeedsReview: boolean;
  readonly sceneNeedsReview: boolean;
  readonly screenSpaceReviewElementIds: readonly string[];
  readonly surfaceReviewElementIds: readonly string[];
  readonly automaticSurfaceReprojection: false;
  readonly message: string;
}

function sameRenderValues(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) <= 1e-8;
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameRenderValues(value, right[index]));
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  const entries = Object.entries(left);
  const other = new Map(Object.entries(right));
  return entries.length === other.size && entries.every(([key, value]) => other.has(key) && sameRenderValues(value, other.get(key)));
}

function renderBody(scene: StudioBg3dSceneDocument, aspectRatio: number) {
  const { camera: _camera, shots: _shots, activeShotId: _activeShot, pinnedVersionedCut: _pin, ...body } = scene;
  const direction = (values: readonly number[]) => {
    const length = Math.hypot(...values);
    return length > 1e-9 ? values.map((value) => value / length) : values;
  };
  return {
    ...body,
    lighting: {
      ...body.lighting,
      key: { ...body.lighting.key, direction: direction(body.lighting.key.direction) },
      fill: { ...body.lighting.fill, direction: direction(body.lighting.fill.direction) },
    },
    output: {
      ...body.output,
      // projection에서 자동 비율을 현재 픽셀 비율로 고정하는 것은 화면 변경이 아니다.
      exportAspectRatio: Math.round(body.output.exportHeight * (body.output.exportAspectRatio ?? aspectRatio)) / body.output.exportHeight,
      transparentBackground: body.output.transparentBackground || body.background.mode === "transparent",
    },
  };
}

/** 원본 승인과 새 화면의 보정 검토를 구분한다. 이 읽기 모델은 승인 상태를 바꾸지 않는다. */
export function describeStudioScene3dLinkedLayerReview(input: {
  readonly scene: StudioBg3dSceneDocument;
  readonly bundleId?: string;
  readonly linked3dRender?: unknown;
}): StudioScene3dLinkedLayerReviewState | null {
  const cut = input.scene.pinnedVersionedCut;
  const sameNumbers = (left: readonly number[], right: readonly number[]) => left.length === right.length
    && left.every((value, index) => Math.abs(value - right[index]) <= 1e-8);
  const camera = input.scene.camera;
  const cameraNeedsReview = cut !== undefined && (
    !sameNumbers(camera.position, cut.camera.position)
    || !sameNumbers(camera.target, cut.camera.target)
    || !sameNumbers(camera.up ?? [0, 1, 0], cut.camera.up)
    || !sameNumbers(camera.lensShift ?? [0, 0], cut.camera.lensShift)
    || Math.abs(camera.fovDegrees - studioBg3dFocalLengthToFovDegrees(cut.camera.focalLengthMm)) > 1e-8
    || (camera.projection ?? "perspective") !== cut.camera.projection
    || Math.abs((camera.nearClip ?? 0.03) - cut.camera.near) > 1e-8
    || (cut.camera.projection === "orthographic"
      && Math.abs((camera.zoom ?? 1) - 5 / cut.camera.orthoScale) > 1e-8)
  );
  const aspectRatio = cut ? cut.source.scene.output.width / cut.source.scene.output.height : 1;
  const sceneNeedsReview = cut !== undefined && (!cut.source.legacyBg3d
    || !sameRenderValues(renderBody(input.scene, aspectRatio), renderBody(cut.source.legacyBg3d, aspectRatio)));
  const document = parseStudioLinked3dRenderDocument(input.linked3dRender);
  const link = document?.links.find((entry) => entry.bundleId === input.bundleId);
  const screenSpaceReviewElementIds = new Set(
    link?.corrections.filter((entry) => cameraNeedsReview || sceneNeedsReview || entry.status === "conflict"
      || entry.sourcePassRevision !== link.passRevision.revision).map((entry) => entry.elementId) ?? [],
  );
  const surfaceReviewElementIds = new Set<string>();
  for (const correction of cut?.corrections ?? []) {
    if (correction.status !== "needs-review" && !cameraNeedsReview && !sceneNeedsReview) continue;
    if (correction.kind === "screen-space") screenSpaceReviewElementIds.add(correction.elementId);
    else surfaceReviewElementIds.add(correction.elementId);
  }
  if (!cut && screenSpaceReviewElementIds.size === 0 && surfaceReviewElementIds.size === 0) return null;
  const approval = cut?.status === "approved" ? "승인" : cut?.status === "needs-review" ? "재검토 필요" : "초안";
  const messages = [
    ...(cut ? [`고정 컷 ${cut.name} · 버전 ${cut.revision} · 원본 ${approval}`] : []),
    ...(cameraNeedsReview ? ["현재 화면의 카메라가 고정 컷과 달라 재검토 필요"] : []),
    ...(sceneNeedsReview ? ["현재 장면·모델·포즈가 고정 컷 원본과 달라 재검토 필요"] : []),
    ...(screenSpaceReviewElementIds.size > 0
      ? [`화면 좌표 보정 ${screenSpaceReviewElementIds.size}개 재검토 필요`]
      : []),
    ...(surfaceReviewElementIds.size > 0
      ? [`표면 부착 보정 ${surfaceReviewElementIds.size}개 재부착 검토 필요 · 자동 재투영 미지원`]
      : []),
  ];
  return Object.freeze({
    pinnedCutId: cut?.id ?? null,
    pinnedSourceHash: cut?.sourceHash ?? null,
    pinnedCutRevision: cut?.revision ?? null,
    pinnedApproval: cut?.status ?? null,
    cameraNeedsReview,
    sceneNeedsReview,
    screenSpaceReviewElementIds: Object.freeze([...screenSpaceReviewElementIds]),
    surfaceReviewElementIds: Object.freeze([...surfaceReviewElementIds]),
    automaticSurfaceReprojection: false as const,
    message: messages.join(" · "),
  });
}

export type StudioScene3dCanonicalSceneLookup =
  | { readonly ok: true; readonly scene: StudioBg3dSceneDocument }
  | { readonly ok: false; readonly reason: "missing" | "diverged" };

/** 2D 재편집과 Scene3D bridge가 같은 검증 및 독립 원본 스냅샷을 사용한다. */
export function resolveCanonicalStudioBg3dSceneForBundle(
  elements: readonly StudioLinked3dRenderElementLike[],
  bundleId: string,
): StudioScene3dCanonicalSceneLookup {
  const scenes = elements.flatMap((element) =>
    element.type === "image"
    && element.bg3dLtBundleId === bundleId
    && element.bg3dScene !== undefined
      ? [element.bg3dScene]
      : []);
  if (scenes.length === 0) return { ok: false, reason: "missing" };
  const serialized = scenes.map(serializeStudioBg3dSceneDocument);
  const first = serialized[0];
  if (!first || serialized.some((candidate) => candidate !== first)) {
    return { ok: false, reason: "diverged" };
  }
  // 저장 복원 직후의 page 객체는 가변일 수 있다. 편집 세션이 원본 참조를 공유하지 않는다.
  const scene = parseStudioBg3dSceneDocument(first);
  return scene ? { ok: true, scene } : { ok: false, reason: "diverged" };
}

/**
 * Resolves only the canonical BG3D edit source needed by the 2D editor.
 * Scene3D authority construction stays behind the specialist lazy boundary.
 */
export function resolveStudioScene3dLinkedLayerEditSource(input: {
  readonly bundleId: string;
  readonly linked3dRender: unknown;
  readonly shared3dStage: StudioShared3dStagePersistedState;
  readonly elements: readonly LinkedLayerElement[];
}): StudioBg3dSceneDocument | null {
  const pageDocument = parseStudioLinked3dRenderDocument(input.linked3dRender);
  if (!pageDocument) return null;
  const link = pageDocument.links.find(({ bundleId }) => bundleId === input.bundleId);
  if (!link) return null;
  const sceneLookup = resolveCanonicalStudioBg3dSceneForBundle(input.elements, input.bundleId);
  if (!sceneLookup.ok) return null;
  const scene = sceneLookup.scene;
  if (scene.activeShotId !== link.shotId) return null;
  if (!isStudioLinked3dPassRevisionForScene(link.passRevision, scene)) return null;
  const crossReference = validateStudioLinked3dRenderDocumentAgainstPage({
    value: pageDocument,
    elements: input.elements,
    shared3dStage: input.shared3dStage,
  });
  return crossReference.ok ? scene : null;
}
