import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { ChangeEvent } from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import type { ResearchNextAction, ResearchWorkspaceSummary } from "./research-dashboard";
import {
  isResearchDeskSessionEmpty,
  RESEARCH_INTENTS,
  researchIntentById,
  updateResearchDeskFocus,
} from "./research-desk-session";
import type { ResearchDeskFocusPatch, ResearchDeskSession } from "./research-desk-session";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 지금 할 일 카드 — 저장 자료·기획 진행에서 계산한 다음 행동 하나와 리서치 흐름 진행도.
 * 페이지 안 목적지(`#saved-board` 등)는 버튼으로 열어 데스크가 해당 탭을 고르게 한다.
 */
export function ResearchNextActionCard({
  action,
  summary,
  onAnchor,
}: {
  action: ResearchNextAction;
  summary: ResearchWorkspaceSummary;
  /** 페이지 안 목적지(`#saved-board` 등)를 여는 방법 — 데스크에서는 해당 탭을 고른다. */
  onAnchor: (anchor: string) => void;
}) {
  const bt = useBilingual("ResearchNextActionCard");
  const progress = Math.round((summary.completedStages / summary.stages.length) * 100);
  const className = `${RESOURCE_BUTTON} gap-2 border-accent bg-accent-soft text-accent`;
  return <article className="grid gap-4 rounded-2xl border border-accent/40 bg-panel p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" aria-labelledby="next-research-action-title">
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">{action.eyebrow}</p>
      <h2 id="next-research-action-title" className="mt-1.5 text-lg font-bold break-keep">{action.title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-fg-2 break-keep">{action.description}</p>
      <div className="mt-3 flex items-center gap-3">
        <progress className="h-2 w-full max-w-56" max={100} value={progress} aria-label={`리서치 흐름 ${progress}%`} />
        <span className="shrink-0 text-xs text-fg-2">{formatI18nTemplate(bt("리서치 흐름 {v0}/{v1} 단계", "Research flow {v0}/{v1}"), { v0: summary.completedStages, v1: summary.stages.length })}</span>
      </div>
    </div>
    {action.href.startsWith("#")
      ? <button type="button" className={className} onClick={() => onAnchor(action.href)}>{action.label}<ArrowRight size={16} aria-hidden="true" /></button>
      : <Link className={className} to={action.href} reloadDocument={action.reloadDocument}>{action.label}<ArrowRight size={16} aria-hidden="true" /></Link>}
  </article>;
}

/**
 * 리서치 초점 — 조사 렌즈·이름·시대와 제약·핵심 질문을 브라우저 세션에 고정한다.
 * 렌즈를 바꾸면 통합 검색의 기본 경로도 함께 바뀐다(세션 `lastMode`).
 */
export function ResearchFocusPanel({
  session,
  sessionReady,
  sessionWritable,
  sessionError,
  onSessionChange,
  onSessionReset,
}: {
  session: ResearchDeskSession;
  sessionReady: boolean;
  sessionWritable: boolean;
  sessionError: string;
  onSessionChange: (updater: (current: ResearchDeskSession) => ResearchDeskSession) => void;
  onSessionReset: () => void;
}) {
  const bt = useBilingual("ResearchFocusPanel");
  const intent = researchIntentById(session.intent);
  const updateFocus = (patch: ResearchDeskFocusPatch) => {
    onSessionChange((current) => updateResearchDeskFocus(current, patch));
  };

  return <section className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5" aria-labelledby="research-focus-title">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-xs font-bold text-accent">{bt("이번 리서치 초점", "This research focus")}</p>
        <h2 id="research-focus-title" className="mt-1 text-lg font-bold">{bt("질문이 흐려지지 않도록 작업 맥락 고정", "Pin the context so the question stays sharp")}</h2>
      </div>
      <button type="button" className={RESOURCE_BUTTON} disabled={isResearchDeskSessionEmpty(session)} onClick={onSessionReset}>{bt("초점·기록 초기화", "Reset focus & history")}</button>
    </header>
    <div className="flex flex-wrap gap-2" role="group" aria-label="리서치 렌즈">
      {RESEARCH_INTENTS.map((entry) => <button
        key={entry.id}
        type="button"
        aria-pressed={session.intent === entry.id}
        className={`${RESOURCE_BUTTON} ${session.intent === entry.id ? "border-accent bg-accent-soft text-accent" : "bg-canvas"}`}
        onClick={() => updateFocus({ intent: entry.id, lastMode: researchIntentById(entry.id).defaultMode })}
      >{entry.label}</button>)}
    </div>
    <p className="text-sm leading-6 text-fg-2">{intent.description}</p>
    <div className="grid gap-4 md:grid-cols-2">
      <label htmlFor="research-session-title" className="text-sm font-semibold">리서치 이름
        <input
          id="research-session-title"
          value={session.title}
          maxLength={80}
          className={`${RESOURCE_INPUT} mt-2`}
          placeholder="예: 1화 야간 기차역 고증"
          onChange={(event: ChangeEvent<HTMLInputElement>) => updateFocus({ title: event.target.value })}
        />
      </label>
      <label htmlFor="research-session-context" className="text-sm font-semibold">시대·장소·제약
        <input
          id="research-session-context"
          value={session.context}
          maxLength={240}
          className={`${RESOURCE_INPUT} mt-2`}
          placeholder={intent.contextPlaceholder}
          onChange={(event: ChangeEvent<HTMLInputElement>) => updateFocus({ context: event.target.value })}
        />
      </label>
    </div>
    <label htmlFor="research-session-question" className="block text-sm font-semibold">핵심 질문
      <textarea
        id="research-session-question"
        rows={2}
        value={session.question}
        maxLength={180}
        className={`${RESOURCE_INPUT} mt-2 min-h-20 resize-y`}
        placeholder={intent.questionPlaceholder}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateFocus({ question: event.target.value })}
      />
    </label>
    <p role="status" className="text-xs leading-5 text-fg-2">
      {sessionError || (!sessionReady
        ? bt("로컬 리서치 세션을 불러오는 중입니다.", "Loading the local research session.")
        : sessionWritable
          ? bt("초점과 최근 검색은 이 브라우저에만 저장되며 계정과 동기화되지 않습니다.", "Focus and recent searches stay in this browser and are not synced to your account.")
          : bt("이 환경에서는 세션을 저장할 수 없어 현재 탭에서만 유지됩니다.", "This environment can't save the session, so it lasts only in this tab."))}
    </p>
  </section>;
}
