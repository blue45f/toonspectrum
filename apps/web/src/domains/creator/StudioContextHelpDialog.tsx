import {
  BookOpen,
  Bug,
  ChevronRight,
  Command,
  ExternalLink,
  HelpCircle,
  Home,
  LifeBuoy,
  Search,
  Scale,
  Stethoscope,
  Wrench,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { buildStudioToolHelp } from "./studio-current-tool-help";
import {
  filterStudioHelpRecipes,
  getStudioContextHelpGuide,
  getStudioHelpRecipe,
  STUDIO_HELP_RECIPES,
  type StudioContextHelpView,
  type StudioHelpRecipe,
  type StudioHelpRecipeDestination,
} from "./studio-help-content";
import {
  requestStudioCommandSearch,
  type StudioHelpCenterSection,
} from "./studio-help-center-channel";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface StudioContextHelpDialogProps {
  readonly open: boolean;
  readonly toolCommandId: string | null;
  readonly onClose: () => void;
  readonly onOpenSection: (section: StudioHelpCenterSection) => void;
}

interface QuickActionProps {
  readonly icon: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly onClick: () => void;
}

function QuickAction({ icon, eyebrow, title, description, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-36 flex-col rounded-2xl border border-border/70 bg-card/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="mb-4 inline-flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
        {icon}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {eyebrow}
      </span>
      <span className="mt-1 text-sm font-semibold text-foreground">{title}</span>
      <span className="mt-2 text-xs leading-5 text-muted-foreground">{description}</span>
      <ChevronRight className="mt-auto size-4 self-end text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
    </button>
  );
}

interface HomePanelProps {
  readonly toolCommandId: string | null;
  readonly onViewChange: (view: StudioContextHelpView) => void;
  readonly onOpenSection: (section: StudioHelpCenterSection) => void;
  readonly onOpenCommandSearch: () => void;
  readonly onOpenManual: () => void;
  readonly onOpenRecipe: (recipeId: string) => void;
}

function HomePanel({
  toolCommandId,
  onViewChange,
  onOpenSection,
  onOpenCommandSearch,
  onOpenManual,
  onOpenRecipe,
}: HomePanelProps) {
  const toolHelp = useMemo(
    () => (toolCommandId ? buildStudioToolHelp(toolCommandId) : null),
    [toolCommandId],
  );
  const guide = getStudioContextHelpGuide(toolHelp?.commandId);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-6 sm:px-8 sm:py-8">
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <HelpCircle className="size-3.5" aria-hidden="true" />
            작업 흐름을 끊지 않는 도움말
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            지금 막힌 지점에서 바로 해결하세요
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            현재 도구의 30초 가이드부터 증상별 점검 순서, 시스템 진단과 복구까지 한 곳에서 연결합니다.
            기능 이름을 알고 있다면 F1 명령 검색이 가장 빠릅니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenCommandSearch}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Search className="size-4" aria-hidden="true" />
              기능·설정 찾기
              <kbd className="ml-1 rounded border border-primary-foreground/25 bg-primary-foreground/10 px-1.5 py-0.5 text-[10px] font-medium">F1</kbd>
            </button>
            <button
              type="button"
              onClick={() => onViewChange("troubleshooting")}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background/70 px-4 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Wrench className="size-4" aria-hidden="true" />
              증상으로 해결하기
            </button>
          </div>
        </div>
      </section>

      {toolHelp ? (
        <section aria-labelledby="current-tool-help-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">지금 선택한 도구</p>
              <h3 id="current-tool-help-heading" className="mt-1 truncate text-lg font-bold text-foreground">
                {guide?.title ?? toolHelp.label}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {guide?.summary ?? toolHelp.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onViewChange("tool")}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              30초 가이드
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
          <p className="text-sm font-semibold text-foreground">현재 도구 정보가 아직 연결되지 않았습니다.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            기능·설정 찾기에서 명령 이름을 검색하거나 증상별 해결 레시피를 사용하세요.
          </p>
        </section>
      )}

      <section aria-labelledby="help-paths-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">빠른 경로</p>
            <h3 id="help-paths-heading" className="mt-1 text-lg font-bold text-foreground">목적에 맞는 도움말 열기</h3>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">검색 · 학습 · 진단 · 복구</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickAction
            icon={<BookOpen className="size-4" aria-hidden="true" />}
            eyebrow="Learn"
            title="현재 도구 익히기"
            description="핵심 결과, 3단계 사용법, 자주 발생하는 문제를 현재 도구 기준으로 봅니다."
            onClick={() => onViewChange("tool")}
          />
          <QuickAction
            icon={<Wrench className="size-4" aria-hidden="true" />}
            eyebrow="Solve"
            title="문제 해결 레시피"
            description="증상을 검색하고 재현 가능한 점검 순서대로 원인을 좁힙니다."
            onClick={() => onViewChange("troubleshooting")}
          />
          <QuickAction
            icon={<Command className="size-4" aria-hidden="true" />}
            eyebrow="Find"
            title="기능·설정 검색"
            description="메뉴 위치를 외우지 않고 기능 이름이나 별칭으로 명령을 찾습니다."
            onClick={onOpenCommandSearch}
          />
          <QuickAction
            icon={<Stethoscope className="size-4" aria-hidden="true" />}
            eyebrow="Inspect"
            title="시스템 진단"
            description="입력 이벤트, 렌더러, GPU와 브라우저 상태를 한 번에 확인합니다."
            onClick={() => onOpenSection("diagnostics")}
          />
          <QuickAction
            icon={<LifeBuoy className="size-4" aria-hidden="true" />}
            eyebrow="Recover"
            title="작업 복구"
            description="저장·자동 복구 후보를 확인하고 안전하게 이전 상태로 돌아갑니다."
            onClick={() => onOpenSection("recovery")}
          />
          <QuickAction
            icon={<BookOpen className="size-4" aria-hidden="true" />}
            eyebrow="Reference"
            title="사용자 설명서"
            description="개념과 전체 작업 흐름을 길게 읽어야 할 때 별도 설명서를 엽니다."
            onClick={onOpenManual}
          />
        </div>
      </section>

      <section aria-labelledby="popular-fixes-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">자주 막히는 지점</p>
            <h3 id="popular-fixes-heading" className="mt-1 text-lg font-bold text-foreground">먼저 확인할 문제</h3>
          </div>
          <button
            type="button"
            onClick={() => onViewChange("troubleshooting")}
            className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            전체 보기
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {STUDIO_HELP_RECIPES.slice(0, 4).map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => onOpenRecipe(recipe.id)}
              className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 text-left transition hover:border-primary/35 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Wrench className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{recipe.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{recipe.summary}</span>
              </span>
              <ChevronRight className="ml-auto mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

interface ToolPanelProps {
  readonly toolCommandId: string | null;
  readonly onOpenRecipe: (recipeId: string) => void;
  readonly onOpenCommandSearch: () => void;
  readonly onOpenDiagnostics: () => void;
}

function ToolPanel({
  toolCommandId,
  onOpenRecipe,
  onOpenCommandSearch,
  onOpenDiagnostics,
}: ToolPanelProps) {
  const help = useMemo(
    () => (toolCommandId ? buildStudioToolHelp(toolCommandId) : null),
    [toolCommandId],
  );
  const guide = getStudioContextHelpGuide(help?.commandId);

  if (!help) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl items-center px-5 py-12 sm:px-8">
        <div className="w-full rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center">
          <HelpCircle className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-bold text-foreground">현재 도구를 확인할 수 없습니다</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            캔버스로 돌아가 도구를 선택한 뒤 다시 열거나, 기능·설정 검색에서 알고 있는 이름을 검색하세요.
          </p>
          <button
            type="button"
            onClick={onOpenCommandSearch}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Search className="size-4" aria-hidden="true" />
            기능·설정 찾기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-6 sm:px-8 sm:py-8">
      <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{guide?.eyebrow ?? "현재 도구"}</span>
          <span>{help.commandId}</span>
          {help.shortcut ? <kbd className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground">{help.shortcut}</kbd> : null}
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {guide?.title ?? help.label}
        </h2>
        {help.labelEn ? <p className="mt-1 text-sm font-medium text-muted-foreground">{help.labelEn}</p> : null}
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          {guide?.summary ?? help.description}
        </p>
        {guide ? (
          <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/8 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">완료하면</p>
            <p className="mt-1 text-sm font-medium leading-6 text-foreground">{guide.outcome}</p>
          </div>
        ) : null}
      </header>

      {guide ? (
        <>
          <section aria-labelledby="quick-guide-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">30초 가이드</p>
                <h3 id="quick-guide-heading" className="mt-1 text-lg font-bold text-foreground">가장 짧은 성공 경로</h3>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{guide.steps.length}단계</span>
            </div>
            <ol className="mt-5 space-y-4">
              {guide.steps.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
                  <div className="pt-0.5">
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="tool-tips-heading" className="rounded-2xl border border-border bg-card p-5">
              <h3 id="tool-tips-heading" className="text-sm font-bold text-foreground">품질을 높이는 팁</h3>
              <ul className="mt-3 space-y-3">
                {guide.tips.map((tip) => (
                  <li key={tip} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="tool-fixes-heading" className="rounded-2xl border border-border bg-card p-5">
              <h3 id="tool-fixes-heading" className="text-sm font-bold text-foreground">이럴 때 확인</h3>
              <div className="mt-3 space-y-3">
                {guide.troubleshooting.map((item) => (
                  <div key={item.symptom} className="rounded-xl bg-muted/55 p-3">
                    <p className="text-xs font-semibold text-foreground">{item.symptom}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.resolution}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section aria-labelledby="related-help-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 id="related-help-heading" className="text-sm font-bold text-foreground">관련 문제 해결</h3>
              {guide.tutorialId ? (
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  튜토리얼 연결됨
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {guide.relatedRecipeIds.map((recipeId) => {
                const recipe = getStudioHelpRecipe(recipeId);
                if (!recipe) return null;
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => onOpenRecipe(recipe.id)}
                    className="flex items-center gap-3 rounded-xl border border-border/70 p-3 text-left transition hover:border-primary/35 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Wrench className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs font-semibold text-foreground">{recipe.title}</span>
                    <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card/50 p-6">
          <h3 className="text-base font-bold text-foreground">핵심 도구 가이드를 준비 중입니다</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            명령 설명과 별칭은 사용할 수 있으며, 상세 작성형 가이드가 없는 도구는 기능·설정 검색과 진단으로 이어집니다.
          </p>
          {help.aliases.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {help.aliases.map((alias) => (
                <span
                  key={`${alias.vendor}:${alias.term}`}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {alias.term}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-5">
        <button
          type="button"
          onClick={onOpenCommandSearch}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Search className="size-3.5" aria-hidden="true" />
          관련 기능 찾기
        </button>
        <button
          type="button"
          onClick={onOpenDiagnostics}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Stethoscope className="size-3.5" aria-hidden="true" />
          입력·렌더링 진단
        </button>
      </div>
    </div>
  );
}

interface TroubleshootingPanelProps {
  readonly initialRecipeId: string | null;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onRunDestination: (destination: StudioHelpRecipeDestination) => void;
}

function RecipeCard({
  recipe,
  emphasized,
  onRunDestination,
}: {
  readonly recipe: StudioHelpRecipe;
  readonly emphasized: boolean;
  readonly onRunDestination: (destination: StudioHelpRecipeDestination) => void;
}) {
  return (
    <article className={`rounded-2xl border bg-card p-5 transition ${emphasized ? "border-primary/55 ring-1 ring-primary/20" : "border-border"}`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Wrench className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{recipe.title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{recipe.summary}</p>
        </div>
      </div>
      <ol className="mt-4 space-y-3 border-t border-border pt-4">
        {recipe.checks.map((check, index) => (
          <li key={check.title} className="grid grid-cols-[1.5rem_1fr] gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">{index + 1}</span>
            <div>
              <p className="text-xs font-semibold text-foreground">{check.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{check.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onRunDestination(recipe.primaryAction)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {recipe.primaryAction.label}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
        {recipe.secondaryAction ? (
          <button
            type="button"
            onClick={() => onRunDestination(recipe.secondaryAction!)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {recipe.secondaryAction.label}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TroubleshootingPanel({
  initialRecipeId,
  query,
  onQueryChange,
  onRunDestination,
}: TroubleshootingPanelProps) {
  const recipes = useMemo(() => filterStudioHelpRecipes(query), [query]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Troubleshooting</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">증상부터 찾는 문제 해결</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          기능 이름을 몰라도 괜찮습니다. 보이는 증상을 검색한 뒤 위에서 아래 순서로 확인하면 원인을 빠르게 좁힐 수 있습니다.
        </p>
      </header>

      <label className="mt-6 block">
        <span className="sr-only">문제 해결 검색</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            type="search"
            placeholder="예: 선이 안 보여요, 채우기가 새요, 저장 복구"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </span>
      </label>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{recipes.length}개의 해결 경로</span>
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            검색 초기화
          </button>
        ) : null}
      </div>

      {recipes.length > 0 ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              emphasized={recipe.id === initialRecipeId}
              onRunDestination={onRunDestination}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <Search className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-foreground">일치하는 해결 레시피가 없습니다</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">더 짧은 증상으로 검색하거나 F1 기능·설정 검색을 사용하세요.</p>
        </div>
      )}
    </div>
  );
}

export function StudioContextHelpDialog({
  open,
  toolCommandId,
  onClose,
  onOpenSection,
}: StudioContextHelpDialogProps) {
  const [view, setView] = useState<StudioContextHelpView>(() => (toolCommandId ? "tool" : "home"));
  const [recipeQuery, setRecipeQuery] = useState("");
  const [initialRecipeId, setInitialRecipeId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = documentElement.style.overflow;
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    const overlay = overlayRef.current;
    const siblings = Array.from(body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== overlay,
    );
    const previousSiblingState = siblings.map((element) => ({
      element,
      inert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

    siblings.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousRootOverflow;
      previousSiblingState.forEach(({ element, inert, ariaHidden }) => {
        if (!inert) element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const openCommandSearch = () => {
    onClose();
    requestStudioCommandSearch();
  };

  const openManual = () => {
    window.open("/studio/manual", "_blank", "noopener,noreferrer");
  };

  const openRecipe = (recipeId: string) => {
    const recipe = getStudioHelpRecipe(recipeId);
    setInitialRecipeId(recipeId);
    setRecipeQuery(recipe?.title ?? "");
    setView("troubleshooting");
  };

  const runDestination = (destination: StudioHelpRecipeDestination) => {
    if (destination.type === "view") {
      setView(destination.view);
      return;
    }
    if (destination.type === "section") {
      onOpenSection(destination.section);
      return;
    }
    if (destination.type === "command-search") {
      openCommandSearch();
      return;
    }
    openManual();
  };

  const internalNav = [
    { id: "home" as const, label: "도움말 홈", icon: <Home className="size-4" aria-hidden="true" /> },
    { id: "tool" as const, label: "현재 도구", icon: <BookOpen className="size-4" aria-hidden="true" /> },
    { id: "troubleshooting" as const, label: "문제 해결", icon: <Wrench className="size-4" aria-hidden="true" /> },
  ];
  const sectionNav = [
    { id: "terminology" as const, label: "용어 사전", icon: <BookOpen className="size-4" aria-hidden="true" /> },
    { id: "diagnostics" as const, label: "시스템 진단", icon: <Stethoscope className="size-4" aria-hidden="true" /> },
    { id: "recovery" as const, label: "작업 복구", icon: <LifeBuoy className="size-4" aria-hidden="true" /> },
    { id: "license" as const, label: "라이선스", icon: <Scale className="size-4" aria-hidden="true" /> },
    { id: "bug-report" as const, label: "버그 보고", icon: <Bug className="size-4" aria-hidden="true" /> },
  ];

  const title = view === "home" ? "도움말 홈" : view === "tool" ? "현재 도구 도움말" : "문제 해결";

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-context-help-title"
        tabIndex={-1}
        className="flex h-[min(900px,94vh)] w-[min(1180px,96vw)] min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl outline-none"
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HelpCircle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">ToonStudio Help</p>
            <h1 id="studio-context-help-title" className="truncate text-sm font-bold text-foreground">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openCommandSearch}
              className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-xs font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
            >
              <Search className="size-3.5" aria-hidden="true" />
              기능 찾기
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">F1</kbd>
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="도움말 닫기"
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-muted/20 p-3 md:flex" aria-label="도움말 탐색">
            <nav className="space-y-1">
              {internalNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  aria-current={view === item.id ? "page" : undefined}
                  className={`flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${view === item.id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="my-3 border-t border-border" />
            <nav className="space-y-1" aria-label="지원 도구">
              {sectionNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenSection(item.id)}
                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {item.icon}
                  {item.label}
                  <ChevronRight className="ml-auto size-3.5" aria-hidden="true" />
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={openManual}
              className="mt-auto flex items-center gap-2 rounded-xl border border-border bg-background p-3 text-left text-xs font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
              사용자 설명서
            </button>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-background/95 p-2 backdrop-blur md:hidden" aria-label="도움말 탐색">
              {internalNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  aria-current={view === item.id ? "page" : undefined}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${view === item.id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            {view === "home" ? (
              <HomePanel
                toolCommandId={toolCommandId}
                onViewChange={setView}
                onOpenSection={onOpenSection}
                onOpenCommandSearch={openCommandSearch}
                onOpenManual={openManual}
                onOpenRecipe={openRecipe}
              />
            ) : view === "tool" ? (
              <ToolPanel
                toolCommandId={toolCommandId}
                onOpenRecipe={openRecipe}
                onOpenCommandSearch={openCommandSearch}
                onOpenDiagnostics={() => onOpenSection("diagnostics")}
              />
            ) : (
              <TroubleshootingPanel
                initialRecipeId={initialRecipeId}
                query={recipeQuery}
                onQueryChange={(nextQuery) => {
                  setRecipeQuery(nextQuery);
                  if (!nextQuery) setInitialRecipeId(null);
                }}
                onRunDestination={runDestination}
              />
            )}
          </main>
        </div>
      </div>
    </div>,
    document.body,
  );
}
