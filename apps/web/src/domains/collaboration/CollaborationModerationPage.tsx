import { useEffect, useState } from "react";
import { CollabLogin, CollabNotice, collabButton } from "./collaboration-ui";
import type { CollaborationReport } from "../../../../../packages/core/src/collaboration";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { getApiErrorMessage } from "@/platform/api";
import { collaborationClient } from "@/platform/collaboration-client";
import { Container } from "@/shared/components/section";
import { useApp } from "@/shared/lib/store";

export function CollaborationModerationPage() {
  const userId = useApp((state) => state.userId);
  useDocumentTitle("구인·의뢰 신고 검토");
  return <Container size="wide" className="max-w-4xl py-10">
    <Link href="/collaborate" className="text-sm text-accent">구인·의뢰로 돌아가기</Link>
    <h1 className="mt-6 text-3xl font-bold text-fg">신고 검토</h1>
    <p className="mt-3 text-sm text-fg-3">운영자 전용 · 삭제되지 않은 공고의 최근 신고 100건</p>
    <div className="mt-6">{userId ? <Reports key={userId} /> : <CollabLogin />}</div>
  </Container>;
}
function Reports() {
  const [items, setItems] = useState<CollaborationReport[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void collaborationClient.reports(controller.signal).then((result) => {
      if (!Array.isArray(result)) throw new Error("신고 목록 응답을 확인하지 못했어요.");
      if (!controller.signal.aborted) { setItems(result); setError(""); }
    }).catch(async (reason) => { const message = await getApiErrorMessage(reason, "신고를 불러오지 못했어요."); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [refresh]);
  async function moderate(item: CollaborationReport) {
    if (busy) return;
    setBusy(true);
    try { await collaborationClient.moderate(item.postId, !item.hidden); setRefresh((value) => value + 1); }
    catch (reason) { setError(await getApiErrorMessage(reason, "공개 여부를 변경하지 못했어요.")); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {error && <CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3`} onClick={() => setRefresh((value) => value + 1)}>다시 불러오기</button></CollabNotice>}
    {!items && !error && <p role="status">신고를 불러오고 있어요.</p>}
    {items?.length === 0 && <CollabNotice>접수된 신고가 없어요.</CollabNotice>}
    {items?.map((item, index) => <article key={`${item.postId}:${index}`} className="rounded-2xl border border-line bg-panel p-5">
      <Link href={`/collaborate/${item.postId}`} className="text-lg font-bold text-fg hover:text-accent">{item.title}</Link>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-fg-2">{item.reason}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-fg-3">{new Date(item.createdAt).toLocaleString("ko-KR")} · {item.hidden ? "비공개" : "공개 중"}</span><button type="button" disabled={busy} className={collabButton} onClick={() => { void moderate(item); }}>{item.hidden ? "공개 복원" : "공고 비공개"}</button></div>
    </article>)}
  </div>;
}
