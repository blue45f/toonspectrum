import { StudioReviewDraftShelf } from "./StudioReviewDraftShelf";
import { StudioReviewNoteFilters } from "./StudioReviewNoteFilters";
import { nextReviewNoteId, reviewNoteMatches, type ReviewNoteView } from "./studio-review-note-query";
import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { validateStudioReviewSpatialAnchor } from "@toonspectrum/studio-project-model";
import { useSession } from "@/compat/auth-session-store";
import { getAuthSessionRevision, listeners as sessionListeners, type Session } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { createStudioReviewComment, newStudioProjectGraphId } from "../project-graph/studio-project-graph-client";
import type { StudioReviewCommentCreateInput } from "../project-graph/studio-project-graph-contract";
import { getStudioTeam } from "../studio-team-client";
import { StudioReviewEditorLink } from "../review-handoff/StudioReviewEditorLink";
import { StudioReviewTaskCompletion } from "../review-task-completion/StudioReviewTaskCompletion";
import { StudioReviewProductionConnection } from "../review-production/StudioReviewProductionConnection";
import { studioReviewResolutionMatchesComment, type StudioReviewResolutionRequest } from "../review-resolution/studio-review-resolution-route";
import { StudioReviewCommentAssignment } from "./StudioReviewCommentAssignment";
import { studioReviewRosterName, useStudioReviewRoster } from "./use-studio-review-roster";
import { normalizeStudioReviewAssignees, studioReviewAssigneesAllowed, studioReviewDueAt } from "./studio-review-comment-assignment";
import { verifyStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";
import { StudioPinnedReviewPreview } from "./StudioPinnedReviewPreview";
import { StudioPinnedReviewWorkflow } from "./StudioPinnedReviewWorkflow";
import { StudioPinnedReviewComparison } from "./StudioPinnedReviewComparison";
import { StudioReviewVoiceNotes } from "./StudioReviewVoiceNotes";
import { StudioReviewAnnotationLocation, type StudioReviewAnnotationSelection } from "./StudioReviewSpatialAnnotation";

const StudioReviewResolution = lazy(async () => ({ default: (await import("../review-resolution/StudioReviewResolution")).StudioReviewResolution }));
const StudioReviewExport = lazy(async () => ({ default: (await import("../review-export/StudioReviewExport")).StudioReviewExport }));
const StudioPinnedReviewShareManager = lazy(async () => ({ default: (await import("../review-share/StudioPinnedReviewShareManager")).StudioPinnedReviewShareManager }));

/** A pinned server review. This surface never substitutes the latest editable document. */
export function StudioPinnedReviewPanel({
  subject,
  resolutionRequest = null,
  showShareTools = true,
  showExportTools = true,
}: {
  readonly subject: StudioVirtualSpaceReviewSubject | null;
  readonly resolutionRequest?: StudioReviewResolutionRequest | null;
  /** Keep review work focused when sharing is presented in a separate delivery hub. */
  readonly showShareTools?: boolean;
  /** Keep approved export and delivery actions in their dedicated delivery hub. */
  readonly showExportTools?: boolean;
}) {
  const session = useSession();
  const actorId = session.data?.user.id ?? null;
  // Actor changes remove private pixels/notes during the same render and give
  // drafts, idempotency identities and pending writes a separate owner.
  return <PinnedReviewForActor
    key={JSON.stringify([actorId, subject])}
    actorId={actorId}
    subject={subject}
    resolutionRequest={resolutionRequest}
    showShareTools={showShareTools}
    showExportTools={showExportTools}
  />;
}

function PinnedReviewForActor({ actorId, subject, resolutionRequest, showShareTools, showExportTools }: {
  readonly actorId: string | null;
  readonly subject: StudioVirtualSpaceReviewSubject | null;
  readonly resolutionRequest: StudioReviewResolutionRequest | null;
  readonly showShareTools: boolean;
  readonly showExportTools: boolean;
}) {
  const bt = useBilingual("StudioPinnedReviewPanel");
  const inputId = useId();
  const [noteView, setNoteView] = useState<ReviewNoteView>("all");
  const [noteQuery, setNoteQuery] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [result, setResult] = useState<StudioVirtualSpaceReviewVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"note" | "recommended" | "required">("note");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [annotation, setAnnotation] = useState<StudioReviewAnnotationSelection | null>(null);
  const [needsLocation, setNeedsLocation] = useState(false);
  const roster = useStudioReviewRoster({ actorId, workId: subject?.workId ?? null, enabled: result?.ok === true,
    autoStart: result?.ok === true && result.review.comments.some((comment) => Boolean(comment.assigneeIds?.length)) });
  const annotationRef = useRef<StudioReviewAnnotationSelection | null>(null);
  const annotationGeneration = useRef(0);
  const selectAnnotation = useCallback((next: StudioReviewAnnotationSelection | null) => {
    const prior = annotationRef.current;
    if (JSON.stringify(prior?.anchor ?? null) !== JSON.stringify(next?.anchor ?? null) || prior?.sha256 !== next?.sha256) ++annotationGeneration.current;
    if (prior && !next) setNeedsLocation(true);
    if (next) setNeedsLocation(false);
    annotationRef.current = next; setAnnotation(next);
  }, []);
  const generation = useRef(0);
  const readGeneration = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  // The mounted view relinquishes its pending UI state immediately. Old async
  // finally blocks cannot release a newer action after this generation changes.
  const invalidateActiveView = useCallback(() => {
    invalidate(); setBusy(false); setLoading(false); selectAnnotation(null);
  }, [invalidate, selectAnnotation]);
  // Invalidate at unmount commit, before a delayed authority promise can issue a
  // write under the next actor while passive effect cleanup is still pending.
  useLayoutEffect(() => invalidate, [invalidate]);
  const attempted = useRef<{ fingerprint: string; input: StudioReviewCommentCreateInput } | null>(null);
  const refresh = useCallback(async (retainCurrent = false) => {
    const own = ++readGeneration.current, scope = generation.current;
    const sessionRevision = getAuthSessionRevision();
    if (document.visibilityState === "hidden") return;
    if (!retainCurrent) { setResult(null); selectAnnotation(null); }
    setLoading(true);
    const next = !actorId ? { ok: false as const, reason: "access-denied" as const }
      : subject ? await verifyStudioVirtualSpaceReviewSubject(subject, "view") : { ok: false as const, reason: "invalid-subject" as const };
    if (scope !== generation.current || own !== readGeneration.current) return;
    if (sessionRevision !== getAuthSessionRevision()) { setResult(null); setLoading(false); return; }
    if (!next.ok || !next.project.access.comment || !["open", "changes-requested"].includes(next.review.status)) selectAnnotation(null);
    setResult(next.ok && next.expiresAt <= Date.now() ? { ok: false, reason: "unavailable" } : next); setLoading(false);
  }, [actorId, subject, selectAnnotation]);
  useEffect(() => {
    setBody(""); setSeverity("note"); setAssigneeIds([]); setDue(""); setNotice(""); attempted.current = null;
    void refresh();
    const focus = () => { void refresh(); };
    const visibility = () => {
      if (document.visibilityState === "hidden") { invalidateActiveView(); setResult(null); }
      else void refresh();
    };
    const sessionPublished = (session: Session) => {
      // Normal cookie reconciliation also advances the session revision. Start
      // a fresh read without remounting this actor's draft or retry identity.
      // The revision fence still cancels pending mutations; never replay them.
      if (actorId && session?.user.id === actorId) void refresh(true);
      else { invalidateActiveView(); ++readGeneration.current; setResult(null); }
    };
    sessionListeners.add(sessionPublished);
    globalThis.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => { invalidate(); sessionListeners.delete(sessionPublished); globalThis.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility); };
  }, [actorId, invalidate, invalidateActiveView, refresh]);
  useEffect(() => {
    if (!result?.ok) return;
    const ttl = result.expiresAt - Date.now();
    const renew = setTimeout(() => { void refresh(true); }, Math.max(0, ttl - 5_000));
    const expiry = setTimeout(() => { selectAnnotation(null); setResult(null); }, Math.max(0, ttl));
    return () => { clearTimeout(renew); clearTimeout(expiry); };
  }, [result, refresh, selectAnnotation]);
  const save = async () => {
    if (!actorId || !subject || !body.trim() || busy || needsLocation) return;
    const own = generation.current, text = body.trim(), sessionRevision = getAuthSessionRevision();
    const selected = annotationRef.current, selectionOwn = annotationGeneration.current;
    const dueDate = studioReviewDueAt(due), assigned = normalizeStudioReviewAssignees(assigneeIds);
    if (!dueDate.ok) { setNotice(bt("기한의 날짜와 시간을 확인해 주세요.", "Check the due date and time.")); return; }
    setBusy(true); setNotice("");
    try {
      const verified = await verifyStudioVirtualSpaceReviewSubject(subject, "view");
      if (own !== generation.current || sessionRevision !== getAuthSessionRevision() || selectionOwn !== annotationGeneration.current) return;
      if (!verified.ok || !verified.project.access.comment || !["open", "changes-requested"].includes(verified.review.status)) {
        selectAnnotation(null); setResult(verified); setNotice(bt("현재 검수본에 의견을 남길 권한이 없어요.", "You cannot comment on this review now.")); return;
      }
      if (assigned.length) {
        try {
          const team = await getStudioTeam(subject.workId);
          if (own !== generation.current || sessionRevision !== getAuthSessionRevision() || selectionOwn !== annotationGeneration.current) return;
          if (!studioReviewAssigneesAllowed(team, subject.workId, actorId, assigned)) {
            setNotice(bt("선택한 담당자의 현재 편집 권한을 확인해 주세요. 선택을 해제하거나 다시 배정할 수 있어요.", "Check the selected assignees' current edit access. Clear or update the selection.")); return;
          }
        } catch {
          if (own === generation.current && sessionRevision === getAuthSessionRevision()) setNotice(bt("담당자 권한을 확인하지 못해 저장하지 않았어요. 선택을 남겨 두었으니 다시 확인해 주세요.", "The note was not sent because assignee access could not be verified. Your selection is preserved. Please try again."));
          return;
        }
      }
      if (verified.expiresAt <= Date.now()) {
        setNotice(bt("권한 확인 시간이 지났어요. 검토 기록을 새로 확인한 뒤 다시 저장해 주세요.", "The access check expired. Refresh the review before saving again.")); return;
      }
      if (selected && (!annotationRef.current || annotationRef.current.expiresAt <= Date.now()
        || !validateStudioReviewSpatialAnchor(annotationRef.current.mapping, selected.anchor))) {
        selectAnnotation(null); setNotice(bt("의견 위치를 다시 확인해 주세요.", "Please select the note location again.")); return;
      }
      const artifact = verified.project.artifacts.find((item) => item.id === subject.artifactId)!;
      const anchor = { ...(selected?.anchor ?? { kind: "artifact" as const }), artifactId: subject.artifactId, revisionId: subject.revisionId, scope: artifact.scope };
      const fingerprint = JSON.stringify([subject, text, severity, anchor, assigned, dueDate.dueAt ?? null]);
      if (attempted.current?.fingerprint !== fingerprint) attempted.current = { fingerprint, input: {
        id: newStudioProjectGraphId("review-note"), body: text, severity,
        anchor, ...(assigned.length ? { assigneeIds: assigned } : {}), ...(dueDate.dueAt ? { dueAt: dueDate.dueAt } : {}),
      } };
      await createStudioReviewComment(subject.reviewId, attempted.current.input);
      if (own !== generation.current || sessionRevision !== getAuthSessionRevision()) return;
      attempted.current = null; setBody(""); setAssigneeIds([]); setDue(""); selectAnnotation(null); setNeedsLocation(false);
      setNotice(bt("이 검수 버전에 의견을 남겼어요.", "Your note was saved to this review version."));
      await refresh();
    } catch {
      if (own === generation.current && sessionRevision === getAuthSessionRevision()) setNotice(bt("저장 결과를 확인하지 못했어요. 입력은 남겨 두었습니다. 목록을 새로 확인해 주세요.", "The save could not be confirmed. Your draft is preserved. Refresh the review before trying again."));
    } finally { if (own === generation.current) setBusy(false); }
  };
  const draftDue = studioReviewDueAt(due);
  const draftArtifact = result?.ok ? result.project.artifacts.find((item) => item.id === subject?.artifactId) : null;
  const draftCompose = result?.ok && result.project.access.comment && ["open", "changes-requested"].includes(result.review.status) && subject && draftArtifact && body.trim() && draftDue.ok && !needsLocation && !attempted.current
    && (!annotation || validateStudioReviewSpatialAnchor(annotation.mapping, annotation.anchor))
    ? { body: body.trim(), severity, assigneeIds: normalizeStudioReviewAssignees(assigneeIds),
        anchor: { ...(annotation?.anchor ?? { kind: "artifact" as const }), artifactId: subject.artifactId, revisionId: subject.revisionId, scope: draftArtifact.scope },
        ...(draftDue.dueAt ? { dueAt: draftDue.dueAt } : {}) } : null;
  const jumpNote = (direction: -1 | 1) => {
    const notes = result?.ok ? result.review.comments : [];
    const ids = notes.filter((note) => reviewNoteMatches(note, noteView, noteQuery, actorId)).map((note) => note.id);
    const id = nextReviewNoteId(ids, activeNoteId, direction);
    if (!id) return;
    setActiveNoteId(id);
    const element = document.getElementById(`${inputId}-note-${id}`);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  };
  return <section className="rounded-2xl border border-line bg-card p-5 studio-vspace-pinned-review" aria-label={bt("고정된 검수본", "Pinned review")} data-space-interactive="true">
    <h2 className="text-lg font-bold">{bt("함께 검토하기", "Review together")}</h2>
    <p className="mt-2 text-sm text-fg-2">{bt("초대에서 지정한 검수본과 검토 기록입니다. 최신 작업본으로 자동 변경되지 않아요.", "This is the snapshot and review history specified in your invitation. It does not switch to the latest working version.")}</p>
    {loading ? <p role="status">{bt("권한과 검수본을 확인 중…", "Verifying access and snapshot…")}</p> : null}
    {result && !result.ok ? <p role="alert">{result.reason === "closed"
      ? bt("이 검수는 종료되었어요. 새 검수 초대를 받아 주세요.", "This review is closed. Ask for a new review invitation.")
      : result.reason === "version-mismatch" || result.reason === "invalid-subject"
        ? bt("초대의 검수 버전을 확인할 수 없어요. 다른 버전은 열지 않았습니다.", "This invitation's version could not be verified. No other version was opened.")
        : bt("검수본에 접근할 수 없어요. 연결과 작품 권한을 확인해 주세요.", "The review is unavailable. Check your connection and project access.")}</p> : null}
    {result?.ok ? <>
      <h3 className="mt-4 font-bold">{result.review.title}</h3>
      <p className="text-xs text-fg-3 break-all">{bt("검수 버전", "Review version")} · {result.subject.revisionId}</p>
      <details className="mt-2 text-xs"><summary className="flex min-h-11 cursor-pointer items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{bt("버전 식별 정보", "Version identity")}</summary><code className="break-all">{result.subject.rootGraphHash}</code></details>
      <StudioPinnedReviewPreview key={JSON.stringify(result.subject)} subject={subject ?? result.subject} onRevoked={() => { invalidateActiveView(); setResult({ ok: false, reason: "access-denied" }); }}
        notes={result.review.comments}
        annotation={result.project.access.comment && ["open", "changes-requested"].includes(result.review.status)
          ? { selected: annotation, onSelect: selectAnnotation, disabled: busy, commentInputId: inputId } : undefined} />
      <StudioPinnedReviewComparison subject={subject ?? result.subject} title={result.review.title}
        onRevoked={() => { invalidateActiveView(); setResult({ ok: false, reason: "access-denied" }); }} />
      <StudioReviewVoiceNotes subject={result.subject} canComment={result.project.access.comment && ["open", "changes-requested"].includes(result.review.status)} />
      <StudioReviewNoteFilters comments={result.review.comments} view={noteView} query={noteQuery} actorId={actorId}
        onView={setNoteView} onQuery={setNoteQuery} onJump={jumpNote} listId={`${inputId}-notes`} />
      <div id={`${inputId}-notes`} className="mt-4 space-y-3" aria-label={bt("검토 의견", "Review notes")}>
        {result.review.comments.map((comment) => <article key={comment.id} id={`${inputId}-note-${comment.id}`} tabIndex={-1}
          hidden={!reviewNoteMatches(comment, noteView, noteQuery, actorId)} aria-current={activeNoteId === comment.id ? "true" : undefined}
          className="rounded-xl border border-line p-3 outline-none focus:ring-2 focus:ring-accent">
          <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
          <p className="mt-2 text-xs text-fg-3"><StudioReviewAnnotationLocation anchor={comment.anchor ?? { kind: "artifact" }} /></p>
          <p className="mt-2 text-xs text-fg-3">{comment.severity === "required" ? bt("수정 필요", "Required") : comment.severity === "recommended" ? bt("제안", "Suggestion") : bt("메모", "Note")} · {comment.status === "resolved" ? bt("해결됨", "Resolved") : comment.status === "dismissed" ? bt("보류 처리", "Dismissed") : bt("검토 중", "Open")}</p>
          {comment.assigneeIds?.length ? <p className="mt-2 break-words text-xs text-fg-3">{bt("담당자", "Assignees")} · {comment.assigneeIds.map((id) =>
            studioReviewRosterName(roster, id) ?? bt("현재 확인할 수 없는 담당자", "Assignee currently unavailable")).join(", ")}</p> : null}
          {comment.dueAt ? <p className="mt-1 text-xs text-fg-3">{bt("완료 기한", "Due date")} · <time dateTime={comment.dueAt}>{new Date(comment.dueAt).toLocaleString()}</time></p> : null}
          {result.project.access.edit && comment.anchor?.source ? <div className="mt-2"><StudioReviewEditorLink request={{ subject: result.subject, commentId: comment.id }} /></div> : null}
          {result.project.access.edit ? <div className="mt-2"><StudioReviewProductionConnection request={{ subject: result.subject, commentId: comment.id }} /></div> : null}
          {result.project.access.edit && comment.status === "resolved" ? <div className="mt-2"><StudioReviewTaskCompletion request={{ subject: result.subject, commentId: comment.id }} /></div> : null}
          {result.project.access.edit && resolutionRequest && studioReviewResolutionMatchesComment(resolutionRequest, result.subject, comment.id)
            ? <Suspense fallback={<p role="status">{bt("수정 검토를 불러오는 중…", "Loading correction review…")}</p>}>
              <StudioReviewResolution request={resolutionRequest} onRecorded={() => { void refresh(true); }}
                onRevoked={() => { invalidateActiveView(); setResult({ ok: false, reason: "access-denied" }); }} />
            </Suspense> : null}
        </article>)}
        {!result.review.comments.length ? <p className="text-sm">{bt("아직 검토 의견이 없어요.", "No review notes yet.")}</p> : null}
      </div>
      {result.project.access.comment && ["open", "changes-requested"].includes(result.review.status) ? <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="mb-3 rounded-lg border border-line p-3 text-sm" aria-live="polite">
          {needsLocation ? bt("위치를 다시 선택하거나 전체 검수본 의견으로 바꿔 주세요.", "Select a location again or choose a note on the whole review.")
            : annotation ? <StudioReviewAnnotationLocation anchor={annotation.anchor} /> : bt("전체 검수본에 의견을 남깁니다.", "Your note will apply to the whole review.")}
          {annotation || needsLocation ? <button type="button" className="ml-2 min-h-11 rounded-lg border border-line px-3" disabled={busy}
            onClick={() => { selectAnnotation(null); setNeedsLocation(false); }}>{bt("전체 검수본에 의견", "Use whole review")}</button> : null}
        </div>
        <label htmlFor={inputId} className="text-sm font-semibold">{bt("이 버전에 의견 남기기", "Leave a note on this version")}</label>
        <textarea id={inputId} className="mt-2 w-full rounded-lg border border-line bg-card p-3" rows={3} maxLength={20_000} value={body}
          onChange={(event) => setBody(event.target.value)} disabled={busy} />
        <label className="mt-2 block text-sm">{bt("의견 유형", "Note type")}
          <select className="ml-2 min-h-11 rounded-lg border border-line bg-card px-2" value={severity} disabled={busy} onChange={(event) => setSeverity(event.target.value as typeof severity)}>
            <option value="note">{bt("메모", "Note")}</option><option value="recommended">{bt("제안", "Suggestion")}</option><option value="required">{bt("필수 수정", "Required change")}</option>
          </select>
        </label>
        {subject && actorId ? <StudioReviewCommentAssignment roster={roster} ids={assigneeIds} onChange={setAssigneeIds}
          due={due} onDueChange={setDue} disabled={busy} /> : null}
        <button type="submit" className="mt-2 min-h-11 rounded-lg border border-line px-4" disabled={busy || !body.trim() || needsLocation}>{busy ? bt("저장 중…", "Saving…") : bt("의견 저장", "Save note")}</button>

        {attempted.current && !busy ? <p className="mt-2 text-xs text-fg-2">{bt("직접 저장한 의견의 결과부터 다시 확인해 주세요. 중복 발행을 막기 위해 해당 입력의 개인 초안 추가는 잠시 중지했습니다.", "Reconcile the directly submitted note first. Adding that input as a private draft is paused to avoid duplicate publication.")}</p> : null}
      </form> : <p className="mt-3 text-xs">{bt("검토 기록을 열람하고 있습니다.", "You are viewing the review history.")}</p>}
      {actorId && subject ? <StudioReviewDraftShelf scope={{ actorId, subject }} compose={draftCompose} disabled={busy} onBusy={setBusy}
          onStored={() => { setBody(""); setAssigneeIds([]); setDue(""); selectAnnotation(null); setNeedsLocation(false); }}
          onPublished={() => { void refresh(true); }} /> : null}
      <StudioPinnedReviewWorkflow verified={result} onRefresh={() => { void refresh(true); }} onRevoked={() => { invalidateActiveView(); setResult({ ok: false, reason: "access-denied" }); }} />
      {showShareTools && result.project.access.edit ? <Suspense fallback={<p className="mt-3 text-sm" role="status">{bt("공유 도구를 불러오는 중…", "Loading sharing tools…")}</p>}><StudioPinnedReviewShareManager verified={result} /></Suspense> : null}
      {showExportTools && result.review.status === "approved" ? <Suspense fallback={null}><StudioReviewExport verified={result} /></Suspense> : null}
    </> : null}
    {notice ? <p className="mt-3 text-sm" role="status">{notice}</p> : null}
    <button type="button" className="mt-3 min-h-11 rounded-lg border border-line px-4" disabled={busy || loading} onClick={() => { void refresh(); }}>{bt("검토 기록 새로 확인", "Refresh review")}</button>
  </section>;
}
