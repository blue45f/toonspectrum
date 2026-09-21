import { PinOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { StudioColorEditor } from "./StudioColorEditor";
import { useStudioColorWorkspace } from "./StudioColorWorkspaceContext";
import { useStudioColorSession } from "./useStudioColorSession";
import { useStudioSharedColorHistory } from "./useStudioSharedColorHistory";

export function StudioPinnedColorPanel() {
  const workspace = useStudioColorWorkspace();
  if (!workspace || !workspace.pinned || workspace.isMobile) return null;
  return <PinnedEditor key={workspace.ownerKey + ":" + workspace.target} />;
}

function PinnedEditor() {
  const workspace = useStudioColorWorkspace()!;
  const history = useStudioSharedColorHistory();
  const rootRef = useRef<HTMLElement>(null);
  const { session, message, change, commit, cancel } = useStudioColorSession({
    value: workspace[workspace.target], targetKey: `${workspace.ownerKey}:${workspace.target}`,
    onCommit: (color) => {
      if (workspace.target === "primary") workspace.onPrimaryChange(color); else workspace.onSecondaryChange(color);
      history.rememberColor(color);
    },
  });
  useEffect(() => {
    if (!workspace.focusToken) return;
    rootRef.current?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [workspace.focusToken]);
  return <section ref={rootRef} tabIndex={-1} aria-label="고정 색상 작업실" data-studio-pinned-color-panel="true"
    className="flex max-h-[min(52dvh,34rem)] min-h-0 shrink-0 flex-col rounded-lg border border-line bg-panel focus-visible:ring-2 focus-visible:ring-accent">
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
      <label className="flex items-center gap-2 text-xs font-semibold">색상
        <select data-studio-color-cancel="true" aria-label="고정 색상 편집 대상" value={workspace.target}
          onChange={(event) => { cancel(); workspace.setTarget(event.currentTarget.value === "secondary" ? "secondary" : "primary"); }}
          className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm">
          <option value="primary">주 색</option><option value="secondary">보조 색</option>
        </select>
      </label>
      <button type="button" data-studio-color-cancel="true" aria-label="색상 패널 고정 해제" className="grid size-11 place-items-center rounded-lg text-fg-2 hover:bg-raised"
        onClick={() => { cancel(); workspace.onPinnedChange(false); }}><PinOff size={18} aria-hidden /></button>
    </header>
    <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
      <StudioColorEditor session={session} onChange={change} onGestureCommit={() => { commit(); }}
        onApplyRequest={() => { commit(); }} onCancelRequest={cancel} recentColors={history.colors}
        documentColors={workspace.documentColors} error={message} historyStatus={history.status} onRetryHistory={history.retry}
        onRequestCanvasEyedropper={workspace.onRequestSample ? () => { cancel(); workspace.sampleColor(workspace.target); } : undefined} />
    </div>
  </section>;
}
