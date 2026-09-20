import { useState } from "react";
import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioWorkSession } from "./use-studio-work-session";
import { StudioWorkSessionComposer } from "./StudioWorkSessionComposer";
import { StudioWorkSessionDetail } from "./StudioWorkSessionDetail";
import { sessionStatusLabels } from "./studio-work-session-presentation";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm";
export function StudioWorkSessionWorkspace({ workId, initialSessionId = null }: { readonly workId: string; readonly initialSessionId?: string | null }) {
  const bt = useBilingual("StudioWorkSessionWorkspace"), auth = useSession(), actor = auth.data?.user.id;
  return actor ? <WorkspaceForActor key={`${actor}:${workId}`} workId={workId} actorId={actor} initialSessionId={initialSessionId} />
    : <p role="status">{bt("로그인 후 이 작품의 작업 세션을 확인할 수 있습니다.", "Sign in to view this work's sessions.")}</p>;
}
function WorkspaceForActor({ workId, actorId, initialSessionId }: { readonly workId: string; readonly actorId: string; readonly initialSessionId: string | null }) {
  const bt = useBilingual("StudioWorkSessionWorkspace");
  const { controller, snapshot } = useStudioWorkSession(workId, actorId, initialSessionId);
  const [compose, setCompose] = useState(false);
  const busy = snapshot.phase === "loading" || snapshot.phase === "saving";
  const status = snapshot.view ? sessionStatusLabels[snapshot.view.session.status] : null;
  return <section className="space-y-4" aria-label={bt("함께 작업하는 세션", "Work sessions")} data-work-session-workspace="true">
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{bt("작업 세션", "Work sessions")}</h2>
      <div className="flex flex-wrap gap-2"><button type="button" className={control} disabled={busy || snapshot.pending} onClick={() => { setCompose(false); controller.select(null); }}>{bt("세션 목록", "Sessions")}</button>
        <button type="button" className={control} disabled={busy || snapshot.pending} aria-expanded={compose} onClick={() => setCompose((value) => !value)}>{bt("세션 초안 만들기", "New session draft")}</button></div>
    </header>
    <p className="text-sm text-fg-2">{bt("같은 고정 입력본으로 목적·메모·결과를 남깁니다. 참여 기록은 현재 접속 인원이 아니며, 세션 종료는 원고 승인이나 공개가 아닙니다.", "Keep purpose, notes and results tied to one pinned input. Participation is not online presence; closing is not approval or publication.")}</p>
    {busy ? <p role="status" className="text-sm">{snapshot.phase === "saving" ? bt("처리 결과 확인 중…", "Confirming the operation…") : bt("최신 세션 확인 중…", "Checking current session…")}</p> : null}
    {snapshot.reason ? <p role="status" className="rounded-lg border border-line p-3 text-sm">{snapshot.reason === "uncertain"
      ? bt("처리 결과를 확인하지 못했습니다. 같은 요청의 서버 기록을 먼저 조회하세요. 자동으로 다시 보내지 않습니다.", "The result is uncertain. Read the same server operation first. It is not automatically resent.")
      : snapshot.reason === "conflict" ? bt("다른 변경이 먼저 저장되었습니다. 최신 상태를 확인한 후 다시 판단하세요.", "Another change was saved first. Review the latest state before deciding again.")
        : snapshot.reason === "storage" ? bt("요청 복구 정보의 저장 공간에 문제가 있습니다. 이미 전송된 요청의 처리 결과는 별도로 확인해야 합니다.", "Request recovery storage is unavailable. Any request already sent still needs its outcome verified.")
          : snapshot.reason === "access-denied" ? bt("이 세션의 접근 권한을 확인할 수 없습니다. 민감한 내용은 숨겼습니다.", "Access could not be verified. Sensitive content is hidden.")
            : bt("작업 세션을 확인하지 못했습니다. 서버와 입력본 권한을 다시 확인하세요.", "The work session could not be verified. Check server availability and input access.")}</p> : null}
    <div className="flex flex-wrap gap-2"><button className={control} type="button" disabled={busy} onClick={() => { void controller.refresh(); }}>{bt("최신 상태 다시 읽기", "Read current state")}</button>
      {snapshot.pending ? <button className={control} type="button" disabled={busy || snapshot.reason === "access-denied"} onClick={() => { void controller.reconcile(true); }}>{bt("동일 요청 확인 후 재시도", "Verify and retry the same request")}</button> : null}</div>
    {compose ? <StudioWorkSessionComposer workId={workId} actorId={actorId} controller={controller} busy={busy || snapshot.pending} saving={snapshot.phase === "saving" || snapshot.pending} onCreated={() => setCompose(false)} /> : null}
    {!compose && snapshot.list ? <div className="space-y-2">
      {snapshot.list.items.map(({ session }) => <button type="button" key={session.id} className="block min-h-11 w-full rounded-lg border border-line p-3 text-left" disabled={busy || snapshot.pending} onClick={() => controller.select(session.id)}>
        <strong className="block text-sm">{session.title}</strong><span className="mt-1 block text-xs text-fg-2">{bt(sessionStatusLabels[session.status][0], sessionStatusLabels[session.status][1])} · v{session.version} · {session.purpose}</span>
      </button>)}
      {!snapshot.list.items.length ? <p>{bt("이 페이지에 열람 가능한 세션이 없습니다.", "No accessible sessions on this page.")}</p> : null}
      {snapshot.list.nextCursor ? <button type="button" className={control} disabled={busy} onClick={() => controller.select(null, snapshot.list!.nextCursor)}>{bt("다음 세션 목록", "Next sessions")}</button> : null}
    </div> : null}
    {!compose && snapshot.view && status ? <StudioWorkSessionDetail key={JSON.stringify([snapshot.view.session.id, snapshot.view.session.input])}
      view={snapshot.view} actorId={actorId} controller={controller} busy={busy || snapshot.pending} saving={snapshot.phase === "saving" || snapshot.pending} /> : null}
    <Link className="inline-flex min-h-11 items-center text-sm underline" href={`/studio/p/${encodeURIComponent(workId)}/review`}>{bt("원고 검수 작업실 열기", "Open manuscript review workspace")}</Link>
  </section>;
}
