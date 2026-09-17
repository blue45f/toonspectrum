import {
  ArrowRight,
  Box,
  Clapperboard,
  FileImage,
  Images,
  LayoutTemplate,
  PanelsTopLeft,
  PenTool,
  Presentation,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
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

import { buildStudioModeLaunchHref, resolveStudioModeCreationPlan } from "../studio-mode-creation-plan";
import { studioModeLabel } from "../studio-mode-profile";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import type { StudioProjectKind } from "../studio-project-library-store";
import {
  STUDIO_PROJECT_CREATE_KINDS,
  STUDIO_PROJECT_CREATE_TEMPLATES,
  type StudioProjectCreateKindOption,
} from "../save-first/studio-project-create-options";
import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import { StudioModeWorkspacePreview } from "./StudioModeWorkspacePreview";
import {
  DisabledReason,
  StudioTaskFlow,
  StudioTaskSummary,
  type StudioTaskFlowStep,
} from "./StudioTaskFlow";

type Locale = "ko" | "en";
type Choice<T extends string> = {
  readonly id: T;
  readonly labelKo: string;
  readonly labelEn: string;
};

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

const CREATE_DISABLED_REASON_ID = "studio-create-disabled-reason";

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function localized(option: StudioProjectCreateKindOption, locale: Locale): string {
  return locale === "ko" ? option.titleKo : option.titleEn;
}

function defaultTitle(option: StudioProjectCreateKindOption, locale: Locale): string {
  return locale === "ko" ? option.defaultTitleKo : option.defaultTitleEn;
}

function requestedKind(kind: string | null, templateId: string | null): StudioProjectKind | null {
  const explicit = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind)?.id;
  if (explicit) return explicit;
  if (!templateId) return null;
  return STUDIO_PROJECT_CREATE_KINDS.find((option) =>
    STUDIO_PROJECT_CREATE_TEMPLATES[option.id].some((template) => template.id === templateId)
  )?.id ?? null;
}

function documentTitle(kind: StudioProjectKind, title: string): string {
  if (kind === "webtoon") return "EP01 원고";
  if (kind === "slides") return "발표 자료";
  return `${title} 작업 문서`;
}

function OnboardingSelect<T extends string>({
  id,
  label,
  value,
  choices,
  locale,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly choices: readonly Choice<T>[];
  readonly locale: Locale;
  readonly onChange: (next: T) => void;
}) {
  return (
    <label className="text-xs font-bold text-fg-2" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
      >
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {locale === "ko" ? choice.labelKo : choice.labelEn}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StudioModeProjectCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locale = localeFromLanguage(useI18n((state) => state.lang));
  const requestedTemplateId = searchParams.get("template");
  const requestedSelection = webtoonOnboardingSelectionFromSearchParams(searchParams);
  const requestedKindId = requestedKind(searchParams.get("kind"), requestedTemplateId);
  const initialKind = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === requestedKindId)
    ?? STUDIO_PROJECT_CREATE_KINDS[0]!;
  const initialTemplateId = STUDIO_PROJECT_CREATE_TEMPLATES[initialKind.id]
    .find((template) => template.id === requestedTemplateId)?.id
    ?? STUDIO_PROJECT_CREATE_TEMPLATES[initialKind.id][0]?.id
    ?? "webtoon-vertical";

  const [kind, setKind] = useState<StudioProjectKind>(initialKind.id);
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [title, setTitle] = useState(() => defaultTitle(initialKind, locale));
  const [titleEdited, setTitleEdited] = useState(false);
  const [showMoreKinds, setShowMoreKinds] = useState(false);
  const [onboardingEnabled, setOnboardingEnabled] = useState(Boolean(requestedSelection));
  const [selection, setSelection] = useState<WebtoonOnboardingSelection>(
    requestedSelection ?? DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templates = STUDIO_PROJECT_CREATE_TEMPLATES[kind];
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? templates[0]!;
  const selectedTemplateLabel = locale === "ko" ? selectedTemplate.labelKo : selectedTemplate.labelEn;
  const modePlan = useMemo(
    () => resolveStudioModeCreationPlan(kind, selectedTemplate.id),
    [kind, selectedTemplate.id],
  );
  const onboardingPlan = useMemo(() => buildWebtoonOnboardingPlan(selection), [selection]);
  const structuredWebtoon = kind === "webtoon" && onboardingEnabled;
  const visibleKinds = useMemo(
    () => STUDIO_PROJECT_CREATE_KINDS.filter((option) => option.featured || showMoreKinds),
    [showMoreKinds],
  );
  const titleReady = title.trim().length > 0;
  const modeName = studioModeLabel(modePlan.profile, locale);
  const steps: readonly StudioTaskFlowStep[] = [
    {
      id: "kind",
      label: locale === "ko" ? "만들 작업 선택" : "Choose work type",
      description: modeName,
      state: "complete",
    },
    {
      id: "details",
      label: locale === "ko" ? "이름과 시작 형식" : "Name and format",
      description: selectedTemplateLabel,
      state: titleReady ? "complete" : "current",
    },
    ...(structuredWebtoon ? [{
      id: "production-track",
      label: locale === "ko" ? "제작 트랙 확인" : "Confirm production track",
      description: locale === "ko" ? onboardingPlan.titleKo : onboardingPlan.titleEn,
      state: "complete" as const,
    }] : []),
    {
      id: "start",
      label: locale === "ko" ? "자동 저장하며 시작" : "Start with autosave",
      description: locale === "ko"
        ? "이 기기에 복구 저장 후 작업 시작"
        : "Start after creating device recovery storage",
      state: titleReady ? "current" : "upcoming",
    },
  ];

  function chooseKind(option: StudioProjectCreateKindOption) {
    setKind(option.id);
    setTemplateId(STUDIO_PROJECT_CREATE_TEMPLATES[option.id][0]?.id ?? `${option.id}-blank`);
    if (!titleEdited) setTitle(defaultTitle(option, locale));
    if (option.id !== "webtoon") setOnboardingEnabled(false);
    setError(null);
  }

  function create() {
    const normalizedTitle = title.trim();
    if (creating || !normalizedTitle) return;
    setCreating(true);
    setError(null);
    try {
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title: normalizedTitle,
        kind,
        templateId: selectedTemplate.id,
        primaryLocale: locale === "ko" ? "ko-KR" : "en-US",
        document: {
          title: documentTitle(kind, normalizedTitle),
          kind: modePlan.document.kind,
          defaultWorkspace: modePlan.document.workspace,
          width: modePlan.document.width,
          height: modePlan.document.height,
          pageCount: modePlan.document.pageCount,
        },
      }, window);
      ensureStudioSaveProfile(window.localStorage, result.project.id, {
        provider: "browser",
        autoSave: true,
        createVersions: true,
        target: window,
      });

      if (structuredWebtoon) {
        writeStudioWebtoonOnboardingProfile(
          window.localStorage,
          createStudioWebtoonOnboardingProfile(result.project.id, selection, result.project.createdAt),
        );
        navigate(webtoonOnboardingProjectHref(result.project.id, selection), { replace: true });
        return;
      }
      navigate(buildStudioModeLaunchHref(result, modePlan), { replace: true });
    } catch (cause) {
      setCreating(false);
      setError(cause instanceof Error
        ? cause.message
        : locale === "ko"
          ? "새 작업을 만들지 못했습니다."
          : "The new work could not be created.");
    }
  }

  const startLabel = structuredWebtoon
    ? (locale === "ko" ? "프로젝트와 제작 계획 만들기" : "Create project and production plan")
    : locale === "ko" ? `${modeName} 시작` : `Start ${modeName}`;

  return (
    <div data-route-ready="studio-new" data-studio-mode-create="true" className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
                <Sparkles size={14} aria-hidden="true" /> TOONSTUDIO CREATE
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
                {locale === "ko" ? "무엇을 만들지 고르면 작업공간도 바뀝니다" : "Choose what to make — the workspace changes with it"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
                {locale === "ko"
                  ? "작업 종류와 시작 형식만 고르면 됩니다. 시작하는 즉시 이 기기에 복구 저장되며, 종류마다 패널·도구·AI 추천·제작 흐름과 내보내기 목표가 달라집니다."
                  : "Choose the work type and starting format. Recovery storage begins on this device immediately, and each mode adapts panels, tools, AI, workflow and delivery."}
              </p>
            </div>
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
              {locale === "ko" ? "기존 파일 가져오기" : "Import existing files"}
            </Link>
          </header>

          <StudioTaskFlow
            steps={steps}
            ariaLabel={locale === "ko" ? "새 프로젝트 시작 단계" : "New project start steps"}
            className="mt-5"
          />

          <section className="mt-7" aria-labelledby="studio-mode-kind-title">
            <p className="text-xs font-black text-accent">01</p>
            <h2 id="studio-mode-kind-title" className="mt-1 text-lg font-black text-fg">
              {locale === "ko" ? "만들 작업" : "What are you making?"}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleKinds.map((option) => {
                const active = option.id === kind;
                const Icon = KIND_ICONS[option.id];
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseKind(option)}
                    className={cn(
                      "min-h-36 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active ? "border-accent bg-accent-soft/50 shadow-sm" : "border-line bg-card hover:bg-raised",
                    )}
                  >
                    <span className={cn("grid size-10 place-items-center rounded-xl", active ? "bg-accent text-on-accent" : "bg-panel text-fg-2")}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <b className="mt-3 block text-sm text-fg">{localized(option, locale)}</b>
                    <span className="mt-1 block text-xs leading-5 text-fg-3">
                      {locale === "ko" ? option.descriptionKo : option.descriptionEn}
                    </span>
                  </button>
                );
              })}
            </div>
            {!showMoreKinds ? (
              <button type="button" onClick={() => setShowMoreKinds(true)} className={buttonClass({ variant: "quiet", size: "sm", className: "mt-2" })}>
                {locale === "ko" ? "다른 작업 종류 보기" : "Show more project types"}
              </button>
            ) : null}
          </section>

          <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
            <div className="min-w-0 space-y-4">
              <StudioModeWorkspacePreview profile={modePlan.profile} locale={locale} />

              {kind === "webtoon" ? (
                <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-accent">
                        {locale === "ko" ? "실제 제작 단계에 맞춰 시작" : "Start from your real production stage"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-fg-3">
                        {locale === "ko"
                          ? "대본·콘티·팀 구성과 연재 주기를 알려주면 첫 제작 계획까지 준비합니다."
                          : "Use your current material, goal, team and cadence to prepare the first production plan."}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={onboardingEnabled}
                      onClick={() => setOnboardingEnabled((value) => !value)}
                      className={buttonClass({ variant: onboardingEnabled ? "solid" : "outline", size: "sm" })}
                    >
                      {onboardingEnabled
                        ? (locale === "ko" ? "제작 계획 사용 중" : "Production plan on")
                        : (locale === "ko" ? "제작 단계 설정하기" : "Configure production")}
                    </button>
                  </div>

                  {onboardingEnabled ? (
                    <div className="mt-4">
                      <h3 className="text-base font-black text-fg">
                        {locale === "ko" ? onboardingPlan.titleKo : onboardingPlan.titleEn}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-fg-3">
                        {locale === "ko" ? onboardingPlan.summaryKo : onboardingPlan.summaryEn}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <OnboardingSelect<WebtoonStartingPointId>
                          id="studio-webtoon-starting-point"
                          label={locale === "ko" ? "현재 가지고 있는 자료" : "What you already have"}
                          value={selection.startingPoint}
                          choices={WEBTOON_STARTING_POINTS}
                          locale={locale}
                          onChange={(startingPoint) => setSelection((current) => ({ ...current, startingPoint }))}
                        />
                        <OnboardingSelect<WebtoonOnboardingGoalId>
                          id="studio-webtoon-goal"
                          label={locale === "ko" ? "이번 프로젝트 목표" : "Project goal"}
                          value={selection.goal}
                          choices={WEBTOON_ONBOARDING_GOALS}
                          locale={locale}
                          onChange={(goal) => setSelection((current) => ({ ...current, goal }))}
                        />
                        <OnboardingSelect<WebtoonTeamModelId>
                          id="studio-webtoon-team"
                          label={locale === "ko" ? "제작 인원" : "Team model"}
                          value={selection.teamModel}
                          choices={WEBTOON_TEAM_MODELS}
                          locale={locale}
                          onChange={(teamModel) => setSelection((current) => ({ ...current, teamModel }))}
                        />
                        <OnboardingSelect<WebtoonCadenceId>
                          id="studio-webtoon-cadence"
                          label={locale === "ko" ? "제작 주기" : "Cadence"}
                          value={selection.cadence}
                          choices={WEBTOON_CADENCES}
                          locale={locale}
                          onChange={(cadence) => setSelection((current) => ({ ...current, cadence }))}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
              <p className="text-xs font-black text-accent">02</p>
              <h2 className="mt-1 text-lg font-black text-fg">{locale === "ko" ? "시작 형식" : "Starting format"}</h2>
              <label className="mt-4 block text-xs font-bold text-fg-2" htmlFor="studio-mode-project-title">
                {locale === "ko" ? "프로젝트 이름" : "Project name"}
                <input
                  id="studio-mode-project-title"
                  value={title}
                  maxLength={120}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTitleEdited(true);
                  }}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
                />
              </label>
              <label className="mt-4 block text-xs font-bold text-fg-2" htmlFor="studio-mode-template">
                {locale === "ko" ? "시작 템플릿" : "Starting template"}
                <select
                  id="studio-mode-template"
                  value={selectedTemplate.id}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {locale === "ko" ? template.labelKo : template.labelEn}
                    </option>
                  ))}
                </select>
              </label>

              <StudioTaskSummary
                eyebrow={locale === "ko" ? "선택한 시작 설정" : "Selected setup"}
                title={title.trim() || (locale === "ko" ? "프로젝트 이름 없음" : "Untitled project")}
                description={`${modeName} · ${selectedTemplateLabel}`}
                className="mt-4"
                meta={(
                  <>
                    <span className="rounded-full border border-good/30 bg-good/10 px-2 py-1 text-[0.65rem] font-bold text-fg-2">
                      {locale === "ko" ? "이 기기에 저장됨" : "Saved on this device"}
                    </span>
                    <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.65rem] font-bold text-fg-3">
                      {modePlan.document.workspace} · {modePlan.document.width} × {modePlan.document.height}
                    </span>
                  </>
                )}
              />

              <DisabledReason id={CREATE_DISABLED_REASON_ID} visible={!titleReady} className="mt-3">
                {locale === "ko"
                  ? "프로젝트 이름을 입력하면 자동 저장되는 작업공간을 시작할 수 있습니다."
                  : "Enter a project name to start an autosaved workspace."}
              </DisabledReason>

              <button
                type="button"
                disabled={creating || !titleReady}
                aria-describedby={!titleReady ? CREATE_DISABLED_REASON_ID : undefined}
                onClick={create}
                className={buttonClass({ variant: "solid", size: "lg", className: "mt-5 min-h-12 w-full gap-2" })}
              >
                {creating ? (locale === "ko" ? "작업공간 만드는 중…" : "Creating workspace…") : startLabel}
                {!creating ? <ArrowRight size={16} aria-hidden="true" /> : null}
              </button>
              <p className="mt-2 text-center text-[0.68rem] leading-5 text-fg-3">
                {locale === "ko"
                  ? "자동 복구 저장과 버전 기록이 즉시 시작됩니다. 저장 위치는 작업 중 언제든 연결할 수 있습니다."
                  : "Recovery autosave and version history start immediately. You can connect another save destination later."}
              </p>
              {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
