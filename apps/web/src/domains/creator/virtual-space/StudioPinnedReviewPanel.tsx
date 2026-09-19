import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/compat/auth-session-store";
import { getAuthSessionRevision } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { createStudioReviewComment, newStudioProjectGraphId } from "../project-graph/studio-project-graph-client";
import type { StudioReviewCommentCreateInput } from "../project-graph/studio-project-graph-contract";
import { verifyStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";
import { StudioPinnedReviewPreview } from "./StudioPinnedReviewPreview";
import { StudioPinnedReviewWorkflow } from "./StudioPinnedReviewWorkflow";

/** A pinned server review. This surface never substitutes the latest editable document. */
export function StudioPinnedReviewPanel({ subject }: { readonly subject: StudioVirtualSpaceReviewSubject | null }) {
  const session = useSession();
  const actorId = session.data?.user.id ?? null;
  // Actor changes remove private pixels/notes during the same render and give
  // drafts, idempotency identities and pending writes a separate owner.
  return <PinnedReviewForActor key={JSON.stringify([actorId, subject])} actorId={actorId} subject={subject} />;
}

function PinnedReviewForActor({ actorId, subject }: {
  readonly actorId: string | null;
  readonly subject: StudioVirtualSpaceReviewSubject | null;
}) {
  const bt = useBilingual("StudioPinnedReviewPanel");
  const inputId = useId();
  const [result, setResult] = useState<StudioVirtualSpaceReviewVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"note" | "recommended" | "required">("note");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const readGeneration = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  // Invalidate at unmount commit, before a delayed authority promise can issue a
  // write under the next actor while passive effect cleanup is still pending.
  useLayoutEffect(() => invalidate, [invalidate]);
  const attempted = useRef<{ fingerprint: string; input: StudioReviewCommentCreateInput } | null>(null);
  const refresh = useCallback(async (retainCurrent = false) => {
    const own = ++readGeneration.current, scope = generation.current;
    const sessionRevision = getAuthSessionRevision();
    if (document.visibilityState === "hidden") return;
    if (!retainCurrent) setResult(null);
    setLoading(true);
    const next = !actorId ? { ok: false as const, reason: "access-denied" as const }
      : subject ? await verifyStudioVirtualSpaceReviewSubject(subject, "view") : { ok: false as const, reason: "invalid-subject" as const };
    if (scope !== generation.current || own !== readGeneration.current) return;
    if (sessionRevision !== getAuthSessionRevision()) { setResult(null); setLoading(false); return; }
    setResult(next.ok && next.expiresAt <= Date.now() ? { ok: false, reason: "unavailable" } : next); setLoading(false);
  }, [actorId, subject]);
  useEffect(() => {
    setBody(""); setSeverity("note"); setNotice(""); attempted.current = null;
    void refresh();
    const focus = () => { void refresh(); };
    const visibility = () => {
      if (document.visibilityState === "hidden") { invalidate(); setResult(null); setLoading(false); }
      else void refresh();
    };
    globalThis.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => { invalidate(); globalThis.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility); };
  }, [invalidate, refresh]);
  useEffect(() => {
    if (!result?.ok) return;
    const ttl = result.expiresAt - Date.now();
    const renew = setTimeout(() => { void refresh(true); }, Math.max(0, ttl - 5_000));
    const expiry = setTimeout(() => { setResult(null); }, Math.max(0, ttl));
    return () => { clearTimeout(renew); clearTimeout(expiry); };
  }, [result, refresh]);
  const save = async () => {
    if (!actorId || !subject || !body.trim() || busy) return;
    const own = generation.current, text = body.trim(), sessionRevision = getAuthSessionRevision();
    setBusy(true); setNotice("");
    try {
      const verified = await verifyStudioVirtualSpaceReviewSubject(subject, "view");
      if (own !== generation.current || sessionRevision !== getAuthSessionRevision()) return;
      if (!verified.ok || !verified.project.access.comment || !["open", "changes-requested"].includes(verified.review.status)) {
        setResult(verified); setNotice(bt("현재 검수본에 의견을 남길 권한이 없어요.", "You cannot comment on this review now.")); return;
      }
      const artifact = verified.project.artifacts.find((item) => item.id === subject.artifactId)!;
      const fingerprint = JSON.stringify([subject, text, severity]);
      if (attempted.current?.fingerprint !== fingerprint) attempted.current = { fingerprint, input: {
        id: newStudioProjectGraphId("review-note"), body: text, severity,
        anchor: { kind: "artifact", artifactId: subject.artifactId, revisionId: subject.revisionId, scope: artifact.scope },
      } };
      await createStudioReviewComment(subject.reviewId, attempted.current.input);
      if (own !== generation.current || sessionRevision !== getAuthSessionRevision()) return;
      attempted.current = null; setBody("");
      setNotice(bt("이 검수 버전에 의견을 남겼어요.", "Your note was saved to this review version."));
      await refresh();
    } catch {
      if (own === generation.current && sessionRevision === getAuthSessionRevision()) setNotice(bt("저장 결과를 확인하지 못했어요. 입력은 남겨 두었습니다. 목록을 새로 확인해 주세요.", "The save could not be confirmed. Your draft is preserved. Refresh the review before trying again."));
    } finally { if (own === generation.current) setBusy(false); }
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
      <details className="mt-2 text-xs"><summary>{bt("버전 식별 정보", "Version identity")}</summary><code className="break-all">{result.subject.rootGraphHash}</code></details>
      <StudioPinnedReviewPreview key={JSON.stringify(result.subject)} subject={subject ?? result.subject} onRevoked={() => { invalidate(); setResult({ ok: false, reason: "access-denied" }); }} />
      <div className="mt-4 space-y-3" aria-label={bt("검토 의견", "Review notes")}>
        {result.review.comments.map((comment) => <article key={comment.id} className="rounded-xl border border-line p-3">
          <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
          <p className="mt-2 text-xs text-fg-3">{comment.severity === "required" ? bt("수정 필요", "Required") : comment.severity === "recommended" ? bt("제안", "Suggestion") : bt("메모", "Note")} · {comment.status === "resolved" ? bt("해결됨", "Resolved") : comment.status === "dismissed" ? bt("보류 처리", "Dismissed") : bt("검토 중", "Open")}</p>
        </article>)}
        {!result.review.comments.length ? <p className="text-sm">{bt("아직 검토 의견이 없어요.", "No review notes yet.")}</p> : null}
      </div>
      {result.project.access.comment && ["open", "changes-requested"].includes(result.review.status) ? <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label htmlFor={inputId} className="text-sm font-semibold">{bt("이 버전에 의견 남기기", "Leave a note on this version")}</label>
        <textarea id={inputId} className="mt-2 w-full rounded-lg border border-line bg-card p-3" rows={3} maxLength={20_000} value={body}
          onChange={(event) => setBody(event.target.value)} disabled={busy} />
        <label className="mt-2 block text-sm">{bt("의견 유형", "Note type")}
          <select className="ml-2 min-h-11 rounded-lg border border-line bg-card px-2" value={severity} disabled={busy} onChange={(event) => setSeverity(event.target.value as typeof severity)}>
            <option value="note">{bt("메모", "Note")}</option><option value="recommended">{bt("제안", "Suggestion")}</option><option value="required">{bt("필수 수정", "Required change")}</option>
          </select>
        </label>
        <button type="submit" className="mt-2 min-h-11 rounded-lg border border-line px-4" disabled={busy || !body.trim()}>{busy ? bt("저장 중…", "Saving…") : bt("의견 저장", "Save note")}</button>
      </form> : <p className="mt-3 text-xs">{bt("검토 기록을 열람하고 있습니다.", "You are viewing the review history.")}</p>}
      <StudioPinnedReviewWorkflow verified={result} onRefresh={() => { void refresh(true); }} onRevoked={() => { invalidate(); setResult({ ok: false, reason: "access-denied" }); }} />
    </> : null}
    {notice ? <p className="mt-3 text-sm" role="status">{notice}</p> : null}
    <button type="button" className="mt-3 min-h-11 rounded-lg border border-line px-4" disabled={busy || loading} onClick={() => { void refresh(); }}>{bt("검토 기록 새로 확인", "Refresh review")}</button>
  </section>;
}
