import { useLayoutEffect, useRef, useState } from "react";

import {
  studioRasterTileIntersectsDocumentRect,
  type StudioRasterVisibleDocumentRect,
} from "./studio-raster-visible-rect";
import { StudioRasterCrdtCanvas } from "./StudioRasterCrdtCanvas";

import type { StudioCrdtDocument } from "./studio-crdt-document";
import type { StudioRasterReplayRuntimeResult } from "./studio-crdt-raster-replay-runtime";
import type { StudioRasterOverlaySourceOperation } from "./studio-crdt-raster-ui-bridge";
import type { StudioWebGpuViewportSurfacePlan } from "./studio-webgpu-viewport";

export interface StudioRasterCrdtSurfaceProps {
  readonly document: StudioCrdtDocument | null;
  readonly workId: string | null;
  readonly surfaceId: string;
  readonly viewport: StudioWebGpuViewportSurfacePlan | null;
  readonly visibleDocumentRect: StudioRasterVisibleDocumentRect | null;
  readonly sourceOperations: readonly StudioRasterOverlaySourceOperation[];
  readonly hidden?: boolean;
  readonly className?: string;
  readonly onVisibleOperationIdsChange?: (operationIds: readonly string[]) => void;
  readonly onError?: (message: string) => void;
}

interface ReadyRasterFrame {
  readonly generation: number;
  readonly result: StudioRasterReplayRuntimeResult;
  readonly signal: AbortSignal;
}

interface StudioRasterSurfaceCallbacks {
  readonly onVisibleOperationIdsChange?: (operationIds: readonly string[]) => void;
  readonly onError?: (message: string) => void;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left === right || (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function publishStudioRasterVisibleOperationIds(
  visibleOperationIdsRef: { current: readonly string[] },
  callbacksRef: { current: StudioRasterSurfaceCallbacks },
  operationIds: readonly string[]
): void {
  const stable = [...operationIds].sort();
  if (sameStringArray(visibleOperationIdsRef.current, stable)) return;
  visibleOperationIdsRef.current = stable;
  callbacksRef.current.onVisibleOperationIdsChange?.(stable);
}

/**
 * Owns the document subscription, verified asset replay and atomic fallback handoff for one page
 * raster surface. StudioPage receives only a small set of operation IDs after a complete GPU/2D
 * frame; while loading or on any failure, the redundant Konva vectors remain authoritative.
 */
export function StudioRasterCrdtSurface({
  document,
  workId,
  surfaceId,
  viewport,
  visibleDocumentRect,
  sourceOperations,
  hidden = false,
  className,
  onVisibleOperationIdsChange,
  onError,
}: StudioRasterCrdtSurfaceProps) {
  const [revision, setRevision] = useState(0);
  const [frame, setFrame] = useState<ReadyRasterFrame | null>(null);
  const generationRef = useRef(0);
  const visibleOperationIdsRef = useRef<readonly string[]>([]);
  const sourceOperationsRef = useRef(sourceOperations);
  const semanticHashCacheRef = useRef(new Map<string, {
    readonly semanticParameters: string;
    readonly sha256: string;
  }>());
  const callbacksRef = useRef({ onVisibleOperationIdsChange, onError });
  callbacksRef.current = { onVisibleOperationIdsChange, onError };
  sourceOperationsRef.current = sourceOperations;
  const sourceOperationKey = sourceOperations
    .map(({ operationId, semanticParameters }) => `${operationId}:${semanticParameters}`)
    .join("\u001e");
  const hasViewport = viewport !== null;
  const visibleRectX = visibleDocumentRect?.x ?? null;
  const visibleRectY = visibleDocumentRect?.y ?? null;
  const visibleRectWidth = visibleDocumentRect?.width ?? null;
  const visibleRectHeight = visibleDocumentRect?.height ?? null;

  useLayoutEffect(() => {
    setRevision((value) => value + 1);
    if (!document) return;
    return document.subscribeChanges((change) => {
      if (
        change.changedRasterSurfaceIds.has(surfaceId) ||
        change.rasterOperationLogs.some((log) => log.surface.surfaceId === surfaceId) && (
          change.changedRasterOperationIds.size > 0 ||
          change.changedRasterUndoOperationIds.size > 0 ||
          change.changedRasterUndoAcknowledgementIds.size > 0
        )
      ) {
        setRevision((value) => value + 1);
      }
    }, { includeOrigin: () => true });
  }, [document, surfaceId]);

  useLayoutEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const controller = new AbortController();
    publishStudioRasterVisibleOperationIds(visibleOperationIdsRef, callbacksRef, []);
    setFrame(null);
    if (
      hidden || !document || !workId || !hasViewport ||
      visibleRectX === null || visibleRectY === null ||
      visibleRectWidth === null || visibleRectHeight === null
    ) {
      return () => controller.abort();
    }
    const log = document.getRasterOperationLog(surfaceId);
    if (!log) return () => controller.abort();
    const sourceSnapshot = sourceOperationsRef.current.map((source) => ({ ...source }));
    const sourceById = new Map(sourceSnapshot.map((source) => [source.operationId, source]));

    let active = true;
    void Promise.all([
      import("./studio-crdt-raster-replay-runtime"),
      import("./studio-raster-asset-client"),
      import("./studio-crdt-raster-ui-bridge"),
    ]).then(async ([runtime, assetClient, bridge]) => {
      const result = await runtime.replayStudioRasterCrdtPixels({
        workId,
        log,
        signal: controller.signal,
        visibleTileFilter: (tile) =>
          studioRasterTileIntersectsDocumentRect(tile, {
            x: visibleRectX,
            y: visibleRectY,
            width: visibleRectWidth,
            height: visibleRectHeight,
          }, log.surface.tileSize),
      }, {
        download: async (reference, signal) => (
          await assetClient.downloadStudioRasterAsset(workId, reference, signal)
        ).bytes,
      });
      for (const operationId of result.appliedOperationIds) {
        const source = sourceById.get(operationId);
        const operation = log.operations.find((candidate) => candidate.operationId === operationId);
        if (!source || !operation) {
          throw new Error("표시할 픽셀 작업의 벡터 원본을 확인할 수 없습니다.");
        }
        const cached = semanticHashCacheRef.current.get(operationId);
        const actualSha256 = cached?.semanticParameters === source.semanticParameters
          ? cached.sha256
          : await bridge.sha256StudioRasterSemanticParameters(
              source.semanticParameters,
              controller.signal
            );
        semanticHashCacheRef.current.set(operationId, {
          semanticParameters: source.semanticParameters,
          sha256: actualSha256,
        });
        if (actualSha256 !== operation.semanticParametersSha256) {
          throw new Error("벡터 원본이 변경되어 안전한 픽셀 표시를 중단했습니다.");
        }
      }
      if (!active || controller.signal.aborted || generationRef.current !== generation) return;
      setFrame({ generation, result, signal: controller.signal });
    }).catch((cause: unknown) => {
      if (
        !active || controller.signal.aborted ||
        (cause instanceof DOMException && cause.name === "AbortError")
      ) return;
      publishStudioRasterVisibleOperationIds(visibleOperationIdsRef, callbacksRef, []);
      callbacksRef.current.onError?.(
        cause instanceof Error
          ? cause.message
          : "실시간 픽셀 캔버스를 재생하지 못했습니다."
      );
    });

    return () => {
      active = false;
      controller.abort(new DOMException("새 래스터 프레임이 요청되었습니다.", "AbortError"));
    };
  }, [
    document,
    hasViewport,
    hidden,
    revision,
    sourceOperationKey,
    surfaceId,
    visibleRectHeight,
    visibleRectWidth,
    visibleRectX,
    visibleRectY,
    workId,
  ]);

  useLayoutEffect(() => () => {
    visibleOperationIdsRef.current = [];
    callbacksRef.current.onVisibleOperationIdsChange?.([]);
  }, []);

  if (!frame || !viewport || hidden) return null;
  return (
    <StudioRasterCrdtCanvas
      className={className}
      generation={frame.generation}
      surface={frame.result.surface}
      tiles={frame.result.tiles}
      viewport={{
        ...viewport.transform,
        surfaceBounds: viewport.surface,
      }}
      signal={frame.signal}
      onFrameReady={(generation) => {
        if (generation !== frame.generation || generationRef.current !== generation) return;
        publishStudioRasterVisibleOperationIds(
          visibleOperationIdsRef,
          callbacksRef,
          frame.result.appliedOperationIds
        );
      }}
      onFrameInvalid={() => {
        publishStudioRasterVisibleOperationIds(visibleOperationIdsRef, callbacksRef, []);
      }}
      onPresentationResult={(result) => {
        if (result.status === "ready" || result.status === "stale") return;
        callbacksRef.current.onError?.(
          `실시간 픽셀 표시가 안전하게 중단되었습니다 (${result.reason}).`
        );
      }}
    />
  );
}
