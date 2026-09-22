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

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
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
import { DisabledReason } from "./StudioTaskFlow";

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
const PRIMARY_CREATE_KIND_IDS = ["webtoon", "illustration", "storyboard"] as const;

function localized(
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

function requestedKind(kind: string | null, templateId: string | null): StudioProjectKind | null {
  const explicit = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind)?.id;
  if (explicit) return explicit;
  if (!templateId) return null;
  return STUDIO_PROJECT_CREATE_KINDS.find((option) =>
    STUDIO_PROJECT_CREATE_TEMPLATES[option.id].some((template) => template.id === templateId)
  )?.id ?? null;
}

function documentTitle(
  kind: StudioProjectKind,
  title: string,
  bt: (ko: string, en: string) => string,
): string {
  if (kind === "webtoon") return bt("EP01 원고", "EP01 manuscript");
  if (kind === "slides") return bt("발표 자료", "Presentation");
  return bt(`${title} 작업 문서`, `${title} working document`);
}

function OnboardingSelect<T extends string>({
  id,
  label,
  value,
  choices,
  locale: _locale,
  onChange,
}: {  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly choices: readonly Choice<T>[];
  readonly locale?: string;
  readonly onChange: (next: T) => void;
}) {
  const bt = useBilingual("StudioModeProjectCreatePage.onboardingSelect");
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
            {bt(choice.labelKo, choice.labelEn)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StudioModeProjectCreatePage() {
  const bt = useBilingual("StudioModeProjectCreatePage");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locale = useI18n((state) => state.lang);
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
  const [title, setTitle] = useState(() => defaultTitle(initialKind, bt));
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
  const modePlan = useMemo(
    () => resolveStudioModeCreationPlan(kind, selectedTemplate.id),
    [kind, selectedTemplate.id],
  );
  const onboardingPlan = useMemo(() => buildWebtoonOnboardingPlan(selection), [selection]);
  const structuredWebtoon = kind === "webtoon" && onboardingEnabled;
  const primaryKinds = useMemo(
    () => STUDIO_PROJECT_CREATE_KINDS.filter((option) =>
      PRIMARY_CREATE_KIND_IDS.includes(option.id as (typeof PRIMARY_CREATE_KIND_IDS)[number])),
    [],
  );
  const additionalKinds = useMemo(
    () => STUDIO_PROJECT_CREATE_KINDS.filter((option) =>
      !PRIMARY_CREATE_KIND_IDS.includes(option.id as (typeof PRIMARY_CREATE_KIND_IDS)[number])),
    [],
  );
  const selectedKind = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind) ?? initialKind;
  const selectedKindIsPrimary = primaryKinds.some((option) => option.id === kind);
  const titleReady = title.trim().length > 0;
  const modeName = bt(studioModeLabel(modePlan.profile, "ko"), studioModeLabel(modePlan.profile, "en"));
  function chooseKind(option: StudioProjectCreateKindOption) {
    setKind(option.id);
    setTemplateId(STUDIO_PROJECT_CREATE_TEMPLATES[option.id][0]?.id ?? `${option.id}-blank`);
    if (!titleEdited) setTitle(defaultTitle(option, bt));
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
        primaryLocale: locale,
        document: {
          title: documentTitle(kind, normalizedTitle, bt),
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
        : bt("새 작업을 만들지 못했습니다.", "The new work could not be created."));
    }
  }

  const startLabel = structuredWebtoon
    ? (bt("프로젝트와 제작 계획 만들기", "Create project and production plan"))
    : bt(`${modeName} 시작`, `Start ${modeName}`);

  return (
    <div
      data-route-ready="studio-new"
      data-studio-mode-create="true"
      data-studio-simple-create="true"
      className="min-h-[calc(100vh-4rem)] bg-bg"
    >
      <Container size="wide" className="py-4 sm:py-6">
        <div className="mx-auto max-w-4xl">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black text-accent">
                <Sparkles size={14} aria-hidden="true" />
                {bt("새 프로젝트", "New project")}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {bt("세 가지만 정하면 바로 시작할 수 있어요.", "Choose three things and start creating.")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">
                {bt("만들 종류, 이름, 크기를 고르면 자동 저장되는 작업공간을 엽니다.", "Choose a project type, name and size. ToonStudio opens an autosaved workspace.")}
              </p>
            </div>
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
              {bt("기존 파일로 시작", "Start from a file")}
            </Link>
          </header>

          <section
            className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5"
            aria-labelledby="studio-mode-kind-title"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-on-accent">1</span>
              <div>
                <h2 id="studio-mode-kind-title" className="text-lg font-black text-fg">
                  {bt("무엇을 만들까요?", "What are you making?")}
                </h2>
                <p className="text-xs text-fg-3">
                  {bt("가장 많이 쓰는 세 가지부터 보여드려요.", "Start with the three most common choices.")}
                </p>
              </div>
            </div>

            <label className="mt-4 block text-xs font-bold text-fg-2 sm:hidden">
              {bt("만들 작업 선택", "Choose work type")}
              <select
                value={kind}
                aria-label={bt("만들 작업 선택", "Choose work type")}
                onChange={(event) => {
                  const option = STUDIO_PROJECT_CREATE_KINDS.find(
                    (item) => item.id === event.target.value,
                  );
                  if (option) chooseKind(option);
                }}
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-base text-fg outline-none focus:border-accent"
              >
                {STUDIO_PROJECT_CREATE_KINDS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {localized(option, bt)}
                  </option>
                ))}
              </select>
            </label>

            <div
              className="mt-4 hidden gap-2 sm:grid sm:grid-cols-3"
              data-studio-primary-kind-count={primaryKinds.length}
            >
              {primaryKinds.map((option) => {
                const active = option.id === kind;
                const Icon = KIND_ICONS[option.id];
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    data-studio-primary-create-kind={option.id}
                    onClick={() => chooseKind(option)}
                    className={cn(
                      "min-h-32 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active ? "border-accent bg-accent-soft/60" : "border-line bg-panel/55 hover:border-line-strong hover:bg-raised",
                    )}
                  >
                    <span className={cn(
                      "grid size-9 place-items-center rounded-xl",
                      active ? "bg-accent text-on-accent" : "bg-card text-fg-2",
                    )}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <b className="mt-3 block text-sm text-fg">{localized(option, bt)}</b>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-fg-3">
                      {bt(option.descriptionKo, option.descriptionEn)}
                    </span>
                  </button>
                );
              })}
            </div>

            {!selectedKindIsPrimary && !showMoreKinds ? (
              <div
                className="mt-3 flex items-center gap-3 rounded-xl border border-accent/45 bg-accent-soft/35 p-3"
                data-studio-selected-additional-kind={selectedKind.id}
              >
                {(() => {
                  const SelectedIcon = KIND_ICONS[selectedKind.id];
                  return <SelectedIcon size={18} className="shrink-0 text-accent" aria-hidden="true" />;
                })()}
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-fg">{localized(selectedKind, bt)}</strong>
                  <span className="block truncate text-xs text-fg-3">
                    {bt(selectedKind.descriptionKo, selectedKind.descriptionEn)}
                  </span>
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowMoreKinds((value) => !value)}
              className={buttonClass({ variant: "quiet", size: "sm", className: "mt-3 hidden sm:inline-flex" })}
            >
              {showMoreKinds
                ? bt("다른 작업 종류 접기", "Hide other project types")
                : bt("다른 작업 종류 보기", "Show more project types")}
            </button>

            {showMoreKinds ? (
              <div className="mt-3 hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
                {additionalKinds.map((option) => {
                  const active = option.id === kind;
                  const Icon = KIND_ICONS[option.id];
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      data-studio-additional-create-kind={option.id}
                      onClick={() => chooseKind(option)}
                      className={cn(
                        "flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                        active ? "border-accent bg-accent-soft/60" : "border-line bg-panel/55 hover:bg-raised",
                      )}
                    >
                      <span className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl",
                        active ? "bg-accent text-on-accent" : "bg-card text-fg-2",
                      )}>
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <strong className="block text-sm text-fg">{localized(option, bt)}</strong>
                        <span className="mt-0.5 line-clamp-1 block text-xs text-fg-3">
                          {bt(option.descriptionKo, option.descriptionEn)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-on-accent">2</span>
              <div>
                <h2 className="text-lg font-black text-fg">{bt("이름과 크기", "Name and size")}</h2>
                <p className="text-xs text-fg-3">
                  {bt("나중에 프로젝트 설정에서 바꿀 수 있어요.", "You can change these later in project settings.")}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-fg-2" htmlFor="studio-mode-project-title">
                {bt("프로젝트 이름", "Project name")}
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
              <label className="block text-xs font-bold text-fg-2" htmlFor="studio-mode-template">
                {bt("시작 템플릿·크기", "Starting template and size")}
                <select
                  id="studio-mode-template"
                  aria-label={bt("시작 템플릿", "Starting template")}
                  value={selectedTemplate.id}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {bt(template.labelKo, template.labelEn)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-xl bg-panel/60 px-3 py-2.5 text-xs leading-5 text-fg-2">
              {bt("작업은 이 기기에 자동 저장됩니다. 팀 공유와 클라우드 백업은 작업 중 언제든 연결할 수 있어요.", "Your work is autosaved on this device. Team sharing and cloud backup can be connected later.")}
            </div>
            <DisabledReason id={CREATE_DISABLED_REASON_ID} visible={!titleReady} className="mt-3">
              {bt("프로젝트 이름을 입력해 주세요.", "Enter a project name.")}
            </DisabledReason>
            <button
              type="button"
              disabled={creating || !titleReady}
              aria-describedby={!titleReady ? CREATE_DISABLED_REASON_ID : undefined}
              onClick={create}
              className={buttonClass({ variant: "solid", size: "lg", className: "mt-4 min-h-12 w-full gap-2" })}
            >
              {creating ? bt("프로젝트 만드는 중…", "Creating project…") : startLabel}
              {!creating ? <ArrowRight size={16} aria-hidden="true" /> : null}
            </button>
            <p className="mt-2 text-center text-[0.68rem] leading-5 text-fg-3">
              {bt("그리는 동안 이 기기에 자동 저장됩니다. 저장 위치는 작업 중 언제든 연결할 수 있습니다.", "Your work is autosaved on this device while you draw. You can connect another save destination later.")}
            </p>
            {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
          </section>
          <details
            className="mt-4 rounded-2xl border border-line bg-card p-4"
            open={structuredWebtoon || undefined}
            data-studio-create-optional-settings="true"
          >
            <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-fg">
              {bt("추가 설정", "Optional setup")}
            </summary>

            <div className="min-w-0 space-y-4 pt-3">
              <details className="rounded-xl border border-line bg-panel/40">
                <summary className="min-h-11 cursor-pointer content-center px-3 text-sm font-semibold text-fg-2">
                  {bt("준비되는 작업 화면 보기", "Preview the prepared workspace")}
                </summary>
                <div className="border-t border-line p-3">
                  <StudioModeWorkspacePreview
                    profile={modePlan.profile}
                    locale={locale === "ko" ? "ko" : "en"}
                  />
                </div>
              </details>

              {kind === "webtoon" ? (
                <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-accent">
                        {bt("실제 제작 단계에 맞춰 시작", "Start from your real production stage")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-fg-3">
                        {bt("대본·콘티·팀 구성과 연재 주기를 알려주면 첫 제작 계획까지 준비합니다.", "Use your current material, goal, team and cadence to prepare the first production plan.")}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={onboardingEnabled}
                      onClick={() => setOnboardingEnabled((value) => !value)}
                      className={buttonClass({ variant: onboardingEnabled ? "solid" : "outline", size: "sm" })}
                    >
                      {onboardingEnabled
                        ? (bt("제작 계획 사용 중", "Production plan on"))
                        : (bt("제작 단계 설정하기", "Configure production"))}
                    </button>
                  </div>

                  {onboardingEnabled ? (
                    <div className="mt-4">
                      <h3 className="text-base font-black text-fg">
                        {bt(onboardingPlan.titleKo, onboardingPlan.titleEn)}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-fg-3">
                        {bt(onboardingPlan.summaryKo, onboardingPlan.summaryEn)}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <OnboardingSelect<WebtoonStartingPointId>
                          id="studio-webtoon-starting-point"
                          label={bt("현재 가지고 있는 자료", "What you already have")}
                          value={selection.startingPoint}
                          choices={WEBTOON_STARTING_POINTS}
                          locale={locale}
                          onChange={(startingPoint) => setSelection((current) => ({ ...current, startingPoint }))}
                        />
                        <OnboardingSelect<WebtoonOnboardingGoalId>
                          id="studio-webtoon-goal"
                          label={bt("이번 프로젝트 목표", "Project goal")}
                          value={selection.goal}
                          choices={WEBTOON_ONBOARDING_GOALS}
                          locale={locale}
                          onChange={(goal) => setSelection((current) => ({ ...current, goal }))}
                        />
                        <OnboardingSelect<WebtoonTeamModelId>
                          id="studio-webtoon-team"
                          label={bt("제작 인원", "Team model")}
                          value={selection.teamModel}
                          choices={WEBTOON_TEAM_MODELS}
                          locale={locale}
                          onChange={(teamModel) => setSelection((current) => ({ ...current, teamModel }))}
                        />
                        <OnboardingSelect<WebtoonCadenceId>
                          id="studio-webtoon-cadence"
                          label={bt("제작 주기", "Cadence")}
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

          </details>
        </div>
      </Container>
    </div>
  );
}
