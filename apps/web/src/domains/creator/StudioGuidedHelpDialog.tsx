/**
 * Guided Help — an authored, context-aware layer above the existing command
 * search, tutorials and diagnostics surfaces.
 *
 * The dialog never pretends to execute a command. It teaches the shortest safe
 * path, then hands execution to the already-audited F1 registry or to an
 * existing support section.
 */

import {
  ArrowLeft,
  BookOpen,
  Bug,
  ChevronRight,
  Command,
  ExternalLink,
  HelpCircle,
  Home,
  Layers,
  LifeBuoy,
  Lightbulb,
  MessageSquare,
  MousePointer2,
  Paintbrush,
  Search,
  Sparkles,
  Stethoscope,
  Wrench,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { buildStudioToolHelp } from "./studio-current-tool-help";
import {
  searchStudioGuidedHelp,
  STUDIO_GUIDED_HELP_ARTICLE_BY_ID,
  STUDIO_GUIDED_HELP_INTENTS,
  studioGuidedHelpArticle,
  studioGuidedHelpArticleForCommand,
  studioGuidedHelpCategoryLabel,
} from "./studio-guided-help";
import { STUDIO_Z_CLASS } from "./studio-z-index";

import type {
  StudioGuidedHelpAction,
  StudioGuidedHelpArticle,
  StudioGuidedHelpCategory,
} from "./studio-guided-help";
import type { StudioHelpCenterSection } from "./studio-help-center-channel";

export type StudioGuidedHelpSupportSection = Exclude<
  StudioHelpCenterSection,
  "current-tool"
>;

export interface StudioGuidedHelpDialogProps {
  readonly open: boolean;
  readonly initialToolCommandId: string | null;
  readonly onClose: () => void;
  readonly onOpenSupport: (section: StudioGuidedHelpSupportSection) => void;
  readonly onOpenCommandSearch: () => void;
  readonly onOpenManual: () => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),details>summary,[tabindex]:not([tabindex="-1"])';

const CATEGORY_ICON: Readonly<
  Record<StudioGuidedHelpCategory, typeof HelpCircle>
> = Object.freeze({
  start: Sparkles,
  drawing: Paintbrush,
  selection: MousePointer2,
  adjustment: Wrench,
  workflow: Layers,
  recovery: LifeBuoy,
});

const SUPPORT_ACTIONS: readonly Readonly<{
  section: StudioGuidedHelpSupportSection;
  label: string;
  description: string;
  icon: typeof HelpCircle;
}>[] = Object.freeze([
  {
    section: "terminology",
    label: "CSP·Photoshop 용어",
    description: "쓰던 이름을 ToonStudio 기능으로 연결",
    icon: Command,
  },
  {
    section: "diagnostics",
    label: "기기·브라우저 진단",
    description: "GPU·저장소·렌더 상태를 실측",
    icon: Stethoscope,
  },
  {
    section: "recovery",
    label: "복구 가이드",
    description: "임시저장·체크포인트·안전 모드",
    icon: LifeBuoy,
  },
  {
    section: "bug-report",
    label: "버그 리포트",
    description: "개인정보를 제외한 진단 패키지",
    icon: Bug,
  },
]);

function SurfaceButton({
  icon: Icon,
  title,
  description,
  onClick,
  active = false,
  trailing,
}: {
  icon: typeof HelpCircle;
  title: string;
  description?: string;
  onClick: () => void;
  active?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active || undefined}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active
          ? "border-accent/55 bg-accent-soft text-fg"
          : "border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg"
      }`}
    >
      <Icon size={17} aria-hidden className={active ? "text-accent" : "text-fg-3"} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-[0.6875rem] leading-snug text-fg-3">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ?? <ChevronRight size={15} aria-hidden className="shrink-0 text-fg-3" />}
    </button>
  );
}

function ArticleBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-full border border-line bg-card px-2 text-[0.6875rem] font-medium text-fg-3">
      {children}
    </span>
  );
}

function EmptySearch({ onOpenCommandSearch }: { onOpenCommandSearch: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card/40 px-4 py-8 text-center">
      <Search size={24} aria-hidden className="mx-auto text-fg-3" />
      <h3 className="mt-3 text-sm font-semibold text-fg">작성형 가이드에서 찾지 못했습니다</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-fg-3">
        F1 검색은 모든 명령·설정·패널·튜토리얼과 CSP·Photoshop·Krita·Procreate 별칭을 함께 찾습니다.
      </p>
      <button
        type="button"
        onClick={onOpenCommandSearch}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Command size={16} aria-hidden />
        F1 기능·설정 찾기 열기
      </button>
    </div>
  );
}

function GuidedHelpHome({
  initialArticle,
  query,
  onQueryChange,
  onOpenArticle,
  onOpenSupport,
  onOpenCommandSearch,
  onOpenManual,
  searchInputRef,
}: {
  initialArticle: StudioGuidedHelpArticle | null;
  query: string;
  onQueryChange: (query: string) => void;
  onOpenArticle: (articleId: string) => void;
  onOpenSupport: (section: StudioGuidedHelpSupportSection) => void;
  onOpenCommandSearch: () => void;
  onOpenManual: () => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
}) {
  const inputId = useId();
  const results = useMemo(() => searchStudioGuidedHelp(query, 12), [query]);
  const searching = query.trim().length > 0;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <section className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="relative px-4 py-5 sm:px-6 sm:py-6">
          <div className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-accent">
              <Sparkles size={14} aria-hidden />
              Contextual guided help
            </span>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-fg sm:text-2xl">
              막힌 작업을 설명해 보세요
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-3">
              현재 도구의 30초 시작법, 실패 원인과 복구 순서를 먼저 보여 주고, 더 넓은 기능은 F1 검색과 실측 진단으로 이어 줍니다.
            </p>
            <label htmlFor={inputId} className="sr-only">
              도움말 검색
            </label>
            <div className="mt-4 flex min-h-12 items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/20">
              <Search size={18} aria-hidden className="shrink-0 text-fg-3" />
              <input
                ref={searchInputRef}
                id={inputId}
                type="search"
                value={query}
                autoComplete="off"
                onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.currentTarget.value)}
                placeholder="예: 색이 새요, Paint Bucket, 퀵 마스크, 저장 복구"
                className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <X size={16} aria-hidden />
                  <span className="sr-only">검색어 지우기</span>
                </button>
              ) : (
                <kbd className="shrink-0 rounded-md border border-line bg-card px-2 py-1 text-[0.6875rem] text-fg-3">
                  F1
                </kbd>
              )}
            </div>
          </div>
        </div>
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {searching ? `작성형 도움말 검색 결과 ${results.length}개` : "추천 도움말을 표시합니다."}
      </p>

      {searching ? (
        results.length > 0 ? (
          <section aria-label="도움말 검색 결과" className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-fg">작성형 도움말</h3>
              <span className="text-[0.6875rem] tabular-nums text-fg-3">{results.length}개</span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {results.map(({ article, matchedOn }) => {
                const Icon = CATEGORY_ICON[article.category];
                return (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => onOpenArticle(article.id)}
                    className="group flex min-h-20 items-start gap-3 rounded-xl border border-line bg-card p-3 text-left transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-raised text-fg-2 group-hover:text-accent">
                      <Icon size={17} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-fg">{article.title}</span>
                        <span className="rounded-full border border-line px-1.5 py-0.5 text-[0.625rem] text-fg-3">
                          {studioGuidedHelpCategoryLabel(article.category)}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-fg-3">
                        {article.summary}
                      </span>
                      {matchedOn === "alias" ? (
                        <span className="mt-1 block text-[0.625rem] text-accent">익숙한 타사·이전 용어로 찾음</span>
                      ) : null}
                    </span>
                    <ChevronRight size={16} aria-hidden className="mt-1 shrink-0 text-fg-3" />
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <EmptySearch onOpenCommandSearch={onOpenCommandSearch} />
        )
      ) : (
        <>
          {initialArticle ? (
            <section aria-labelledby="guided-current-tool-heading">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 id="guided-current-tool-heading" className="text-sm font-semibold text-fg">
                  지금 쓰는 도구
                </h3>
                <span className="text-[0.6875rem] text-fg-3">작업 맥락에서 바로 시작</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenArticle(initialArticle.id)}
                className="group flex min-h-24 w-full items-center gap-4 rounded-2xl border border-accent/35 bg-accent-soft/20 p-4 text-left transition-colors hover:border-accent/60 hover:bg-accent-soft/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-contrast shadow-sm">
                  <Paintbrush size={21} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.6875rem] font-semibold uppercase tracking-wider text-accent">현재 도구 가이드</span>
                  <span className="mt-1 block text-base font-bold text-fg">{initialArticle.title}</span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-fg-3">{initialArticle.summary}</span>
                </span>
                <ChevronRight size={19} aria-hidden className="shrink-0 text-accent" />
              </button>
            </section>
          ) : null}

          <section aria-labelledby="guided-intents-heading">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 id="guided-intents-heading" className="text-sm font-semibold text-fg">
                무엇을 하려는 중인가요?
              </h3>
              <span className="text-[0.6875rem] text-fg-3">결과 중심으로 찾기</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {STUDIO_GUIDED_HELP_INTENTS.map((intent) => (
                <button
                  key={intent.id}
                  type="button"
                  onClick={() => onOpenArticle(intent.articleId)}
                  className="group min-h-24 rounded-xl border border-line bg-card p-3 text-left transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="block text-xs font-semibold leading-snug text-fg group-hover:text-accent">
                    {intent.label}
                  </span>
                  <span className="mt-2 block text-[0.6875rem] leading-relaxed text-fg-3">
                    {intent.description}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="guided-support-heading">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 id="guided-support-heading" className="text-sm font-semibold text-fg">
                빠른 해결과 참고
              </h3>
              <span className="text-[0.6875rem] text-fg-3">실측·복구·전체 문서</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {SUPPORT_ACTIONS.map((item) => (
                <SurfaceButton
                  key={item.section}
                  icon={item.icon}
                  title={item.label}
                  description={item.description}
                  onClick={() => onOpenSupport(item.section)}
                />
              ))}
              <SurfaceButton
                icon={BookOpen}
                title="전체 사용자 매뉴얼"
                description="새 탭에서 긴 형식 문서 열기"
                onClick={onOpenManual}
                trailing={<ExternalLink size={15} aria-hidden className="shrink-0 text-fg-3" />}
              />
              <SurfaceButton
                icon={Command}
                title="F1 기능·설정 찾기"
                description="모든 명령·설정·패널·튜토리얼"
                onClick={onOpenCommandSearch}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function GuidedHelpArticle({
  article,
  initialArticleId,
  onBack,
  onOpenArticle,
  onRunAction,
}: {
  article: StudioGuidedHelpArticle;
  initialArticleId: string | null;
  onBack: () => void;
  onOpenArticle: (articleId: string) => void;
  onRunAction: (action: StudioGuidedHelpAction) => void;
}) {
  const toolHelp = article.commandId ? buildStudioToolHelp(article.commandId) : null;
  const related = (article.relatedIds ?? [])
    .map((id) => studioGuidedHelpArticle(id))
    .filter((candidate): candidate is StudioGuidedHelpArticle => candidate !== null);
  const CategoryIcon = CATEGORY_ICON[article.category];
  const currentTool = initialArticleId === article.id;

  return (
    <article className="p-4 sm:p-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft size={17} aria-hidden />
        도움말 홈
      </button>

      <header className="mt-2 rounded-2xl border border-line bg-card p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
            <CategoryIcon size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-accent">
                {article.eyebrow}
              </span>
              {currentTool ? <ArticleBadge>현재 도구</ArticleBadge> : null}
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-fg sm:text-2xl">{article.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">{article.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <ArticleBadge>{studioGuidedHelpCategoryLabel(article.category)}</ArticleBadge>
              {toolHelp?.shortcut ? <ArticleBadge>단축키 {toolHelp.shortcut}</ArticleBadge> : null}
              {toolHelp?.aliases.slice(0, 2).map((alias) => (
                <ArticleBadge key={`${alias.vendor}:${alias.term}`}>{alias.term}</ArticleBadge>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section aria-labelledby="guided-steps-heading" className="mt-5">
        <div className="flex items-center gap-2">
          <Sparkles size={17} aria-hidden className="text-accent" />
          <h3 id="guided-steps-heading" className="text-sm font-semibold text-fg">30초 시작</h3>
        </div>
        <ol className="mt-2 grid gap-2 lg:grid-cols-3">
          {article.steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-line bg-card p-3.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-contrast">
                {index + 1}
              </span>
              <h4 className="mt-3 text-sm font-semibold text-fg">{step.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-fg-3">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-2 rounded-xl border border-accent/30 bg-accent-soft/20 px-3.5 py-3">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-accent">완료 모습</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">{article.outcome}</p>
        </div>
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.72fr)]">
        <section aria-labelledby="guided-troubleshooting-heading">
          <div className="flex items-center gap-2">
            <Wrench size={17} aria-hidden className="text-fg-3" />
            <h3 id="guided-troubleshooting-heading" className="text-sm font-semibold text-fg">잘 안 될 때</h3>
          </div>
          <div className="mt-2 space-y-2">
            {article.problems.map((problem, index) => (
              <details
                key={problem.title}
                open={index === 0}
                className="group rounded-xl border border-line bg-card open:border-accent/30"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  {problem.title}
                  <ChevronRight size={16} aria-hidden className="shrink-0 text-fg-3 transition-transform group-open:rotate-90" />
                </summary>
                <div className="border-t border-line px-3.5 py-3 text-xs leading-relaxed">
                  <p className="text-fg-3"><strong className="font-semibold text-fg-2">가능한 원인 · </strong>{problem.cause}</p>
                  <p className="mt-2 text-fg-2"><strong className="font-semibold text-accent">해결 순서 · </strong>{problem.fix}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        <aside className="space-y-3">
          {article.checks && article.checks.length > 0 ? (
            <section className="rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center gap-2">
                <MousePointer2 size={16} aria-hidden className="text-fg-3" />
                <h3 className="text-xs font-semibold text-fg">먼저 확인</h3>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-fg-3">
                {article.checks.map((check) => <li key={check}>· {check}</li>)}
              </ul>
            </section>
          ) : null}
          {article.tips && article.tips.length > 0 ? (
            <section className="rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} aria-hidden className="text-accent" />
                <h3 className="text-xs font-semibold text-fg">작업 팁</h3>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-fg-3">
                {article.tips.map((tip) => <li key={tip}>· {tip}</li>)}
              </ul>
            </section>
          ) : null}
          {article.tutorialIds && article.tutorialIds.length > 0 ? (
            <section className="rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center gap-2">
                <BookOpen size={16} aria-hidden className="text-fg-3" />
                <h3 className="text-xs font-semibold text-fg">관련 학습 경로</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-fg-3">
                기능 튜토리얼에서 {article.tutorialIds.length}개 관련 실습을 더 볼 수 있습니다. F1 검색에서 도구 이름을 입력하면 튜토리얼 결과도 함께 표시됩니다.
              </p>
            </section>
          ) : null}
        </aside>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="guided-related-heading" className="mt-5">
          <h3 id="guided-related-heading" className="text-sm font-semibold text-fg">다음에 이어 보기</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {related.map((candidate) => {
              const Icon = CATEGORY_ICON[candidate.category];
              return (
                <SurfaceButton
                  key={candidate.id}
                  icon={Icon}
                  title={candidate.title}
                  description={candidate.summary}
                  onClick={() => onOpenArticle(candidate.id)}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-fg">이제 실제 기능으로 이동하세요</h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            실행과 이동은 상태를 아는 기존 명령 레지스트리가 담당합니다. 이 도움말은 없는 동작을 실행되는 것처럼 표시하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRunAction(article.primaryAction)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {article.primaryAction.type === "manual" ? <ExternalLink size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          {article.primaryAction.label}
        </button>
      </section>
    </article>
  );
}

export function StudioGuidedHelpDialog({
  open,
  initialToolCommandId,
  onClose,
  onOpenSupport,
  onOpenCommandSearch,
  onOpenManual,
}: StudioGuidedHelpDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const initialArticle = useMemo(
    () => studioGuidedHelpArticleForCommand(initialToolCommandId),
    [initialToolCommandId],
  );
  const [activeArticleId, setActiveArticleId] = useState<string | null>(
    initialArticle?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const activeArticle = studioGuidedHelpArticle(activeArticleId);

  useEffect(() => {
    if (!open) return;
    setActiveArticleId(initialArticle?.id ?? null);
    setQuery("");
  }, [initialArticle, open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const activeElement = document.activeElement;
    openerRef.current = activeElement instanceof HTMLElement ? activeElement : null;

    const overlay = overlayRef.current;
    const inerted = [...document.body.children]
      .filter((element) => element !== overlay)
      .map((element) => ({ element: element as HTMLElement, inert: (element as HTMLElement).inert }));
    for (const { element } of inerted) element.inert = true;

    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      if (initialArticle) closeButtonRef.current?.focus({ preventScroll: true });
      else searchInputRef.current?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex >= 0,
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      for (const { element, inert } of inerted) element.inert = inert;
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [initialArticle, onClose, open]);

  const openArticle = useCallback((articleId: string) => {
    if (!STUDIO_GUIDED_HELP_ARTICLE_BY_ID.has(articleId)) return;
    setActiveArticleId(articleId);
    setQuery("");
    dialogRef.current?.querySelector<HTMLElement>("[data-guided-help-scroll]")?.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => {
    setActiveArticleId(null);
    setQuery("");
    requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
  }, []);

  const runAction = useCallback(
    (action: StudioGuidedHelpAction) => {
      if (action.type === "support") {
        onOpenSupport(action.section);
        return;
      }
      if (action.type === "manual") {
        onOpenManual();
        return;
      }
      onOpenCommandSearch();
    },
    [onOpenCommandSearch, onOpenManual, onOpenSupport],
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 ${STUDIO_Z_CLASS.help} flex items-center justify-center bg-black/50 px-2 py-2 backdrop-blur-sm sm:px-4 sm:py-[4vh]`}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-panel pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[90vh]"
      >
        <header className="flex min-h-14 items-center gap-3 border-b border-line px-3 sm:px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <HelpCircle size={19} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 id={titleId} className="truncate text-sm font-bold text-fg">
              도움말 홈{activeArticle ? ` · ${activeArticle.title}` : ""}
            </h1>
            <p id={descriptionId} className="truncate text-[0.6875rem] text-fg-3">
              현재 도구 · 작업별 30초 가이드 · 문제 해결 · 전체 검색
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            title="닫기 (Esc)"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={19} aria-hidden />
            <span className="sr-only">도움말 닫기</span>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="도움말 바로가기"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-card/35 p-2 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r"
          >
            <div className="min-w-44 md:min-w-0">
              <SurfaceButton
                icon={Home}
                title="도움말 홈"
                description="검색·목적별 시작"
                onClick={goHome}
                active={!activeArticle}
              />
            </div>
            {initialArticle ? (
              <div className="min-w-44 md:min-w-0">
                <SurfaceButton
                  icon={Paintbrush}
                  title="현재 도구"
                  description={initialArticle.title}
                  onClick={() => openArticle(initialArticle.id)}
                  active={activeArticle?.id === initialArticle.id}
                />
              </div>
            ) : null}
            <div className="my-1 hidden border-t border-line md:block" />
            {SUPPORT_ACTIONS.map((item) => (
              <div key={item.section} className="min-w-44 md:min-w-0">
                <SurfaceButton
                  icon={item.icon}
                  title={item.label}
                  description={item.description}
                  onClick={() => onOpenSupport(item.section)}
                />
              </div>
            ))}
            <div className="mt-auto hidden space-y-1 pt-2 md:block">
              <SurfaceButton
                icon={Command}
                title="F1 전체 검색"
                onClick={onOpenCommandSearch}
              />
              <SurfaceButton
                icon={BookOpen}
                title="사용자 매뉴얼"
                onClick={onOpenManual}
                trailing={<ExternalLink size={15} aria-hidden className="shrink-0 text-fg-3" />}
              />
              <div className="flex items-center gap-2 px-3 pt-2 text-[0.625rem] leading-relaxed text-fg-3">
                <MessageSquare size={14} aria-hidden className="shrink-0" />
                실행 가능 여부는 현재 스튜디오 상태에서 다시 확인합니다.
              </div>
            </div>
          </nav>

          <main data-guided-help-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {activeArticle ? (
              <GuidedHelpArticle
                article={activeArticle}
                initialArticleId={initialArticle?.id ?? null}
                onBack={goHome}
                onOpenArticle={openArticle}
                onRunAction={runAction}
              />
            ) : (
              <GuidedHelpHome
                initialArticle={initialArticle}
                query={query}
                onQueryChange={setQuery}
                onOpenArticle={openArticle}
                onOpenSupport={onOpenSupport}
                onOpenCommandSearch={onOpenCommandSearch}
                onOpenManual={onOpenManual}
                searchInputRef={searchInputRef}
              />
            )}
          </main>
        </div>
      </div>
    </div>,
    document.body,
  );
}
