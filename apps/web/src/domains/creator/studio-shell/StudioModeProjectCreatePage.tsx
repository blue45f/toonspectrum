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

type Locale = "ko" | "en";

type WebtoonChoiceOption<T extends string> = {
  readonly id: T;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
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

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function projectTitle(option: StudioProjectCreateKindOption, locale: Locale): string {
  return locale === "ko" ? option.titleKo : option.titleEn;
}

function defaultTitle(option: StudioProjectCreateKindOption, locale: Locale): string {
  return locale === "ko" ? option.defaultTitleKo : option.defaultTitleEn;
}

function initialDocumentTitle(kind: StudioProjectKind, projectTitle: string): string {
  if (kind === "webtoon") return "EP01 원고";
  if (kind === "slides") return "발표 자료";
  return `${projectTitle} 작업 문서`;
}

function requestedProjectKind(kind: string | null, templateId: string | null): StudioProjectKind | null {
  const explicit = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind)?.id;
  if (explicit) return explicit;
  if (!templateId) return null;
  return STUDIO_PROJECT_CREATE_KINDS.find((option) =>
    STUDIO_PROJECT_CREATE_TEMPLATES[option.id].some((template) => template.id === templateId)
  )?.id ?? null;
}

function WebtoonOnboardingSelect<T extends string>({
  id,
  label,
  value,
  options,
  locale,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly options: readonly WebtoonChoiceOption<T>[];
  readonly locale: Locale;
  readonly onChange: (value: T) => void;
}) {
  return (
    <label className="min-w-0 text-xs font-bold text-fg-2" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {locale === "ko" ? option.labelKo : option.labelEn}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StudioModeProjectCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
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
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [title, setTitle] = useState(() => defaultTitle(initialKind, locale));
  const [titleEdited, setTitleEdited] = useState(false);
  const [showMoreKinds, setShowMoreKinds] = useState(false);
  const [webtoonOnboardingEnabled, setWebtoonOnboardingEnabled] = useState(Boolean(requestedWebtoonSelection));
  const [webtoonSelection, setWebtoonSelection] = useState<WebtoonOnboardingSelection>(
    requestedWebtoonSelection ?? DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind) ?? initialKind;
  const templates = STUDIO_PROJECT_CREATE_TEMPLATES[kind];
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? templates[0]!;
  const modePlan = useMemo(() => resolveStudioModeCreationPlan(kind, selectedTemplate?.id), [kind, selectedTemplate?.id]);
  const onboardingPlan = useMemo(() => buildWebtoonOnboardingPlan(webtoonSelection), [webtoonSelection]);
  const structuredWebtoonFlow = kind === "webtoon" && webtoonOnboardingEnabled;
  const visibleKinds = useMemo(
    () => STUDIO_PROJECT_CREATE_KINDS.filter((option) => option.featured || showMoreKinds),
    [showMoreKinds],
  );

  function selectKind(option: StudioProjectCreateKindOption) {
    const firstTemplate = STUDIO_PROJECT_CREATE_TEMPLATES[option.id][0];
    setKind(option.id);
    setTemplateId(firstTemplate?.id ?? `${option.id}-blank`);
    if (!titleEdited) setTitle(defaultTitle(option, locale));
    if (option.id !== "webtoon") setWebtoonOnboardingEnabled(false);
    setError(null);
  }

  function create() {
    if (creating || !title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const normalizedTitle = title.trim();
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title: normalizedTitle,
        kind,
        templateId: selectedTemplate.id,
        primaryLocale: locale === "ko" ? "ko-KR" : "en-US",
        document: {
          title: initialDocumentTitle(kind, normalizedTitle),
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

      if (structuredWebtoonFlow) {
        const onboarding = createStudioWebtoonOnboardingProfile(
          result.project.id,
          webtoonSelection,
          result.project.createdAt,
        );
        writeStudioWebtoonOnboardingProfile(window.localStorage, onboarding);
        navigate(webtoonOnboardingProjectHref(result.project.id, webtoonSelection), { replace: true });
        return;
      }

      navigate(buildStudioModeLaunchHref(result, modePlan), { replace: true });
    } catch (cause) {
      setCreating(false);
      setError(cause instanceof Error
        ? cause.message
        : locale === "ko"
          ? "새 작업을 만들지 못했습니다. 저장 공간과 브라우저 설정을 확인해 주세요."
          : "The new work could not be created. Check storage and browser settings.");
    }
  }

  const startLabel = structuredWebtoonFlow
    ? (locale === "ko" ? "프로젝트와 제작 계획 만들기" : "Create project and production plan")
    : `${studioModeLabel(modePlan.profile, locale)} ${locale === "ko" ? "시작" : "Start"}`;

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
                  : "Choose the work type and starting format. Recovery storage begins on this device immediately, while panels, tools, AI recommendations, workflow and delivery targets adapt to the work."}
              </p>
            </div>
            <Link href="/studio/import" className={buttonClass({ variant: "outline", className: "min-h-11" })}>
              {locale === "ko" ? "기존 파일 가져오기" : "Import existing files"}
            </Link>
          </header>

          <section className="mt-7" aria-labelledby="studio-mode-kind-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black text-accent">01</p>
                <h2 id="studio-mode-kind-title" className="mt-1 text-lg font-black text-fg">
                  {locale === "ko" ? "만들 작업" : "What are you making?"}
                </h2>
              </div>
              <span className="hidden text-xs text-fg-3 sm:inline">
                {locale === "ko" ? "선택 즉시 아래 작업공간 미리보기가 바뀝니다" : "The workspace preview updates immediately"}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleKinds.map((option) => {
                const active = option.id === kind;
                const Icon = KIND_ICONS[option.id];
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectKind(option)}
                    className={cn(
                      "min-h-36 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active
                        ? "border-accent bg-accent-soft/50 shadow-sm"
                        : "border-line bg-card hover:border-accent/40 hover:bg-raised",
                    )}
                  >
                    <span className={cn(
                      "grid size-10 place-items-center rounded-xl",
                      active ? "bg-accent text-on-accent" : "bg-panel text-fg-2",
                    )}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <b className="mt-3 block text-sm text-fg">{projectTitle(option, locale)}</b>
                    <span className="mt-1 block text-xs leading-5 text-fg-3">
                      {locale === "ko" ? option.descriptionKo : option.descriptionEn}
                    </span>
                  </button>
                );
              })}
            </div>
            {!showMoreKinds ? (
              <button
                type="button"
                onClick={() => setShowMoreKinds(true)}
                className={buttonClass({ variant: "quiet", size: "sm", className: "mt-2" })}
              >
                {locale === "ko" ? "다른 작업 종류 보기" : "Show more project types"}
              </button>
            ) : null}
          </section>

          <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]" aria-label={locale === "ko" ? "선택한 작업공간과 시작 설정" : "Selected workspace and start settings"}>
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
                          ? "대본·콘티·팀 구성과 연재 주기를 알려주면 첫 제작 계획까지 함께 준비합니다."
                          : "Tell us what you already have, your goal, team and cadence to prepare the first production plan."}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={webtoonOnboardingEnabled}
                      onClick={() => setWebtoonOnboardingEnabled((value) => !value)}
                      className={buttonClass({ variant: webtoonOnboardingEnabled ? "solid" : "outline", size: "sm" })}
                    >
                      {webtoonOnboardingEnabled
                        ? (locale === "ko" ? "제작 계획 사용 중" : "Production plan on")
                        : (locale === "ko" ? "제작 단계 설정하기" : "Configure production")}
                    </button>
                  </div>

                  {webtoonOnboardingEnabled ? (
                    <div className="mt-4">
                      <h3 className="text-base font-black text-fg">
                        {locale === "ko" ? onboardingPlan.titleKo : onboardingPlan.titleEn}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-fg-3">
                        {locale === "ko" ? onboardingPlan.summaryKo : onboardingPlan.summaryEn}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <WebtoonOnboardingSelect<WebtoonStartingPointId>
                          id="studio-webtoon-starting-point"
                          label={locale === "ko" ? "현재 가지고 있는 자료" : "What you already have"}
                          value={webtoonSelection.startingPoint}
                          options={WEBTOON_STARTING_POINTS}
                          locale={locale}
                          onChange={(startingPoint) => setWebtoonSelection((current) => ({ ...current, startingPoint }))}
                        />
                        <WebtoonOnboardingSelect<WebtoonOnboardingGoalId>
                          id="studio-webtoon-goal"
                          label={locale === "ko" ? "이번 프로젝트 목표" : "Project goal"}
                          value={webtoonSelection.goal}
                          options={WEBTOON_ONBOARDING_GOALS}
                          locale={locale}
                          onChange={(goal) => setWebtoonSelection((current) => ({ ...current, goal }))}
                        />
                        <WebtoonOnboardingSelect<WebtoonTeamModelId>
                          id="studio-webtoon-team"
                          label={locale === "ko" ? "제작 인원" : "Team model"}
                          value={webtoonSelection.teamModel}
                          options={WEBTOON_TEAM_MODELS}
                          locale={locale}
                          onChange={(teamModel) => setWebtoonSelection((current) => ({ ...current, teamModel }))}
                        />
                        <WebtoonOnboardingSelect<WebtoonCadenceId>
                          id="studio-webtoon-cadence"
                          label={locale === "ko" ? "제작 주기" : "Cadence"}
                          value={webtoonSelection.cadence}
                          options={WEBTOON_CADENCES}
                          locale={locale}
                          onChange={(cadence) => setWebtoonSelection((current) => ({ ...current, cadence }))}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
              <p className="text-xs font-black text-accent">02</p>
              <h2 className="mt-1 text-lg font-black text-fg">
                {locale === "ko" ? "시작 형식" : "Starting format"}
              </h2>

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
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>

              <label className="mt-4 block text-xs font-bold text-fg-2" htmlFor="studio-mode-template">
                {locale === "ko" ? "시작 템플릿" : "Starting template"}
                <select
                  id="studio-mode-template"
                  value={selectedTemplate.id}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {locale === "ko" ? template.labelKo : template.labelEn}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4 rounded-xl border border-line bg-panel/60 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-fg-2">{locale === "ko" ? "첫 작업공간" : "First workspace"}</span>
                  <span className="font-black text-fg">{modePlan.document.workspace}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-fg-2">{locale === "ko" ? "캔버스" : "Canvas"}</span>
                  <span className="font-black text-fg">{modePlan.document.width} × {modePlan.document.height}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-fg-2">{locale === "ko" ? "시작 도구" : "Start tool"}</span>
                  <span className="font-black text-fg">{modePlan.launch.startTool}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={create}
                disabled={creating || !title.trim()}
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
