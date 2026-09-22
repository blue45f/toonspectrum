from pathlib import Path

root = Path(__file__).resolve().parents[2]
host_path = root / "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx"
hook_path = root / "apps/web/src/domains/creator/use-studio-skia-committed-ink-host-runtime.ts"
test_path = root / "apps/web/src/domains/creator/studio-skia-committed-ink-bridge.test.ts"

host = host_path.read_text()
before_lines = len(host.splitlines())
if hook_path.exists():
    raise SystemExit(f"refusing to overwrite existing helper: {hook_path}")

old_import = '''import {
  canStudioSkiaPublishOverSettledInk,
  decideStudioSkiaCommittedInkDraw,
  projectStudioSkiaCommittedInkAuthority,
  projectStudioSkiaCommittedInkVisibleReceipt,
  type StudioSkiaCommittedInkAuthority,
  type StudioSkiaCommittedInkVisibleReceipt,
} from "./studio-skia-committed-ink-bridge";'''
new_import = '''import { useStudioSkiaCommittedInkHostRuntime } from "./use-studio-skia-committed-ink-host-runtime";'''
if host.count(old_import) != 1:
    raise SystemExit("Skia bridge import changed; exact extraction aborted")
host = host.replace(old_import, new_import)

old_refs = '''  const skiaCommittedInkAuthorityRef = useRef<StudioSkiaCommittedInkAuthority | null>(null);
  const skiaCommittedInkVisibleReceiptRef = useRef<StudioSkiaCommittedInkVisibleReceipt | null>(null);
  const skiaCommittedInkDeferAttemptsRef = useRef(new Map<string, number>());
'''
if host.count(old_refs) != 1:
    raise SystemExit("Skia host refs changed; exact extraction aborted")
host = host.replace(old_refs, "")

process_ref = '''  const processCommittedInkSurfaceHandoffsRef = useRef<() => void>(() => undefined);'''
if host.count(process_ref) != 1:
    raise SystemExit("handoff process ref changed; exact extraction aborted")
host = host.replace(
    process_ref,
    process_ref + '''
  const skiaCommittedInkRuntime = useStudioSkiaCommittedInkHostRuntime(
    committedInkSurfaceHandoffsRef,
    processCommittedInkSurfaceHandoffsRef,
  );''',
)

old_handlers = '''  function canSkiaDocumentPublishOverSettledInk(
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
  }
'''
if host.count(old_handlers) != 1:
    raise SystemExit("Skia host handlers changed; exact extraction aborted")
host = host.replace(old_handlers, "")

old_empty = '''      skiaCommittedInkDeferAttemptsRef.current.clear();'''
if host.count(old_empty) != 1:
    raise SystemExit("Skia empty-queue reset changed; exact extraction aborted")
host = host.replace(old_empty, '''      skiaCommittedInkRuntime.clear();''')

old_decision = '''        const drawDecision = decideStudioSkiaCommittedInkDraw({
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

        skiaCommittedInkDeferAttemptsRef.current.delete(request.token);'''
new_decision = '''        const drawDecision = skiaCommittedInkRuntime.decide(request);
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

        skiaCommittedInkRuntime.settle(request.token);'''
if host.count(old_decision) != 1:
    raise SystemExit("Skia draw decision changed; exact extraction aborted")
host = host.replace(old_decision, new_decision)

old_wiring = '''  canSkiaDocumentPublishOverSettledInk,
  onSkiaDocumentAuthorityChange,
  onSkiaDocumentVisiblePresentation,'''
new_wiring = '''  canSkiaDocumentPublishOverSettledInk: skiaCommittedInkRuntime.canPublishOverSettledInk,
  onSkiaDocumentAuthorityChange: skiaCommittedInkRuntime.onAuthorityChange,
  onSkiaDocumentVisiblePresentation: skiaCommittedInkRuntime.onVisiblePresentation,'''
if host.count(old_wiring) != 1:
    raise SystemExit("Skia viewport wiring changed; exact extraction aborted")
host = host.replace(old_wiring, new_wiring)

after_lines = len(host.splitlines())
if after_lines > 29696:
    raise SystemExit(f"editor host still exceeds architecture ceiling: {after_lines} > 29696")
if before_lines - after_lines < 52:
    raise SystemExit(f"expected at least 52 extracted host lines, got {before_lines - after_lines}")

hook = '''import { useRef } from "react";
import type { StudioCommittedInkSurfaceHandoff } from "./studio-committed-ink-handoff-coordinator";
import {
  createStudioSkiaCommittedInkHostRuntime,
  type StudioSkiaCommittedInkHostRuntime,
} from "./studio-skia-committed-ink-bridge";

type CurrentRef<T> = { current: T };

/**
 * Keeps ephemeral Skia handoff authority outside the editor host. Document, undo,
 * storage, export and permission authority remain with their existing owners.
 */
export function useStudioSkiaCommittedInkHostRuntime(
  handoffsRef: CurrentRef<StudioCommittedInkSurfaceHandoff[]>,
  wakeRef: CurrentRef<() => void>,
): StudioSkiaCommittedInkHostRuntime {
  const runtimeRef = useRef<StudioSkiaCommittedInkHostRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = createStudioSkiaCommittedInkHostRuntime({
      readQueue: () => handoffsRef.current,
      wake: () => wakeRef.current(),
    });
  }
  return runtimeRef.current;
}
'''

runtime_test = test_path.read_text()
old_expectation = '''    expect(runtime.decide(request())).toEqual({ status: "fallback" });
    runtime.clear();'''
new_expectation = '''    expect(runtime.decide(request())).toEqual({ status: "wait", nextDeferAttempt: 1 });
    runtime.defer("receipt-token", 1);
    expect(runtime.decide(request())).toEqual({ status: "fallback" });
    runtime.clear();'''
if runtime_test.count(old_expectation) != 1:
    raise SystemExit("runtime revision-change expectation changed; exact repair aborted")
runtime_test = runtime_test.replace(old_expectation, new_expectation)

host_path.write_text(host)
hook_path.write_text(hook)
test_path.write_text(runtime_test)
print(f"extracted committed-ink host runtime: {before_lines} -> {after_lines} lines")
