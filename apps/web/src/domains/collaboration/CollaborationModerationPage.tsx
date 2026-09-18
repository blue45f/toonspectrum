import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useState } from "react";
import { CollabLogin, CollabNotice, collabButton } from "./collaboration-ui";
import type { CollaborationReport } from "../../../../../packages/core/src/collaboration";
import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { getApiErrorMessage } from "@/infrastructure/api";
import { collaborationClient } from "@/infrastructure/collaboration-client";
import { Container } from "@/shared/components/section";
import { useApp } from "@/shared/lib/store";

export function CollaborationModerationPage() {
  const userId = useApp((state) => state.userId);
  useDocumentTitle("구인·의뢰 신고 검토");
  return <Container size="wide" className="max-w-4xl py-10">
    <Link href="/collaborate" className="text-sm text-accent">{translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "구인·의뢰로 돌아가기")}</Link>
    <h1 className="mt-6 text-3xl font-bold text-fg">{translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "신고 검토")}</h1>
    <p className="mt-3 text-sm text-fg-3">{translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "운영자 전용 · 삭제되지 않은 공고의 최근 신고 100건")}</p>
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
    {error && <CollabNotice error>{error}<button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "en", "{v0} ml-3"), { v0: String(collabButton) })} onClick={() => setRefresh((value) => value + 1)}>{translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "다시 불러오기")}</button></CollabNotice>}
    {!items && !error && <p role="status">{translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "신고를 불러오고 있어요.")}</p>}
    {items?.length === 0 && <CollabNotice>{translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "접수된 신고가 없어요.")}</CollabNotice>}
    {items?.map((item, index) => <article key={`${item.postId}:${index}`} className="rounded-2xl border border-line bg-panel p-5">
      <Link href={formatI18nTemplate(translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "en", "/collaborate/{v0}"), { v0: String(item.postId) })} className="text-lg font-bold text-fg hover:text-accent">{item.title}</Link>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-fg-2">{item.reason}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-fg-3">{new Date(item.createdAt).toLocaleString("ko-KR")} · {item.hidden ? translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "비공개") : translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "공개 중")}</span><button type="button" disabled={busy} className={collabButton} onClick={() => { void moderate(item); }}>{item.hidden ? translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "공개 복원") : translateCurrentStaticSourceText("domains.collaboration.CollaborationModerationPage", "ko", "공고 비공개")}</button></div>
    </article>)}
  </div>;
}
