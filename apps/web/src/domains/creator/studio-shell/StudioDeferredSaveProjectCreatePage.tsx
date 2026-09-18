import {
  getCurrentUiLocale,
  resolveUiLocale,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Box,
  Clapperboard,
  ClipboardCheck,
  FileImage,
  Images,
  LayoutTemplate,
  PanelsTopLeft,
  PenTool,
  Presentation,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { WorkflowTrustBadge } from "@/shared/components/WorkflowTrustBadge";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  WEBTOON_CADENCES,
  WEBTOON_ONBOARDING_GOALS,
  WEBTOON_STARTING_POINTS,
  WEBTOON_TEAM_MODELS,
  buildWebtoonOnboardingPlan,
  createStudioWebtoonOnboardingProfile,
  webtoonOnboardingProjectHref,
  webtoonOnboardingSelectionFromSearchParams,
  writeStudioWebtoonOnboardingProfile,
  type WebtoonCadenceId,
  type WebtoonOnboardingGoalId,
  type WebtoonOnboardingSelection,
  type WebtoonStartingPointId,
  type WebtoonTeamModelId,
} from "@/shared/lib/webtoon-production-onboarding";

import {
  STUDIO_PROJECT_CREATE_KINDS,
  STUDIO_PROJECT_CREATE_TEMPLATES,
  type StudioProjectCreateKindOption,
} from "../save-first/studio-project-create-options";
import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import type { StudioProjectKind } from "../studio-project-library-store";
import {
  DisabledReason,
  RecoverableActionNotice,
  StudioTaskFlow,
  StudioTaskSummary,
  type StudioTaskFlowStep,
} from "./StudioTaskFlow";

type Locale = string;

const KIND_ICONS: Readonly<Record<StudioProjectKind, LucideIcon>> = {
  webtoon: PanelsTopLeft,
  illustration: PenTool,
  image: FileImage,
  design: LayoutTemplate,
  slides: Presentation,
  storyboard: Clapperboard,
  "three-d": Box,
  animation: Images,
};

function projectTitle(
  option: StudioProjectCreateKindOption,
  bt: (ko: string, en: string) => string,
): string {
  return bt(option.titleKo, option.titleEn);
}

function defaultTitle(
  option: StudioProjectCreateKindOption,
  bt: (ko: string, en: string) => string,
): string {
  return bt(option.defaultTitleKo, option.defaultTitleEn);
}

function requestedProjectKind(kind: string | null, templateId: string | null): StudioProjectKind | null {
  const explicit = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind)?.id;
  if (explicit) return explicit;
  if (!templateId) return null;
  return STUDIO_PROJECT_CREATE_KINDS.find((option) =>
    STUDIO_PROJECT_CREATE_TEMPLATES[option.id].some((template) => template.id === templateId)
  )?.id ?? null;
}

type WebtoonChoiceOption<T extends string> = {
  readonly id: T;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
};

function WebtoonOnboardingSelect<T extends string>({
  id,
  label,
  value,
  options,
  locale: _locale,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly options: readonly WebtoonChoiceOption<T>[];
  readonly locale?: string;
  readonly onChange: (value: T) => void;
}) {
  const bt = useBilingual("StudioDeferredSaveProjectCreatePage.onboardingSelect");
  return (
    <label className="min-w-0 text-xs font-bold text-fg-2" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-2 min-h-12 w-full min-w-0 rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {bt(option.labelKo, option.labelEn)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StudioDeferredSaveProjectCreatePage() {
  const bt = useBilingual("StudioDeferredSaveProjectCreatePage");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = language;
  const requestedTemplateId = searchParams.get("template");
  const requestedWebtoonSelection = webtoonOnboardingSelectionFromSearchParams(searchParams);
  const requestedKindId = requestedProjectKind(searchParams.get("kind"), requestedTemplateId);
  const initialKind = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === requestedKindId)
    ?? STUDIO_PROJECT_CREATE_KINDS[0]!;
  const initialTemplateId = STUDIO_PROJECT_CREATE_TEMPLATES[initialKind.id]
    .find((template) => template.id === requestedTemplateId)?.id
    ?? STUDIO_PROJECT_CREATE_TEMPLATES[initialKind.id][0]?.id
    ?? "webtoon-vertical";

  const [kind, setKind] = useState<StudioProjectKind>(initialKind.id);
  const [title, setTitle] = useState(() => defaultTitle(initialKind, bt));
  const [titleEdited, setTitleEdited] = useState(false);
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [showMoreKinds, setShowMoreKinds] = useState(false);
  const [webtoonOnboardingEnabled, setWebtoonOnboardingEnabled] = useState(Boolean(requestedWebtoonSelection));
  const [webtoonSelection, setWebtoonSelection] = useState<WebtoonOnboardingSelection>(
    requestedWebtoonSelection ?? DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind) ?? initialKind;
  const templates = STUDIO_PROJECT_CREATE_TEMPLATES[kind];
  const selectedTemplate = templates.find((option) => option.id === templateId) ?? templates[0];
  const selectedTemplateLabel = selectedTemplate
    ? bt(selectedTemplate.labelKo, selectedTemplate.labelEn)
    : templateId;
  const visibleKinds = useMemo(
    () => STUDIO_PROJECT_CREATE_KINDS.filter((option) => option.featured || showMoreKinds),
    [showMoreKinds],
  );
  const onboardingPlan = useMemo(
    () => buildWebtoonOnboardingPlan(webtoonSelection),
    [webtoonSelection],
  );
  const structuredWebtoonFlow = kind === "webtoon" && webtoonOnboardingEnabled;
  const titleReady = title.trim().length > 0;

  const steps: readonly StudioTaskFlowStep[] = [
    {
      id: "kind",
      label: bt("만들 작업 선택", "Choose work type"),
      description: projectTitle(selected, bt),
      state: "complete",
    },
    {
      id: "details",
      label: bt("이름과 시작 형식", "Name and format"),
      description: selectedTemplateLabel,
      state: titleReady ? "complete" : "current",
    },
    ...(structuredWebtoonFlow ? [{
      id: "production-track",
      label: bt("제작 트랙 확인", "Confirm production track"),
      description: bt(onboardingPlan.titleKo, onboardingPlan.titleEn),
      state: "complete" as const,
    }] : []),
    {
      id: "start",
      label: bt("자동 저장하며 시작", "Start with autosave"),
      description: structuredWebtoonFlow
        ? (bt("프로젝트와 첫 제작 계획 생성", "Create the project and first production plan"))
        : (bt("기기 복구 저장 후 클라우드 연결", "Device recovery first, cloud next")),
      state: titleReady ? "current" : "upcoming",
    },
  ];

  const selectKind = (option: StudioProjectCreateKindOption) => {
    setKind(option.id);
    setTemplateId(STUDIO_PROJECT_CREATE_TEMPLATES[option.id][0]?.id ?? `${option.id}-blank`);
    if (!titleEdited) setTitle(defaultTitle(option, bt));
    setError(null);
  };

  const create = () => {
    if (typeof window === "undefined" || creating || !titleReady) return;
    setCreating(true);
    setError(null);
    try {
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title,
        kind,
        templateId,
        primaryLocale: locale,
      }, window);
      ensureStudioSaveProfile(window.localStorage, result.project.id, {
        provider: "browser",
        autoSave: true,
        createVersions: true,
        target: window,
      });
      let destination = `${result.href}&uiMode=basic&startTool=draw`;
      if (structuredWebtoonFlow) {
        const profile = createStudioWebtoonOnboardingProfile(
          result.project.id,
          webtoonSelection,
          result.project.createdAt,
        );
        writeStudioWebtoonOnboardingProfile(window.localStorage, profile);
        destination = webtoonOnboardingProjectHref(result.project.id, webtoonSelection);
      }
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : bt("임시 작업을 시작하지 못했습니다.", "The temporary work could not be started."));
      setCreating(false);
    }
  };

  const startLabel = structuredWebtoonFlow
    ? (bt("프로젝트와 제작 계획 만들기", "Create project and production plan"))
    : bt(`${selected.titleKo} 시작`, `Start ${selected.titleEn}`);

  return (
    <div data-route-ready="studio-new" className="min-h-[calc(100vh-4rem)] min-w-0 bg-bg">
      <Container size="wide" className="min-w-0 py-7 sm:py-12">
        <div className="mx-auto min-w-0 max-w-6xl">
          <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="flex min-w-0 flex-wrap items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
                <Sparkles size={14} className="shrink-0" aria-hidden="true" /> <span className="break-words">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioDeferredSaveProjectCreatePage", "en", "TOONSTUDIO CREATE")}</span>
              </p>
              <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-fg sm:text-4xl">
                {bt("바로 만들기 시작하세요", "Start creating right away")}
              </h1>
              <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-fg-2 sm:text-base">
                {bt("작업 종류와 시작 형식만 고르면 됩니다. 시작하는 즉시 이 기기에 복구 저장되며, 프로젝트 저장 후에는 ToonStudio 클라우드에서 다른 기기와 팀 작업으로 이어갈 수 있습니다. 기존 파일과 외부 드라이브는 가져오기·백업 옵션입니다.", "Choose only the work type and starting format. Recovery storage begins on this device immediately, and a saved project can continue through ToonStudio Cloud across devices and teams. Existing files and external drives remain optional import and backup paths.")}
              </p>
            </div>
            <Link href="/studio/import" className={buttonClass({ variant: "outline", className: "w-full min-w-0 sm:w-auto" })}>
              <span className="break-words">{bt("기존 파일 가져오기", "Import existing files")}</span>
            </Link>
          </header>

          <StudioTaskFlow
            steps={steps}
            ariaLabel={bt("새 프로젝트 시작 단계", "New project start steps")}
            className="mt-5"
          />

          <section className="mt-7 min-w-0" aria-labelledby="project-kind-title">
            <h2 id="project-kind-title" className="break-words text-base font-black text-fg">
              {bt("1. 만들 작업", "1. Project type")}
            </h2>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleKinds.map((option) => {
                const active = option.id === kind;
                const Icon = KIND_ICONS[option.id];
                const descriptionId = `studio-kind-${option.id}-description`;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    aria-describedby={descriptionId}
                    onClick={() => selectKind(option)}
                    className={cn(
                      "min-h-36 min-w-0 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active
                        ? "border-accent bg-accent-soft/40 shadow-sm"
                        : "border-line bg-card hover:border-accent/40 hover:bg-raised",
                    )}
                  >
                    <span className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      active ? "bg-accent text-on-accent" : "bg-panel text-fg-2",
                    )}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <b className="mt-3 block break-words text-base text-fg">{projectTitle(option, l)}</b>
                    <span id={descriptionId} className="mt-1 block break-words text-xs leading-5 text-fg-3">
                      {bt(option.descriptionKo ?? "", option.descriptionEn ?? "")}
                    </span>
                  </button>
                );
              })}
            </div>
            {!showMoreKinds ? (
              <button
                type="button"
                aria-expanded={showMoreKinds}
                onClick={() => setShowMoreKinds(true)}
                className={buttonClass({ variant: "quiet", size: "sm", className: "mt-2 w-full min-w-0 sm:w-auto" })}
              >
                <span className="break-words">{bt("다른 작업 종류 보기", "Show more project types")}</span>
              </button>
            ) : null}
          </section>

          <section className="mt-7 min-w-0 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-7" aria-labelledby="project-settings-title">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Sparkles size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="project-settings-title" className="break-words text-xl font-black text-fg">
                  {bt("2. 이름과 시작 형식", "2. Name and starting format")}
                </h2>
                <p className="mt-1 break-words text-xs leading-5 text-fg-3">
                  {bt("공개 제목·소개·장르·연재 위치는 지금 정하지 않아도 됩니다.", "A public title, synopsis, genre and publishing destination are not required now.")}
                </p>
              </div>
            </div>
            <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
              <label className="min-w-0 text-xs font-bold text-fg-2" htmlFor="studio-project-title">
                {bt("프로젝트 이름", "Project name")}
                <input
                  id="studio-project-title"
                  value={title}
                  maxLength={120}
                  aria-invalid={!titleReady}
                  aria-describedby="studio-project-title-help"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setTitle(event.target.value);
                    setTitleEdited(true);
                    setError(null);
                  }}
                  className="mt-2 min-h-12 w-full min-w-0 rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <span id="studio-project-title-help" className={cn("mt-2 block break-words text-[0.6875rem] leading-5", titleReady ? "text-fg-3" : "text-danger")}>
                  {titleReady
                    ? (bt("작업용 이름이며 공개 전 언제든 바꿀 수 있습니다.", "This is a working name and can change before publishing."))
                    : (bt("프로젝트 이름을 입력하면 시작할 수 있습니다.", "Enter a project name to continue."))}
                </span>
              </label>
              <label className="min-w-0 text-xs font-bold text-fg-2" htmlFor="studio-project-template">
                {bt("시작 템플릿", "Starting template")}
                <select
                  id="studio-project-template"
                  value={templateId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    setTemplateId(event.target.value);
                    setError(null);
                  }}
                  className="mt-2 min-h-12 w-full min-w-0 rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  {templates.map((option) => (
                    <option key={option.id} value={option.id}>
                      {bt(option.labelKo, option.labelEn)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {kind === "webtoon" ? (
            <section className="mt-5 min-w-0 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-7" aria-labelledby="webtoon-production-onboarding-title">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <ClipboardCheck size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioDeferredSaveProjectCreatePage", "en", "PRODUCTION ONBOARDING")}</p>
                    <h2 id="webtoon-production-onboarding-title" className="mt-1 break-words text-xl font-black text-fg">
                      {bt("실제 제작 단계에 맞춰 시작", "Start from your real production stage")}
                    </h2>
                    <p className="mt-1 max-w-3xl break-words text-xs leading-5 text-fg-3">
                      {bt("현재 가진 자료와 목표를 기준으로 첫 승인 마일스톤과 작업 체크리스트를 만듭니다. 기능 설명만 보고 끝나는 온보딩이 아닙니다.", "Create the first approval milestone and task checklist from the material and goal you already have.")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-pressed={webtoonOnboardingEnabled}
                  onClick={() => setWebtoonOnboardingEnabled((enabled) => !enabled)}
                  className={buttonClass({
                    variant: webtoonOnboardingEnabled ? "solid" : "outline",
                    size: "sm",
                    className: "w-full min-w-0 sm:w-auto sm:shrink-0",
                  })}
                >
                  {webtoonOnboardingEnabled
                    ? (bt("제작 트랙 사용 중", "Production track enabled"))
                    : (bt("제작 트랙 설정", "Set production track"))}
                </button>
              </div>

              {webtoonOnboardingEnabled ? (
                <div className="mt-5">
                  <div className="grid min-w-0 gap-4 md:grid-cols-2">
                    <WebtoonOnboardingSelect<WebtoonStartingPointId>
                      id="webtoon-onboarding-start"
                      label={bt("현재 가지고 있는 자료", "What you already have")}
                      value={webtoonSelection.startingPoint}
                      options={WEBTOON_STARTING_POINTS}
                      locale={legacyLocale}
                      onChange={(startingPoint) => setWebtoonSelection((current) => ({ ...current, startingPoint }))}
                    />
                    <WebtoonOnboardingSelect<WebtoonOnboardingGoalId>
                      id="webtoon-onboarding-goal"
                      label={bt("프로젝트 목표", "Project goal")}
                      value={webtoonSelection.goal}
                      options={WEBTOON_ONBOARDING_GOALS}
                      locale={legacyLocale}
                      onChange={(goal) => setWebtoonSelection((current) => ({ ...current, goal }))}
                    />
                    <WebtoonOnboardingSelect<WebtoonTeamModelId>
                      id="webtoon-onboarding-team"
                      label={bt("제작 인원", "Team model")}
                      value={webtoonSelection.teamModel}
                      options={WEBTOON_TEAM_MODELS}
                      locale={legacyLocale}
                      onChange={(teamModel) => setWebtoonSelection((current) => ({ ...current, teamModel }))}
                    />
                    <WebtoonOnboardingSelect<WebtoonCadenceId>
                      id="webtoon-onboarding-cadence"
                      label={bt("예상 연재 주기", "Publishing cadence")}
                      value={webtoonSelection.cadence}
                      options={WEBTOON_CADENCES}
                      locale={legacyLocale}
                      onChange={(cadence) => setWebtoonSelection((current) => ({ ...current, cadence }))}
                    />
                  </div>
                  <div className="mt-5 grid gap-4 rounded-2xl border border-accent/25 bg-accent-soft/20 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.8fr)]">
                    <div>
                      <p className="text-xs font-black text-accent">{bt("추천 제작 트랙", "Recommended production track")}</p>
                      <h3 className="mt-1 text-lg font-black text-fg">{bt(onboardingPlan.titleKo, onboardingPlan.titleEn)}</h3>
                      <p className="mt-2 text-xs leading-5 text-fg-2">{bt(onboardingPlan.summaryKo, onboardingPlan.summaryEn)}</p>
                    </div>
                    <div className="rounded-xl bg-panel p-3">
                      <p className="text-[0.65rem] font-bold text-fg-3">{bt("첫 승인 마일스톤", "First approval milestone")}</p>
                      <p className="mt-1 text-sm font-bold text-fg">{bt(onboardingPlan.milestoneKo, onboardingPlan.milestoneEn)}</p>
                    </div>
                  </div>
                  <Link href="/learn/process#production-onboarding" className={buttonClass({ variant: "quiet", size: "sm", className: "mt-3 w-full min-w-0 sm:w-auto" })}>
                    <span className="break-words">{bt("업계 제작 과정과 트랙 설명 보기", "Review the industry workflow and tracks")}</span>
                  </Link>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl bg-panel p-4 text-xs leading-5 text-fg-2">
                  {bt("바로 드로잉으로 시작하려면 지금 상태를 유지하세요. 기획·대본·콘티·완성 원고·연재 중 상태에서 이어가려면 제작 트랙을 설정하세요.", "Keep this off to open the drawing workspace immediately, or enable it to continue from planning, script, storyboard, finished art or a live series.")}
                </div>
              )}
            </section>
          ) : null}

          <section className="mt-5 flex min-w-0 items-start gap-3 rounded-2xl border border-success/30 bg-success-soft/15 p-4" aria-label={bt("자동 저장 안내", "Autosave notice")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-success">
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <WorkflowTrustBadge state="device-saved" locale={legacyLocale} className="mb-2 w-fit max-w-full" />
              <h2 className="break-words text-sm font-black text-fg">
                {bt("그리는 동안 이 기기에 자동 저장됩니다", "Your work is autosaved on this device while you draw")}
              </h2>
              <p className="mt-1 break-words text-xs leading-5 text-fg-2">
                {bt("‘임시 작업’에서 언제든 이어갈 수 있습니다. 프로젝트로 저장하면 ToonStudio 클라우드 동기화와 버전 복구를 사용할 수 있으며, Google Drive·Dropbox·OneDrive는 가져오기와 추가 백업에 선택적으로 사용할 수 있습니다.", "Resume it from Temporary work at any time. Saving as a project enables ToonStudio Cloud sync and version recovery; Google Drive, Dropbox and OneDrive remain optional import and extra-backup choices.")}
              </p>
            </div>
          </section>

          {error ? (
            <RecoverableActionNotice
              tone="danger"
              title={bt("프로젝트를 시작하지 못했습니다", "The project could not be started")}
              description={bt(`${error} 입력한 이름과 시작 형식은 그대로 유지되어 있습니다.`, `${error} Your project name and starting format are still preserved.`)}
              action={
                <button
                  type="button"
                  onClick={create}
                  disabled={creating || !titleReady}
                  className={buttonClass({ variant: "outline", size: "sm", className: "w-full min-w-0 gap-2 sm:w-auto" })}
                >
                  <RefreshCw size={14} className="shrink-0" aria-hidden="true" />
                  <span className="break-words">{bt("다시 시도", "Try again")}</span>
                </button>
              }
              className="mt-5"
            />
          ) : null}

          <div className="mt-7 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <StudioTaskSummary
              eyebrow={bt("시작할 작업", "Ready to start")}
              title={`${title.trim() || (bt("이름 없는 프로젝트", "Untitled project"))} · ${projectTitle(selected, locale)}`}
              description={structuredWebtoonFlow
                ? (bt(`${onboardingPlan.titleKo} · ${onboardingPlan.milestoneKo}`, `${onboardingPlan.titleEn} · ${onboardingPlan.milestoneEn}`))
                : bt(`${selectedTemplateLabel} 템플릿을 적용하고 드로잉 도구로 시작합니다.`, `Apply the ${selectedTemplateLabel} template and open the drawing tool.`)}
              meta={<WorkflowTrustBadge state="device-saved" locale={locale} compact={false} />}
            />
            <div className="flex min-w-0 flex-col gap-3 lg:min-w-72">
              <DisabledReason id="studio-create-disabled-reason" visible={!titleReady}>
                {bt("프로젝트 이름을 입력하면 자동 저장되는 작업공간을 시작할 수 있습니다.", "Enter a project name to start an autosaved workspace.")}
              </DisabledReason>
              <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <Link href="/studio" className={buttonClass({ variant: "quiet", className: "w-full min-w-0 sm:w-auto" })}>
                  <span className="break-words">{bt("내 작업으로", "Back to My work")}</span>
                </Link>
                <button
                  type="button"
                  disabled={creating || !titleReady}
                  aria-describedby={!titleReady ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioDeferredSaveProjectCreatePage", "en", "studio-project-title-help studio-create-disabled-reason") : undefined}
                  onClick={create}
                  className={buttonClass({ className: "w-full min-w-0 sm:min-w-44 sm:w-auto" })}
                >
                  <span className="break-words">{creating ? (bt("준비 중…", "Preparing…")) : startLabel}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
