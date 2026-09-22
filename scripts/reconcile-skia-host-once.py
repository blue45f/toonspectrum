from __future__ import annotations

from pathlib import Path

HOST = Path("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx")
MAX_LINES = 29_696


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new)


source = HOST.read_text(encoding="utf-8")

source = replace_once(
    source,
    '''import {
  createStudioCommittedInkSurfaceHandoff,
  sumStudioCommittedInkHandoffSurfaceCounts,
  transitionStudioCommittedInkHandoffHead,
  type StudioCommittedInkAuthorityEvidence,
  type StudioCommittedInkSurfaceCounts,
  type StudioCommittedInkSurfaceHandoff,
  type StudioCommittedInkVisibleDrawReceipt,
} from "./studio-committed-ink-handoff-coordinator";''',
    '''import {
  transitionStudioCommittedInkHandoffHead,
  type StudioCommittedInkAuthorityEvidence,
  type StudioCommittedInkSurfaceCounts,
  type StudioCommittedInkSurfaceHandoff,
  type StudioCommittedInkVisibleDrawReceipt,
} from "./studio-committed-ink-handoff-coordinator";''',
    "committed ink coordinator imports",
)

source = replace_once(
    source,
    '''import {
  canStudioSkiaPublishOverSettledInk,
  decideStudioSkiaCommittedInkDraw,
  projectStudioSkiaCommittedInkAuthority,
  projectStudioSkiaCommittedInkVisibleReceipt,
  type StudioSkiaCommittedInkAuthority,
  type StudioSkiaCommittedInkVisibleReceipt,
} from "./studio-skia-committed-ink-bridge";''',
    '''import {
  appendStudioCommittedInkHandoff,
  createStudioSkiaCommittedInkHostRuntime,
} from "./studio-skia-committed-ink-bridge";''',
    "Skia bridge imports",
)

source = replace_once(
    source,
    '''  /** React 상태 예약이 아니라 실제 가시 픽셀 영수증 뒤에만 라이브 표면을 넘긴다. */
  const committedInkSurfaceHandoffsRef = useRef<StudioCommittedInkSurfaceHandoff[]>([]);
  const skiaCommittedInkAuthorityRef = useRef<StudioSkiaCommittedInkAuthority | null>(null);
  const skiaCommittedInkVisibleReceiptRef = useRef<StudioSkiaCommittedInkVisibleReceipt | null>(null);
  const skiaCommittedInkDeferAttemptsRef = useRef(new Map<string, number>());
  /** Draw 실패 재시도는 StudioPage 전체 렌더가 아니라 bounded rAF coordinator로만 진행한다. */
  const committedInkSurfaceHandoffRafRef = useRef(0);
  const processCommittedInkSurfaceHandoffsRef = useRef<() => void>(() => undefined);''',
    '''  /** React 상태 예약이 아니라 실제 가시 픽셀 영수증 뒤에만 라이브 표면을 넘긴다. */
  const committedInkSurfaceHandoffsRef = useRef<StudioCommittedInkSurfaceHandoff[]>([]);
  /** Draw 실패 재시도는 StudioPage 전체 렌더가 아니라 bounded rAF coordinator로만 진행한다. */
  const committedInkSurfaceHandoffRafRef = useRef(0);
  const processCommittedInkSurfaceHandoffsRef = useRef<() => void>(() => undefined);
  const [skiaCommittedInkRuntime] = useState(() => createStudioSkiaCommittedInkHostRuntime({
    readQueue: () => committedInkSurfaceHandoffsRef.current,
    wake: () => processCommittedInkSurfaceHandoffsRef.current(),
  }));''',
    "Skia host runtime state",
)

source = replace_once(
    source,
    '''  /**
   * 커밋 성공은 React 상태 예약일 뿐 실제 픽셀 영수증이 아니다. 현재 표면에서 아직 다른
   * handoff가 예약하지 않은 FIFO 접두부만 예약한다. 정확한 Skia 가시 영수증이 있으면 그
   * 표면으로 원자 인계하고, 미지원/실패 시에만 동기 mainLayer.draw() 영수증으로 복귀한다.
   */
  function queueCommittedStrokeSurfaceHandoff(pageId: string, strokeIds: readonly string[]) {
    const pending = committedInkSurfaceHandoffsRef.current;
    const reserved = sumStudioCommittedInkHandoffSurfaceCounts(pending);
    const overlaySettledCount = Math.max(
      0,
      liveInkOverlayRendererRef.current.settledStrokeCount
        + liveRetainedMediaOverlayRendererRef.current.settledStrokeCount
        + liveDynamicBrushOverlayRendererRef.current.settledStrokeCount
        - reserved.overlay
    );
    const draftSettledCount = Math.max(
      0,
      draftPreviewStoreRef.current.settledCount - reserved.draft
    );
    const gpuSettledCount = Math.max(
      0,
      pendingGpuStrokesRef.current.length - reserved.gpu
    );
    if (overlaySettledCount + draftSettledCount + gpuSettledCount === 0) return;
    const queued = createStudioCommittedInkSurfaceHandoff({
      pageId,
      strokeIds: [...new Set(strokeIds)],
      overlaySettledCount,
      draftSettledCount,
      gpuSettledCount,
      queuedRevision: studioRevisionProjectGenerationRef.current,
    });
    committedInkSurfaceHandoffsRef.current = [...pending, queued];
    // This ref-only append can happen after React's last layout effect in the automatic commit
    // batch. Always schedule one post-commit pass; the processor remains idempotent and waits
    // fail-visible until the canonical scene projection has caught up.
    scheduleCommittedInkSurfaceHandoffRetry();
  }
  function canSkiaDocumentPublishOverSettledInk(
    candidate: Parameters<NonNullable<StudioCanvasViewportHandlers["canSkiaDocumentPublishOverSettledInk"]>>[0]
  ): boolean {
    return canStudioSkiaPublishOverSettledInk(
      candidate,
      committedInkSurfaceHandoffsRef.current,
    );
  }
  function onSkiaDocumentAuthorityChange(
    authority: Parameters<NonNullable<StudioCanvasViewportHandlers["onSkiaDocumentAuthorityChange"]>>[0]
  ): void {
    const projected = projectStudioSkiaCommittedInkAuthority(authority);
    skiaCommittedInkAuthorityRef.current = projected;
    if (
      projected.status !== "active"
      || skiaCommittedInkVisibleReceiptRef.current?.sceneRevision !== projected.sceneRevision
    ) {
      skiaCommittedInkVisibleReceiptRef.current = null;
    }
    processCommittedInkSurfaceHandoffsRef.current();
  }
  function onSkiaDocumentVisiblePresentation(
    presentation: Parameters<NonNullable<StudioCanvasViewportHandlers["onSkiaDocumentVisiblePresentation"]>>[0]
  ): void {
    skiaCommittedInkVisibleReceiptRef.current =
      projectStudioSkiaCommittedInkVisibleReceipt(presentation);
    processCommittedInkSurfaceHandoffsRef.current();
  }''',
    '''  /** Reserve only the newly settled FIFO suffix; the bridge owns queue accounting. */
  function queueCommittedStrokeSurfaceHandoff(pageId: string, strokeIds: readonly string[]) {
    const pending = committedInkSurfaceHandoffsRef.current;
    const next = appendStudioCommittedInkHandoff(pending, {
      pageId,
      strokeIds,
      overlaySettledCount: liveInkOverlayRendererRef.current.settledStrokeCount
        + liveRetainedMediaOverlayRendererRef.current.settledStrokeCount
        + liveDynamicBrushOverlayRendererRef.current.settledStrokeCount,
      draftSettledCount: draftPreviewStoreRef.current.settledCount,
      gpuSettledCount: pendingGpuStrokesRef.current.length,
      queuedRevision: studioRevisionProjectGenerationRef.current,
    });
    if (next === pending) return;
    committedInkSurfaceHandoffsRef.current = [...next];
    scheduleCommittedInkSurfaceHandoffRetry();
  }''',
    "queue accounting and Skia event wrappers",
)

source = replace_once(
    source,
    '''      committedInkRetainedRetryRef.current = null;
      skiaCommittedInkDeferAttemptsRef.current.clear();
      return;''',
    '''      committedInkRetainedRetryRef.current = null;
      skiaCommittedInkRuntime.clear();
      return;''',
    "empty queue runtime cleanup",
)

source = replace_once(
    source,
    '''        const drawDecision = decideStudioSkiaCommittedInkDraw({
          request,
          authority: skiaCommittedInkAuthorityRef.current,
          visibleReceipt: skiaCommittedInkVisibleReceiptRef.current,
          deferAttempt: skiaCommittedInkDeferAttemptsRef.current.get(request.token) ?? 0,
        });
        if (drawDecision.status === "hold") {
          queue = transition.queue;
          break;
        }
        if (drawDecision.status === "wait") {
          skiaCommittedInkDeferAttemptsRef.current.set(
            request.token,
            drawDecision.nextDeferAttempt,
          );
          queue = transition.queue;
          retryVisibleDraw = true;
          break;
        }

        skiaCommittedInkDeferAttemptsRef.current.delete(request.token);''',
    '''        const drawDecision = skiaCommittedInkRuntime.decide(request);
        if (drawDecision.status === "hold") {
          queue = transition.queue;
          break;
        }
        if (drawDecision.status === "wait") {
          skiaCommittedInkRuntime.defer(request.token, drawDecision.nextDeferAttempt);
          queue = transition.queue;
          retryVisibleDraw = true;
          break;
        }

        skiaCommittedInkRuntime.settle(request.token);''',
    "Skia draw decision state",
)

source = replace_once(
    source,
    '''  canSkiaDocumentPublishOverSettledInk,
  onSkiaDocumentAuthorityChange,
  onSkiaDocumentVisiblePresentation,''',
    '''  canSkiaDocumentPublishOverSettledInk: skiaCommittedInkRuntime.canPublishOverSettledInk,
  onSkiaDocumentAuthorityChange: skiaCommittedInkRuntime.onAuthorityChange,
  onSkiaDocumentVisiblePresentation: skiaCommittedInkRuntime.onVisiblePresentation,''',
    "viewport Skia handlers",
)

for forbidden in (
    "skiaCommittedInkAuthorityRef",
    "skiaCommittedInkVisibleReceiptRef",
    "skiaCommittedInkDeferAttemptsRef",
    "decideStudioSkiaCommittedInkDraw",
    "createStudioCommittedInkSurfaceHandoff",
    "sumStudioCommittedInkHandoffSurfaceCounts",
):
    if forbidden in source:
        raise SystemExit(f"host still owns extracted symbol: {forbidden}")

line_count = len(source.splitlines())
if line_count > MAX_LINES:
    raise SystemExit(f"host architecture ratchet would fail: {line_count} > {MAX_LINES}")

HOST.write_text(source, encoding="utf-8")
print(f"reconciled {HOST}: {line_count} lines")
