import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import {
  completeStudioDrawingPracticeDocument,
  createStudioDrawingPracticeDocument,
  patchStudioDrawingPracticeDocument,
  relinkStudioDrawingPracticeSource,
  resetStudioDrawingPracticePlacement,
  retryStudioDrawingPracticeDocument,
  type StudioDrawingPracticeDocument,
  type StudioDrawingPracticeView,
} from "./studio-drawing-practice-document";
import { resolveStudioDrawingPracticeAsset } from "./studio-drawing-practice-runtime";
import { uid } from "./studio-id";
import { createLayerGroup, type LayerGroup } from "./studio-layers";

import type { StudioAsset } from "./studio-asset-library";
import type { PageState } from "./studio-page-state";
import type { StudioDrawingPracticeSourceState } from "./StudioDrawingPracticeBar";
import type { StudioDrawingPracticeStartRequest } from "./StudioReferencePanel";

interface DrawingPracticePreview {
  readonly pageId: string;
  readonly source: StudioDrawingPracticeDocument;
  readonly document: StudioDrawingPracticeDocument;
}

export interface UseStudioDrawingPracticeRuntimeInput {
  readonly traceRequested: boolean;
  readonly activePage: PageState;
  readonly currentPageId: string;
  readonly assets: readonly StudioAsset[];
  readonly assetsLoaded: boolean;
  readonly assetsLoading: boolean;
  readonly masterEditMode: boolean;
  readonly activePageMutationLocked: boolean;
  readonly canvasWidth: number;
  readonly readCurrentPages: () => PageState[];
  readonly readCurrentPageId: () => string;
  readonly readAssets: () => StudioAsset[];
  readonly replaceAssets: (assets: StudioAsset[]) => void;
  readonly setAssetsLoaded: (loaded: boolean) => void;
  readonly loadAssets: () => void;
  readonly markDocumentChanged: () => boolean;
  readonly commitPages: (pages: PageState[]) => boolean;
  readonly setError: (message: string | null) => void;
  readonly preloadReferencePanel: () => void;
  readonly setReferencePanelOpen: (open: boolean) => void;
  readonly clearSelection: () => void;
  readonly activateDrawTool: () => void;
  readonly announce: (message: string) => void;
}

export interface StudioDrawingPracticeViewProps {
  readonly drawingPracticeDocument: StudioDrawingPracticeDocument | null;
  readonly drawingPracticeSourceDataUrl: string | null;
  readonly drawingPracticeSourceState: StudioDrawingPracticeSourceState;
  readonly drawingPracticeCompareActive: boolean;
  readonly setDrawingPracticeCompareActive: (active: boolean) => void;
  readonly previewDrawingPracticeView: (patch: Partial<StudioDrawingPracticeView>) => void;
  readonly commitDrawingPracticeView: (patch: Partial<StudioDrawingPracticeView>) => void;
  readonly cancelDrawingPracticePreview: () => void;
  readonly finishDrawingPractice: () => void;
  readonly retryDrawingPractice: () => void;
  readonly resetDrawingPracticePlacement: () => void;
  readonly removeDrawingPractice: () => void;
  readonly openDrawingPracticeReferencePanel: () => void;
}

export interface StudioDrawingPracticeRuntime {
  readonly targetGroupId: string | null;
  readonly start: (request: StudioDrawingPracticeStartRequest) => void;
  readonly commitView: (patch: Partial<StudioDrawingPracticeView>) => void;
  readonly viewProps: StudioDrawingPracticeViewProps;
}

export function useStudioDrawingPracticeRuntime(
  input: UseStudioDrawingPracticeRuntimeInput,
): StudioDrawingPracticeRuntime {
  const [preview, setPreview] = useState<DrawingPracticePreview | null>(null);
  const [compareActive, setCompareActive] = useState(false);
  const traceInstructionAnnouncedRef = useRef(false);
  const { traceRequested, currentPageId, assetsLoaded, assetsLoading } = input;
  const openTraceFromEffect = useEffectEvent(() => {
    input.preloadReferencePanel();
    input.setReferencePanelOpen(true);
    if (traceInstructionAnnouncedRef.current) return;
    traceInstructionAnnouncedRef.current = true;
    input.announce("레퍼런스를 선택한 뒤 ‘이 이미지로 따라 그리기’를 누르세요.");
  });
  const loadAssetsFromEffect = useEffectEvent(() => input.loadAssets());

  useEffect(() => {
    if (traceRequested) openTraceFromEffect();
  }, [traceRequested]);

  useEffect(() => {
    setPreview(null);
    setCompareActive(false);
  }, [currentPageId]);

  const persisted = input.activePage.drawingPractice ?? null;
  const document = useMemo(() => {
    if (preview?.pageId === input.activePage.id && preview.source === persisted) {
      return preview.document;
    }
    return persisted;
  }, [input.activePage.id, persisted, preview]);
  const sourceAsset = useMemo(
    () => resolveStudioDrawingPracticeAsset(document, input.assets),
    [document, input.assets],
  );
  const sourceState: StudioDrawingPracticeSourceState = sourceAsset
    ? "ready"
    : input.assetsLoading || !input.assetsLoaded
      ? "loading"
      : "missing";
  const targetGroupId = document?.status === "active"
    && document.targetGroupId
    && input.activePage.groups?.some((group) => group.id === document.targetGroupId)
      ? document.targetGroupId
      : null;

  useEffect(() => {
    if (!document || assetsLoading || assetsLoaded) return;
    loadAssetsFromEffect();
  }, [assetsLoaded, assetsLoading, document]);

  const createResultGroup = useCallback((attemptIndex: number): LayerGroup => (
    createLayerGroup(uid(), `따라 그리기 ${attemptIndex}회차`)
  ), []);

  const commitDocument = useCallback((
    nextDocument: StudioDrawingPracticeDocument | null,
    options: { readonly resultGroup?: LayerGroup } = {},
  ): boolean => {
    if (input.masterEditMode || input.activePageMutationLocked) {
      input.setError("현재 페이지가 잠겨 있어 따라 그리기 가이드를 변경할 수 없어요.");
      return false;
    }
    const latest = input.readCurrentPages();
    const target = latest.find((page) => page.id === input.readCurrentPageId());
    if (!target) {
      input.setError("현재 페이지를 찾지 못해 따라 그리기 가이드를 변경하지 않았어요.");
      return false;
    }
    if (!input.markDocumentChanged()) return false;
    const nextPages = latest.map((page): PageState => {
      if (page !== target) return page;
      const currentGroups = page.groups ?? [];
      const resultGroup = options.resultGroup;
      const nextGroups = resultGroup && !currentGroups.some((group) => group.id === resultGroup.id)
        ? [...currentGroups, resultGroup]
        : page.groups;
      if (nextDocument) {
        return {
          ...page,
          ...(nextGroups === undefined ? {} : { groups: nextGroups }),
          drawingPractice: nextDocument,
        };
      }
      const { drawingPractice: _drawingPractice, ...rest } = page;
      return rest as PageState;
    });
    const committed = input.commitPages(nextPages);
    if (committed) {
      setPreview(null);
      setCompareActive(false);
      input.setError(null);
    }
    return committed;
  }, [input]);

  const start = useCallback((request: StudioDrawingPracticeStartRequest): void => {
    const target = input.readCurrentPages().find((page) => page.id === input.readCurrentPageId());
    if (!target) {
      input.setError("현재 페이지를 찾지 못해 따라 그리기를 시작하지 않았어요.");
      return;
    }
    const source = {
      ...request.item.asset,
      assetId: request.asset.id,
      name: request.asset.name,
      width: request.asset.width,
      height: request.asset.height,
    };
    const existing = target.drawingPractice;
    const currentAssets = input.readAssets();
    const existingSourceMissing = Boolean(existing && !resolveStudioDrawingPracticeAsset(existing, currentAssets));
    if (!currentAssets.some((asset) => asset.id === request.asset.id)) {
      input.replaceAssets([...currentAssets, request.asset]);
    }
    input.setAssetsLoaded(true);
    const viewport = { canvasWidth: input.canvasWidth, canvasHeight: target.canvasH };
    if (existing && existingSourceMissing) {
      let relinked = relinkStudioDrawingPracticeSource(existing, source, viewport);
      const existingGroupAvailable = Boolean(
        relinked.targetGroupId && target.groups?.some((group) => group.id === relinked.targetGroupId),
      );
      const resultGroup = existingGroupAvailable ? undefined : createResultGroup(relinked.attemptIndex);
      if (resultGroup) {
        relinked = patchStudioDrawingPracticeDocument(relinked, { targetGroupId: resultGroup.id }, viewport);
      }
      if (!commitDocument(relinked, { resultGroup })) return;
      input.setReferencePanelOpen(false);
      input.clearSelection();
      input.activateDrawTool();
      input.announce("누락된 따라 그리기 원본을 다시 연결했어요.");
      return;
    }
    const resultGroup = createResultGroup(1);
    const next = createStudioDrawingPracticeDocument({
      attemptId: uid(),
      source,
      viewport,
      purpose: target.elements.length > 0 ? "production-assist" : "practice",
      targetGroupId: resultGroup.id,
    });
    if (!commitDocument(next, { resultGroup })) return;
    input.setReferencePanelOpen(false);
    input.clearSelection();
    input.activateDrawTool();
    input.announce("선택한 이미지를 따라 그리기 가이드로 배치했어요.");
  }, [commitDocument, createResultGroup, input]);

  const previewView = useCallback((patch: Partial<StudioDrawingPracticeView>): void => {
    if (!persisted) return;
    const base = preview?.pageId === input.activePage.id && preview.source === persisted
      ? preview.document
      : persisted;
    setPreview({
      pageId: input.activePage.id,
      source: persisted,
      document: patchStudioDrawingPracticeDocument(
        base,
        { view: patch },
        { canvasWidth: input.canvasWidth, canvasHeight: input.activePage.canvasH },
      ),
    });
  }, [input.activePage.canvasH, input.activePage.id, input.canvasWidth, persisted, preview]);

  const commitView = useCallback((patch: Partial<StudioDrawingPracticeView>): void => {
    const target = input.readCurrentPages().find((page) => page.id === input.readCurrentPageId());
    const persistedTarget = target?.drawingPractice;
    if (!target || !persistedTarget) return;
    const base = preview?.pageId === target.id && preview.source === persistedTarget
      ? preview.document
      : persistedTarget;
    const next = patchStudioDrawingPracticeDocument(
      base,
      { view: patch },
      { canvasWidth: input.canvasWidth, canvasHeight: target.canvasH },
    );
    if (!commitDocument(next) || next.view.mode !== "reference-window") return;
    input.preloadReferencePanel();
    input.setReferencePanelOpen(true);
  }, [commitDocument, input, preview]);

  const finish = useCallback((): void => {
    if (!document) return;
    const completed = completeStudioDrawingPracticeDocument(document);
    commitDocument({ ...completed, view: { ...completed.view, visible: false, locked: true } });
  }, [commitDocument, document]);

  const retry = useCallback((): void => {
    if (!document) return;
    const resultGroup = createResultGroup(Math.min(9_999, document.attemptIndex + 1));
    const retried = retryStudioDrawingPracticeDocument(document, uid(), resultGroup.id);
    if (!commitDocument(retried, { resultGroup })) return;
    input.clearSelection();
    input.activateDrawTool();
    input.announce(`따라 그리기 ${retried.attemptIndex}회차를 시작했어요.`);
  }, [commitDocument, createResultGroup, document, input]);

  const resetPlacement = useCallback((): void => {
    if (!document) return;
    const reset = resetStudioDrawingPracticePlacement(
      document,
      { canvasWidth: input.canvasWidth, canvasHeight: input.activePage.canvasH },
    );
    if (commitDocument(reset)) input.announce("따라 그리기 원본을 페이지에 맞춰 다시 배치했어요.");
  }, [commitDocument, document, input]);

  const remove = useCallback((): void => {
    if (commitDocument(null)) input.announce("가이드만 제거했어요. 그린 내용은 그대로 유지됩니다.");
  }, [commitDocument, input]);

  const openReferencePanel = useCallback((): void => {
    input.preloadReferencePanel();
    input.setReferencePanelOpen(true);
  }, [input]);

  return {
    targetGroupId,
    start,
    commitView,
    viewProps: {
      drawingPracticeDocument: document,
      drawingPracticeSourceDataUrl: sourceAsset?.dataUrl ?? null,
      drawingPracticeSourceState: sourceState,
      drawingPracticeCompareActive: compareActive,
      setDrawingPracticeCompareActive: setCompareActive,
      previewDrawingPracticeView: previewView,
      commitDrawingPracticeView: commitView,
      cancelDrawingPracticePreview: () => setPreview(null),
      finishDrawingPractice: finish,
      retryDrawingPractice: retry,
      resetDrawingPracticePlacement: resetPlacement,
      removeDrawingPractice: remove,
      openDrawingPracticeReferencePanel: openReferencePanel,
    },
  };
}
