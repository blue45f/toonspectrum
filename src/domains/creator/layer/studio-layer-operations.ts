import { preserveStudioBg3dLtSceneAnchorAfterRemoval } from "../bg3d/studio-bg3d-lt-layer-plan";
import { hasTrack, removeTrack, type AnimationTimelineDoc } from "../studio-anim-tracks";
import { elBounds } from "../studio-element-geometry";
import { planBindSelectionToFrameFolder } from "../studio-frame-folder";
import { selectionShapeForIds, type GroupSelectionState } from "../studio-group-selection";
import { uid } from "../studio-id";
import {
  createLayerGroup,
  emptyGroupIds,
  groupItems,
  moveLayerGroup,
  removeItemsFromGroups,
  removeLayerItems,
  type LayerGroup,
} from "../studio-layers";
import {
  createStudioPixelEditCanvas,
  encodeStudioPixelEditResultPng,
  loadStudioPixelEditImage,
  yieldStudioPixelEditMainThread,
} from "../studio-legacy-editor-runtime-helpers";
import {
  planStudioShared3dStageCollectionRemoval,
  studioShared3dStageCollectionEntries,
} from "../studio-shared-3d-stage-collection";

import {
  applyStudioLayerMergePlan,
  planStudioLayerFlattenVisible,
  planStudioLayerMergeDown,
  planStudioLayerMergeSelected,
  type StudioLayerMergePlan,
} from "./studio-layer-merge";

import type { StudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import type { El, ImageEl } from "../studio-element-model";
import type { StudioExtendedBlendModeId } from "../studio-extended-blend";
import type { PageState } from "../studio-page-state";
import type { StudioLayerNavigatorAction } from "./StudioLayerNavigator";
import type { SetStateAction } from "react";

/**
 * Editor surface the layer commands operate on. Values are captured per render (the
 * factory is invoked in the StudioPage body); refs stay refs so event-time reads see
 * the live value instead of their render-time closure.
 */
export interface StudioLayerOperationsContext {
  readonly elements: El[];
  readonly groups: LayerGroup[];
  readonly elementById: ReadonlyMap<string, El>;
  readonly selected: El | null | undefined;
  readonly selectedId: string | null;
  readonly activePage: PageState;
  readonly animTimeline: AnimationTimelineDoc;
  readonly masterEditMode: boolean;
  readonly pageEditLocked: boolean;
  readonly activeSurfaceReviewLocked: boolean;
  readonly layerMergeBusy: boolean;
  readonly extendedBlendMode: StudioExtendedBlendModeId;
  readonly extendedBlendOpacity: number;
  readonly coalesceKeyRef: { current: string | null };
  readonly activeGroupIdRef: { current: string | null };
  readonly shared3dStageMergeConflictReason: (removeIds: readonly string[]) => string | null;
  readonly beginLiveResourceEditAsync: (
    elementIds?: readonly string[] | null
  ) => Promise<boolean>;
  readonly endLiveResourceEdit: () => void;
  readonly commit: (
    nextElements: El[],
    extraPatch?: Partial<Omit<PageState, "id" | "elements">>,
    targetPageId?: string
  ) => boolean;
  readonly updateActivePage: (patch: Partial<Omit<PageState, "id">>) => void;
  readonly patchLayerItems: (
    ids: readonly string[],
    resolvePatch: (element: El) => Partial<El>,
    options?: { readonly coalesceKey?: string }
  ) => void;
  readonly groupSelectedElements: () => boolean;
  readonly ungroupSelectedElements: () => boolean;
  readonly deleteLayerGroup: (groupId: string) => void;
  readonly moveLayer: (id: string, dir: "up" | "down") => void;
  readonly applyGroupSelectionState: (next: GroupSelectionState) => void;
  readonly setError: (message: string | null) => void;
  readonly setLayerMergeBusy: (busy: boolean) => void;
  readonly setSelectedId: (id: string | null) => void;
  readonly setMarqueeIds: (action: SetStateAction<string[]>) => void;
  readonly setActiveGroupId: (id: string | null) => void;
  readonly announceDrawingShortcut: (message: string) => void;
}

export interface StudioLayerOperations {
  readonly commitLayerMergePlan: (
    result: ReturnType<typeof planStudioLayerMergeDown>
  ) => Promise<void>;
  readonly applyExtendedBlendMergeDown: () => Promise<void>;
  readonly handleLayerNavigatorAction: (action: StudioLayerNavigatorAction) => void;
  readonly deleteLayerElements: (ids: readonly string[]) => boolean;
}

/**
 * Layer merge / navigator-action / explicit-delete commands extracted from StudioPage.
 * Behavior-identical move: the bodies below are verbatim, with dependencies received
 * through {@link ctx} instead of component closure. The review-lock, master-edit and
 * live-resource gates stay inside the extracted code so every entry point keeps the
 * same authority contract.
 */
export function createStudioLayerOperations(
  ctx: StudioLayerOperationsContext,
): StudioLayerOperations {
  const {
    elements,
    groups,
    elementById,
    selected,
    selectedId,
    activePage,
    animTimeline,
    masterEditMode,
    pageEditLocked,
    activeSurfaceReviewLocked,
    layerMergeBusy,
    extendedBlendMode,
    extendedBlendOpacity,
    coalesceKeyRef,
    activeGroupIdRef,
    shared3dStageMergeConflictReason,
    beginLiveResourceEditAsync,
    endLiveResourceEdit,
    commit,
    updateActivePage,
    patchLayerItems,
    groupSelectedElements,
    ungroupSelectedElements,
    deleteLayerGroup,
    moveLayer,
    applyGroupSelectionState,
    setError,
    setLayerMergeBusy,
    setSelectedId,
    setMarqueeIds,
    setActiveGroupId,
    announceDrawingShortcut,
  } = ctx;

  async function commitLayerMergePlan(
    result: ReturnType<typeof planStudioLayerMergeDown>
  ) {
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    if (masterEditMode) {
      setError("마스터 편집 중에는 레이어 병합을 사용할 수 없어요.");
      return;
    }
    if (pageEditLocked && !masterEditMode) {
      setError("이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 레이어를 편집해 주세요.");
      return;
    }
    if (layerMergeBusy) return;
    const sharedStageConflict = shared3dStageMergeConflictReason(result.plan.removeIds);
    if (sharedStageConflict) {
      setError(sharedStageConflict);
      return;
    }
    if (!(await beginLiveResourceEditAsync(result.plan.removeIds))) return;
    setLayerMergeBusy(true);
    try {
      const plan: StudioLayerMergePlan = result.plan;
      const {
        bakeStudioMergeComposite,
        planStudioMergeBakeMode,
      } = await import("./studio-layer-merge-bake");
      const sources = plan.removeIds
        .map((id) => elements.find((element) => element.id === id))
        .filter((element): element is El => Boolean(element))
        .map((element) => {
          const bounds = elBounds(element);
          return {
            id: element.id,
            type: element.type,
            src: element.type === "image" ? element.src : undefined,
            x: bounds.x,
            y: bounds.y,
            width: Math.max(1, bounds.w),
            height: Math.max(1, bounds.h),
            opacity: element.opacity,
            rotation: "rotation" in element ? Number(element.rotation ?? 0) : 0,
            flipped: element.type === "image" ? element.flipped : undefined,
            flippedY: element.type === "image" ? element.flippedY : undefined,
          };
        });
      const mode = planStudioMergeBakeMode(sources);
      if (mode.mode === "raster") {
        const baked = await bakeStudioMergeComposite({
          plan,
          sources,
          newId: uid(),
        });
        if (baked.ok && baked.mode === "raster") {
          const composite: ImageEl = {
            ...baked.composite,
            rotation: 0,
          };
          const next = applyStudioLayerMergePlan(elements, plan, composite) as El[];
          commit(next);
          setSelectedId(composite.id);
          setMarqueeIds([]);
          setError(null);
          return;
        }
        if (!baked.ok) {
          setError(baked.reason);
          return;
        }
      }
      // Mixed vector/raster or bake unavailable — non-destructive group merge (single undo).
      const group = createLayerGroup(uid(), plan.resultName);
      updateActivePage({
        groups: [...groups, group],
        elements: groupItems(elements, [...plan.removeIds], group.id) as El[],
      });
      setError(null);
    } finally {
      setLayerMergeBusy(false);
      endLiveResourceEdit();
    }
  }

  // 확장 블렌드 병합 — commitLayerMergePlan과 동일한 게이트/잠금/단일 undo 계약을 따르되,
  // 소스 2장을 각자 공유 좌표계 캔버스에 래스터한 뒤 studio-extended-blend 엔진으로 합성한다.
  async function applyExtendedBlendMergeDown() {
    if (selected?.type !== "image") return;
    const result = planStudioLayerMergeDown({ items: elements, groups, selectedId: selected.id });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    if (masterEditMode) {
      setError("마스터 편집 중에는 레이어 병합을 사용할 수 없어요.");
      return;
    }
    if (pageEditLocked && !masterEditMode) {
      setError("이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 레이어를 편집해 주세요.");
      return;
    }
    if (layerMergeBusy) return;
    const sharedStageConflict = shared3dStageMergeConflictReason(result.plan.removeIds);
    if (sharedStageConflict) {
      setError(sharedStageConflict);
      return;
    }
    if (!(await beginLiveResourceEditAsync(result.plan.removeIds))) return;
    setLayerMergeBusy(true);
    try {
      const plan = result.plan;
      const { studioMergeBoundsFromSources } = await import("./studio-layer-merge-bake");
      const { blendExtended, extendedBlendModeLabel } = await import("../studio-extended-blend");
      const sources = plan.removeIds
        .map((id) => elements.find((element) => element.id === id))
        .filter((element): element is El => Boolean(element))
        .map((element) => {
          const bounds = elBounds(element);
          return {
            id: element.id,
            type: element.type,
            src: element.type === "image" ? element.src : undefined,
            x: bounds.x,
            y: bounds.y,
            width: Math.max(1, bounds.w),
            height: Math.max(1, bounds.h),
            opacity: element.opacity,
            rotation: "rotation" in element ? Number(element.rotation ?? 0) : 0,
            flipped: element.type === "image" ? element.flipped : undefined,
            flippedY: element.type === "image" ? element.flippedY : undefined,
          };
        });
      const ordered = [...plan.sources]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((entry) => sources.find((source) => source.id === entry.id))
        .filter((source): source is (typeof sources)[number] => Boolean(source));
      if (ordered.length !== 2 || ordered.some((source) => source.type !== "image" || !source.src)) {
        setError("이미지 레이어끼리만 확장 블렌드로 합칠 수 있습니다.");
        return;
      }
      const bounds = studioMergeBoundsFromSources(ordered, plan.bounds);
      const width = Math.max(1, Math.ceil(bounds.width));
      const height = Math.max(1, Math.ceil(bounds.height));
      // 소스별로 "각자" 캔버스에 병합 bake와 동일 레시피(회전/반전/불투명도)로 그려 픽셀을 뽑는다.
      const layers: ImageData[] = [];
      for (const source of ordered) {
        const image = await loadStudioPixelEditImage(source.src!);
        const made = createStudioPixelEditCanvas(width, height);
        if (!made) throw new Error("캔버스를 만들 수 없습니다.");
        const ctx = made.ctx;
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.globalAlpha = Math.min(1, Math.max(0, source.opacity ?? 1));
        const cx = source.x - bounds.x + source.width / 2;
        const cy = source.y - bounds.y + source.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate(((source.rotation ?? 0) * Math.PI) / 180);
        ctx.scale(source.flipped ? -1 : 1, source.flippedY ? -1 : 1);
        ctx.drawImage(image, -source.width / 2, -source.height / 2, source.width, source.height);
        ctx.restore();
        layers.push(ctx.getImageData(0, 0, width, height));
      }
      const blended = blendExtended(layers[0]!, layers[1]!, extendedBlendMode, extendedBlendOpacity);
      const made = createStudioPixelEditCanvas(width, height);
      if (!made) throw new Error("캔버스를 만들 수 없습니다.");
      const outImage = made.ctx.createImageData(width, height);
      outImage.data.set(blended.data);
      made.ctx.putImageData(outImage, 0, 0);
      await yieldStudioPixelEditMainThread();
      const src = await encodeStudioPixelEditResultPng(made.canvas);
      // name은 ImageEl 리터럴이 아닌 병합 계약(StudioMergeBakeComposite)과 동일하게 spread로 싣는다.
      const composite: ImageEl = {
        ...{ name: `확장 블렌드 ${extendedBlendModeLabel(extendedBlendMode)}` },
        id: uid(),
        type: "image",
        src,
        x: bounds.x,
        y: bounds.y,
        width,
        height,
        rotation: 0,
        opacity: 1,
      };
      commit(applyStudioLayerMergePlan(elements, plan, composite) as El[]);
      setSelectedId(composite.id);
      setMarqueeIds([]);
      setError(null);
    } catch (err) {
      console.error("Failed to apply extended blend merge:", err);
      setError("확장 블렌드를 적용하지 못했습니다(이미지 픽셀 읽기/인코딩 실패).");
    } finally {
      setLayerMergeBusy(false);
      endLiveResourceEdit();
    }
  }

  function handleLayerNavigatorAction(action: StudioLayerNavigatorAction) {
    if (pageEditLocked && !masterEditMode) {
      // 드래그 중 프리뷰는 포인터가 움직이는 동안 초당 수십 번 들어온다. 잠긴 페이지에서
      // 표본마다 토스트를 띄우면 안내가 아니라 폭주다 — 조용히 무시하고, 사용자가 포인터를
      // 놓는 순간 오는 확정 액션 하나만 잠금 사유를 알린다.
      if (action.type === "set-items-opacity" && action.live) return;
      setError("이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 레이어를 편집해 주세요.");
      return;
    }
    switch (action.type) {
      case "group-selection":
        groupSelectedElements();
        return;
      case "ungroup-selection":
        ungroupSelectedElements();
        return;
      case "create-group": {
        if (masterEditMode) return;
        const seedIds = [...new Set(action.seedIds)].filter((id) => elementById.has(id));
        if (
          seedIds.some((id) => {
            const element = elementById.get(id);
            return element?.groupId !== undefined;
          })
        ) {
          const message =
            "기존 그룹이 포함된 선택이에요. 먼저 그룹을 해제한 뒤 새 그룹을 만들어 주세요.";
          setError(message);
          announceDrawingShortcut(message);
          return;
        }
        const group = createLayerGroup(uid(), `그룹 ${groups.length + 1}`);
        updateActivePage({
          groups: [...groups, group],
          elements: seedIds.length > 0 ? (groupItems(elements, seedIds, group.id) as El[]) : elements,
        });
        if (seedIds.length > 0) {
          applyGroupSelectionState({
            ...selectionShapeForIds(seedIds),
            activeGroupId: null,
          });
        }
        return;
      }
      case "create-frame-folder": {
        if (masterEditMode) return;
        const frame = elements.find((el) => el.id === action.frameId && el.type === "frame");
        if (!frame) {
          setError("컷 폴더로 묶을 프레임을 찾지 못했어요.");
          return;
        }
        const plan = planBindSelectionToFrameFolder({
          frameId: frame.id,
          frameLabel: ("name" in frame && typeof frame.name === "string" && frame.name.trim())
            ? frame.name
            : "컷",
          groupId: uid(),
          seedIds: action.seedIds,
          items: elements,
          groups,
        });
        if (!plan) {
          setError("컷 폴더에 묶을 다른 레이어를 먼저 선택해 주세요.");
          return;
        }
        updateActivePage({
          groups: [...groups, plan.group],
          elements: plan.items as El[],
        });
        announceDrawingShortcut(
          plan.clearedNoClipIds.length > 0
            ? `컷 폴더 · ${plan.memberIds.length}개 레이어 · 패널 클립 켬`
            : `컷 폴더 · ${plan.memberIds.length}개 레이어`
        );
        return;
      }
      case "rename-item":
        patchLayerItems([action.id], () => ({ name: action.name.trim().slice(0, 160) }));
        return;
      case "rename-group": {
        if (masterEditMode) return;
        const name = action.name.trim().slice(0, 160);
        const current = groups.find((group) => group.id === action.groupId);
        if (!name || !current || current.name === name) return;
        updateActivePage({
          groups: groups.map((group) =>
            group.id === action.groupId ? { ...group, name } : group
          ),
        });
        return;
      }
      case "set-group-flag": {
        if (masterEditMode) return;
        const current = groups.find((group) => group.id === action.groupId);
        if (!current || current[action.flag] === action.value) return;
        updateActivePage({
          groups: groups.map((group) =>
            group.id === action.groupId ? { ...group, [action.flag]: action.value } : group
          ),
        });
        return;
      }
      case "set-items-hidden":
        patchLayerItems(action.ids, () => ({ hidden: action.hidden }));
        return;
      case "set-items-locked":
        patchLayerItems(action.ids, () => ({ locked: action.locked }));
        return;
      case "set-items-opacity": {
        const opacity = Math.min(1, Math.max(0, action.opacity));
        // 스크러버가 포인터를 놓기 전에도 문서에 값을 넣어야 캔버스 픽셀이 실시간으로 따라온다.
        // 표본마다 `commit()`을 부르면 undo가 1%마다 하나씩 쌓이므로, 같은 키의 연속 표본을
        // 최상단 스냅샷 교체로 합치는 `commitCoalesced`로 보낸다 — 라이브 반영 + ⌘Z 1회.
        // 확정 표본(live 없음)은 같은 키로 한 번 더 합친 뒤 체인을 끊어, 다음 제스처가 이번
        // 제스처의 히스토리 항목에 빨려 들어가지 않게 한다.
        const coalesceKey = `opacity:${[...action.ids].join(",")}`;
        patchLayerItems(action.ids, () => ({ opacity }), { coalesceKey });
        if (!action.live) coalesceKeyRef.current = null;
        return;
      }
      case "merge-down": {
        void commitLayerMergePlan(
          planStudioLayerMergeDown({
            items: elements,
            groups,
            selectedId: action.id,
          })
        );
        return;
      }
      case "flatten-visible": {
        void commitLayerMergePlan(
          planStudioLayerFlattenVisible({ items: elements, groups })
        );
        return;
      }
      case "merge-selected": {
        void commitLayerMergePlan(
          planStudioLayerMergeSelected({
            items: elements,
            groups,
            selectedIds: action.ids,
          })
        );
        return;
      }
      case "set-item-flag":
        patchLayerItems([action.id], () => ({ [action.flag]: action.value } as Partial<El>));
        return;
      case "assign-items-to-group": {
        if (masterEditMode) return;
        const requestedIds = new Set(action.ids.filter((id) => elementById.has(id)));
        if (requestedIds.size === 0) return;
        if (!action.groupId) {
          const next = removeItemsFromGroups(elements, [...requestedIds]) as El[];
          if (next !== elements) updateActivePage({ elements: next });
          return;
        }
        if (!groups.some((group) => group.id === action.groupId)) return;
        const memberIds = elements
          .filter((element) => element.groupId === action.groupId || requestedIds.has(element.id))
          .map((element) => element.id);
        updateActivePage({ elements: groupItems(elements, memberIds, action.groupId) as El[] });
        return;
      }
      case "set-items-role":
        patchLayerItems(action.ids, () => ({ layerRole: action.role }));
        return;
      case "set-items-color":
        patchLayerItems(action.ids, () => ({ layerColor: action.color }));
        return;
      case "move-item":
        moveLayer(action.id, action.direction);
        return;
      case "move-group": {
        if (masterEditMode) return;
        const next = moveLayerGroup(elements, action.groupId, action.direction) as El[];
        if (next !== elements) commit(next);
        return;
      }
      case "ungroup":
        if (!masterEditMode) deleteLayerGroup(action.groupId);
        return;
      case "delete-items": {
        deleteLayerElements(action.ids);
        return;
      }
    }
  }

  // 삭제 버튼·Delete 키·퀵 액션·내비게이터가 모두 같은 명시적 삭제 정책을 사용한다. 잠금은
  // 이동/변형을 막지만 사용자가 직접 요청한 삭제는 허용하며, 실제로 제거된 ID의 타임라인만 함께 지운다.
  function deleteLayerElements(ids: readonly string[]) {
    if (activeSurfaceReviewLocked) {
      setError("이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 레이어를 삭제해 주세요.");
      return false;
    }
    const removal = removeLayerItems(elements, ids);
    if (removal.removedIds.length === 0) return false;
    const idSet = new Set(removal.removedIds);
    const trackedDeleted = removal.removedIds.filter((id) => hasTrack(animTimeline, id));
    const nextTimeline = trackedDeleted.reduce(
      (document, id) => removeTrack(document, id),
      animTimeline
    );
    const nextItemsBeforeVisibilityRelease = preserveStudioBg3dLtSceneAnchorAfterRemoval<El, StudioBg3dSceneDocument>(
      elements,
      removal.items
    );
    const sharedStages = studioShared3dStageCollectionEntries(activePage.shared3dStage);
    const survivingBundleIds = new Set(nextItemsBeforeVisibilityRelease.flatMap((element) =>
      element.type === "image" && element.bg3dLtBundleId
        ? [element.bg3dLtBundleId]
        : []));
    const removedSharedStageBundleIds = sharedStages?.flatMap((stage) =>
      survivingBundleIds.has(stage.background.bundleId)
        ? []
        : [stage.background.bundleId]) ?? [];
    const stageRemoval = removedSharedStageBundleIds.length > 0
      ? planStudioShared3dStageCollectionRemoval({
          value: activePage.shared3dStage,
          bundleIds: removedSharedStageBundleIds,
          elements: nextItemsBeforeVisibilityRelease,
        })
      : null;
    if (removedSharedStageBundleIds.length > 0 && !stageRemoval) {
      setError("삭제할 3D 배경의 원본 연결을 안전하게 정리하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
      return false;
    }
    const visibilityRelease = stageRemoval ?? {
      nextState: activePage.shared3dStage,
      nextElements: nextItemsBeforeVisibilityRelease,
      restoredElementIds: [] as readonly string[],
    };
    const nextItems = [...visibilityRelease.nextElements];
    const removedGroupIds = new Set(
      elements
        .filter((element) => idSet.has(element.id) && element.groupId)
        .map((element) => element.groupId as string)
    );
    const emptyAfterRemoval = new Set(emptyGroupIds(nextItems, groups));
    const groupsEmptiedByRemoval = new Set(
      [...removedGroupIds].filter((groupId) => emptyAfterRemoval.has(groupId))
    );
    const committed = commit(
      nextItems,
      {
        ...(trackedDeleted.length > 0 ? { animTimeline: nextTimeline } : {}),
        ...(removedSharedStageBundleIds.length > 0
          ? { shared3dStage: visibilityRelease.nextState }
          : {}),
        ...(groupsEmptiedByRemoval.size > 0
          ? { groups: groups.filter((group) => !groupsEmptiedByRemoval.has(group.id)) }
          : {}),
      }
    );
    if (!committed) return false;
    if (visibilityRelease.restoredElementIds.length > 0) {
      announceDrawingShortcut(
        `공유 3D 배경을 삭제하고 캐릭터 원본 ${visibilityRelease.restoredElementIds.length}개를 다시 표시했어요`,
      );
    }
    if (
      activeGroupIdRef.current &&
      groupsEmptiedByRemoval.has(activeGroupIdRef.current)
    ) {
      // 마지막 자식을 삭제해 그룹 메타데이터까지 정리한 경우 그룹 진입 상태도 같은
      // 트랜잭션 결과에 맞춰 해제한다. 존재하지 않는 그룹의 자식 선택 규칙이 남으면
      // 다음 클릭이 "유령 그룹" 내부 선택처럼 동작한다.
      activeGroupIdRef.current = null;
      setActiveGroupId(null);
    }
    if (selectedId && idSet.has(selectedId)) setSelectedId(null);
    setMarqueeIds((current) => current.filter((id) => !idSet.has(id)));
    return true;
  }

  return {
    commitLayerMergePlan,
    applyExtendedBlendMergeDown,
    handleLayerNavigatorAction,
    deleteLayerElements,
  };
}
