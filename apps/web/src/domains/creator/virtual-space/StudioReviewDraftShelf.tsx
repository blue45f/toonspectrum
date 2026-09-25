import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getAuthSessionRevision, getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { newStudioProjectGraphId } from "../project-graph/studio-project-graph-client";
import { StudioReviewAnnotationLocation } from "./StudioReviewSpatialAnnotation";
import { acquireReviewDraftRepository, reviewDraftScopeKey, type ReviewDraftInput, type ReviewDraftScope, type ReviewPrivateDraft } from "./studio-review-draft-shelf";
import { publishReviewDrafts } from "./studio-review-draft-publish";

const button = "min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50";
export function StudioReviewDraftShelf(props: Parameters<typeof ReviewDraftShelfForScope>[0]) {
  return <ReviewDraftShelfForScope key={reviewDraftScopeKey(props.scope)} {...props} />;
}
function ReviewDraftShelfForScope({ scope, compose, disabled, onBusy, onStored, onPublished }: {
  readonly scope: ReviewDraftScope; readonly compose: Omit<ReviewDraftInput, "id"> | null; readonly disabled: boolean;
  readonly onBusy: (value: boolean) => void; readonly onStored: () => void;
  readonly onPublished: () => void;
}) {
  const bt = useBilingual("StudioReviewDraftShelf");
  const [entries, setEntries] = useState<ReviewPrivateDraft[] | null>(null), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [confirm, setConfirm] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const generation = useRef(0), pending = useRef(false);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  const releaseOwnAction = useCallback(() => {
    invalidate();
    if (pending.current) { pending.current = false; onBusy(false); }
  }, [invalidate, onBusy]);
  useLayoutEffect(() => releaseOwnAction, [releaseOwnAction]);
  const run = async (action: "load" | "add" | "remove" | "publish" | "revise", id?: string) => {
    if (disabled || pending.current || getAuthUserId() !== scope.actorId) return;
    if (action === "add" && !compose) return;
    if (action === "publish" && (!confirm || !selected.length)) return;
    const own = generation.current, session = getAuthSessionRevision();
    const current = () => own === generation.current && session === getAuthSessionRevision() && getAuthUserId() === scope.actorId && document.visibilityState !== "hidden";
    pending.current = true; onBusy(true); setNotice("");
    try {
      const repository = await acquireReviewDraftRepository(); if (!current()) return;
      if (action === "publish") {
        const consent = selected.map((id) => {
          const entry = entries?.find((candidate) => candidate.input.id === id);
          if (!entry) throw new Error("Draft selection is stale");
          return entry.input;
        });
        const outcome = await publishReviewDrafts(scope, consent, repository, current); if (!current()) return;
        const latest = await repository.list(scope); if (!current()) return;
        setEntries(latest); setSelected([]); setConfirm(false);
        setNotice(outcome.stopped
          ? bt(`${outcome.confirmed.length}개 의견만 발행을 확인했습니다. 나머지는 보존했으며 같은 식별자로 결과를 다시 확인할 수 있습니다.`, `Confirmed ${outcome.confirmed.length} notes. Remaining drafts are preserved for reconciliation using the same identities.`)
          : bt(`${outcome.confirmed.length}개 의견 발행을 서버 기록에서 확인했습니다.`, `Confirmed ${outcome.confirmed.length} published notes in the server record.`));
        onPublished(); return;
      }
      const result = action === "load" ? await repository.list(scope) : action === "remove"
        ? await repository.remove(scope, id!, current) : action === "revise" ? await repository.reviseBody(scope, id!, edits[id!]!, current) : await repository.add(scope, { ...compose!, id: newStudioProjectGraphId("review-note") }, current);
      if (!current()) return;
      setEntries(result); setSelected([]); setConfirm(false);
      if (action === "add") onStored();
      if (action === "revise" || action === "remove") setEdits((prior) => { const next = { ...prior }; delete next[id!]; return next; });
      setNotice(bt("이 기기의 개인 초안입니다. 아직 팀에 발행되지 않은 초안과 결과 확인이 필요한 항목을 구분해 표시합니다.", "Personal drafts on this device. Unpublished drafts and attempts needing reconciliation are shown separately."));
    } catch {
      if (current()) setNotice(bt("개인 초안을 읽거나 저장하지 못했습니다. 입력과 기존 저장본은 유지됩니다. 기기 저장소와 한도(20개)를 확인해 주세요.", "Could not read or save drafts. Current input and stored drafts are preserved. Check device storage and the 20-draft limit."));
    } finally { pending.current = false; if (own === generation.current) onBusy(false); }
  };
  const edited = (entry: ReviewPrivateDraft) => Object.hasOwn(edits, entry.input.id) ? edits[entry.input.id]! : entry.input.body;
  return <details className="mt-4 rounded-xl border border-line p-3">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("개인 초안·묶음 발행", "Private drafts and batch publication")}</summary>
    <p className="my-2 text-xs text-fg-2">{bt("현재 계정과 고정 검수본에만 연결된 기기 저장입니다. 팀 공유·클라우드 백업이 아닙니다. 발행은 항목별로 확인하며 일부 실패를 전체 성공으로 처리하지 않습니다.", "Device-local storage for this account and pinned review only, not team sharing or cloud backup. Each publication is confirmed individually; partial failure is not full success.")}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={disabled || !compose} onClick={() => void run("add")}>{bt("초안에 담고 입력 비우기", "Save draft and clear input")}</button>
      <button type="button" className={button} disabled={disabled} onClick={() => void run("load")}>{bt("개인 초안 불러오기", "Load private drafts")}</button>
    </div>
    {entries?.map((entry) => <article key={entry.input.id} className="mt-3 rounded-lg border border-line p-3">
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-5" disabled={disabled || (edited(entry) !== entry.input.body)} checked={selected.includes(entry.input.id)} onChange={(event) => {
          setSelected((prior) => event.target.checked ? [...prior, entry.input.id] : prior.filter((value) => value !== entry.input.id)); setConfirm(false);
        }} />
        <span className="whitespace-pre-wrap break-words">{entry.input.body.length > 200 ? `${entry.input.body.slice(0, 200)}…` : entry.input.body}</span>
      </label>
      <p className="mt-2 text-xs text-fg-2"><StudioReviewAnnotationLocation anchor={entry.input.anchor} /> · {entry.state === "attempted" ? bt("발행 결과 확인 필요 · 내용 변경·삭제는 잠금", "Publication needs reconciliation; editing and deletion locked") : bt("미발행 개인 초안", "Unpublished personal draft")}</p>
      <details className="mt-2"><summary className="min-h-11 cursor-pointer text-xs">{bt("초안 본문 확인·수정", "Read or edit draft text")}</summary>
        <textarea className="w-full rounded-lg border border-line bg-panel p-2 text-sm" rows={4} maxLength={20_000} value={edited(entry)} disabled={disabled || entry.state === "attempted"}
          aria-label={bt(`개인 초안 ${entry.input.id} 본문`, `Private draft ${entry.input.id} text`)} onChange={(event) => {
            setEdits((prior) => ({ ...prior, [entry.input.id]: event.target.value })); setSelected((prior) => prior.filter((id) => id !== entry.input.id)); setConfirm(false);
          }} />
        <button type="button" className={button} disabled={disabled || entry.state === "attempted" || edited(entry) === entry.input.body || !edited(entry).trim()} onClick={() => void run("revise", entry.input.id)}>{bt("초안 본문 저장", "Save draft text")}</button>
      </details>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={disabled || entry.state === "attempted"} onClick={() => void run("remove", entry.input.id)}>{bt("미발행 초안 삭제", "Delete unpublished draft")}</button>
      </div>
    </article>)}
    {entries?.length === 0 ? <p className="mt-2 text-sm">{bt("이 검수본에 보관된 개인 초안이 없습니다.", "No private drafts for this review.")}</p> : null}
    {entries?.length ? <div className="mt-3 space-y-2">
      <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" className="size-5" disabled={disabled || !selected.length} checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />
        {bt(`선택한 ${selected.length}개 의견을 이 고정 검수본에 발행하거나 기존 결과를 확인합니다.`, `Publish or reconcile ${selected.length} selected notes on this exact pinned review.`)}</label>
      <button type="button" className={button} disabled={disabled || !confirm || !selected.length} onClick={() => void run("publish")}>{bt("선택한 초안 발행·결과 확인", "Publish or reconcile selected drafts")}</button>
    </div> : null}
    {notice ? <p className="mt-3 text-xs" role="status">{notice}</p> : null}
  </details>;
}
