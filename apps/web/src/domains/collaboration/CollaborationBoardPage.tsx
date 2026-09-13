import { ArrowRight, BriefcaseBusiness, Paintbrush, Plus, Search, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES, COLLABORATION_STATUS } from "../../../../../packages/core/src/collaboration";

import { CollaborationCard, CollaborationSafety, CollabLogin, CollabNotice, collabButton, collabInput, collabPrimary } from "./collaboration-ui";

import type { CollaborationList } from "../../../../../packages/core/src/collaboration";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { collaborationClient } from "@/infrastructure/collaboration-client";
import { getApiErrorMessage } from "@/infrastructure/api";
import { Container } from "@/shared/components/section";
import { useApp } from "@/shared/lib/store";

const categories = [
  { type: "team", label: "팀원 모집", description: "이야기를 오래 함께 만들 동료", icon: UsersRound },
  { type: "commission", label: "작업 의뢰", description: "이번 회차에 필요한 전문 작업", icon: BriefcaseBusiness },
  { type: "available", label: "작업자 홍보", description: "나의 작업 스타일과 가능 일정", icon: Paintbrush },
] as const;
const views = { all: "전체 공고", mine: "내 공고", applied: "지원한 공고", saved: "저장한 공고" } as const;

export function CollaborationBoardPage() {
  useDocumentTitle("구인·의뢰 · 웹툰을 함께 완성하는 곳");
  const userId = useApp((state) => state.userId);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const type = params.get("type") || "all";
  function change(key: string, value: string) {
    const next = new URLSearchParams(params); next.delete("cursor");
    if (value === "all" && key !== "status") next.delete(key); else next.set(key, value);
    if (key === "view") next.delete("status");
    setParams(next);
  }
  return <Container size="wide" className="py-8 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/10 via-panel to-canvas p-6 sm:p-10">
      <p className="eyebrow text-accent">TOONSTUDIO COLLABORATE</p>
      <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-fg sm:text-5xl">다음 회차,<br />함께 완성할 사람을 찾으세요.</h1>
      <p className="mt-5 max-w-2xl text-base leading-8 text-fg-2">콘티부터 선화·채색·배경·3D까지. 팀원 모집, 보조 작업 의뢰, 작업자 포트폴리오를 한곳에서 연결합니다. 공고 등록과 지원은 무료예요.</p>
      <div className="mt-6 flex flex-wrap gap-3"><Link href="/collaborate/new" className={collabPrimary}><Plus size={17} aria-hidden="true" />공고 등록하기</Link><Link href="/community/promote" className={collabButton}>신작·홍보 영상<ArrowRight size={16} aria-hidden="true" /></Link><Link href="/showcase" className={collabButton}>창작 갤러리<ArrowRight size={16} aria-hidden="true" /></Link></div>
      <p className="mt-5 flex items-center gap-2 text-xs text-fg-3"><ShieldCheck size={15} aria-hidden="true" />지원 연락처 비공개 · 보수 조건 명시 · 결제 중개 없음</p>
    </header>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">{categories.map(({ type: category, label, description, icon: Icon }) => <button key={category} type="button" aria-pressed={type === category} onClick={() => change("type", type === category ? "all" : category)} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-5 text-left transition-colors ${type === category ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-accent/50"}`}><Icon size={25} className="shrink-0 text-accent" aria-hidden="true" /><span className="font-bold text-fg">{label}<span className="mt-1 block text-xs font-normal text-fg-3">{description}</span></span></button>)}</div>
    <section className="mt-8" aria-label="공고 검색과 필터">
      <div className="flex flex-wrap gap-2">{Object.entries(views).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => change("view", key)} className={`${collabButton} ${view === key ? "border-accent text-accent" : ""}`}>{label}</button>)}</div>
      <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); change("q", String(new FormData(event.currentTarget).get("q") || "").trim()); }}>
        <label className="min-w-0 flex-1"><span className="sr-only">공고 검색어</span><input key={params.get("q") || ""} name="q" type="search" maxLength={100} defaultValue={params.get("q") || ""} placeholder="제목·작업 소개를 한글로 검색하세요" className={`${collabInput} mt-0`} /></label><button className={collabButton} type="submit"><Search size={17} aria-hidden="true" />검색</button>
      </form>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{[
        ["role", "작업 분야", COLLABORATION_ROLES], ["payType", "보수 방식", COLLABORATION_PAY], ["workMode", "작업 방식", COLLABORATION_MODES], ["status", "모집 상태", COLLABORATION_STATUS],
      ].map(([key, label, options]) => <label key={String(key)} className="text-xs font-medium text-fg-2">{String(label)}<select aria-label={String(label)} className={collabInput} value={params.get(String(key)) || (key === "status" && view === "all" ? "open" : "all")} onChange={(event) => change(String(key), event.target.value)}><option value="all">전체</option>{Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}</div>
      <div className="mt-3 flex justify-end"><button type="button" onClick={() => setParams({})} className="min-h-11 text-sm text-fg-3 underline underline-offset-4">필터 초기화</button></div>
    </section>
    {view !== "all" && !userId ? <CollabLogin /> : <CollaborationResults key={`${params.toString()}:${userId || "guest"}`} params={params} userId={userId} onNext={(cursor) => { const next = new URLSearchParams(params); next.set("cursor", cursor); setParams(next); }} />}
    <div className="mt-10 grid gap-5 lg:grid-cols-2"><CollaborationSafety /><section className="rounded-2xl border border-line bg-panel p-5"><p className="eyebrow text-accent">FROM PEOPLE TO PRODUCTION</p><h2 className="mt-3 text-lg font-bold text-fg">동료를 만나고, 내 작업으로 이어가세요.</h2><p className="mt-3 text-sm leading-7 text-fg-2">갤러리에서 작업 스타일을 확인하고, 공고에서 범위와 조건을 합의하세요. 지원만으로 스튜디오의 비공개 작업 권한이 생기지는 않습니다.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/studio" className={collabButton}>내 작업</Link><Link href="/market" className={collabButton}>에셋 마켓</Link><Link href="/community" className={collabButton}>커뮤니티</Link></div></section></div>
  </Container>;
}
function CollaborationResults({ params, userId, onNext }: { params: URLSearchParams; userId: string | null; onNext: (cursor: string) => void }) {
  const [data, setData] = useState<CollaborationList | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0); const [busy, setBusy] = useState(false);
  const query = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    void collaborationClient.list(Object.fromEntries(new URLSearchParams(query)), controller.signal).then((value) => { if (!controller.signal.aborted) { setData(value); setError(""); } }).catch(async (reason: unknown) => { const message = await getApiErrorMessage(reason, "공고를 불러오지 못했어요."); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [query, refresh]);
  async function save(id: string, saved: boolean) {
    if (!userId) { setNotice("로그인 후 공고를 저장할 수 있어요. 상단의 계정 메뉴를 이용해 주세요."); return; }
    if (busy) return; setBusy(true);
    try { await collaborationClient.save(id, !saved); setRefresh((value) => value + 1); setNotice(saved ? "저장을 취소했어요." : "내 계정에 공고를 저장했어요."); }
    catch (reason) { setError(await getApiErrorMessage(reason, "저장에 실패했어요.")); }
    finally { setBusy(false); }
  }
  return <section aria-label="공고 목록" aria-busy={!data && !error}>
    {notice && <div className="mb-4"><CollabNotice>{notice}</CollabNotice></div>}
    {error && <div className="mb-4"><CollabNotice error>{error}<button type="button" onClick={() => setRefresh((value) => value + 1)} className={`${collabButton} ml-3`}>다시 불러오기</button></CollabNotice></div>}
    {!data && !error && <p role="status" className="py-12 text-center text-fg-3">공고를 불러오고 있어요.</p>}
    {data && <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-fg-3"><p>이 페이지의 공고 {data.items.length}개 · 최신 등록순</p>{data.canModerate && <Link href="/collaborate/moderation" className="text-accent underline">신고 검토</Link>}</div>
      {data.items.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.items.map((post) => <CollaborationCard key={post.id} post={post} busy={busy} onSave={() => { void save(post.id, post.saved); }} />)}</div> : <div className="rounded-3xl border border-dashed border-line-strong bg-panel px-6 py-14 text-center"><UsersRound className="mx-auto text-accent" size={32} aria-hidden="true" /><h2 className="mt-5 text-xl font-bold text-fg">조건에 맞는 공고가 아직 없어요.</h2><p className="mt-3 text-sm leading-7 text-fg-3">조건을 바꿔보거나, 첫 동료를 찾는 공고를 직접 등록해 보세요.<br />선화 보조·배경 의뢰·팀원 모집 작성 예시가 준비되어 있어요.</p><Link href="/collaborate/new" className={`${collabPrimary} mt-6`}>첫 공고 작성하기</Link></div>}
      {data.hasMore && data.nextCursor && <div className="mt-6 text-center"><button type="button" className={collabButton} onClick={() => onNext(data.nextCursor ?? "")}>다음 공고 보기<ArrowRight size={16} aria-hidden="true" /></button></div>}
    </>}
  </section>;
}
