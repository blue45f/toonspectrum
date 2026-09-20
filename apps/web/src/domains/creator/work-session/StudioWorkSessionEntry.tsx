import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const Workspace = lazy(() => import("./StudioWorkSessionWorkspace").then((module) => ({ default: module.StudioWorkSessionWorkspace })));
class SessionBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
/** Explicit entry: no API reads or mutations before the user opens the session workspace. */
export function StudioWorkSessionEntry({ workId }: { readonly workId: string }) {
  const bt = useBilingual("StudioWorkSessionEntry"), [expanded, setExpanded] = useState(false);
  return <section className="rounded-xl border border-line bg-card p-4" data-work-session-entry="true">
    <button type="button" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm font-semibold" aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}>{bt("공동 작업 세션", "Collaborative work sessions")}</button>
    {expanded ? <div className="mt-4"><SessionBoundary key={workId} fallback={<p role="alert" className="text-sm">{bt("작업 세션 화면을 불러오지 못했습니다. 이 영역을 닫고 다시 열 수 있습니다. 원고와 제작 보드는 변경하지 않았습니다.", "The session view could not be loaded. Close and reopen this section. Your manuscript and production board were not changed.")}</p>}>
      <Suspense fallback={<p role="status" className="text-sm">{bt("세션 화면 불러오는 중…", "Loading sessions…")}</p>}><Workspace workId={workId} /></Suspense>
    </SessionBoundary></div> : null}
  </section>;
}
