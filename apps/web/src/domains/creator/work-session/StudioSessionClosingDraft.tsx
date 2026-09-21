import { useState } from "react";
import type { StudioWorkSession } from "@toonspectrum/studio-project-model/work-session";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { buildStudioSessionClosingDraft } from "./studio-session-closing-draft";

const control = "min-h-11 max-w-full rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
interface Candidate { scope: string; version: number; text: string; previous: string }
export function StudioSessionClosingDraft({ session, currentSummary, busy, onApply }: {
  readonly session: StudioWorkSession; readonly currentSummary: string; readonly busy: boolean;
  readonly onApply: (text: string) => void;
}) {
  const bt = useBilingual("StudioSessionClosingDraft");
  const scope = JSON.stringify([session.workId, session.id, session.input]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  if (candidate && candidate.scope !== scope) { setCandidate(null); setReplaceConfirmed(false); }
  const visible = candidate?.scope === scope ? candidate : null;
  const stale = visible !== null && (visible.version !== session.version || visible.previous !== currentSummary);
  const oversized = Boolean(visible && visible.text.length > 4000);
  const canApply = visible && !busy && !stale && !oversized && (!currentSummary.trim() || replaceConfirmed);
  const generate = () => {
    if (busy) return;
    setCandidate({ scope, version: session.version, text: buildStudioSessionClosingDraft(session, bt), previous: currentSummary });
    setReplaceConfirmed(false);
  };
  return <section className="space-y-2 rounded-lg border border-line p-3" aria-label={bt("종료 초안 도우미", "Closing draft helper")}>
    <p className="text-xs text-fg-2">{bt("기록된 결정·미결·연결 작업을 옮겨 초안을 만듭니다. 자동 요약·승인·저장은 하지 않습니다.", "Copy recorded decisions, unresolved items and linked work into a draft. No automatic synthesis, approval or saving.")}</p>
    <button type="button" className={control} disabled={busy} onClick={generate}>{visible ? bt("최신 기록으로 다시 만들기", "Rebuild from current records") : bt("기록으로 종료 초안 만들기", "Create closing draft from records")}</button>
    {visible ? <>
      <label className="block text-sm">{bt("검토용 종료 초안", "Closing draft preview")}<textarea readOnly value={visible.text}
        className="mt-1 min-h-40 w-full rounded-lg border border-line bg-card p-2 text-sm" /></label>
      <p className="text-xs text-fg-3">v{visible.version} · {visible.text.length}/4000</p>
      {stale ? <p role="alert" className="text-sm">{bt("세션 기록 또는 종료 입력이 바뀌었습니다. 최신 기록으로 다시 만든 뒤 검토하세요.", "Session records or closing input changed. Rebuild and review the current draft.")}</p> : null}
      {oversized ? <p role="alert" className="text-sm">{bt("기록이 4,000자를 넘어 자동 적용하지 않습니다. 누락 없이 표시했으니 필요한 내용을 직접 정리하세요.", "The records exceed 4,000 characters and cannot be applied automatically. Nothing was truncated; edit the necessary content manually.")}</p> : null}
      {currentSummary.trim() ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={replaceConfirmed}
        disabled={busy || stale || oversized} onChange={(event) => setReplaceConfirmed(event.target.checked)} />{bt("기존 종료 입력을 이 초안으로 바꾸는 데 동의합니다.", "Replace the existing closing input with this draft.")}</label> : null}
      <div className="flex flex-wrap gap-2"><button type="button" className={control} disabled={!canApply} onClick={() => {
        if (!canApply) return;
        onApply(visible.text); setCandidate(null); setReplaceConfirmed(false);
      }}>{bt("검토한 초안 적용", "Apply reviewed draft")}</button>
        <button type="button" className={control} disabled={busy} onClick={() => { setCandidate(null); setReplaceConfirmed(false); }}>{bt("초안 미리보기 닫기", "Close draft preview")}</button></div>
    </> : null}
  </section>;
}
