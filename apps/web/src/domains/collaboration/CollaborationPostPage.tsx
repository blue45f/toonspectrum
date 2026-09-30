import { ArrowLeft, Bookmark, Pencil, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES, COLLABORATION_STATUS, COLLABORATION_TYPES, collaborationBudget } from "../../../../../packages/core/src/collaboration";
import { ApplicationPanel, ApplicationsPanel } from "./collaboration-application-panel";
import { CollaborationConflictPanel, isCollaborationConflictError } from "./collaboration-conflict";
import { ReportForm } from "./collaboration-report-form";
import { CollabField, CollabLogin, CollabNotice, CollaborationSafety, PortfolioLink, collabButton, collabInput, collabPrimary } from "./collaboration-ui";
import type { CollaborationDetail } from "../../../../../packages/core/src/collaboration";
import type { CollaborationAction } from "./collaboration-application-panel";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import { getApiErrorMessage } from "@/platform/api";
import { isNotFoundError } from "@/platform/api-error";
import { collaborationClient } from "@/platform/collaboration-client";
import { Container } from "@/shared/components/section";
import { NotFoundPage } from "@/shared/components/feedback/NotFoundPage";
import {
  canShareCollaborationPost,
  compactPublicShareDescription,
} from "@/shared/lib/public-share-policy";
import { useApp } from "@/shared/lib/store";

import { HiringPublicPositions } from "./hiring/HiringPositionsPage";

import { HiringPostPanel } from "./hiring/HiringPostPanel";

const SCOPE = "domains.collaboration.CollaborationPostPage";

const EN_LABELS: Record<string, string> = {
  "팀원 모집": "Hire teammates",
  "작업 의뢰": "Commission work",
  "작업자 홍보": "Promote yourself",
  "스토리·콘티": "Story · storyboards",
  "러프·스케치": "Roughs · sketches",
  "선화": "Line art",
  "밑색": "Flats",
  "채색·명암": "Coloring · shading",
  "배경": "Backgrounds",
  "3D 모델·소재": "3D models · assets",
  "식자·편집": "Lettering · editing",
  "모션·영상": "Motion · video",
  "기타·복합 작업": "Other · mixed",
  "유료": "Paid",
  "금액 협의": "Negotiable",
  "수익 배분": "Revenue share",
  "자율 무보수 협업": "Unpaid volunteer collab",
  "원격": "Remote",
  "대면": "On-site",
  "혼합": "Hybrid",
  "모집 중": "Open",
  "진행 중": "In progress",
  "마감": "Closed",
};

const SCOPE = "domains.collaboration.CollaborationPostPage";

const EN_LABELS: Record<string, string> = {
  "팀원 모집": "Hire teammates",
  "작업 의뢰": "Commission work",
  "작업자 홍보": "Promote yourself",
  "스토리·콘티": "Story · storyboards",
  "러프·스케치": "Roughs · sketches",
  "선화": "Line art",
  "밑색": "Flats",
  "채색·명암": "Coloring · shading",
  "배경": "Backgrounds",
  "3D 모델·소재": "3D models · assets",
  "식자·편집": "Lettering · editing",
  "모션·영상": "Motion · video",
  "기타·복합 작업": "Other · mixed",
  "유료": "Paid",
  "금액 협의": "Negotiable",
  "수익 배분": "Revenue share",
  "자율 무보수 협업": "Unpaid volunteer collab",
  "원격": "Remote",
  "대면": "On-site",
  "혼합": "Hybrid",
  "모집 중": "Open",
  "진행 중": "In progress",
  "마감": "Closed",
};

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
  const bt = useBilingual(SCOPE);
  const navigate = useNavigate();
  const [data, setData] = useState<CollaborationDetail | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [conflict, setConflict] = useState(false);
  const post = data?.post;
  const shareable = post ? canShareCollaborationPost(post) : false;
  const sharePath = id ? `/collaborate/${encodeURIComponent(id)}` : "/collaborate";
  const shareDescription = compactPublicShareDescription(
    post
      ? `${COLLABORATION_ROLES[post.role]} · ${collaborationBudget(post)} · ${post.details.description}`
      : null,
    bt("웹툰 제작을 함께할 창작자와 작업 의뢰를 찾아보세요.", "Find creators and gigs to build webtoons together."),
  );
  const publicMetaTitle = shareable ? post?.title ?? bt("구인·의뢰 공고", "Gig post") : bt("구인·의뢰 공고", "Gig post");
  const publicMetaDescription = shareable
    ? shareDescription
    : bt("웹툰 제작을 함께할 창작자와 작업 의뢰를 찾는 공간입니다.", "A place to find creators and gigs for building webtoons.");

  useDocumentTitle(post ? `${post.title} · ${bt("구인·의뢰", "Gigs")}` : bt("구인·의뢰 공고", "Gig post"));
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
      if (!controller.signal.aborted) { setData(result); setError(""); setNotFound(false); }
    }).catch(async (reason) => {
      if (controller.signal.aborted) return;
      // 존재하지 않는 공고 id는 404 전용 화면으로 분리한다(일시 오류와 구분).
      if (isNotFoundError(reason)) {
        setNotFound(true);
        return;
      }
      setError(await getApiErrorMessage(reason, bt("공고를 불러오지 못했어요.", "Couldn't load the post.")));
    });
    return () => controller.abort();
  }, [id, reload, bt]);
  const act: CollaborationAction = async (work, success) => {
    if (busy) return false;
    setBusy(true); setError(""); setNote(""); setConflict(false);
    try { await work(); setNote(success); setReload((value) => value + 1); return true; }
    catch (reason) {
      if (isCollaborationConflictError(reason)) { setConflict(true); return false; }
      setError(await getApiErrorMessage(reason, bt("요청을 완료하지 못했어요.", "Couldn't complete the request."))); return false;
    }
    finally { setBusy(false); }
  };
  async function remove() {
    if (busy || !globalThis.confirm(bt("공고를 삭제할까요? 되돌릴 수 없으며, 지원서 내용과 연락처도 삭제됩니다.", "Delete this post? This can't be undone, and applications and contacts are deleted too."))) return;
    setBusy(true);
    try { await collaborationClient.remove(id); navigate("/collaborate?view=mine"); }
    catch (reason) { setError(await getApiErrorMessage(reason, bt("공고를 삭제하지 못했어요.", "Couldn't delete the post."))); setBusy(false); }
  }
  const label = (ko: string) => bt(ko, EN_LABELS[ko] ?? ko);
  if (notFound) return <NotFoundPage />;
  return <Container size="wide" className="py-8 sm:py-12">
    <Link href="/collaborate" className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-3"><ArrowLeft size={16} aria-hidden="true" />{bt("구인·의뢰 목록", "Gigs list")}</Link>
    {error && <div className="my-5"><CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3`} onClick={() => setReload((value) => value + 1)}>{bt("다시 불러오기", "Reload")}</button></CollabNotice></div>}
    {note && <div className="my-5"><CollabNotice>{note}</CollabNotice></div>}
    {conflict && <div className="my-5"><CollaborationConflictPanel busy={busy} onReload={() => { setConflict(false); setReload((value) => value + 1); }} onKeepEditing={() => setConflict(false)} /></div>}
    {!data && !error && <div role="status" aria-label={bt("공고를 불러오는 중", "Loading the post")} className="mt-5 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6" aria-hidden="true">
        <div className="skeleton h-56 rounded-3xl" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
      <div className="skeleton h-72 rounded-2xl" aria-hidden="true" />
    </div>}
    {data && post && <div className="mt-5 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <header className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
          <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-accent/10 px-3 py-2 text-accent">{label(COLLABORATION_TYPES[post.type])}</span><span className="rounded-full bg-raised px-3 py-2 text-fg-2">{label(COLLABORATION_ROLES[post.role])}</span><span className="rounded-full bg-raised px-3 py-2 text-fg-2">{label(COLLABORATION_STATUS[post.status === "open" && post.expired ? "closed" : post.status])}</span></div>
          <h1 className="mt-5 break-words text-2xl font-bold leading-snug text-fg sm:text-4xl">{post.title}</h1>
          <p className="mt-5 text-2xl font-bold text-accent">{collaborationBudget(post)}</p>
          <p className="mt-4 text-sm text-fg-3"><Link href={`/u/${encodeURIComponent(post.author.id)}`} className="font-semibold text-fg-2 underline-offset-4 hover:text-accent hover:underline">{post.author.name}</Link> · {new Date(post.createdAt).toLocaleDateString("ko-KR")} {bt("등록", "posted")}</p>
          {post.hidden && <div className="mt-4"><CollabNotice error>{bt("운영자가 비공개 처리한 공고입니다. 공개 목록에는 나타나지 않으며 새 지원을 받지 않아요.", "This post was hidden by a moderator. It doesn't appear in public lists and takes no new applications.")}</CollabNotice></div>}
        </header>
        {userId ? <HiringPostPanel key={`${id}:${reload}`} postId={id} postVersion={post.version} canManage={data.canManage} /> : <HiringPublicPositions postId={id} />}
        {[
          [bt("작품과 작업 소개", "Project & work"), post.details.description],
          [bt("작업 분량·납품물·일정", "Scope · deliverables · schedule"), post.details.deliverables],
          [bt("보수·지급 조건", "Pay & terms"), post.details.compensation],
          [bt("저작권·크레딧·수정 범위", "Rights · credits · revisions"), post.details.terms],
        ].map(([sectionTitle, text]) => <section key={sectionTitle} className="rounded-2xl border border-line bg-panel p-6"><h2 className="text-lg font-bold text-fg">{sectionTitle}</h2><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-8 text-fg-2">{text}</p></section>)}
        <div id="collaboration-application" className="scroll-mt-24">
          {data.canManage ? <ApplicationsPanel key={reload} id={id} busy={busy} act={act} /> : <ApplicationPanel data={data} userId={userId} busy={busy} act={act} />}
        </div>
        {userId && <ReportForm id={id} busy={busy} act={act} />}
      </div>
      <aside className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-line bg-panel p-5"><h2 className="font-bold text-fg">{bt("협업 조건 한눈에", "Terms at a glance")}</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="text-fg-3">{bt("보수 방식", "Pay model")}</dt><dd className="mt-1 font-semibold text-fg">{label(COLLABORATION_PAY[post.payType])}</dd></div>
            <div><dt className="text-fg-3">{bt("작업 방식", "Work mode")}</dt><dd className="mt-1 text-fg">{label(COLLABORATION_MODES[post.workMode])}{post.details.location ? ` · ${post.details.location}` : ""}</dd></div>
            <div><dt className="text-fg-3">{bt("모집 마감", "Deadline")}</dt><dd className="mt-1 text-fg">{post.details.deadline ? bt(`${post.details.deadline} 23:59 (한국)`, `${post.details.deadline} 23:59 (KST)`) : bt("상시 접수", "Always open")}</dd></div>
            {post.details.genre && <div><dt className="text-fg-3">{bt("장르·분위기", "Genre · mood")}</dt><dd className="mt-1 text-fg">{post.details.genre}</dd></div>}
            {post.details.tools.length > 0 && <div><dt className="text-fg-3">{bt("사용 도구", "Tools")}</dt><dd className="mt-2 flex flex-wrap gap-2">{post.details.tools.map((tool) => <span key={tool} className="rounded-lg bg-raised px-2 py-1 text-xs text-fg-2">{tool}</span>)}</dd></div>}
          </dl>
          <PortfolioLink url={post.details.portfolioUrl} />
          {shareable && (
            <Suspense fallback={null}>
              <SharePageButton
                path={sharePath}
                text={post.title}
                description={shareDescription}
                label={bt("공고 공유", "Share post")}
                actionLabel={bt("공고 보기", "View post")}
                className={`${collabButton} mt-4 w-full`}
              />
            </Suspense>
          )}
          {userId ? <button type="button" disabled={busy} aria-pressed={post.saved} className={`${collabButton} mt-4 w-full`} onClick={() => { void act(() => collaborationClient.save(id, !post.saved), post.saved ? bt("저장을 취소했어요.", "Removed from saved.") : bt("공고를 저장했어요.", "Post saved.")); }}><Bookmark size={16} aria-hidden="true" fill={post.saved ? "currentColor" : "none"} />{post.saved ? bt("저장 취소", "Unsave") : bt("공고 저장", "Save post")}</button> : <div className="mt-4"><CollabLogin /></div>}
        </section>
        {data.canManage && <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <h2 className="font-bold text-fg">{bt("내 공고 관리", "Manage my post")}</h2>
          <Link href={`/collaborate/${id}/edit`} className={`${collabButton} w-full`}><Pencil size={16} aria-hidden="true" />{bt("공고 수정", "Edit post")}</Link>
          <CollabField label={bt("모집 상태 변경", "Change status")}><select disabled={busy} className={collabInput} value={post.status} onChange={(event) => { const status = event.target.value; void act(() => collaborationClient.status(id, status, post.version), bt("모집 상태를 변경했어요.", "Status updated.")); }}>{Object.entries(COLLABORATION_STATUS).map(([key, text]) => <option key={key} value={key}>{label(text)}</option>)}</select></CollabField>
          <button type="button" className={`${collabButton} w-full text-bad`} disabled={busy} onClick={() => { void remove(); }}><Trash2 size={16} aria-hidden="true" />{bt("공고 삭제", "Delete post")}</button>
        </section>}
        {data.canModerate && <section className="rounded-2xl border border-line p-5"><h2 className="font-bold text-fg">{bt("운영자 관리", "Moderator tools")}</h2><button type="button" className={`${collabButton} mt-3`} disabled={busy} onClick={() => { void act(() => collaborationClient.moderate(id, !post.hidden), bt("공개 여부를 변경했어요.", "Visibility updated.")); }}>{post.hidden ? bt("공개 복원", "Restore visibility") : bt("공고 비공개", "Hide post")}</button></section>}
        <CollaborationSafety />
        <Link href="/studio" className={`${collabButton} w-full`}>{bt("합의 후 내 작업으로 이동", "Go to my work after agreeing")}</Link>
      </aside>
      {!data.canManage && ((data.application && data.application.status !== "withdrawn") || (post.status === "open" && !post.expired && !post.hidden)) ? (
        <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[55] rounded-2xl border border-line bg-panel/95 p-2 shadow-2xl backdrop-blur md:hidden">
          <a href="#collaboration-application" className={`${collabPrimary} w-full`}>
            {data.application && data.application.status !== "withdrawn" ? bt("내 지원 확인", "Check my application") : userId ? bt("이 공고에 지원하기", "Apply to this post") : bt("로그인 후 지원하기", "Sign in to apply")}
          </a>
        </div>
      ) : null}
    </div>}
  </Container>;
}
