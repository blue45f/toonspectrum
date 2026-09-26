/*
 * Live drawing surface admission/controller extracted from StudioCuttoonEditorHost.
 * The host owns state; this module owns the renderer-selection and live-surface transition seam.
 */
import type { DrawEl } from "../studio-element-model";

// The host is a mutable runtime bag by design; keep the dynamic seam isolated to this adapter.
type StudioLiveSurfaceHost = Record<string, unknown>;

export function bindStudioDrawLiveSurfaces(h: StudioLiveSurfaceHost) {
  const host = h as Record<string, never>;
  const {
    STUDIO_POINTER_PREDICTION_ENABLED,
    STUDIO_VISIBLE_LIVE_INK_PREFERENCE,
    STUDIO_VISIBLE_LIVE_INK_SELECTION_ENABLED,
    activePage,
    announceDrawingShortcut,
    appendStudioLivingInkAuthoritativeSuffix,
    applyLiveStrokeBackendPresentationEffects,
    armTransientPenInkSurfaces,
    beginGpuLiveSourceJournal,
    beginGpuPinnedReceiptEpoch,
    beginLiveResourceEdit,
    beginLiveStrokeBackendAudit,
    buildGpuLiveStrokePlan,
    canUseStudioPointerPredictionForSession,
    cancelGpuPinnedRequestWatchdog,
    cancelLiveStrokeBackendAudit,
    checkpointPendingStroke,
    collaborationAccessRef,
    commitPendingStrokeBatchForAdmission,
    currentPageId,
    currentPageIdRef,
    decideStudioLiveInkBackend,
    discardStudioHokusaiLiveStroke,
    discardStudioLivingInkStroke,
    draftPreviewStoreRef,
    drawingGesturePreviewPublisherRef,
    drawingInputSettingsRef,
    drawingPointerTransportRef,
    drawingRef,
    endLiveResourceEdit,
    finishQueuedStudioDrawingPointer,
    flushDirectLiveDraft,
    flushDirectLiveDraftNow,
    flushPendingStrokeCommitsRef,
    gpuLingerRafRef,
    gpuLiveAcceptedRequestIdRef,
    gpuLiveInkPinnedRef,
    gpuLiveOperationOrderKeyRef,
    gpuLiveSourceJournalFirstStrokeIndexRef,
    gpuLiveSourceJournalRef,
    gpuLiveStrokePlannerRef,
    hokusaiLiveFinalizingRef,
    hokusaiLiveProviderRef,
    inkMeshLivePreviewRuntimeRef,
    isDirectLiveDraftEl,
    isStudioPixelPencilRenderMode,
    liveBrushPressureSamplesFor,
    liveDraftDirectRef,
    liveDraftLayerRef,
    liveDraftPendingRef,
    liveDraftRafRef,
    liveDraftVisualRef,
    liveDynamicBrushDraftDirectRef,
    liveDynamicBrushOverlayRendererRef,
    liveInkOverlayClearGenRef,
    liveInkOverlayRendererRef,
    liveInkStyleFor,
    liveRetainedMediaDraftDirectRef,
    liveRetainedMediaOverlayRendererRef,
    liveStampDraftDirectRef,
    liveStampOverlayRendererRef,
    liveWetInkDraftDirectRef,
    liveWetInkOverlayRendererRef,
    livingInkAdmissionReadinessRef,
    livingInkCoordinatorRef,
    livingInkFinalizingRef,
    livingInkMode,
    livingInkOverlaySurfaceRef,
    livingInkPhysicalModeEnabled,
    livingInkStrokeRef,
    livingInkWaterNoopStrokeIdsRef,
    nextGpuLiveOperationOrderKey,
    pendingGpuDrawAuthoritiesRef,
    pendingGpuStrokesRef,
    pendingStrokeAdmission,
    pendingStrokeAdmissionRef,
    pendingStrokeAdmissionScopeRef,
    pendingStrokeCommitsRef,
    postCorrection,
    releaseDrawingPointerSession,
    releasePendingStrokeCheckpoint,
    resolveStudioStampBrushStyle,
    resolveStudioStrokeSurfaceRoute,
    salvageRejectedStroke,
    scheduleLiveDrawPressure,
    selectStudioLiveStrokeMedia,
    setError,
    setLiveDraftShapeKind,
    setUnloadGuardArmed,
    stageRef,
    stopQuickShapeTracking,
    strokeAdmissionCommitFlushRef,
    studioCrdtDocumentRef,
    studioLiveBrushPressure,
    studioLiveInkFastOverlaySupportsStyle,
    studioLivingInkSupportsElement,
    studioPostCorrectionRunsDuringPointerContact,
    studioStrokeSurfaceEpochRef,
    studioStrokeSurfaceRouteRef,
    webGpuBackendRef,
    webGpuCanvasHandleRef
  } = host;

  return function beginStudioDrawLiveSurfaces(
    next: DrawEl,
    pointerSample: PointerEvent,
    strokeOrigin: Readonly<{ x: number; y: number }>,
    admission: {
      readonly pendingBackdrop?: boolean;
      readonly onAdmitted?: (stroke: DrawEl) => void;
      readonly pinnedMedia?: ReturnType<typeof selectStudioLiveStrokeMedia>;
    } = {},
  ): boolean {
    const { pinnedMedia } = admission;
    const selectedMedia = pinnedMedia ?? selectStudioLiveStrokeMedia(next, {
      livingInkPhysicalModeEnabled,
      retainedHasSettledStrokes: liveRetainedMediaOverlayRendererRef.current.hasSettledStrokes,
      explicitBackend: import.meta.env.VITE_STUDIO_LIVE_INK_BACKEND,
      hardwareReady: webGpuBackendRef.current === "webgpu" && webGpuCanvasHandleRef.current?.isBackendAvailable() === true,
      rolloutPrefersGpu: STUDIO_VISIBLE_LIVE_INK_PREFERENCE === "webgpu" && STUDIO_VISIBLE_LIVE_INK_SELECTION_ENABLED,
    });
    const deferSelectedSurface = (): boolean => {
      if (pinnedMedia) return false;
      const inputSettings = structuredClone(drawingInputSettingsRef.current);
      const capturedScope = {
        ...pendingStrokeAdmissionScopeRef.current,
        pageId: currentPageIdRef.current,
        generation: collaborationAccessRef.current.documentGeneration,
      };
      setUnloadGuardArmed(true);
      pendingStrokeAdmission().defer({
        stroke: next,
        scope: capturedScope,
        checkpoint: (stroke) => checkpointPendingStroke(stroke, capturedScope.pageId, capturedScope.generation),
        settled: (stroke, accepted) => releasePendingStrokeCheckpoint(stroke.id, accepted),
        recover: (stroke, reason) => {
          salvageRejectedStroke(stroke, "선택한 렌더러 입력 준비", reason, capturedScope.pageId, capturedScope.generation);
          if (drawingRef.current?.id !== stroke.id) return;
          // 이 획의 샘플러만 종료한다. 앞선 GPU 확정 표면과 Worker handoff는 건드리지 않는다.
          discardStudioLivingInkStroke(stroke.id);
          discardStudioHokusaiLiveStroke(stroke.id);
          drawingRef.current = null;
          releaseDrawingPointerSession();
          stopQuickShapeTracking();
          scheduleLiveDrawPressure(null);
          endLiveResourceEdit();
        },
        admit: (stroke, complete, finish) => {
          const providerState = selectedMedia.kind === "hokusai"
            ? hokusaiLiveProviderRef.current.state
            : selectedMedia.kind === "living-ink" ? livingInkAdmissionReadinessRef.current.state : null;
          if (providerState === "failed" || providerState === "unavailable") {
            if (complete) throw new Error("선택한 자연매체 Worker를 준비하지 못해 원본 입력을 획 복구에 보관했습니다.");
            return false;
          }
          if (livingInkFinalizingRef.current || hokusaiLiveFinalizingRef.current) return false;
          // 앞선 GPU 영수증이 늦게 도착한 경우 유휴 타이머가 없어도 같은 커밋 경계를 재시도한다.
          commitPendingStrokeBatchForAdmission(
            pendingStrokeCommitsRef.current !== null,
            strokeAdmissionCommitFlushRef,
            () => flushSync(() => flushPendingStrokeCommitsRef.current()),
          );
          if (pendingGpuStrokesRef.current.length > 0 || pendingGpuDrawAuthoritiesRef.current.length > 0
            || (admission.pendingBackdrop && pendingStrokeCommitsRef.current !== null)) return false;
          if (complete) {
            if (!studioCrdtDocumentRef.current && !beginLiveResourceEdit(undefined, "append-stroke")) return false;
            drawingRef.current = stroke;
            drawingInputSettingsRef.current = inputSettings;
          }
          if (!beginStudioDrawLiveSurfaces(stroke, pointerSample, strokeOrigin, { pinnedMedia: selectedMedia })) {
            if (complete) {
              drawingRef.current = null;
              drawingInputSettingsRef.current = null;
              endLiveResourceEdit();
              if (selectedMedia.kind !== "hokusai" && selectedMedia.kind !== "living-ink") {
                throw new Error("선택한 렌더러에서 획을 시작하지 못해 원본 입력을 획 복구에 보관했습니다.");
              }
            }
            return false;
          }
          admission.onAdmitted?.(stroke);
          if (complete) {
            if (finish) finish();
            else finishQueuedStudioDrawingPointer(stageRef.current, pointerSample, { consumeReleaseSample: false });
          } else flushDirectLiveDraftNow(stroke);
          return true;
        },
      });
      drawingGesturePreviewPublisherRef.current.cancel(next.id);
      announceDrawingShortcut("선택한 렌더러를 준비하는 동안 원본 입력을 보관합니다");
      return true;
    };
    if (livingInkFinalizingRef.current || hokusaiLiveFinalizingRef.current || admission.pendingBackdrop
      || (!pinnedMedia && (pendingStrokeAdmissionRef.current?.size ?? 0) > 0)) return deferSelectedSurface();
    // 다이렉트 라이브 초안 무장: 이 렌더(스트로크 시작) 이후 pointermove 는 React 를 거치지
    // 않는다. GPU 파인은 백엔드가 이미 준비된 경우에만 스트로크 단위로 한 번 결정한다.
    {
      // 새 획이 시작되면 대기 배치의 유휴 타이머를 보류한다 — 획 중간에 커밋 렌더(수백 ms)가
      // 끼어들지 않는다. 이 획이 끝나면 큐잉이 타이머를 다시 잡고, 취소/즉시커밋 경로는
      // 어차피 배치를 직접 소비한다.
      const pendingBatch = pendingStrokeCommitsRef.current;
      if (pendingBatch?.timer) {
        globalThis.clearTimeout(pendingBatch.timer);
        pendingBatch.timer = null;
      }
      // 이전 획이 아직 대기 배치에 있고 WebGPU 권한을 들고 있으면 아래 진입 가드가 새 표면
      // 작업을 통째로 거절한다 — 2초 유휴가 지나기 전에 두 번째 획을 그은 사람은 그 획을
      // 통째로 잃었다(실측: 해칭 간격 0.6초에서 100% 거절, "획을 시작하지 않았습니다" 배너).
      // 새 획이 시작된 이상 이전 획의 유휴 창은 끝났으므로 여기서 그 커밋을 끝낸다. 커밋과
      // 레이아웃 이펙트(표면 반납)가 같은 태스크 안에서 끝나야 아래 가드가 비워진 큐를 보므로
      // flushSync 다. 영수증을 아직 못 받은 획은 그대로 남고, 가드가 정직하게 거절한다.
      // Pointer contact always shows the raw append-only stroke. The fixed-lag engine remains
      // gated for future experiments, while production post-correction runs once on release.
      // Translucent/specialty paths stay isolated because retained overlap can flash alpha.
      commitPendingStrokeBatchForAdmission(
        pendingStrokeCommitsRef.current !== null
          && (pendingGpuStrokesRef.current.length > 0 || pendingGpuDrawAuthoritiesRef.current.length > 0),
        strokeAdmissionCommitFlushRef,
        () => flushSync(() => flushPendingStrokeCommitsRef.current()),
      );
      const pixelDirect = isStudioPixelPencilRenderMode(next.brush);
      const causalPostCorrectionEligible = !pixelDirect
        && studioPostCorrectionRunsDuringPointerContact()
        && isDirectLiveDraftEl(next)
        && postCorrection > 0
        && (next.opacity ?? 1) === 1
        && next.mode !== "eraser"
        && !next.fill
        && (next.symmetry?.type ?? "none") === "none";
      const overlayCandidate = !pixelDirect
        && isDirectLiveDraftEl(next)
        && (next.opacity ?? 1) === 1
        && liveInkOverlayRendererRef.current.isNativeSurfaceReady
        && studioLiveInkFastOverlaySupportsStyle(liveInkStyleFor(next));
      const pendingGpuAuthorityBlocksNewSurface =
        pendingGpuStrokesRef.current.length > 0
        || pendingGpuDrawAuthoritiesRef.current.length > 0;
      const rejectSelectedSurface = (providerLabel: string, detail: string): false => {
        cancelLiveStrokeBackendAudit(next.id);
        gpuLiveOperationOrderKeyRef.current = null;
        liveInkOverlayRendererRef.current.resetActive();
        liveWetInkOverlayRendererRef.current.resetActive();
        liveRetainedMediaOverlayRendererRef.current.resetActive();
        liveDynamicBrushOverlayRendererRef.current.resetActive();
        liveStampOverlayRendererRef.current.resetActive();
        if (!pinnedMedia) setError(`${providerLabel} 엔진을 현재 사용할 수 없어 획을 시작하지 않았습니다. ${detail}`);
        return false;
      };

      if (pendingGpuAuthorityBlocksNewSurface) {
        return deferSelectedSurface();
      }

      const livingInkAdmitted = (selectedMedia.kind === "living-ink")
        && beginStudioLivingInkStroke(next, pointerSample);
      if ((selectedMedia.kind === "living-ink") && !livingInkAdmitted) {
        return deferSelectedSurface();
      }

      const hokusaiPinned = (selectedMedia.kind === "hokusai")
        && beginStudioHokusaiLiveStroke(next);
      if ((selectedMedia.kind === "hokusai") && !hokusaiPinned) {
        return deferSelectedSurface();
      }

      const stampDirect = Boolean((selectedMedia.kind === "stamp")
        && selectedMedia.stampKind
        && liveStampOverlayRendererRef.current.begin(
          resolveStudioStampBrushStyle(
            selectedMedia.stampKind,
            {
              color: next.stroke,
              size: Math.max(1, next.strokeWidth),
              opacity: next.opacity ?? 1,
            },
            next.stamp,
            next.brush,
          ),
          next.points[0] ?? strokeOrigin.x,
          next.points[1] ?? strokeOrigin.y,
          next.pressures?.[0] ?? 0.5
        ));
      if ((selectedMedia.kind === "stamp") && !stampDirect) {
        return rejectSelectedSurface("스탬프", "선택한 스탬프 표면을 시작하지 못했습니다.");
      }

      // The WebGPU lane is either admitted as the selected provider or rejected. It never hands
      // the same stroke to Canvas2D/Konva after initialization, audit, or journal failure.
      const gpuStartEligible = (selectedMedia.kind === "webgpu")
        && webGpuBackendRef.current === "webgpu"
        && webGpuCanvasHandleRef.current?.isBackendAvailable() === true
        && gpuLiveStrokePlannerRef.current !== null;
      gpuLiveOperationOrderKeyRef.current = gpuStartEligible
        ? nextGpuLiveOperationOrderKey()
        : null;
      const gpuStartPlan = gpuStartEligible ? buildGpuLiveStrokePlan(next) : null;
      const liveInkBackendDecision = decideStudioLiveInkBackend({
        preference: (selectedMedia.kind === "webgpu") ? "webgpu" : "canvas2d",
        selectionEnabled: (selectedMedia.kind === "webgpu") ? STUDIO_VISIBLE_LIVE_INK_SELECTION_ENABLED : true,
        resolvedBackend: webGpuBackendRef.current,
        // Missing preparation is an unavailable WebGPU selection, never permission for Canvas2D.
        direct: overlayCandidate && gpuStartPlan !== null,
        postCorrectionActive: causalPostCorrectionEligible,
        mode: next.mode,
        fill: next.fill,
        opacity: next.opacity ?? 1,
        symmetryType: next.symmetry?.type ?? "none",
        preparedStroke: gpuStartPlan?.preparation,
      });
      const gpuPin = (selectedMedia.kind === "webgpu")
        && liveInkBackendDecision.status === "ready"
        && liveInkBackendDecision.backend === "webgpu";
      if ((selectedMedia.kind === "webgpu") && liveInkBackendDecision.status !== "ready") {
        return rejectSelectedSurface(
          "WebGPU 라이브 잉크",
          `선택 거부 사유: ${liveInkBackendDecision.reason}`,
        );
      }
      gpuLiveSourceJournalRef.current = null;
      gpuLiveSourceJournalFirstStrokeIndexRef.current = 0;
      if (gpuPin && !beginLiveStrokeBackendAudit(next.id, "webgpu")) {
        return rejectSelectedSurface("WebGPU 라이브 잉크", "백엔드 검증 세션을 시작하지 못했습니다.");
      }
      if (gpuPin && (!gpuStartPlan || !beginGpuLiveSourceJournal(next, gpuStartPlan))) {
        return rejectSelectedSurface("WebGPU 라이브 잉크", "복구 가능한 소스 저널을 만들지 못했습니다.");
      }

      // Canvas2D remains a manual compatibility engine. It is never reached from a WebGPU miss.
      liveInkOverlayClearGenRef.current += 1;
      let liveInkOverlayStarted = false;
      // 오버레이가 애초에 맡지 않는 획(지우개·채우기·대칭)은 시작 실패가 아니라 Konva 직접
      // 초안이 정상 경로다. 이 자격을 시작 조건과 거절 조건이 같이 써야, WebGPU 없는 기기에서
      // 표준 지우개가 "2D 표면을 시작하지 못했다"며 통째로 거부되는 일이 없다(실측: 지우개 획이
      // 화면에는 보이지만 문서·자동저장에 남지 않았다).
      const liveInkOverlayEligible = overlayCandidate
        && next.mode !== "eraser"
        && !next.fill
        && (next.symmetry?.type ?? "none") === "none";
      if ((selectedMedia.kind === "canvas2d")
        && liveInkBackendDecision.status === "ready"
        && liveInkBackendDecision.backend === "canvas2d"
        && liveInkOverlayEligible
      ) {
        const liveInkStyle = liveInkStyleFor(next);
        liveInkOverlayStarted = causalPostCorrectionEligible
          ? liveInkOverlayRendererRef.current.beginDeferred(liveInkStyle)
          : liveInkOverlayRendererRef.current.begin(
              liveInkStyle,
              next.points[0] ?? strokeOrigin.x,
              next.points[1] ?? strokeOrigin.y,
              studioLiveBrushPressure(next, next.pressures?.[0])
            );
      } else {
        // 다른 렌더러를 쓰는 새 획도 이전 커밋의 draw 영수증 대기 잉크를 지우면 안 된다.
        liveInkOverlayRendererRef.current.resetActive();
      }
      if ((selectedMedia.kind === "canvas2d") && liveInkOverlayEligible && !liveInkOverlayStarted) {
        return rejectSelectedSurface("Canvas2D 라이브 잉크", "명시적으로 선택한 2D 표면을 시작하지 못했습니다.");
      }

      const wetInkOverlayStarted = (selectedMedia.kind === "wet")
        && liveWetInkOverlayRendererRef.current.isNativeSurfaceReady
        && liveWetInkOverlayRendererRef.current.begin(next, {
          pageEpoch: currentPageId,
          hidden: next.hidden === true,
        }).status === "started";
      if ((selectedMedia.kind === "wet") && !wetInkOverlayStarted) {
        return rejectSelectedSurface("습식 매체", "선택한 습식 표면을 시작하지 못했습니다.");
      }

      const retainedMediaDirect = (selectedMedia.kind === "retained")
        && liveRetainedMediaOverlayRendererRef.current.begin(next).status === "started";
      if ((selectedMedia.kind === "retained") && !retainedMediaDirect) {
        return rejectSelectedSurface("리테인드 매체", "선택한 매체 표면을 시작하지 못했습니다.");
      }

      const dynamicBrushDirect = (selectedMedia.kind === "dynamic")
        && liveDynamicBrushOverlayRendererRef.current.begin(next).status === "started";
      if ((selectedMedia.kind === "dynamic") && !dynamicBrushDirect) {
        return rejectSelectedSurface("동적 브러시", "선택한 동적 표면을 시작하지 못했습니다.");
      }
      const strokeSurfaceRoute = resolveStudioStrokeSurfaceRoute({
        strokeId: next.id,
        pointerId: Math.max(0, pointerSample.pointerId),
        strokeEpoch: studioStrokeSurfaceEpochRef.current++,
        livingInk: {
          eligible: studioLivingInkSupportsElement(next, livingInkPhysicalModeEnabled),
          providerState: livingInkAdmissionReadinessRef.current.state,
          capabilitiesAccepted: livingInkAdmissionReadinessRef.current.state === "ready",
          admitted: livingInkAdmitted,
        },
        hokusai: {
          admitted: hokusaiPinned,
          surface: hokusaiPinned ? "supported" : "unavailable",
        },
        stampAdmitted: stampDirect,
        gpuAdmitted: gpuPin,
        liveInkAdmitted: liveInkOverlayStarted,
        wetInkAdmitted: wetInkOverlayStarted,
        dynamicAdmitted: dynamicBrushDirect,
      });
      if (strokeSurfaceRoute.kind === "living-ink") {
        const pinned = livingInkCoordinatorRef.current.pinActiveRoute(
          next.id,
          strokeSurfaceRoute.routeKey,
        );
        const surface = livingInkOverlaySurfaceRef.current;
        if (!pinned || !surface) {
          void livingInkCoordinatorRef.current.cancelStroke(next.id);
          if (livingInkMode === "water") {
            livingInkWaterNoopStrokeIdsRef.current.add(next.id);
            setError("수채 번짐 물 도구 경로를 고정하지 못해 문서를 변경하지 않습니다.");
          } else {
            setError("수채 번짐 포인터 경로를 고정하지 못해 문서를 변경하지 않습니다.");
          }
          return false;
        } else {
          livingInkStrokeRef.current = {
            mode: livingInkMode,
            pageId: activePage.id,
            strokeId: next.id,
            route: strokeSurfaceRoute,
            surfaceKey: surface.binding.surfaceKey,
            forwardedSampleCount: 0,
            overlayPresented: false,
            failed: false,
            finishing: false,
            finalDrawing: null,
            canonicalImageId: null,
            canonicalPngHash: null,
            transactionCommitted: false,
          };
          appendStudioLivingInkAuthoritativeSuffix(next, 0);
        }
      }
      studioStrokeSurfaceRouteRef.current = strokeSurfaceRoute;
      const direct =
        (
          strokeSurfaceRoute.kind === "konva"
          && (isDirectLiveDraftEl(next) || next.mode === "eraser")
        )
        || strokeSurfaceRoute.kind === "living-ink"
        || hokusaiPinned
        || pixelDirect || stampDirect
        || liveInkOverlayStarted
        || wetInkOverlayStarted
        || gpuPin
        || dynamicBrushDirect
        || retainedMediaDirect;
      liveDraftDirectRef.current = direct;
      liveStampDraftDirectRef.current = strokeSurfaceRoute.kind === "stamp";
      liveDynamicBrushDraftDirectRef.current = strokeSurfaceRoute.kind === "dynamic";
      liveRetainedMediaDraftDirectRef.current = retainedMediaDirect;
      liveWetInkDraftDirectRef.current = strokeSurfaceRoute.kind === "wet-ink";
      gpuLiveInkPinnedRef.current = strokeSurfaceRoute.kind === "gpu";
      if (!stampDirect) liveStampOverlayRendererRef.current.resetActive();
      if (!dynamicBrushDirect) liveDynamicBrushOverlayRendererRef.current.resetActive();
      if (!retainedMediaDirect) liveRetainedMediaOverlayRendererRef.current.resetActive();
      if (!wetInkOverlayStarted) liveWetInkOverlayRendererRef.current.resetActive();
      const selectedMaterialProviderOwnsHiddenDraft =
        strokeSurfaceRoute.kind === "living-ink"
        || strokeSurfaceRoute.kind === "hokusai";
      liveDraftVisualRef.current = direct || stampDirect
        ? selectedMaterialProviderOwnsHiddenDraft ? null : next
        : null;
      liveDraftPendingRef.current = direct || stampDirect ? next : null;
      if (
        selectedMaterialProviderOwnsHiddenDraft
        || stampDirect
        || dynamicBrushDirect
        || wetInkOverlayStarted
        || retainedMediaDirect
      ) {
        // A generic retained tap can be painted during the pointer-down transition before the
        // specialist route wins authority. Selected material providers stay blank until their own
        // receipt; other admitted native surfaces already contain their exact initial contact.
        liveDraftLayerRef.current?.drawScene();
      }
      const predictionTailEligible = canUseStudioPointerPredictionForSession(
        STUDIO_POINTER_PREDICTION_ENABLED,
        drawingPointerTransportRef.current?.getSession()
      )
        && liveInkOverlayStarted
        && next.mode !== "eraser"
        && !next.fill
        && (next.symmetry?.type ?? "none") === "none";
      armTransientPenInkSurfaces({
        pointerEvent: pointerSample,
        drawing: next,
        causalPostCorrectionEligible,
        nativePredictionEligible: predictionTailEligible,
      });
      if (predictionTailEligible && !causalPostCorrectionEligible) {
        // This is a bounded preview admission only: failure leaves the already-started Canvas2D
        // live-ink + Perfect Freehand path untouched. The async host prewarms WASM/fabric before
        // pointerdown, so begin itself never waits inside the contact task.
        inkMeshLivePreviewRuntimeRef.current?.begin(
          next,
          liveBrushPressureSamplesFor(next),
        );
      } else {
        inkMeshLivePreviewRuntimeRef.current?.cancel();
      }
      // A pin grants only a write route, never visibility. The retained DrawEl stays hidden as
      // canonical commit evidence until coordinator token + imperative receipt authorize WebGPU.
      applyLiveStrokeBackendPresentationEffects();
      if (gpuPin && gpuLiveAcceptedRequestIdRef.current) {
        beginGpuPinnedReceiptEpoch(gpuLiveAcceptedRequestIdRef.current);
        // A synchronous early receipt becomes exact only after the watchdog epoch is armed.
        applyLiveStrokeBackendPresentationEffects();
      } else {
        cancelGpuPinnedRequestWatchdog();
      }
      if (gpuLingerRafRef.current) {
        globalThis.cancelAnimationFrame(gpuLingerRafRef.current);
        gpuLingerRafRef.current = 0;
      }
      if (direct || stampDirect) {
        // Dynamic brushes paint a first-pixel contact in begin() and finish material setup on
        // the next frame. Flushing now would pull that planner back onto the pointerdown task.
        if (liveDynamicBrushOverlayRendererRef.current.hasPendingBegin) {
          liveDraftPendingRef.current = next;
          if (liveDraftRafRef.current === null) {
            liveDraftRafRef.current = globalThis.requestAnimationFrame(() => {
              liveDraftRafRef.current = null;
              flushDirectLiveDraft();
            });
          }
        } else {
          // Emit the initial tap immediately. In particular, a WebGPU pin suppresses the Konva
          // draft, and the stamp renderer owns its dot at begin, so neither waits for pointermove.
          flushDirectLiveDraftNow(next);
        }
      } else {
        // 비다이렉트 시작도 격리 스토어로 — 이후 프레임은 scheduleDraft 가 스토어만 갱신한다.
        // Avoid flushSync here: it can join a pending pages-history render into the pointerdown
        // long task. The live tap floor plus the next isolated draft commit still first-paints.
        draftPreviewStoreRef.current.setActive(next);
        setLiveDraftShapeKind(next.kind && next.kind !== "freehand" ? next.kind : null);
      }
    }
    return true;
  }
}
