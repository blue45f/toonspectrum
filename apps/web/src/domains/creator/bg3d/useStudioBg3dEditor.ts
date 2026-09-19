/* Extracted from StudioBackground3D. Closures keep original identifiers via an `any` host bag. */
// @ts-nocheck
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).
import * as R from "./studio-bg3d-editor-runtime-bindings";
import { useStudioBg3dInplaceTools } from "./useStudioBg3dInplaceTools";
import { isStudioBg3dPhysicsTransientPhase } from "./studio-bg3d-physics-ui";
import { useStudioBg3dEditorState } from "./useStudioBg3dEditorState";
import { bindStudioBg3dEditorViewModel } from "./studio-bg3d-editor-view-model";
import { bindStudioBg3dEditorSelectionViewModel } from "./studio-bg3d-editor-selection-view-model";
import { bindStudioBg3dEditorLayoutViewModel } from "./studio-bg3d-editor-layout-view-model";
import { attachStudioBg3dEditorHosts } from "./studio-bg3d-editor-attach-hosts";
import { bindStudioBg3dEditorSceneGraph } from "./StudioBg3dEditorSceneGraph";
import { useStudioBg3dEditorEffects } from "./useStudioBg3dEditorEffects";
import { useStudioBg3dEditorRestoreEffects } from "./useStudioBg3dEditorRestoreEffects";
import { createStudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";
import {
  applyStudioBg3dOutlinerSelectionEffect,
  planStudioBg3dOutlinerMutation,
} from "./studio-bg3d-outliner-mutation";

import type { StudioBg3dOutlinerMutationAction } from "./studio-bg3d-outliner-mutation";

export function useStudioBg3dEditor(props) {
  const {
    createStudioBg3dHistorySnapshot,
    createStudioBg3dModelImportActions,
    duplicateBgCustomModelInstance,
    duplicatePrimitive,
    planStudioBg3dSceneEntityRemoval,
  } = R;
  const h = useStudioBg3dEditorState(props);
  bindStudioBg3dEditorViewModel(h);
  bindStudioBg3dEditorSelectionViewModel(h);
  bindStudioBg3dEditorLayoutViewModel(h);
  attachStudioBg3dEditorHosts(h);
  const actions = createStudioBg3dModelImportActions({
    attachmentByStorageModelIdRef: h.attachmentByStorageModelIdRef,
    canAdmitSceneNodes: h.canAdmitSceneNodes,
    cancelCustomModelPlacement: h.cancelCustomModelPlacement,
    captureInFlightRef: h.captureInFlightRef,
    commitSceneEntityRemoval: h.commitSceneEntityRemoval,
    destructiveMutationGuardRef: h.destructiveMutationGuardRef,
    deviceQuality: h.deviceQuality,
    genericModelClassifications: h.genericModelClassifications,
    invalidateModelThumbnailCaptures: h.invalidateModelThumbnailCaptures,
    isModalAssetSessionCurrent: h.isModalAssetSessionCurrent,
    isRestoringScene: h.isRestoringScene,
    modalAssetSessionRef: h.modalAssetSessionRef,
    modelImportAbortRef: h.modelImportAbortRef,
    modelLoadPendingRef: h.modelLoadPendingRef,
    modelRenderer: h.modelRenderer,
    modelRootCacheRef: h.modelRootCacheRef,
    physicsRuntimeSourceRef: h.physicsRuntimeSourceRef,
    replaceCanonicalDocumentState: h.replaceCanonicalDocumentState,
    placementSessionRef: h.placementSessionRef,
    sceneBaseDocument: h.sceneBaseDocument,
    sceneRestoreAbortRef: h.sceneRestoreAbortRef,
    setCustomModels: h.setCustomModels,
    setDeletingModelId: h.setDeletingModelId,
    setError: h.setError,
    setGenericModelClassifications: h.setGenericModelClassifications,
    setGenericModelSourceFormats: h.setGenericModelSourceFormats,
    setIsUploadingModel: h.setIsUploadingModel,
    setModelImportProgress: h.setModelImportProgress,
    setModelLibrary: h.setModelLibrary,
    setModelLibraryStatus: h.setModelLibraryStatus,
    setRefTick: h.setRefTick,
    setSelectedIds: h.setSelectedIds,
    startModelThumbnailCaptureBatch: h.startModelThumbnailCaptureBatch,
    storageModelIdByAttachmentIdRef: h.storageModelIdByAttachmentIdRef,
  });
  h.handleDeleteModelFromLibrary = actions.handleDeleteModelFromLibrary;
  h.handleUploadModelFiles = actions.handleUploadModelFiles;
  h.importMarketplaceModelFiles = actions.importModelFiles;
  h.marketplaceModelId = props.marketplaceModelId;
  h.inplaceTools = useStudioBg3dInplaceTools({
    live: h.physicsRuntimeSourceRef, selectedIds: h.selectedIds, session: h.modalAssetSessionRef.current,
    ready: h.open && !h.isRestoringScene && !h.physicsInteractionLocked && !h.isCapturing && !h.isBatchRenderingShots,
    renderer: h.modelRenderer, quality: h.deviceQuality, cache: h.modelRootCacheRef.current,
    attachments: h.attachmentByStorageModelIdRef.current, storageIds: h.storageModelIdByAttachmentIdRef.current,
    isSessionCurrent: h.isModalAssetSessionCurrent,
    isBlocked: () => h.captureInFlightRef.current || h.sceneRestoreAbortRef.current !== null || h.modelImportAbortRef.current !== null || h.destructiveMutationGuardRef.current.blocksClose || isStudioBg3dPhysicsTransientPhase(h.physicsPhaseRef.current) || h.placementSessionRef.current.phase === "preview",
    replace: h.replaceCanonicalDocumentState, commitHistory: h.commitImmediateHistoryTransition,
    notify: () => h.setRefTick((value) => value + 1),
  });
  bindStudioBg3dEditorSceneGraph(h);

  const outlinerMutationDependencies = {
    duplicatePrimitive,
    duplicateModel: duplicateBgCustomModelInstance,
    planRemoval: planStudioBg3dSceneEntityRemoval,
  };

  const applyOutlinerMutation = (action: StudioBg3dOutlinerMutationAction) => {
    const live = h.physicsRuntimeSourceRef.current;
    const plan = planStudioBg3dOutlinerMutation({
      snapshot: live,
      action,
      dependencies: outlinerMutationDependencies,
    });
    if (!plan.ok) {
      if (plan.reason === "remove-failed") {
        h.setError("부모를 삭제해도 자식의 월드 변환을 보존할 수 없어 삭제를 취소했습니다.");
      }
      return;
    }

    const before = createStudioBg3dHistorySnapshot(live);
    h.commitImmediateHistoryTransition(
      plan.snapshot.primitives,
      plan.snapshot.customModels,
      plan.snapshot.document,
      before,
      {
        commandId: plan.command.id,
        label: plan.command.label,
        source: plan.command.source,
      },
    );
    h.replaceCanonicalDocumentState({
      primitives: plan.snapshot.primitives,
      customModels: plan.snapshot.customModels,
      document: plan.snapshot.document,
    });
    h.setSelectedIds((current) =>
      applyStudioBg3dOutlinerSelectionEffect(current, plan.selection));
    h.setError(null);
  };

  h.outlinerController = createStudioBg3dSceneOutlinerController({
    query: h.layerQuery,
    items: h.layerListItems,
    filteredItems: h.filteredLayerItems,
    hierarchy: h.sceneHierarchy,
    selectedIds: h.selectedIds,
    primitiveColors: new Map(h.primitives.map((primitive) => [primitive.id, primitive.color])),
    onQueryChange: h.setLayerQuery,
    onSelect: (id, mode) => {
      h.setSelectedSharedCharacterElementId?.(null);
      h.setSelectedIds((current) => {
        if (mode === "replace") return new Set([id]);
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    onRename: (item) => {
      const name = window.prompt("새 이름을 입력하세요", item.label);
      if (name === null) return;
      applyOutlinerMutation({ type: "rename", item, name });
    },
    onToggleVisibility: (item) =>
      applyOutlinerMutation({ type: "toggle-visibility", item }),
    onToggleLock: (item) =>
      applyOutlinerMutation({ type: "toggle-lock", item }),
    onDuplicate: (item) => {
      if (!h.canAdmitSceneNodes(1)) return;
      applyOutlinerMutation({ type: "duplicate", item });
    },
    onRemove: (item) => applyOutlinerMutation({ type: "remove", item }),
  });
  h.handleOpenPrecisionModeler = props.onOpenPrecisionModeler
    ? () => {
        const scene = h.readCurrentCanonicalScene?.("precision-modeler");
        if (!scene) return;
        try {
          props.onOpenPrecisionModeler(scene);
        } catch (error) {
          console.error(error);
          h.setError("정밀 모델링 워크스페이스로 안전하게 전환하지 못했습니다. 현재 3D 장면은 그대로 유지됩니다.");
        }
      }
    : undefined;
  useStudioBg3dEditorEffects(h);
  useStudioBg3dEditorRestoreEffects(h);
  return h;
}
