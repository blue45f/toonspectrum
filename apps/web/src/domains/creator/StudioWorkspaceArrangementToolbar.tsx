import { LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";

import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { captureStudioWorkspaceArrangement, setStudioWorkspaceArranging } from "./studio-workspace-arrangement";
import type { StudioWorkspaceArrangementControlsProps } from "./StudioWorkspaceArrangementControls";

/** Optional layout controls load on intent without remounting the canvas or any panel. */
export function StudioWorkspaceArrangementToolbar({ disabled = false }: { readonly disabled?: boolean }) {
  const [controls, setControls] = useState<{ Component: ComponentType<StudioWorkspaceArrangementControlsProps>; snapshot: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(false);
  const available = useRef(false);
  const pending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { available.current = !disabled; return () => { available.current = false; }; }, [disabled]);
  useEffect(() => {
    if (controls) root.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [controls]);
  async function open() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const { StudioWorkspaceArrangementControls } = await import("./StudioWorkspaceArrangementControls");
      if (!alive.current || !available.current) return;
      setControls({ Component: StudioWorkspaceArrangementControls, snapshot: captureStudioWorkspaceArrangement() });
      setStudioWorkspaceArranging(true);
    } catch { if (alive.current) setFailed(true); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  if (controls) return (
    <div ref={root} className="contents">
      <controls.Component
        disabled={disabled}
        initialSnapshot={controls.snapshot}
      />
    </div>
  );
  if (disabled) return null;
  return (
    <div data-studio-workspace-arrangement="true" className="pointer-events-auto fixed bottom-3 right-3 z-[69] hidden max-w-[calc(100vw-1.5rem)] flex-col gap-1 rounded-xl border border-line-strong bg-panel/95 p-1.5 text-fg shadow-xl lg:flex">
      <button type="button" disabled={busy} aria-busy={busy} aria-pressed={false} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-wait disabled:opacity-40 ${STUDIO_FOCUS_RING}`} onClick={() => void open()}>
        <LayoutGrid size={15} aria-hidden />{busy ? "배치 도구 여는 중…" : "배치 편집"}
      </button>
      {failed && <p role="status" className="px-2 text-xs">배치 도구를 불러오지 못했어요. 다시 눌러 주세요. 현재 원고와 배치는 유지됩니다.</p>}
    </div>
  );
}
