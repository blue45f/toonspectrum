import { useCallback, useMemo, useState } from "react";

import type { ChangeEvent, SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { RESOURCE_BUTTON } from "./navigation";
import { ProviderStatus } from "./ProviderStatus";
import { ResearchCoverageMap } from "./ResearchCoverageMap";
import { ResearchMissionPanel } from "./ResearchMissionPanel";
import { ResearchSynthesisBoard } from "./ResearchSynthesisBoard";
import {
  buildResearchBriefMarkdown,
  researchNextAction,
  researchSearchHref,
  resourceLicenseLabel,
  sourceFreshness,
  summarizeResearchWorkspace,
} from "./research-dashboard";
import type { ResearchSearchMode } from "./research-dashboard";
import {
  recordResearchSearch,
  researchDeskBriefContext,
} from "./research-desk-session";
import { buildResearchNotebookMarkdown } from "./research-notebook";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { SavedBoard } from "./SavedBoard";
import { useResearchDeskSession } from "./useResearchDeskSession";
import { useResearchNotebook } from "./useResearchNotebook";
import { downloadText, useCreatorWorkspace } from "./workspace";

import { attributionMarkdown, deadlineLabel, parseWorkspace } from "@/shared/lib/creator-resources";

const RESEARCH_TOOLS = [
  {
    path: "/now",
    eyebrow: "장면 씨앗",
    title: "오늘의 영감",
    description: "사물·공간·빛·소리에서 5컷 미션을 시작합니다.",
    output: "빈 화면을 깨는 짧은 장면",
  },
  {
    path: "/research/assets",
    eyebrow: "시각 근거",
    title: "창작 레퍼런스",
    description: "복식·소품·미술 자료를 출처와 함께 모읍니다.",
    output: "장면 고증과 형태 참고",
  },
  {
    path: "/research/books",
    eyebrow: "판본 비교",
    title: "글로벌 판본 탐색",
    description: "작품명·작가·ISBN으로 여러 서지 제공처를 살펴봅니다.",
    output: "원작·판본·출판 정보",
  },
  {
    path: "/opportunities",
    eyebrow: "기회 추적",
    title: "작가 기회센터",
    description: "지원사업을 저장하고 마감 원문을 다시 확인합니다.",
    output: "지원 후보와 일정 단서",
  },
  {
    path: "/story-lab",
    eyebrow: "이야기 전환",
    title: "스토리 연구실",
    description: "자료를 인물의 욕망·장애물·전환점으로 구조화합니다.",
    output: "첫 화 기획 워크시트",
  },
  {
    path: "/publishing",
    eyebrow: "제출 준비",
    title: "연재·출판 준비실",
    description: "권리·원고·소개 자료의 준비 상태를 점검합니다.",
    output: "제출 전 확인 목록",
  },
] as const;

const DESK_SECTIONS = [
  ["#research-command", "질문·검색"],
  ["#workspace-overview", "작업 상태"],
  ["#research-coverage", "근거 공백"],
  ["#research-synthesis", "판단 노트"],
  ["#research-tools", "목적별 도구"],
  ["#saved-board", "저장 보드"],
  ["#research-export", "내보내기"],
] as const;

export function CreatorHubPage() {
  const navigate = useNavigate();
  const {
    workspace,
    update: updateWorkspace,
    restore,
    readSnapshot,
    ready,
    writable,
    saving,
    error,
  } = useCreatorWorkspace();
  const {
    session: researchSession,
    update: updateResearchSession,
    reset: resetResearchSession,
    ready: researchSessionReady,
    writable: researchSessionWritable,
    error: researchSessionError,
  } = useResearchDeskSession();
  const {
    notebook: researchNotebook,
    update: updateResearchNotebook,
    restore: restoreResearchNotebook,
    reset: resetResearchNotebook,
    ready: researchNotebookReady,
    writable: researchNotebookWritable,
    error: researchNotebookError,
  } = useResearchNotebook();
  const [providerStatusOpen, setProviderStatusOpen] = useState(false);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoring, setRestoring] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const summary = useMemo(() => summarizeResearchWorkspace(workspace), [workspace]);
  const nextAction = useMemo(() => researchNextAction(summary), [summary]);
  const briefContext = useMemo(() => researchDeskBriefContext(researchSession), [researchSession]);
  const recentItems = workspace.saved.slice(-3).reverse();

  const launchSearch = useCallback((mode: ResearchSearchMode, query: string) => {
    updateResearchSession((session) => recordResearchSearch(session, mode, query));
    navigate(researchSearchHref(mode, query));
  }, [navigate, updateResearchSession]);

  const exportResearchBrief = () => {
    const brief = buildResearchBriefMarkdown(workspace, new Date(), briefContext);
    const synthesis = buildResearchNotebookMarkdown(researchNotebook, workspace.saved);
    downloadText("toonstudio-research-brief.md", [brief, synthesis].filter(Boolean).join("\n\n"));
  };

  const importBackup = async (file: File | undefined) => {
    if (!file || restoring || saving) return;
    setRestoring(true);
    const mode = restoreMode;
    try {
      if (file.size > 1_000_000) throw new Error("1 MB 이하의 백업을 선택하세요.");
      const raw = await file.text();
      parseWorkspace(raw);
      const expectedRaw = mode === "replace" ? readSnapshot() : undefined;
      const question = mode === "merge"
        ? "현재 자료와 작성한 기획서는 유지하고, 백업의 새 자료·빈 기획 항목·체크 항목을 합칠까요?"
        : "현재 창작 보드·기획서·체크리스트를 모두 이 백업으로 대체할까요? 먼저 현재 보드를 백업하는 것을 권장합니다.";
      if (!window.confirm(question)) return;
      if (await restore(raw, mode, expectedRaw)) {
        setImportNotice(mode === "merge" ? "현재 작업을 유지하고 백업을 합쳤습니다." : "백업으로 보드를 대체했습니다.");
      }
    } catch (cause) {
      setImportNotice(cause instanceof Error ? cause.message : "백업을 읽지 못했습니다.");
    } finally {
      setRestoring(false);
    }
  };

  return <ResourceLayout
    title="창작 리서치 데스크"
    intro="한 질문에서 자료 탐색을 시작하고, 출처·이용조건·기획 진행도를 점검한 뒤 Story Lab과 Studio 작업으로 연결하세요. 외부 데이터는 제공처·조회일·이용조건을 함께 보존합니다."
    width="wide"
  >
    <ResearchMissionPanel
      summary={summary}
      nextAction={nextAction}
      session={researchSession}
      sessionReady={researchSessionReady}
      sessionWritable={researchSessionWritable}
      sessionError={researchSessionError}
      onSessionChange={updateResearchSession}
      onSessionReset={resetResearchSession}
      onSearch={launchSearch}
    />

    <nav aria-label="리서치 데스크 빠른 이동" className="flex gap-2 overflow-x-auto rounded-2xl border border-line bg-panel p-2">
      {DESK_SECTIONS.map(([href, label]) => <a key={href} href={href} className={`${RESOURCE_BUTTON} shrink-0 bg-canvas`}>{label}</a>)}
    </nav>

    <section id="workspace-overview" className="scroll-mt-24 space-y-5" aria-labelledby="workspace-overview-title">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-accent">현재 브라우저 작업공간</p><h2 id="workspace-overview-title" className="mt-1 text-2xl font-bold">한눈에 보는 리서치 상태</h2></div>
        <p className="text-sm text-fg-2">자동 평점이 아니라 다음 행동을 고르기 위한 사실 요약입니다.</p>
      </header>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-line bg-panel p-5"><dt className="text-sm text-fg-2">저장한 자료</dt><dd className="mt-2 text-3xl font-bold">{summary.savedCount}<span className="ml-1 text-base font-semibold">개</span></dd><dd className="mt-2 text-xs text-fg-2">최대 200개까지 검증된 형식으로 보존</dd></div>
        <div className="rounded-2xl border border-line bg-panel p-5"><dt className="text-sm text-fg-2">자료 제공처</dt><dd className="mt-2 text-3xl font-bold">{summary.providerCount}<span className="ml-1 text-base font-semibold">곳</span></dd><dd className="mt-2 text-xs text-fg-2">서로 다른 유형의 근거를 비교</dd></div>
        <div className="rounded-2xl border border-line bg-panel p-5"><dt className="text-sm text-fg-2">작성한 기획</dt><dd className="mt-2 text-3xl font-bold">{summary.storyCompleted}<span className="mx-1 text-base font-semibold">/</span><span className="text-xl">{summary.storyTotal}</span></dd><dd className="mt-2 text-xs text-fg-2">직접 작성한 Story Lab 항목</dd></div>
        <div className="rounded-2xl border border-line bg-panel p-5"><dt className="text-sm text-fg-2">다가오는 마감</dt><dd className="mt-2 text-3xl font-bold">{summary.upcomingDeadlineCount}<span className="ml-1 text-base font-semibold">개</span></dd><dd className="mt-2 truncate text-xs text-fg-2">{summary.nearestDeadline ? `${deadlineLabel(summary.nearestDeadline.deadline)} · ${summary.nearestDeadline.title}` : "확인된 예정 마감 없음"}</dd></div>
      </dl>
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="리서치 권장 흐름">
        {summary.stages.map((stage, index) => <li key={stage.id} className={`rounded-2xl border p-5 ${stage.status === "current" ? "border-accent bg-accent-soft" : "border-line bg-panel"}`}>
          <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-accent">0{index + 1}</span><span className="text-xs font-semibold text-fg-2">{stage.status === "complete" ? "완료" : stage.status === "current" ? "지금 단계" : "다음 단계"}</span></div>
          <h3 className="mt-3 font-bold">{stage.label}</h3>
          <p className="mt-2 text-sm leading-6 text-fg-2">{stage.description}</p>
          <p className="mt-3 text-xs font-semibold text-fg">기준 · {stage.criterion}</p>
          <Link className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" to={stage.href}>{stage.action} →</Link>
        </li>)}
      </ol>
    </section>

    <div id="research-coverage" className="scroll-mt-24"><ResearchCoverageMap summary={summary} /></div>

    <ResearchSynthesisBoard
      notebook={researchNotebook}
      resources={workspace.saved}
      ready={researchNotebookReady}
      writable={researchNotebookWritable}
      error={researchNotebookError}
      onChange={updateResearchNotebook}
      onReset={resetResearchNotebook}
      onRestore={restoreResearchNotebook}
      onInvestigate={(query) => launchSearch(researchSession.lastMode, query)}
    />

    <section id="research-tools" className="scroll-mt-24 space-y-5" aria-labelledby="research-tools-title">
      <header><p className="text-sm font-semibold text-accent">목적별 도구</p><h2 id="research-tools-title" className="mt-1 text-2xl font-bold">찾는 데서 끝나지 않는 작업 경로</h2><p className="mt-2 max-w-3xl leading-7 text-fg-2">필요한 도구만 열고, 결과는 같은 브라우저 작업공간에서 이어서 사용하세요.</p></header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {RESEARCH_TOOLS.map((tool) => <Link key={tool.path} to={tool.path} className="group rounded-2xl border border-line bg-panel p-5 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <p className="text-xs font-bold text-accent">{tool.eyebrow}</p><h3 className="mt-2 text-lg font-bold">{tool.title} →</h3><p className="mt-2 text-sm leading-6 text-fg-2">{tool.description}</p><p className="mt-4 border-t border-line pt-3 text-xs font-semibold text-fg">결과 · {tool.output}</p>
        </Link>)}
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-5" aria-label="저장 자료 요약">
      <article className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6 xl:col-span-2">
        <header><p className="text-sm font-semibold text-accent">출처·이용조건</p><h2 className="mt-1 text-xl font-bold">보드 점검</h2></header>
        <dl className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-xl bg-canvas p-4"><dt className="text-sm text-fg-2">CC0로 확인된 자료</dt><dd className="font-bold">{summary.publicDomainCount}개</dd></div>
          <div className="flex items-start justify-between gap-4 rounded-xl bg-canvas p-4"><dt className="text-sm text-fg-2">원문 이용조건 확인 필요</dt><dd className="font-bold">{summary.rightsReviewCount}개</dd></div>
          <div className="flex items-start justify-between gap-4 rounded-xl bg-canvas p-4"><dt className="text-sm text-fg-2">조회일 재확인 권장</dt><dd className="font-bold">{summary.staleCount}개</dd></div>
        </dl>
        <p className="text-xs leading-6 text-fg-2">지원공고는 7일, 도서·미술 메타데이터는 제공처별 90~180일을 기준으로 재확인을 권장합니다. 이는 원문 변경 가능성을 알리는 작업 기준입니다.</p>
        <div className="flex flex-wrap gap-2" aria-label="저장 자료 제공처 분포">
          {summary.providerBreakdown.map((entry) => <span key={entry.provider} className="rounded-full border border-line bg-canvas px-3 py-1 text-xs">{entry.label} · {entry.count}</span>)}
          {!summary.providerBreakdown.length && <span className="text-sm text-fg-2">저장 자료가 생기면 제공처 분포가 표시됩니다.</span>}
        </div>
        <a className={RESOURCE_BUTTON} href="#saved-board">전체 보드 점검</a>
      </article>
      <section className="space-y-4 rounded-2xl border border-line bg-panel p-5 sm:p-6 xl:col-span-3" aria-labelledby="recent-research-title">
        <header className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-accent">최근 저장</p><h2 id="recent-research-title" className="mt-1 text-xl font-bold">다시 볼 자료</h2></div><span className="text-sm text-fg-2">최대 3개</span></header>
        {recentItems.length ? <div className="grid gap-3 sm:grid-cols-3">{recentItems.map((item) => {
          const freshness = sourceFreshness(item);
          return <article key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-line bg-canvas">
            {item.imageUrl && <div className="aspect-[4/3] overflow-hidden border-b border-line bg-card"><img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" /></div>}
            <div className="p-4"><p className="text-xs text-accent">{resourceLicenseLabel(item.license)}</p><h3 className="mt-2 break-words font-bold">{item.title}</h3><p className={`mt-2 text-xs ${freshness.needsReview ? "font-semibold text-fg" : "text-fg-2"}`}>{freshness.label}</p><a className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">원문 다시 보기 ↗</a></div>
          </article>;
        })}</div> : <div className="rounded-xl border border-dashed border-line p-6 text-sm leading-6 text-fg-2">아직 저장한 자료가 없습니다. 위 통합 검색이나 목적별 도구에서 첫 자료를 저장하세요.</div>}
      </section>
    </section>

    <section id="research-export" className="scroll-mt-24 space-y-4 rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="research-export-title">
      <header><p className="text-sm font-semibold text-accent">휴대·복구 가능한 기록</p><h2 id="research-export-title" className="mt-1 text-xl font-bold">내보내기와 백업</h2><p className="mt-2 leading-7 text-fg-2">리서치 초점·검색 기록·판단 노트·기획·출처를 읽기 쉬운 문서로 내보내거나, 자료·기획서 작업공간을 JSON으로 백업하세요.</p></header>
      <div className="flex flex-wrap gap-3">
        <button className={RESOURCE_BUTTON} disabled={!workspace.saved.length && summary.storyCompleted === 0 && !researchSession.title && !researchSession.question && !researchSession.context && !researchSession.history.length && !researchNotebook.entries.length} onClick={exportResearchBrief}>리서치 브리프 내보내기</button>
        <button className={RESOURCE_BUTTON} disabled={!workspace.saved.length} onClick={() => downloadText("toonstudio-sources.md", attributionMarkdown(workspace.saved))}>출처 목록 내보내기</button>
        <button className={RESOURCE_BUTTON} onClick={() => downloadText("toonstudio-creator-board.json", JSON.stringify(workspace, null, 2), "application/json")}>자료·기획서 백업</button>
      </div>
      <p className="text-xs leading-5 text-fg-2">리서치 브리프에는 현재 초점, 최근 검색, 관찰·질문·결정과 연결 근거가 포함됩니다. 자료·기획서 JSON과 판단 노트 JSON은 스키마 경계를 분리해 각각 복구합니다.</p>
      <details className="rounded-xl border border-line bg-canvas p-4">
        <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">백업 가져오기 · 합치기 또는 완전 대체</summary>
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <p className="text-sm leading-6 text-fg-2">기본값은 현재 자료와 작성한 기획을 유지하는 안전한 합치기입니다. 완전 대체는 확인 후에만 실행됩니다.</p>
          <label htmlFor="creator-board-replace" className="flex min-h-11 items-center gap-3 text-sm">
            <input id="creator-board-replace" type="checkbox" disabled={!ready || !writable || restoring || saving} className="size-5" checked={restoreMode === "replace"} onChange={(event: ChangeEvent<HTMLInputElement>) => setRestoreMode(event.target.checked ? "replace" : "merge")} />
            현재 보드를 유지하지 않고 백업으로 완전히 대체
          </label>
          <label htmlFor="creator-board-import" className="block text-sm font-semibold">{restoreMode === "merge" ? "백업 합치기 · 현재 자료와 작성한 기획서 유지" : "백업 대체 · 현재 작업이 변경됩니다"}
            <input id="creator-board-import" className="mt-2 block max-w-full text-sm" type="file" disabled={!ready || !writable || restoring || saving} accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => {
              void importBackup(event.target.files?.[0]);
              event.target.value = "";
            }} />
          </label>
          <p role="status" className="text-sm text-fg-2">{importNotice}</p>
        </div>
      </details>
    </section>

    <SavedBoard items={workspace.saved} disabled={!ready || !writable || saving} onRemove={(id) => {
      void updateWorkspace((value) => ({ ...value, saved: value.saved.filter((item) => item.id !== id) }));
    }} />

    <details className="rounded-2xl border border-line bg-panel p-5" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setProviderStatusOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">데이터 제공처 연결 상태와 한계 확인</summary>
      <p className="mt-2 text-sm leading-6 text-fg-2">검색 전에 인증키 설정 여부를 확인할 수 있습니다. 실제 연결 성공·이용권한·잔여 쿼터는 각 검색 결과와 원문에서 판단해야 합니다.</p>
      {providerStatusOpen && <div className="mt-4"><ProviderStatus /></div>}
    </details>
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
  </ResourceLayout>;
}
