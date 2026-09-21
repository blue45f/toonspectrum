import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { loadStudioWorkSessionWorkspace } from "./load-studio-work-session-workspace";

// A lazy resource caches rejection. Create a new resource only for a user-initiated attempt.
const createAttempt = (workId: string, sequence = 0, expanded = false) => ({
  workId, sequence, expanded, Workspace: lazy(loadStudioWorkSessionWorkspace),
});
class SessionBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
/** Explicit entry: no API reads or mutations before the user opens the session workspace. */
export function StudioWorkSessionEntry({ workId }: { readonly workId: string }) {
  const bt = useBilingual("StudioWorkSessionEntry");
  const [attempt, setAttempt] = useState(() => createAttempt(workId));
  const current = attempt.workId === workId ? attempt : createAttempt(workId);
  if (current !== attempt) setAttempt(current);
  const { expanded, Workspace } = current;
  const retry = () => setAttempt(createAttempt(workId, current.sequence + 1, true));
  return <section className="rounded-xl border border-line bg-card p-4" data-work-session-entry="true">
    <button type="button" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm font-semibold" aria-expanded={expanded}
      onClick={() => expanded ? setAttempt({ ...current, expanded: false }) : retry()}>{bt("공동 작업 세션", "Collaborative work sessions")}</button>
    {expanded ? <div className="mt-4"><SessionBoundary key={current.sequence} fallback={<div role="alert" className="space-y-3 text-sm"><p>{bt("작업 세션 화면을 불러오지 못했습니다. 다시 시도해 주세요. 원고와 제작 보드는 변경하지 않았습니다.", "The session view could not be loaded. Please retry. Your manuscript and production board were not changed.")}</p><button type="button" className="min-h-11 rounded-lg border border-line bg-panel px-3 font-semibold" onClick={retry}>{bt("세션 화면 다시 불러오기", "Retry loading sessions")}</button></div>}>
      <Suspense fallback={<p role="status" className="text-sm">{bt("세션 화면 불러오는 중…", "Loading sessions…")}</p>}><Workspace workId={workId} /></Suspense>
    </SessionBoundary></div> : null}
  </section>;
}
