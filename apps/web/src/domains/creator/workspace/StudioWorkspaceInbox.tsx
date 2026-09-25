import { useEffect, useState } from "react";
import Link from "@/shared/navigation/router-link";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioWorkSessionEntry } from "../work-session/StudioWorkSessionEntry";
import { StudioHandoffEnvelopeInbox } from "../handoff-envelope/StudioHandoffEnvelope";
import { loadStudioServerProductionWorkspace, type StudioServerProductionSnapshot } from "../studio-production/studio-production-server-client";
import { listStudioVirtualSpaceReviewSubjects, studioVirtualSpaceReviewHref, type StudioVirtualSpaceReviewChoices } from "../virtual-space/studio-virtual-space-review-invitation";
import { studioWorkspaceAssignedTasks } from "./studio-workspace-inbox-projection";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm";
export function StudioWorkspaceInbox({ workId }: { readonly workId: string }) {
  const bt = useBilingual("StudioWorkspaceInbox");
  const session = useSession(), actor = session.data?.user.id;
  return actor ? <InboxForActor key={`${actor}:${workId}:${getAuthSessionRevision()}`} actor={actor} workId={workId} />
    : <p role="status">{bt("로그인 후 이 작품의 검수 요청과 인수인계를 확인할 수 있습니다.", "Sign in to view this work's reviews and handoffs.")}</p>;
}
function InboxForActor({ actor, workId }: { readonly actor: string; readonly workId: string }) {
  const bt = useBilingual("StudioWorkspaceInbox");
  const [revision, refresh] = useState(0);
  const [snapshot, setSnapshot] = useState<StudioServerProductionSnapshot | null>(null);
  const [taskFailure, setTaskFailure] = useState(false);
  const [reviews, setReviews] = useState<StudioVirtualSpaceReviewChoices | null>(null);
  const [query, setQuery] = useState("");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    let live = true;
    const abort = new AbortController(), authRevision = getAuthSessionRevision();
    setSnapshot(null); setTaskFailure(false); setReviews(null); setExpired(false);
    const current = () => live && !abort.signal.aborted && getAuthSessionRevision() === authRevision && getAuthUserId() === actor && document.visibilityState !== "hidden";
    const expire = () => { live = false; abort.abort(); setSnapshot(null); setTaskFailure(true); setReviews({ ok: false, reason: "unavailable" }); setExpired(true); };
    const timeout = setTimeout(expire, 15_000);
    listeners.add(expire);
    void loadStudioServerProductionWorkspace(workId, abort.signal).then((value) => {
      if (current()) { if (value.capabilities.view) setSnapshot(value); else setTaskFailure(true); }
    }, () => { if (current()) setTaskFailure(true); });
    void listStudioVirtualSpaceReviewSubjects(workId).then((value) => { if (current()) setReviews(value); }, () => {
      if (current()) setReviews({ ok: false, reason: "unavailable" });
    });
    const invalidate = () => {
      live = false; abort.abort(); setSnapshot(null); setReviews(null);
      if (document.visibilityState !== "hidden" && getAuthUserId() === actor) refresh((value) => value + 1);
    };
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => { live = false; abort.abort(); clearTimeout(timeout); listeners.delete(expire); window.removeEventListener("focus", invalidate); document.removeEventListener("visibilitychange", invalidate); };
  }, [workId, actor, revision]);
  const normalized = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = (value: string) => value.normalize("NFKC").toLocaleLowerCase().includes(normalized);
  const tasks = snapshot ? studioWorkspaceAssignedTasks(snapshot.document, actor).filter((task) => matches(task.title)) : [];
  const choices = reviews?.ok ? reviews.choices.filter((choice) => matches(`${choice.title} ${choice.artifactTitle}`)) : [];
  return <div className="space-y-5" data-workspace-inbox="true">
    <p className="text-sm text-fg-2">{bt("검수·담당 작업·인수인계를 같은 작품에서 확인합니다. 열람, 인수, 작업 완료와 승인은 별도입니다.", "Review requests, assigned work and handoffs for this work. Viewing, acceptance, completion and approval remain separate.")}</p>
    {expired ? <p role="status" className="text-sm">{bt("권한 확인 유효 시간이 지났습니다. 최신 상태를 다시 읽어 주세요.", "The access-check lease has expired. Read the latest state again.")}</p> : null}
    <label className="block text-sm">{bt("검수·담당 작업 찾기", "Find reviews or assigned tasks")}<input type="search" className={`${control} mt-1 w-full`} maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <button type="button" className={control} onClick={() => refresh((value) => value + 1)}>{bt("최신 상태 다시 확인", "Refresh current status")}</button>
    <section aria-label={bt("담당 작업", "Assigned work")}><h3 className="font-semibold">{bt("내 담당 작업", "Assigned to me")}</h3>
      {taskFailure ? <p role="status">{bt("담당 작업을 확인하지 못했습니다. 인수인계와 검수 상태는 각각 확인합니다.", "Assigned work could not be loaded. Handoffs and reviews have independent status.")}</p>
        : !snapshot ? <p role="status">{bt("담당 작업 확인 중…", "Checking assigned work…")}</p>
          : tasks.length ? <ul className="mt-2 space-y-2">{tasks.map((task) => <li key={task.id} className="rounded-lg border border-line p-3">
            <strong>{task.title}</strong><p className="text-sm">{task.due} · {task.status === "blocked" ? bt("막힘", "Blocked") : task.status === "doing" ? bt("진행 중", "In progress") : bt("시작 전", "To do")}</p>
            {task.blockedReason ? <p className="text-sm">{task.blockedReason}</p> : null}
            <Link className="inline-flex min-h-11 items-center underline" href={task.reviewRef ? studioVirtualSpaceReviewHref(task.reviewRef.subject) : `/studio/p/${encodeURIComponent(workId)}/production`}>
              {task.reviewRef ? bt("연결된 검수본 확인", "Open linked review") : bt("제작 보드에서 확인", "Open production board")}</Link>
          </li>)}</ul> : <p>{bt("현재 조건에 맞는 미완료 담당 작업이 없습니다.", "No incomplete assigned work matches this search.")}</p>}
    </section>
    <section aria-label={bt("고정 검수 요청", "Pinned review requests")}><h3 className="font-semibold">{bt("이 작품의 열린 검수", "Open reviews in this work")}</h3>
      {!reviews ? <p role="status">{bt("검수 요청 확인 중…", "Checking review requests…")}</p>
        : !reviews.ok ? <p role="status">{bt("열람 가능한 검수 목록을 확인하지 못했습니다. 권한 또는 서버 상태를 다시 확인하세요.", "Available reviews could not be verified. Check access and server status.")}</p>
          : choices.length ? <ul className="mt-2 space-y-2">{choices.map((choice) => <li key={choice.subject.reviewId} className="rounded-lg border border-line p-3">
            <strong>{choice.title}</strong><p className="break-all text-xs text-fg-3">{choice.artifactTitle} · {choice.subject.revisionId}</p>
            <Link className="inline-flex min-h-11 items-center underline" href={studioVirtualSpaceReviewHref(choice.subject)}>{bt("이 고정 검수본 열기", "Open this pinned review")}</Link>
          </li>)}</ul> : <p>{bt("현재 조건에 맞는 열린 검수가 없습니다.", "No open reviews match this search.")}</p>}
      {reviews?.ok && reviews.truncated ? <p className="text-xs">{bt("일부 최신 검수만 표시합니다. 전체 검수함에서 나머지를 확인하세요.", "Only a bounded set of recent reviews is shown. Check the review workspace for more.")}</p> : null}
    </section>
    <StudioWorkSessionEntry workId={workId} />
    <StudioHandoffEnvelopeInbox workId={workId} />
    <Link className="inline-flex min-h-11 items-center underline" href={`/studio/p/${encodeURIComponent(workId)}/review`}>{bt("검수 작업실 열기", "Open review workspace")}</Link>
  </div>;
}
