import { ArrowRight, BriefcaseBusiness, Paintbrush, Plus, Search, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES, COLLABORATION_STATUS } from "../../../../../packages/core/src/collaboration";

import { CollaborationCard, CollaborationSafety, CollabLogin, CollabNotice, collabButton, collabInput, collabPrimary } from "./collaboration-ui";

import type { CollaborationList } from "../../../../../packages/core/src/collaboration";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { collaborationClient } from "@/platform/collaboration-client";
import { getApiErrorMessage } from "@/platform/api";
import { Container } from "@/shared/components/section";
import { useApp } from "@/shared/lib/store";

const SCOPE = "domains.collaboration.CollaborationBoardPage";

const categories = [
  { type: "team", label: "팀원 모집", enLabel: "Hire teammates", description: "이야기를 오래 함께 만들 동료", enDescription: "Long-term creative partners", icon: UsersRound },
  { type: "commission", label: "작업 의뢰", enLabel: "Commission work", description: "이번 회차에 필요한 전문 작업", enDescription: "Specialist help for this episode", icon: BriefcaseBusiness },
  { type: "available", label: "작업자 홍보", enLabel: "Promote yourself", description: "나의 작업 스타일과 가능 일정", enDescription: "Your style and availability", icon: Paintbrush },
] as const;
const views = { all: "전체 공고", mine: "내 공고", applied: "지원한 공고", saved: "저장한 공고" } as const;
const viewsEn = { all: "All posts", mine: "My posts", applied: "Applied", saved: "Saved" } as const;

const EN_LABELS: Record<string, string> = {
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
  "작업 분야": "Role",
  "보수 방식": "Pay",
  "작업 방식": "Work mode",
  "모집 상태": "Status",
};

export function CollaborationBoardPage() {
  const bt = useBilingual(SCOPE);
  useDocumentTitle(bt("구인·의뢰 · 웹툰을 함께 완성하는 곳", "Gigs & commissions · where webtoons get finished together"));
  const userId = useApp((state) => state.userId);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const type = params.get("type") || "all";
  const viewLabel = (key: keyof typeof views) => bt(views[key], viewsEn[key]);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params); next.delete("cursor");
    if (value === "all" && key !== "status") next.delete(key); else next.set(key, value);
    if (key === "view") next.delete("status");
    setParams(next);
  }
  // 게스트에게는 공개 공고 탐색만 노출 — 내 공고/지원/저장은 로그인 전용.
  const visibleViews = userId
    ? Object.entries(views)
    : Object.entries(views).filter(([key]) => key === "all");
  return <Container size="wide" className="py-8 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/10 via-panel to-canvas p-6 sm:p-10">
      <p className="eyebrow text-accent">TOONSTUDIO COLLABORATE</p>
      <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-fg sm:text-5xl">{bt("다음 회차, 함께 완성할 사람을 찾으세요.", "Find the person to finish the next episode with.")}</h1>
      <p className="mt-5 max-w-2xl text-base leading-8 text-fg-2">{bt("콘티부터 선화·채색·배경·3D까지. 팀원 모집, 보조 작업 의뢰, 작업자 포트폴리오를 한곳에서 연결합니다. 공고 등록과 지원은 무료예요.", "From storyboards to line art, color, backgrounds, and 3D. Hire teammates, commission work, and browse portfolios in one place. Posting and applying are free.")}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/collaborate/new" className={collabPrimary}><Plus size={17} aria-hidden="true" />{bt("모집 글 올리기", "Post a gig")}</Link>
        <a href="#collaboration-results" className={collabButton}><Search size={17} aria-hidden="true" />{bt("공고 둘러보기", "Browse posts")}</a>
      </div>
      <nav aria-label={bt("구인·의뢰 보조 메뉴", "Gigs auxiliary menu")} className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/collaborate/positions" className="min-h-11 content-center font-semibold text-accent underline-offset-4 hover:underline">{bt("조건 상세 검색", "Advanced search")}</Link>
        <Link href="/team/recruiting" className="min-h-11 content-center font-semibold text-fg-2 underline-offset-4 hover:text-accent hover:underline">{bt("인재·지원 관리", "Talent & applications")}</Link>
        <Link href="/collaborate/gallery" className="min-h-11 content-center font-semibold text-fg-2 underline-offset-4 hover:text-accent hover:underline">{bt("포트폴리오 전시", "Portfolio gallery")}</Link>
        <Link href="/showcase" className="inline-flex min-h-11 items-center gap-1 font-semibold text-fg-2 underline-offset-4 hover:text-accent hover:underline">{bt("창작 갤러리", "Creator gallery")}<ArrowRight size={16} aria-hidden="true" /></Link>
      </nav>
      <p className="mt-5 flex items-center gap-2 text-xs text-fg-3"><ShieldCheck size={15} aria-hidden="true" />{bt("지원 연락처 비공개 · 보수 조건 명시 · 결제 중개 없음", "Application contacts stay private · pay terms required · no payment brokering")}</p>
    </header>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">{categories.map(({ type: category, label, enLabel, description, enDescription, icon: Icon }) => <button key={category} type="button" aria-pressed={type === category} onClick={() => change("type", type === category ? "all" : category)} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-5 text-left transition-colors ${type === category ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-accent/50"}`}><Icon size={25} className="shrink-0 text-accent" aria-hidden="true" /><span className="font-bold text-fg">{bt(label, enLabel)}<span className="mt-1 block text-xs font-normal text-fg-3">{bt(description, enDescription)}</span></span></button>)}</div>
    <section id="collaboration-results" className="mt-8 scroll-mt-24" aria-label={bt("공고 검색과 필터", "Post search and filters")}>
      {visibleViews.length > 1 ? (
        <div className="flex flex-wrap gap-2">{visibleViews.map(([key]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => change("view", key)} className={`${collabButton} ${view === key ? "border-accent text-accent" : ""}`}>{viewLabel(key as keyof typeof views)}</button>)}</div>
      ) : null}
      <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); change("q", String(new FormData(event.currentTarget).get("q") || "").trim()); }}>
        <label className="min-w-0 flex-1"><span className="sr-only">{bt("공고 검색어", "Post search keyword")}</span><input key={params.get("q") || ""} name="q" type="search" maxLength={100} defaultValue={params.get("q") || ""} placeholder={bt("제목·작업 소개를 한글로 검색하세요", "Search titles and descriptions")} className={`${collabInput} mt-0`} /></label><button className={collabButton} type="submit"><Search size={17} aria-hidden="true" />{bt("검색", "Search")}</button>
      </form>
      <details className="mt-4 rounded-2xl border border-line bg-panel/60 px-4 py-1 open:pb-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-sm font-semibold text-fg-2 [&::-webkit-details-marker]:hidden">
          <span>{bt("상세 조건", "Detailed filters")}</span>
          <span className="text-xs font-normal text-fg-3">{bt("작업 분야 · 보수 · 방식 · 상태", "Role · pay · mode · status")}</span>
        </summary>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
          ["role", "작업 분야", COLLABORATION_ROLES], ["payType", "보수 방식", COLLABORATION_PAY], ["workMode", "작업 방식", COLLABORATION_MODES], ["status", "모집 상태", COLLABORATION_STATUS],
        ].map(([key, label, options]) => <label key={String(key)} className="text-xs font-medium text-fg-2">{bt(String(label), EN_LABELS[String(label)] ?? String(label))}<select aria-label={bt(String(label), EN_LABELS[String(label)] ?? String(label))} className={collabInput} value={params.get(String(key)) || (key === "status" && view === "all" ? "open" : "all")} onChange={(event) => change(String(key), event.target.value)}><option value="all">{bt("전체", "All")}</option>{Object.entries(options).map(([value, text]) => <option key={value} value={value}>{bt(String(text), EN_LABELS[String(text)] ?? String(text))}</option>)}</select></label>)}</div>
        <div className="mt-3 flex justify-end"><button type="button" onClick={() => setParams({})} className="min-h-11 text-sm text-fg-3 underline underline-offset-4">{bt("필터 초기화", "Reset filters")}</button></div>
      </details>
    </section>
    {view !== "all" && !userId ? <CollabLogin /> : <CollaborationResults key={`${params.toString()}:${userId || "guest"}`} params={params} userId={userId} onNext={(cursor) => { const next = new URLSearchParams(params); next.set("cursor", cursor); setParams(next); }} />}
    <div className="mt-10 grid gap-5 lg:grid-cols-2"><CollaborationSafety /><section className="rounded-2xl border border-line bg-panel p-5"><p className="eyebrow text-accent">FROM PEOPLE TO PRODUCTION</p><h2 className="mt-3 text-lg font-bold text-fg">{bt("동료를 만나고, 내 작업으로 이어가세요.", "Meet collaborators, keep building your own work.")}</h2><p className="mt-3 text-sm leading-7 text-fg-2">{bt("갤러리에서 작업 스타일을 확인하고, 공고에서 범위와 조건을 합의하세요. 지원만으로 스튜디오의 비공개 작업 권한이 생기지는 않습니다.", "Check styles in the gallery, agree on scope and terms in posts. Applying doesn't grant private studio access.")}</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/studio" className={collabButton}>{bt("내 작업", "My work")}</Link><Link href="/market" className={collabButton}>{bt("에셋 마켓", "Asset market")}</Link><Link href="/community" className={collabButton}>{bt("커뮤니티", "Community")}</Link></div></section></div>
  </Container>;
}
function CollaborationResults({ params, userId, onNext }: { params: URLSearchParams; userId: string | null; onNext: (cursor: string) => void }) {
  const bt = useBilingual(SCOPE);
  const [data, setData] = useState<CollaborationList | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0); const [busy, setBusy] = useState(false);
  const query = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    void collaborationClient.list(Object.fromEntries(new URLSearchParams(query)), controller.signal).then((value) => { if (!controller.signal.aborted) { setData(value); setError(""); } }).catch(async (reason: unknown) => { const message = await getApiErrorMessage(reason, bt("공고를 불러오지 못했어요.", "Couldn't load posts.")); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [query, refresh, bt]);
  async function save(id: string, saved: boolean) {
    if (!userId) { setNotice(bt("로그인 후 공고를 저장할 수 있어요. 상단의 계정 메뉴를 이용해 주세요.", "Sign in to save posts. Use the account menu above.")); return; }
    if (busy) return; setBusy(true);
    try { await collaborationClient.save(id, !saved); setRefresh((value) => value + 1); setNotice(saved ? bt("저장을 취소했어요.", "Removed from saved.") : bt("내 계정에 공고를 저장했어요.", "Saved to your account.")); }
    catch (reason) { setError(await getApiErrorMessage(reason, bt("저장에 실패했어요.", "Save failed."))); }
    finally { setBusy(false); }
  }
  return <section aria-label={bt("공고 목록", "Post list")} aria-busy={!data && !error}>
    {notice && <div className="mb-4"><CollabNotice>{notice}</CollabNotice></div>}
    {error && <div className="mb-4"><CollabNotice error>{error}<button type="button" onClick={() => setRefresh((value) => value + 1)} className={`${collabButton} ml-3`}>{bt("다시 불러오기", "Reload")}</button></CollabNotice></div>}
    {!data && !error && <div role="status" aria-label={bt("공고를 불러오는 중", "Loading posts")} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-line bg-panel p-5" aria-hidden="true">
          <div className="skeleton h-6 w-2/5 rounded-full" />
          <div className="skeleton mt-4 h-5 w-4/5 rounded-lg" />
          <div className="skeleton mt-2 h-5 w-3/5 rounded-lg" />
          <div className="skeleton mt-4 h-4 w-full rounded-lg" />
          <div className="skeleton mt-2 h-4 w-5/6 rounded-lg" />
          <div className="skeleton mt-6 h-4 w-1/3 rounded-lg" />
        </div>
      ))}
    </div>}
    {data && <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-fg-3"><p>{bt(`이 페이지의 공고 ${data.items.length}개 · 최신 등록순`, `${data.items.length} posts on this page · newest first`)}</p>{data.canModerate && <Link href="/collaborate/moderation" className="text-accent underline">{bt("신고 검토", "Review reports")}</Link>}</div>
      {data.items.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.items.map((post) => <CollaborationCard key={post.id} post={post} busy={busy} onSave={() => { void save(post.id, post.saved); }} />)}</div> : <ActionableEmptyState
        icon={UsersRound}
        art="search"
        title={bt("조건에 맞는 공고가 아직 없어요.", "No posts match these filters yet.")}
        description={bt("조건을 바꿔보거나, 첫 동료를 찾는 공고를 직접 등록해 보세요. 선화 보조·배경 의뢰·팀원 모집 작성 예시가 준비되어 있어요.", "Try different filters, or post your own gig to find your first collaborator. Templates for line-art help, background commissions, and team hiring are ready.")}
        primary={{ href: "/collaborate/new", label: bt("첫 공고 작성하기", "Post your first gig") }}
        secondary={{ href: "/collaborate", label: bt("필터 초기화", "Reset filters") }}
      />}
      {data.hasMore && data.nextCursor && <div className="mt-6 text-center"><button type="button" className={collabButton} onClick={() => onNext(data.nextCursor ?? "")}>{bt("다음 공고 보기", "Show more posts")}<ArrowRight size={16} aria-hidden="true" /></button></div>}
    </>}
  </section>;
}
