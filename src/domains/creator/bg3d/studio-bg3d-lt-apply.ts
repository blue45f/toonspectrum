import {
  normalizeStudioDrawingAssistDocument,
  type StudioDrawingAssistDocument,
} from "../brush/studio-drawing-assist-document";
import { CANVAS_W } from "../studio-assets";
import { uid } from "../studio-id";
import { isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import {
  ensureStudioLinked3dRenderShot,
  parseStudioLinked3dRenderDocument,
} from "../studio-linked-3d-render-document";
import {
  planStudioShared3dCapturedSourceLayerVisibility,
} from "../studio-shared-3d-scene-bridge";
import {
  migrateStudioShared3dStageCollectionDocument,
  planStudioShared3dStageCollectionRemoval,
  planStudioShared3dStageCollectionUpsert,
  studioShared3dStageEntryAsDocument,
  studioShared3dStageReusableHiddenCharacterElementIds,
} from "../studio-shared-3d-stage-collection";
import {
  createStudioShared3dStageDocument,
  resolveStudioShared3dStageBundleIdForElement,
} from "../studio-shared-3d-stage-document";

import {
  planStudioBg3dEditableCompositeDetach,
} from "./studio-bg3d-editable-composite-detach-plan";

import type {
  StudioBg3dEditableCompositeDetachSuccess,
} from "./studio-bg3d-editable-composite-detach-plan";
import type { StudioBg3dLtLayerPlanSuccess } from "./studio-bg3d-lt-layer-plan";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBackground3DInsertResult } from "../scene-3d/studio-3d-insert-contract";
import type { El } from "../studio-element-model";
import type { StudioLinked3dRenderDocument } from "../studio-linked-3d-render-document";
import type { PageState } from "../studio-page-state";
import type {
  StudioShared3dSourceLayerVisibilityPlan,
} from "../studio-shared-3d-scene-bridge";
import type {
  StudioShared3dStageCollectionDocument,
  StudioShared3dStageCollectionMutation,
} from "../studio-shared-3d-stage-collection";
import type { StudioShared3dStageDccSource } from "../studio-shared-3d-stage-document";

/**
 * Pure planning half of StudioPage's applyBg3dRenderedImage, extracted verbatim as staged
 * planners. Every helper is side-effect free: guard failures come back as `{ ok: false }`
 * results the thin apply wrapper in StudioPage turns into setError + abort, and all document
 * inputs arrive explicitly (ref values are read synchronously by the wrapper before planning).
 */
export interface StudioBg3dLtApplyFailure {
  readonly ok: false;
  readonly message: string;
}

type StudioBg3dLinkedCharacterCapture =
  NonNullable<StudioBackground3DInsertResult["linkedCharacterCapture"]>;
type StudioBg3dCapturedStagePlacements =
  StudioBg3dLinkedCharacterCapture["stagePlacements"];
type StudioBg3dSharedStageMutationKind =
  NonNullable<StudioBackground3DInsertResult["sharedStageMutation"]>["kind"];

/** Resolves the linked Canvas Shot for the incoming render without inventing DCC provenance. */
export function resolveStudioBg3dLtLinkedScene(input: {
  readonly activePage: Pick<PageState, "elements" | "shared3dStage">;
  readonly result: StudioBackground3DInsertResult;
  readonly targetElementId: string | undefined;
  readonly dccSource: StudioShared3dStageDccSource | null;
}): StudioBg3dLtApplyFailure | {
  readonly ok: true;
  readonly dccLinked: boolean;
  readonly removingLinkedRender: boolean;
  readonly linkedScene: StudioBg3dSceneDocument;
  readonly renderResult: StudioBackground3DInsertResult;
} {
  const { activePage, result, targetElementId, dccSource } = input;
  const targetBundleId = resolveStudioShared3dStageBundleIdForElement(
    activePage.elements,
    targetElementId,
  );
  const existingDccSource = studioShared3dStageEntryAsDocument(
    activePage.shared3dStage,
    targetBundleId,
  )?.dccSource;
  const dccLinked = dccSource !== null || existingDccSource !== undefined;
  const removingLinkedRender = result.sharedStageMutation?.kind === "unlink";
  const linkedScene = removingLinkedRender
    ? result.bg3dScene
    : ensureStudioLinked3dRenderShot(result.bg3dScene, {
        // A DCC handoff has an explicit sourceShotId↔sceneShotId mapping. Inventing a Canvas Shot
        // when no mapped Scene shot is active would silently break that provenance chain.
        allowCreate: !dccLinked,
      });
  if (!linkedScene || (!removingLinkedRender && !linkedScene.activeShotId)) {
    return {
      ok: false,
      message: dccLinked
        ? "DCC에서 전달한 Shot을 먼저 선택하거나 새 Shot을 캡처한 뒤 Canvas에 추가해 주세요."
        : "현재 3D 뷰를 저장 가능한 Shot으로 확정하지 못해 Canvas를 바꾸지 않았어요.",
    };
  }
  const renderResult = linkedScene === result.bg3dScene
    ? result
    : { ...result, bg3dScene: linkedScene };
  return { ok: true, dccLinked, removingLinkedRender, linkedScene, renderResult };
}

/** Gates and plans the "keep the 3D source, flatten the bundle" detach materialization. */
export function planStudioBg3dLtDetachComposite(input: {
  readonly renderResult: StudioBackground3DInsertResult;
  readonly plan: StudioBg3dLtLayerPlanSuccess<El>;
  readonly targetElementId: string | undefined;
  readonly pageLocked: boolean;
}): StudioBg3dLtApplyFailure | {
  readonly ok: true;
  readonly detachEditableComposite: boolean;
  readonly detachPlan: StudioBg3dEditableCompositeDetachSuccess<El> | null;
} {
  const { renderResult, plan, targetElementId, pageLocked } = input;
  const detachEditableComposite =
    renderResult.materialization?.kind === "detached-editable-composite";
  if (
    detachEditableComposite
    && (
      !targetElementId
      || renderResult.sharedStageMutation?.kind !== "unlink"
      || renderResult.linkedCharacterCapture !== undefined
      || renderResult.magicFilterMask !== undefined
    )
  ) {
    return {
      ok: false,
      message: "3D 원본을 유지한 한 장 정리는 기존 배경의 캐릭터 연결을 안전하게 해제할 때만 사용할 수 있어요.",
    };
  }
  const detachPlan = detachEditableComposite
    ? planStudioBg3dEditableCompositeDetach<El, StudioBg3dSceneDocument>({
        plan,
        compositePngDataUrl: renderResult.compositePngDataUrl,
        pageLocked,
        expected: {
          bundleId: plan.bundleId,
          groupId: plan.groupId,
          anchorElementId: plan.anchorElementId,
        },
      })
    : null;
  if (detachPlan && !detachPlan.ok) {
    return { ok: false, message: detachPlan.message };
  }
  return { ok: true, detachEditableComposite, detachPlan };
}

/** Validates the captured VRM identity/placement receipts shipped with the render. */
export function resolveStudioBg3dCapturedCharacterPlacements(input: {
  readonly renderResult: StudioBackground3DInsertResult;
}): StudioBg3dLtApplyFailure | {
  readonly ok: true;
  readonly capturedCharacterElementIds: readonly string[];
  readonly capturedCharacterPlacements: StudioBg3dCapturedStagePlacements;
} {
  const { renderResult } = input;
  const capturedCharacterElementIds =
    renderResult.linkedCharacterCapture?.kind === "full-fidelity-linked-vrm-capture"
      ? renderResult.linkedCharacterCapture.elementIds
      : [];
  const capturedCharacterPlacements =
    renderResult.linkedCharacterCapture?.kind === "full-fidelity-linked-vrm-capture"
      ? renderResult.linkedCharacterCapture.stagePlacements
      : [];
  if (
    capturedCharacterPlacements.length !== capturedCharacterElementIds.length
    || new Set(capturedCharacterPlacements.map(({ elementId }) => elementId)).size
      !== capturedCharacterPlacements.length
    || capturedCharacterElementIds.some((elementId) =>
      !capturedCharacterPlacements.some((placement) => placement.elementId === elementId))
  ) {
    return {
      ok: false,
      message: "이 배경의 캐릭터 배치 확인 정보가 일치하지 않아 원본과 다른 배경은 바꾸지 않았어요.",
    };
  }
  return { ok: true, capturedCharacterElementIds, capturedCharacterPlacements };
}

/** Migrates the page's Stage collection and plans shared character source visibility. */
export function planStudioBg3dSharedCharacterVisibility(input: {
  readonly shared3dStage: PageState["shared3dStage"];
  readonly elements: readonly El[];
  readonly capturedCharacterElementIds: readonly string[];
  readonly groups: LayerGroup[];
}): StudioBg3dLtApplyFailure | {
  readonly ok: true;
  readonly currentStageCollection: StudioShared3dStageCollectionDocument | undefined;
  readonly sharedCharacterVisibility: Extract<
    StudioShared3dSourceLayerVisibilityPlan<El>,
    { readonly ok: true }
  >;
} {
  const { shared3dStage, elements, capturedCharacterElementIds, groups } = input;
  const currentStageCollection = shared3dStage === undefined
    ? undefined
    : migrateStudioShared3dStageCollectionDocument(shared3dStage);
  if (shared3dStage !== undefined && !currentStageCollection) {
    return {
      ok: false,
      message: "공유 3D 장면 연결 정보가 손상되어 기존 연결을 덮어쓰지 않았어요. 연결 상태를 확인해 주세요.",
    };
  }
  const reusableHiddenCharacterIds = studioShared3dStageReusableHiddenCharacterElementIds(
    currentStageCollection,
    elements,
  );
  const sharedCharacterVisibility = planStudioShared3dCapturedSourceLayerVisibility({
    elements,
    capturedElementIds: capturedCharacterElementIds,
    isLocked: (element) => isEffectivelyLocked(element, groups),
    reusableHiddenElementIds: reusableHiddenCharacterIds,
  });
  if (!sharedCharacterVisibility.ok) {
    return { ok: false, message: sharedCharacterVisibility.message };
  }
  return {
    ok: true,
    currentStageCollection: currentStageCollection ?? undefined,
    sharedCharacterVisibility,
  };
}

/** Projects mapped perspective guides into the page's drawing assist document, if any. */
export function planStudioBg3dLtDrawingAssist(input: {
  readonly mappedGuides: readonly { readonly x: number; readonly y: number }[];
  readonly activePageId: string;
  readonly currentStudioDrawingAssistDocument: () => {
    readonly document: StudioDrawingAssistDocument;
    readonly page: { readonly id: string; readonly canvasH: number };
  } | null;
}): StudioDrawingAssistDocument | undefined {
  const { mappedGuides, activePageId, currentStudioDrawingAssistDocument } = input;
  const drawingAssistState = mappedGuides.length > 0
    ? currentStudioDrawingAssistDocument()
    : null;
  return drawingAssistState?.page.id === activePageId
    ? normalizeStudioDrawingAssistDocument({
        ...drawingAssistState.document,
        perspective: {
          ...drawingAssistState.document.perspective,
          active: true,
          points: mappedGuides.map((point) => ({ id: uid(), x: point.x, y: point.y })),
        },
        isometric: { ...drawingAssistState.document.isometric, active: false },
        advanced: {
          ...drawingAssistState.document.advanced,
          activeSnapRulerId: null,
        },
      }, {
        canvasWidth: CANVAS_W,
        canvasHeight: drawingAssistState.page.canvasH,
      })
    : undefined;
}

/** Plans the connect/refresh/relink/background-only/unlink Stage collection transition. */
export function planStudioBg3dSharedStageMutation(input: {
  readonly currentStageCollection: StudioShared3dStageCollectionDocument | undefined;
  readonly bundleId: string;
  readonly requestedMutationKind: StudioBg3dSharedStageMutationKind | undefined;
  readonly nextElements: readonly El[];
  readonly capturedCharacterElementIds: readonly string[];
  readonly capturedCharacterPlacements: StudioBg3dCapturedStagePlacements;
  readonly hiddenElementIds: readonly string[];
  readonly dccSource: StudioShared3dStageDccSource | null;
}): StudioBg3dLtApplyFailure | {
  readonly ok: true;
  readonly sharedStageMutationKind:
    StudioBg3dSharedStageMutationKind | "refresh" | "connect";
  readonly stageMutation: StudioShared3dStageCollectionMutation<El>;
} {
  const {
    currentStageCollection,
    bundleId,
    requestedMutationKind,
    nextElements,
    capturedCharacterElementIds,
    capturedCharacterPlacements,
    hiddenElementIds,
    dccSource,
  } = input;
  const priorTargetStage = studioShared3dStageEntryAsDocument(
    currentStageCollection,
    bundleId,
  );
  const sharedStageMutationKind = requestedMutationKind
    ?? (priorTargetStage ? "refresh" : "connect");
  const stageMutation = sharedStageMutationKind === "unlink"
    ? priorTargetStage
      ? planStudioShared3dStageCollectionRemoval({
          value: currentStageCollection,
          bundleIds: [bundleId],
          elements: nextElements,
        })
      : null
    : (() => {
        const provisionalStage = createStudioShared3dStageDocument({
          backgroundBundleId: bundleId,
          elements: nextElements,
          characterElementIds: capturedCharacterElementIds,
          hiddenByStageElementIds: [],
          dccSource: priorTargetStage?.dccSource ?? dccSource ?? undefined,
          capturePolicy: sharedStageMutationKind === "background-only"
            || capturedCharacterElementIds.length === 0
            ? "background-only"
            : "require-all-linked",
        });
        if (!provisionalStage) return null;
        const priorReceiptsById = new Map(
          currentStageCollection?.visibilityReceipts.map((receipt) =>
            [receipt.elementId, receipt.modelRuntimeKey] as const) ?? [],
        );
        const currentRuntimeKeysById = new Map(
          provisionalStage.characters.map((character) =>
            [character.elementId, character.modelRuntimeKey] as const),
        );
        const transferredVisibilityReceiptIds = capturedCharacterElementIds.filter(
          (elementId) =>
            hiddenElementIds.includes(elementId)
            || (
              sharedStageMutationKind === "relink"
              && priorReceiptsById.get(elementId)
                === currentRuntimeKeysById.get(elementId)
              && nextElements.some((element) =>
                element.id === elementId && element.hidden === true)
            ),
        );
        const stage = transferredVisibilityReceiptIds.length === 0
          ? provisionalStage
          : createStudioShared3dStageDocument({
              backgroundBundleId: bundleId,
              elements: nextElements,
              characterElementIds: capturedCharacterElementIds,
              hiddenByStageElementIds: transferredVisibilityReceiptIds,
              dccSource: provisionalStage.dccSource,
              capturePolicy: provisionalStage.capturePolicy,
            });
        return stage
          ? planStudioShared3dStageCollectionUpsert({
              value: currentStageCollection,
              stage,
              elements: nextElements,
              placementCaptures: capturedCharacterPlacements,
            })
          : null;
      })();
  if (!stageMutation || (sharedStageMutationKind !== "unlink" && !stageMutation.nextState)) {
    return {
      ok: false,
      message: "이 배경과 캐릭터 원본의 공유 연결을 안전하게 검증하지 못해 적용하지 않았어요.",
    };
  }
  return { ok: true, sharedStageMutationKind, stageMutation };
}

/** Parses the page's linked 3D Shot index and resolves the DCC source shot mapping. */
export function resolveStudioBg3dLinkedRenderState(input: {
  readonly linked3dRender: PageState["linked3dRender"];
  readonly activeShotId: StudioBg3dSceneDocument["activeShotId"];
  readonly dccShotMappings: readonly {
    readonly sourceShotId: string;
    readonly sceneShotId: string;
  }[];
}): StudioBg3dLtApplyFailure | {
  readonly ok: true;
  readonly currentLinkedRender: StudioLinked3dRenderDocument | undefined;
  readonly sourceShotId: string | undefined;
} {
  const { linked3dRender, activeShotId, dccShotMappings } = input;
  const currentLinkedRender = linked3dRender === undefined
    ? undefined
    : parseStudioLinked3dRenderDocument(linked3dRender);
  if (linked3dRender !== undefined && !currentLinkedRender) {
    return {
      ok: false,
      message: "연결된 3D Shot 인덱스가 손상되어 기존 링크를 덮어쓰지 않았어요.",
    };
  }
  const sourceShotId = dccShotMappings.find(
    (mapping) => mapping.sceneShotId === activeShotId,
  )?.sourceShotId;
  return { ok: true, currentLinkedRender: currentLinkedRender ?? undefined, sourceShotId };
}
