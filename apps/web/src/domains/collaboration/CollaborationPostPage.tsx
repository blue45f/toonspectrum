import { ArrowLeft, Bookmark, Pencil, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES, COLLABORATION_STATUS, COLLABORATION_TYPES, collaborationBudget } from "../../../../../packages/core/src/collaboration";
import { ApplicationPanel, ApplicationsPanel } from "./collaboration-application-panel";
import { ReportForm } from "./collaboration-report-form";
import { CollabField, CollabLogin, CollabNotice, CollaborationSafety, PortfolioLink, collabButton, collabInput } from "./collaboration-ui";
import type { CollaborationDetail } from "../../../../../packages/core/src/collaboration";
import type { CollaborationAction } from "./collaboration-application-panel";
import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";
import { getApiErrorMessage } from "@/infrastructure/api";
import { collaborationClient } from "@/infrastructure/collaboration-client";
import { Container } from "@/shared/components/section";
import {
  canShareCollaborationPost,
  compactPublicShareDescription,
} from "@/shared/lib/public-share-policy";
import { useApp } from "@/shared/lib/store";

const SharePageButton = lazy(async () => {
  const module = await import("@/shared/components/share-page-button");
  return { default: module.SharePageButton };
});

export function CollaborationPostPage() {
  const { id = "" } = useParams();
  const userId = useApp((state) => state.userId);
  return <PostContent key={`${id}:${userId || "guest"}`} id={id} userId={userId} />;
}
function PostContent({ id, userId }: { id: string; userId: string | null }) {
  const navigate = useNavigate();
  const [data, setData] = useState<CollaborationDetail | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const post = data?.post;
  const shareable = post ? canShareCollaborationPost(post) : false;
  const sharePath = id ? `/collaborate/${encodeURIComponent(id)}` : "/collaborate";
  const shareDescription = compactPublicShareDescription(
    post
      ? `${COLLABORATION_ROLES[post.role]} · ${collaborationBudget(post)} · ${post.details.description}`
      : null,
    "웹툰 제작을 함께할 창작자와 작업 의뢰를 찾아보세요.",
  );
  const publicMetaTitle = shareable ? post?.title ?? "구인·의뢰 공고" : "구인·의뢰 공고";
  const publicMetaDescription = shareable
    ? shareDescription
    : "웹툰 제작을 함께할 창작자와 작업 의뢰를 찾는 공간입니다.";

  useDocumentTitle(post ? `${post.title} · 구인·의뢰` : "구인·의뢰 공고");
  useMetaDescription(post ? publicMetaDescription : null);
  usePageSocialMeta({
    canonicalPath: sharePath,
    title: publicMetaTitle,
    description: publicMetaDescription,
    type: "article",
  });
  useEffect(() => {
    const controller = new AbortController();
    void collaborationClient.detail(id, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setData(result); setError(""); }
    }).catch(async (reason) => { const message = await getApiErrorMessage(reason, "공고를 불러오지 못했어요."); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [id, reload]);
  const act: CollaborationAction = async (work, success) => {
    if (busy) return false;
    setBusy(true); setError(""); setNote("");
    try { await work(); setNote(success); setReload((value) => value + 1); return true; }
    catch (reason) { setError(await getApiErrorMessage(reason, "요청을 완료하지 못했어요.")); return false; }
    finally { setBusy(false); }
  };
  async function remove() {
    if (busy || !globalThis.confirm("공고를 삭제할까요? 되돌릴 수 없으며, 지원서 내용과 연락처도 삭제됩니다.")) return;
    setBusy(true);
    try { await collaborationClient.remove(id); navigate("/collaborate?view=mine"); }
    catch (reason) { setError(await getApiErrorMessage(reason, "공고를 삭제하지 못했어요.")); setBusy(false); }
  }
  return <Container size="wide" className="py-8 sm:py-12">
    <Link href="/collaborate" className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-3"><ArrowLeft size={16} aria-hidden="true" />구인·의뢰 목록</Link>
    {error && <div className="my-5"><CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3`} onClick={() => setReload((value) => value + 1)}>다시 불러오기</button></CollabNotice></div>}
    {note && <div className="my-5"><CollabNotice>{note}</CollabNotice></div>}
    {!data && !error && <p role="status" className="py-16 text-center text-fg-3">공고를 불러오고 있어요.</p>}
    {data && post && <div className="mt-5 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <header className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
          <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-accent/10 px-3 py-2 text-accent">{COLLABORATION_TYPES[post.type]}</span><span className="rounded-full bg-raised px-3 py-2 text-fg-2">{COLLABORATION_ROLES[post.role]}</span><span className="rounded-full bg-raised px-3 py-2 text-fg-2">{COLLABORATION_STATUS[post.status === "open" && post.expired ? "closed" : post.status]}</span></div>
          <h1 className="mt-5 break-words text-2xl font-bold leading-snug text-fg sm:text-4xl">{post.title}</h1>
          <p className="mt-5 text-2xl font-bold text-accent">{collaborationBudget(post)}</p>
          <p className="mt-4 text-sm text-fg-3"><Link href={`/u/${encodeURIComponent(post.author.id)}`} className="font-semibold text-fg-2 underline-offset-4 hover:text-accent hover:underline">{post.author.name}</Link> · {new Date(post.createdAt).toLocaleDateString("ko-KR")} 등록</p>
          {post.hidden && <div className="mt-4"><CollabNotice error>운영자가 비공개 처리한 공고입니다. 공개 목록에는 나타나지 않으며 새 지원을 받지 않아요.</CollabNotice></div>}
        </header>
        {[["작품과 작업 소개", post.details.description], ["작업 분량·납품물·일정", post.details.deliverables], ["보수·지급 조건", post.details.compensation], ["저작권·크레딧·수정 범위", post.details.terms]].map(([label, text]) => <section key={label} className="rounded-2xl border border-line bg-panel p-6"><h2 className="text-lg font-bold text-fg">{label}</h2><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-8 text-fg-2">{text}</p></section>)}
        {data.canManage ? <ApplicationsPanel key={reload} id={id} busy={busy} act={act} /> : <ApplicationPanel data={data} userId={userId} busy={busy} act={act} />}
        {userId && <ReportForm id={id} busy={busy} act={act} />}
      </div>
      <aside className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-line bg-panel p-5"><h2 className="font-bold text-fg">협업 조건 한눈에</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="text-fg-3">보수 방식</dt><dd className="mt-1 font-semibold text-fg">{COLLABORATION_PAY[post.payType]}</dd></div>
            <div><dt className="text-fg-3">작업 방식</dt><dd className="mt-1 text-fg">{COLLABORATION_MODES[post.workMode]}{post.details.location ? ` · ${post.details.location}` : ""}</dd></div>
            <div><dt className="text-fg-3">모집 마감</dt><dd className="mt-1 text-fg">{post.details.deadline ? `${post.details.deadline} 23:59 (한국)` : "상시 접수"}</dd></div>
            {post.details.genre && <div><dt className="text-fg-3">장르·분위기</dt><dd className="mt-1 text-fg">{post.details.genre}</dd></div>}
            {post.details.tools.length > 0 && <div><dt className="text-fg-3">사용 도구</dt><dd className="mt-2 flex flex-wrap gap-2">{post.details.tools.map((tool) => <span key={tool} className="rounded-lg bg-raised px-2 py-1 text-xs text-fg-2">{tool}</span>)}</dd></div>}
          </dl>
          <PortfolioLink url={post.details.portfolioUrl} />
          {shareable && (
            <Suspense fallback={null}>
              <SharePageButton
                path={sharePath}
                text={post.title}
                description={shareDescription}
                label="공고 공유"
                actionLabel="공고 보기"
                className={`${collabButton} mt-4 w-full`}
              />
            </Suspense>
          )}
          {userId ? <button type="button" disabled={busy} aria-pressed={post.saved} className={`${collabButton} mt-4 w-full`} onClick={() => { void act(() => collaborationClient.save(id, !post.saved), post.saved ? "저장을 취소했어요." : "공고를 저장했어요."); }}><Bookmark size={16} aria-hidden="true" fill={post.saved ? "currentColor" : "none"} />{post.saved ? "저장 취소" : "공고 저장"}</button> : <div className="mt-4"><CollabLogin /></div>}
        </section>
        {data.canManage && <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <h2 className="font-bold text-fg">내 공고 관리</h2>
          <Link href={`/collaborate/${id}/edit`} className={`${collabButton} w-full`}><Pencil size={16} aria-hidden="true" />공고 수정</Link>
          <CollabField label="모집 상태 변경"><select disabled={busy} className={collabInput} value={post.status} onChange={(event) => { const status = event.target.value; void act(() => collaborationClient.status(id, status, post.version), "모집 상태를 변경했어요."); }}>{Object.entries(COLLABORATION_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CollabField>
          <button type="button" className={`${collabButton} w-full text-bad`} disabled={busy} onClick={() => { void remove(); }}><Trash2 size={16} aria-hidden="true" />공고 삭제</button>
        </section>}
        {data.canModerate && <section className="rounded-2xl border border-line p-5"><h2 className="font-bold text-fg">운영자 관리</h2><button type="button" className={`${collabButton} mt-3`} disabled={busy} onClick={() => { void act(() => collaborationClient.moderate(id, !post.hidden), "공개 여부를 변경했어요."); }}>{post.hidden ? "공개 복원" : "공고 비공개"}</button></section>}
        <CollaborationSafety />
        <Link href="/studio" className={`${collabButton} w-full`}>합의 후 내 작업으로 이동</Link>
      </aside>
    </div>}
  </Container>;
}
