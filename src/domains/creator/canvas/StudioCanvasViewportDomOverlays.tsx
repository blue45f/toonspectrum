import { Suspense } from "react";

import { StudioRenderSurface } from "../render/StudioRenderSurface";
import { CANVAS_W } from "../studio-assets";
import {
  StudioCanonicalVNextDryMediaCanvas,
  StudioLiveDynamicBrushOverlayHost,
  StudioLiveInkOverlayHost,
  StudioLiveInkPredictionHost,
  StudioLiveRetainedMediaOverlayHost,
  StudioLiveStampOverlayHost,
  StudioLiveWetInkOverlayHost,
  StudioWebGpuCanvas,
} from "../studio-page-lazy-ui";
import { StudioInkMeshLivePreviewHost } from "../StudioInkMeshLivePreviewHost";
import { StudioPixiSceneOverlayHost } from "../StudioPixiSceneOverlayHost";

import type { StudioCanvasViewportLiveSurfaces } from "./studio-canvas-viewport-live-surfaces";
import type {
  StudioCanvasViewportHandlers,
  StudioCanvasViewportProps,
} from "./StudioCanvasViewportTypes";

export interface StudioCanvasViewportDomOverlaysProps {
  acceleratedSceneSelectedIds: StudioCanvasViewportLiveSurfaces["acceleratedSceneSelectedIds"];
  canonicalDryMediaAuthorized: StudioCanvasViewportLiveSurfaces["canonicalDryMediaAuthorized"];
  canonicalDryMediaCandidate: StudioCanvasViewportLiveSurfaces["canonicalDryMediaCandidate"];
  canonicalDryMediaLayoutKey: string;
  canvasFlipH: StudioCanvasViewportProps["canvasFlipH"];
  canvasH: StudioCanvasViewportProps["canvasH"];
  velloHubAuthority: StudioCanvasViewportLiveSurfaces["velloHubAuthority"];
  effScale: StudioCanvasViewportProps["effScale"];
  elements: StudioCanvasViewportProps["elements"];
  hokusaiLiveCanvasRef: StudioCanvasViewportLiveSurfaces["hokusaiLiveCanvasRef"];
  inkMeshLivePreviewRuntime: StudioCanvasViewportProps["inkMeshLivePreviewRuntime"];
  liveDynamicBrushOverlayRenderer: StudioCanvasViewportProps["liveDynamicBrushOverlayRenderer"];
  liveInkOverlayRenderer: StudioCanvasViewportProps["liveInkOverlayRenderer"];
  liveInkPredictionRenderer: StudioCanvasViewportProps["liveInkPredictionRenderer"];
  liveRetainedMediaOverlayRenderer: StudioCanvasViewportProps["liveRetainedMediaOverlayRenderer"];
  liveStampOverlayRenderer: StudioCanvasViewportProps["liveStampOverlayRenderer"];
  liveWetInkOverlayRenderer: StudioCanvasViewportProps["liveWetInkOverlayRenderer"];
  livingInkCanvasRef: StudioCanvasViewportLiveSurfaces["livingInkCanvasRef"];
  onWebGpuBackendChange: StudioCanvasViewportHandlers["onWebGpuBackendChange"];
  onWebGpuDeviceLost: StudioCanvasViewportHandlers["onWebGpuDeviceLost"];
  onWebGpuFrameInvalid: StudioCanvasViewportHandlers["onWebGpuFrameInvalid"];
  onWebGpuFrameReady: StudioCanvasViewportHandlers["onWebGpuFrameReady"];
  onWebGpuFrameRequest: StudioCanvasViewportHandlers["onWebGpuFrameRequest"];
  pixiMountParent: HTMLDivElement | null;
  pixiSceneDocumentTransform: StudioCanvasViewportLiveSurfaces["pixiSceneDocumentTransform"];
  readVelloHubPenDown: StudioCanvasViewportLiveSurfaces["readVelloHubPenDown"];
  setCanonicalDryMediaCanvasAuthority: StudioCanvasViewportLiveSurfaces["setCanonicalDryMediaCanvasAuthority"];
  setVelloHubAuthority: StudioCanvasViewportLiveSurfaces["setVelloHubAuthority"];
  setWebGpuCanvasHandle: StudioCanvasViewportHandlers["setWebGpuCanvasHandle"];
  stageViewLayout: StudioCanvasViewportLiveSurfaces["stageViewLayout"];
  transientPenInkSurfaceEnabled: StudioCanvasViewportProps["transientPenInkSurfaceEnabled"];
  velloHubCapability: StudioCanvasViewportLiveSurfaces["velloHubCapability"];
  webGpuPreviewAuthorized: StudioCanvasViewportProps["webGpuPreviewAuthorized"];
  webGpuPreviewStrokes: StudioCanvasViewportProps["webGpuPreviewStrokes"];
  webGpuViewportSurface: StudioCanvasViewportProps["webGpuViewportSurface"];
}

export function StudioCanvasViewportDomOverlays({
  acceleratedSceneSelectedIds,
  canonicalDryMediaAuthorized,
  canonicalDryMediaCandidate,
  canonicalDryMediaLayoutKey,
  canvasFlipH,
  canvasH,
  velloHubAuthority,
  effScale,
  elements,
  hokusaiLiveCanvasRef,
  inkMeshLivePreviewRuntime,
  liveDynamicBrushOverlayRenderer,
  liveInkOverlayRenderer,
  liveInkPredictionRenderer,
  liveRetainedMediaOverlayRenderer,
  liveStampOverlayRenderer,
  liveWetInkOverlayRenderer,
  livingInkCanvasRef,
  onWebGpuBackendChange,
  onWebGpuDeviceLost,
  onWebGpuFrameInvalid,
  onWebGpuFrameReady,
  onWebGpuFrameRequest,
  pixiMountParent,
  pixiSceneDocumentTransform,
  readVelloHubPenDown,
  setCanonicalDryMediaCanvasAuthority,
  setVelloHubAuthority,
  setWebGpuCanvasHandle,
  stageViewLayout,
  transientPenInkSurfaceEnabled,
  velloHubCapability,
  webGpuPreviewAuthorized,
  webGpuPreviewStrokes,
  webGpuViewportSurface,
}: StudioCanvasViewportDomOverlaysProps) {
  return (
    <>
          <Suspense fallback={null}>
            {webGpuViewportSurface ? (
              <StudioLiveInkOverlayHost
                renderer={liveInkOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveStampOverlayHost
                renderer={liveStampOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveDynamicBrushOverlayHost
                renderer={liveDynamicBrushOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveRetainedMediaOverlayHost
                renderer={liveRetainedMediaOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveWetInkOverlayHost
                renderer={liveWetInkOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {transientPenInkSurfaceEnabled && webGpuViewportSurface ? (
              <StudioLiveInkPredictionHost
                renderer={liveInkPredictionRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {transientPenInkSurfaceEnabled && webGpuViewportSurface && inkMeshLivePreviewRuntime ? (
              <StudioInkMeshLivePreviewHost
                runtime={inkMeshLivePreviewRuntime}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
          </Suspense>
          <StudioRenderSurface
            enabled={velloHubCapability.enabled}
            mountParent={pixiMountParent}
            width={stageViewLayout.hostWidth}
            height={stageViewLayout.hostHeight}
            documentTransform={pixiSceneDocumentTransform}
            documentWidth={CANVAS_W}
            documentHeight={canvasH}
            elements={elements}
            selectedIds={acceleratedSceneSelectedIds}
            isPenDown={readVelloHubPenDown}
            onAuthorityChange={setVelloHubAuthority}
          />
          <StudioPixiSceneOverlayHost
            enabled={
              !velloHubCapability.enabled
              || velloHubAuthority.status === "fallback"
            }
            mountParent={pixiMountParent}
            // Vello Hub와 같은 renderer-neutral selection seam. Vello가 admission/render에
            // 실패한 경우에만 Pixi가 명시적으로 이 island의 단독 소유권을 되찾는다.
            width={stageViewLayout.hostWidth}
            height={stageViewLayout.hostHeight}
            documentTransform={pixiSceneDocumentTransform}
            documentWidth={CANVAS_W}
            documentHeight={canvasH}
            elements={elements}
            selectedIds={acceleratedSceneSelectedIds}
          />
          {webGpuViewportSurface ? (
            <canvas
              ref={livingInkCanvasRef}
              aria-hidden="true"
              data-studio-living-ink-overlay="true"
              className="pointer-events-none absolute z-[13] mix-blend-multiply"
              style={{
                left: webGpuViewportSurface.surface.left,
                top: webGpuViewportSurface.surface.top,
                width: webGpuViewportSurface.surface.width,
                height: webGpuViewportSurface.surface.height,
              }}
            />
          ) : null}
          {webGpuViewportSurface ? (
            <canvas
              ref={hokusaiLiveCanvasRef}
              aria-hidden="true"
              data-studio-hokusai-live-overlay="true"
              className="pointer-events-none absolute z-[12]"
              style={{
                left: webGpuViewportSurface.surface.left,
                top: webGpuViewportSurface.surface.top,
                width: webGpuViewportSurface.surface.width,
                height: webGpuViewportSurface.surface.height,
              }}
            />
          ) : null}
          {webGpuViewportSurface ? (
            <Suspense fallback={null}>
              <StudioCanonicalVNextDryMediaCanvas
                element={canonicalDryMediaCandidate}
                layoutKey={canonicalDryMediaLayoutKey}
                visible={canonicalDryMediaAuthorized !== null}
                surfaceBounds={webGpuViewportSurface.surface}
                documentWidth={CANVAS_W}
                documentHeight={canvasH}
                documentScale={effScale}
                flipX={canvasFlipH}
                onAuthorityChange={setCanonicalDryMediaCanvasAuthority}
              />
            </Suspense>
          ) : null}
          {webGpuViewportSurface ? (
            <Suspense fallback={null}>
              <StudioWebGpuCanvas
                className="pointer-events-none z-10"
                width={CANVAS_W}
                height={canvasH}
                surfaceBounds={webGpuViewportSurface.surface}
                scaleX={webGpuViewportSurface.transform.scaleX}
                scaleY={webGpuViewportSurface.transform.scaleY}
                offsetX={webGpuViewportSurface.transform.offsetX}
                offsetY={webGpuViewportSurface.transform.offsetY}
                flipX={webGpuViewportSurface.transform.flipX}
                ref={setWebGpuCanvasHandle}
                strokes={webGpuPreviewStrokes}
                frameAuthorized={webGpuPreviewAuthorized}
                eagerInitialize
                onBackendChange={onWebGpuBackendChange}
                onDeviceLost={onWebGpuDeviceLost}
                onFrameInvalid={onWebGpuFrameInvalid}
                onFrameRequest={onWebGpuFrameRequest}
                onFrameReady={onWebGpuFrameReady}
              />
            </Suspense>
          ) : null}
    </>
  );
}
