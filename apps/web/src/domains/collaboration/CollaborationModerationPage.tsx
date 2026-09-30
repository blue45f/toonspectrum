import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { CollabLogin, CollabNotice, collabButton } from "./collaboration-ui";
import { useAdminGate } from "../admin/components/admin-gate-state";
import type { CollaborationReport } from "../../../../../packages/core/src/collaboration";
import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { getApiErrorMessage } from "@/platform/api";
import { collaborationClient } from "@/platform/collaboration-client";
import { Container } from "@/shared/components/section";

const SCOPE = "domains.collaboration.CollaborationModerationPage";

export function CollaborationModerationPage() {
  const bt = useBilingual(SCOPE);
  const { gate, uid } = useAdminGate();
  useDocumentTitle(bt("구인·의뢰 신고 검토 · ToonStudio", "Gig & commission report review · ToonStudio"));
  return <Container size="wide" className="max-w-4xl py-10">
    <Link href="/collaborate" className="text-sm text-accent">{bt("구인·의뢰로 돌아가기", "Back to gigs & commissions")}</Link>
    <h1 className="mt-6 text-3xl font-bold text-fg">{bt("신고 검토", "Report review")}</h1>
    <p className="mt-3 text-sm text-fg-3">{bt("운영자 전용 · 삭제되지 않은 공고의 최근 신고 100건", "Moderator-only · latest 100 reports on non-deleted posts")}</p>
    <div className="mt-6">
      {gate.kind === "admin" ? <Reports key={uid ?? "admin"} />
        : gate.kind === "loading" ? <p role="status">{bt("운영자 권한을 확인하고 있어요.", "Checking moderator access…")}</p>
        : gate.kind === "guest" ? <CollabLogin />
        : gate.kind === "forbidden" ? <CollabNotice error>{bt("운영자만 접근할 수 있어요.", "Moderators only.")}</CollabNotice>
        : <CollabNotice error>{gate.message || bt("권한을 확인하지 못했어요.", "Couldn't verify access.")} <button type="button" className={`${collabButton} ml-3`} onClick={() => window.location.reload()}>{bt("다시 시도", "Retry")}</button></CollabNotice>}
    </div>
  </Container>;
}
function Reports() {
  const bt = useBilingual(SCOPE);
  const [items, setItems] = useState<CollaborationReport[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void collaborationClient.reports(controller.signal).then((result) => {
      if (!Array.isArray(result)) throw new Error(bt("신고 목록 응답을 확인하지 못했어요.", "Couldn't verify the report list response."));
      if (!controller.signal.aborted) { setItems(result); setError(""); }
    }).catch(async (reason) => { const message = await getApiErrorMessage(reason, bt("신고를 불러오지 못했어요.", "Couldn't load reports.")); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [refresh, bt]);
  async function moderate(item: CollaborationReport) {
    if (busy) return;
    setBusy(true);
    try { await collaborationClient.moderate(item.postId, !item.hidden); setRefresh((value) => value + 1); }
    catch (reason) { setError(await getApiErrorMessage(reason, bt("공개 여부를 변경하지 못했어요.", "Couldn't change visibility."))); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {error && <CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3`} onClick={() => setRefresh((value) => value + 1)}>{bt("다시 불러오기", "Reload")}</button></CollabNotice>}
    {!items && !error && <div role="status" aria-label={bt("신고를 불러오는 중", "Loading reports")} className="space-y-4" aria-hidden="true"><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-40 rounded-2xl" /></div>}
    {items?.length === 0 && (
      <ActionableEmptyState
        icon={ShieldCheck}
        art="generic"
        title={bt("접수된 신고가 없어요", "No reports received")}
        description={bt("현재 검토 대기 중인 구인·의뢰 신고가 없습니다. 새로운 신고가 접수되면 여기에 표시됩니다.", "No gig or commission reports are waiting for review. New reports will appear here.")}
        primary={{ href: "/collaborate", label: bt("구인·의뢰 게시판 보기", "View the gigs board") }}
        secondary={{ href: "/collaborate/new", label: bt("공고 등록하기", "Post a gig") }}
      />
    )}
    {items?.map((item, index) => <article key={`${item.postId}:${index}`} className="rounded-2xl border border-line bg-panel p-5">
      <Link href={`/collaborate/${item.postId}`} className="text-lg font-bold text-fg hover:text-accent">{item.title}</Link>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-fg-2">{item.reason}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-fg-3">{new Date(item.createdAt).toLocaleString("ko-KR")} · {item.hidden ? bt("비공개", "Hidden") : bt("공개 중", "Visible")}</span><button type="button" disabled={busy} className={collabButton} onClick={() => { void moderate(item); }}>{item.hidden ? bt("공개 복원", "Restore visibility") : bt("공고 비공개", "Hide post")}</button></div>
    </article>)}
  </div>;
}
