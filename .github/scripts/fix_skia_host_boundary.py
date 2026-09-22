from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
host_path = root / "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx"
helper_path = root / "apps/web/src/domains/creator/use-studio-skia-committed-ink-coordinator.ts"
host = host_path.read_text()
before_lines = len(host.splitlines())

if helper_path.exists():
    raise SystemExit(f"refusing to overwrite existing helper: {helper_path}")

old_import = '''import {
  canStudioSkiaPublishOverSettledInk,
  decideStudioSkiaCommittedInkDraw,
  projectStudioSkiaCommittedInkAuthority,
  projectStudioSkiaCommittedInkVisibleReceipt,
  type StudioSkiaCommittedInkAuthority,
  type StudioSkiaCommittedInkVisibleReceipt,
} from "./studio-skia-committed-ink-bridge";'''
new_import = '''import { useStudioSkiaCommittedInkCoordinator } from "./use-studio-skia-committed-ink-coordinator";'''
if host.count(old_import) != 1:
    raise SystemExit("Skia bridge import block changed; aborting exact repair")
host = host.replace(old_import, new_import)

old_refs = '''  const skiaCommittedInkAuthorityRef = useRef<StudioSkiaCommittedInkAuthority | null>(null);
  const skiaCommittedInkVisibleReceiptRef = useRef<StudioSkiaCommittedInkVisibleReceipt | null>(null);
  const skiaCommittedInkDeferAttemptsRef = useRef(new Map<string, number>());
'''
if host.count(old_refs) != 1:
    raise SystemExit("Skia committed-ink refs changed; aborting exact repair")
host = host.replace(old_refs, "")

process_ref = '''  const processCommittedInkSurfaceHandoffsRef = useRef<() => void>(() => undefined);'''
if host.count(process_ref) != 1:
    raise SystemExit("handoff process ref changed; aborting exact repair")
host = host.replace(
    process_ref,
    process_ref + '''
  const skiaCommittedInk = useStudioSkiaCommittedInkCoordinator(committedInkSurfaceHandoffsRef, processCommittedInkSurfaceHandoffsRef);''',
)

function_pattern = re.compile(
    r'''\n  function canSkiaDocumentPublishOverSettledInk\([\s\S]*?\n  function prepareStrokeCommitPage\(\): boolean \{'''
)
host, count = function_pattern.subn("\n  function prepareStrokeCommitPage(): boolean {", host, count=1)
if count != 1:
    raise SystemExit("Skia viewport handler block changed; aborting exact repair")

old_reset = '''      skiaCommittedInkDeferAttemptsRef.current.clear();'''
if host.count(old_reset) != 1:
    raise SystemExit("Skia defer reset changed; aborting exact repair")
host = host.replace(old_reset, '''      skiaCommittedInk.reset();''')

decision_pattern = re.compile(
    r'''        const drawDecision = decideStudioSkiaCommittedInkDraw\(\{[\s\S]*?\n        transition = transitionStudioCommittedInkHandoffHead\('''
)
new_decision = '''        const mainLayer = mainLayerRef.current;
        const visibleDraw = skiaCommittedInk.resolveVisibleDraw(
          request,
          mainLayer ? () => mainLayer.draw() : null,
        );
        if (visibleDraw.status === "hold") {
          queue = transition.queue;
          break;
        }
        if (visibleDraw.status === "wait") {
          queue = transition.queue;
          retryVisibleDraw = true;
          break;
        }
        armLiveStrokeCanonicalCanvasAudit(request.strokeIds, request.token);
        const outcome = visibleDraw.outcome;
        transition = transitionStudioCommittedInkHandoffHead('''
host, count = decision_pattern.subn(new_decision, host, count=1)
if count != 1:
    raise SystemExit("Skia visible-draw decision block changed; aborting exact repair")

old_handlers = '''  canSkiaDocumentPublishOverSettledInk,
  onSkiaDocumentAuthorityChange,
  onSkiaDocumentVisiblePresentation,'''
new_handlers = '''  canSkiaDocumentPublishOverSettledInk: skiaCommittedInk.canPublish,
  onSkiaDocumentAuthorityChange: skiaCommittedInk.onAuthorityChange,
  onSkiaDocumentVisiblePresentation: skiaCommittedInk.onVisiblePresentation,'''
if host.count(old_handlers) != 1:
    raise SystemExit("Skia viewport handler wiring changed; aborting exact repair")
host = host.replace(old_handlers, new_handlers)

after_lines = len(host.splitlines())
if after_lines > 29696:
    raise SystemExit(f"host boundary still exceeds ratchet: {after_lines} > 29696")
if before_lines - after_lines < 52:
    raise SystemExit(f"expected a real extraction of at least 52 lines, got {before_lines - after_lines}")

helper = '''import { useCallback, useRef, type MutableRefObject } from "react";
import type {
  StudioCommittedInkSurfaceHandoff,
  StudioCommittedInkVisibleDrawReceipt,
  StudioCommittedInkVisibleDrawRequest,
} from "./studio-committed-ink-handoff-coordinator";
import type { StudioRenderSurfaceAuthority } from "./render/StudioRenderSurface";
import {
  canStudioSkiaPublishOverSettledInk,
  decideStudioSkiaCommittedInkDraw,
  projectStudioSkiaCommittedInkAuthority,
  projectStudioSkiaCommittedInkVisibleReceipt,
  type StudioSkiaCommittedInkAuthority,
  type StudioSkiaCommittedInkVisibleReceipt,
  type StudioSkiaDocumentPresentationCandidate,
} from "./studio-skia-committed-ink-bridge";

type MutableCurrent<T> = Pick<MutableRefObject<T>, "current">;
type VisibleDrawResolution =
  | { readonly status: "hold" | "wait" }
  | {
      readonly status: "ready";
      readonly outcome: StudioCommittedInkVisibleDrawReceipt["outcome"];
    };

/**
 * Owns the ephemeral Skia handoff projection so the editor host only coordinates document work.
 * No document, undo, storage, export, or permission authority moves into this hook.
 */
export function useStudioSkiaCommittedInkCoordinator(
  handoffsRef: MutableCurrent<StudioCommittedInkSurfaceHandoff[]>,
  processHandoffsRef: MutableCurrent<() => void>,
) {
  const authorityRef = useRef<StudioSkiaCommittedInkAuthority | null>(null);
  const visibleReceiptRef = useRef<StudioSkiaCommittedInkVisibleReceipt | null>(null);
  const deferAttemptsRef = useRef(new Map<string, number>());

  const canPublish = useCallback(
    (candidate: StudioSkiaDocumentPresentationCandidate) =>
      canStudioSkiaPublishOverSettledInk(candidate, handoffsRef.current),
    [handoffsRef],
  );

  const onAuthorityChange = useCallback(
    (authority: StudioRenderSurfaceAuthority) => {
      const projected = projectStudioSkiaCommittedInkAuthority(authority);
      authorityRef.current = projected;
      if (
        projected.status !== "active"
        || visibleReceiptRef.current?.sceneRevision !== projected.sceneRevision
      ) {
        visibleReceiptRef.current = null;
      }
      processHandoffsRef.current();
    },
    [processHandoffsRef],
  );

  const onVisiblePresentation = useCallback(
    (presentation: StudioSkiaDocumentPresentationCandidate) => {
      visibleReceiptRef.current =
        projectStudioSkiaCommittedInkVisibleReceipt(presentation);
      processHandoffsRef.current();
    },
    [processHandoffsRef],
  );

  const resolveVisibleDraw = useCallback(
    (
      request: StudioCommittedInkVisibleDrawRequest,
      drawFallback: (() => void) | null,
    ): VisibleDrawResolution => {
      const decision = decideStudioSkiaCommittedInkDraw({
        request,
        authority: authorityRef.current,
        visibleReceipt: visibleReceiptRef.current,
        deferAttempt: deferAttemptsRef.current.get(request.token) ?? 0,
      });
      if (decision.status === "hold") return { status: "hold" };
      if (decision.status === "wait") {
        deferAttemptsRef.current.set(request.token, decision.nextDeferAttempt);
        return { status: "wait" };
      }
      deferAttemptsRef.current.delete(request.token);
      if (decision.status === "receipted") {
        return { status: "ready", outcome: "drawn" };
      }
      if (!drawFallback) return { status: "ready", outcome: "failed" };
      try {
        drawFallback();
        return { status: "ready", outcome: "drawn" };
      } catch {
        return { status: "ready", outcome: "failed" };
      }
    },
    [],
  );

  const reset = useCallback(() => deferAttemptsRef.current.clear(), []);
  return { canPublish, onAuthorityChange, onVisiblePresentation, resolveVisibleDraw, reset };
}
'''

host_path.write_text(host)
helper_path.write_text(helper)
print(f"extracted Skia coordination: {before_lines} -> {after_lines} host lines")
