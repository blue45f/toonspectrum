import { useLayoutEffect, useState } from "react";
import type { StudioWorkSession, StudioWorkSessionView } from "@toonspectrum/studio-project-model";
import Link from "@/compat/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";
import { useStudioReviewRoster } from "../virtual-space/use-studio-review-roster";
import { StudioWorkSessionPreview } from "./StudioWorkSessionPreview";
import { StudioWorkSessionResultPicker } from "./StudioWorkSessionResultPicker";
import { sessionStatusLabels } from "./studio-work-session-presentation";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm";
const noteLabels = { note: ["작업 메모", "Work note"], decision: ["결정 기록", "Decision"], unresolved: ["미결 문제", "Unresolved issue"],
  "material-choice": ["소재 선택 이유", "Material rationale"], "ai-evidence": ["AI 검토 메모", "AI review note"] } as const;
export function StudioWorkSessionDetail({ view, actorId, controller, busy }: {
  readonly view: StudioWorkSessionView; readonly actorId: string; readonly controller: StudioWorkSessionController; readonly busy: boolean;
}) {
  const bt = useBilingual("StudioWorkSessionDetail"), session = view.session;
  const roster = useStudioReviewRoster({ workId: session.workId, actorId, enabled: true, autoStart: true });
  const [body, setBody] = useState(""), [category, setCategory] = useState<StudioWorkSession["notes"][number]["category"]>("note");
  const [closing, setClosing] = useState<"close" | "cancel" | null>(null), [summary, setSummary] = useState(""), [confirmed, setConfirmed] = useState(false);
  useLayoutEffect(() => { setConfirmed(false); }, [session.version]);
  const terminal = session.status === "closed" || session.status === "cancelled", joined = session.participantUserIds.includes(actorId);
  const host = view.capabilities.edit, canWrite = joined && view.capabilities.comment && !terminal;
  const name = (id: string) => id === actorId ? bt("나", "Me") : roster.members?.find((member) => member.userId === id)?.name ?? bt("등록된 참여자", "Registered participant");
  const lifecycle = session.status === "draft" ? ["ready", "준비 완료", "Mark ready"] as const : session.status === "ready" ? ["start", "작업 시작", "Start session"] as const
    : session.status === "active" ? ["pause", "일시정지", "Pause"] as const : session.status === "paused" ? ["resume", "작업 재개", "Resume session"] as const : null;
  return <article className="space-y-4" data-work-session-id={session.id}>
    <header><h3 className="text-lg font-semibold">{session.title}</h3><p className="text-sm text-fg-2">{bt(sessionStatusLabels[session.status][0], sessionStatusLabels[session.status][1])} · v{session.version}</p><p className="mt-2 whitespace-pre-wrap text-sm">{session.purpose}</p></header>
    <section className="rounded-lg border border-line p-3"><h4 className="font-semibold">{bt("참여 기록", "Participation record")}</h4>
      <p className="text-sm">{session.participantUserIds.map(name).join(" · ") || bt("참여 기록 없음", "No participants")}</p>
      <p className="mt-1 text-xs text-fg-2">{bt("현재 온라인 인원이 아닙니다. 다른 시각에 같은 입력본과 기록을 다시 확인할 수 있습니다.", "This is not online presence. Participants can revisit the same input and record later.")}</p>
      {!terminal ? <button className={`${control} mt-2`} type="button" disabled={busy || (host && joined && session.status === "active")}
        onClick={() => { void controller.command({ action: joined ? "leave" : "join" }); }}>{joined ? bt("세션 참여 종료", "Leave session") : bt("초대 수락하고 참여", "Accept invitation and join")}</button> : null}
      {host && joined && session.status === "active" ? <p className="text-xs text-fg-2">{bt("진행자는 먼저 일시정지하거나 세션을 종료한 뒤 나갑니다.", "The host must pause or close the session before leaving.")}</p> : null}
    </section>
    {host && joined && !terminal ? <div className="flex flex-wrap gap-2">
      {lifecycle ? <button type="button" className={control} disabled={busy} onClick={() => { void controller.command({ action: lifecycle[0] }); }}>{bt(lifecycle[1], lifecycle[2])}</button> : null}
      {["active", "paused"].includes(session.status) ? <button className={control} type="button" disabled={busy} onClick={() => { setClosing("close"); setConfirmed(false); }}>{bt("결과를 남기고 종료", "Close with an outcome")}</button> : null}
      <button className={control} type="button" disabled={busy} onClick={() => { setClosing("cancel"); setConfirmed(false); }}>{bt("세션 취소…", "Cancel session…")}</button>
    </div> : null}
    {closing && !terminal ? <form className="space-y-3 rounded-lg border border-line p-3" onSubmit={(event) => {
      event.preventDefault(); if (!confirmed || busy || (closing === "close" && !summary.trim())) return;
      void controller.command(closing === "close" ? { action: "close", summary } : { action: "cancel" });
    }}><h4 className="font-semibold">{closing === "close" ? bt("종료 결과", "Closing outcome") : bt("세션 취소 확인", "Confirm cancellation")}</h4>
      {closing === "close" ? <label className="block text-sm">{bt("결론·미결·다음 행동 (결론 없음도 명시)", "Conclusion, unresolved issues and next step (or explicitly no conclusion)")}<textarea required maxLength={4000} className="mt-1 min-h-24 w-full rounded border border-line bg-card p-2" value={summary} disabled={busy} onChange={(event) => setSummary(event.target.value)} /></label> : null}
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />{bt("기록은 남고 원고 승인·작업 완료·공개 상태는 바뀌지 않음을 확인합니다.", "I understand that the record remains and manuscript approval, task completion and publication do not change.")}</label>
      <div className="flex gap-2"><button type="submit" className={control} disabled={busy || !confirmed}>{bt("확인하고 적용", "Confirm")}</button><button type="button" className={control} disabled={busy} onClick={() => setClosing(null)}>{bt("돌아가기", "Go back")}</button></div>
    </form> : null}
    {session.closeSummary ? <section className="rounded-lg border border-line p-3"><h4 className="font-semibold">{bt("종료 시 남긴 결과", "Recorded outcome")}</h4><p className="whitespace-pre-wrap text-sm">{session.closeSummary}</p></section> : null}
    {session.kind === "reading" ? <section className="space-y-2 rounded-lg border border-line p-3"><h4 className="font-semibold">{bt("대본 리딩 차례", "Reading turn")}</h4>
      <p className="text-sm">{session.readerUserId ? name(session.readerUserId) : bt("아직 차례를 지정하지 않았습니다.", "No reading turn selected.")}</p>
      {host && joined && session.status === "active" ? <label className="block text-sm">{bt("다음 리딩 담당", "Next reader")}<select className={`${control} ml-2 max-w-full`} value={session.readerUserId ?? ""} disabled={busy} onChange={(event) => { void controller.command({ action: "reader", userId: event.target.value || null }); }}>
        <option value="">{bt("담당 없음", "No reader")}</option>{session.participantUserIds.map((id) => <option value={id} key={id}>{name(id)}</option>)}
      </select></label> : null}
      <p className="text-xs text-fg-2">{bt("차례 지정은 마이크나 녹음을 시작하지 않습니다.", "Selecting a reader does not start a microphone or recording.")}</p>
    </section> : null}
    <StudioWorkSessionPreview view={view} controller={controller} busy={busy} />
    <section className="space-y-2"><h4 className="font-semibold">{bt("메모·결정·미결 기록", "Notes, decisions and unresolved issues")}</h4>
      {session.notes.length ? <ul className="space-y-2">{session.notes.map((note) => <li key={note.id} className="rounded-lg border border-line p-3">
        <p className="text-xs text-fg-2">{bt(noteLabels[note.category][0], noteLabels[note.category][1])} · {name(note.authorUserId)} · {new Date(note.at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
      </li>)}</ul> : <p className="text-sm text-fg-2">{bt("아직 기록이 없습니다.", "No notes yet.")}</p>}
      {canWrite ? <form className="space-y-2" onSubmit={(event) => {
        event.preventDefault(); if (!body.trim()) return;
        const text = body;
        void controller.command({ action: "note", category, body: text }).then(() => {
          const current = controller.getSnapshot(); if (current.phase === "ready" && current.view?.session.notes.some((note) => note.authorUserId === actorId && note.body === text)) setBody("");
        });
      }}><fieldset disabled={busy} className="space-y-2"><label className="block text-sm">{bt("기록 유형", "Note type")}<select className={`${control} ml-2`} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
        {Object.entries(noteLabels).filter(([value]) => value !== "decision" || host).map(([value, label]) => <option key={value} value={value}>{bt(label[0], label[1])}</option>)}
      </select></label><label className="block text-sm">{bt("내용", "Content")}<textarea required maxLength={2000} className="mt-1 min-h-24 w-full rounded border border-line bg-card p-2" value={body} onChange={(event) => setBody(event.target.value)} /></label>
        <button className={control} type="submit" disabled={!body.trim()}>{bt("기록 저장", "Save note")}</button>
      </fieldset></form> : null}
      <p className="text-xs text-fg-2">{bt("소재·AI 메모는 사람이 작성한 검토 기록입니다. 소재 사용 허가, AI 실행 결과 검증 또는 검수 승인이 아닙니다.", "Material and AI notes are human-authored review records, not usage permission, verified AI execution or review approval.")}</p>
    </section>
    <section className="space-y-2"><h4 className="font-semibold">{bt("연결한 결과", "Linked outcomes")}</h4>
      {session.results.length ? <ul className="space-y-2">{session.results.map((result) => <li key={JSON.stringify(result)} className="rounded-lg border border-line p-3">
        {result.type === "review" ? <Link className="inline-flex min-h-11 items-center break-all text-sm underline" href={studioVirtualSpaceReviewHref(result.subject)}>{bt("고정 산출물 검수본", "Pinned output review")} · {result.subject.revisionId}</Link>
          : <><p className="break-all text-xs text-fg-2">{result.type === "task" ? bt("담당 작업 참조", "Task reference") : bt("인수인계 봉투 참조", "Handoff reference")} · {result.id}</p>
            <Link className="inline-flex min-h-11 items-center text-sm underline" href={`/studio/p/${encodeURIComponent(session.workId)}/production`}>{bt("제작 보드에서 현재 상태 확인", "Check the current state in production")}</Link></>}
      </li>)}</ul> : <p className="text-sm">{bt("아직 연결된 산출물이나 후속 작업이 없습니다.", "No linked outputs or follow-up work yet.")}</p>}
      {canWrite ? <StudioWorkSessionResultPicker input={session.input} workId={session.workId} actorId={actorId} controller={controller} busy={busy} /> : null}
    </section>
  </article>;
}
