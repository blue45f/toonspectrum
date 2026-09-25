import {
  ArrowRight,
  Box,
  BriefcaseBusiness,
  Clapperboard,
  FileImage,
  FileText,
  LayoutTemplate,
  Lightbulb,
  Presentation,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
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

import {
  STUDIO_AUXILIARY_WORKSPACE_OPTIONS,
  STUDIO_PROJECT_COLLABORATION_OPTIONS,
  STUDIO_PROJECT_FORMAT_PROFILES,
  STUDIO_PROJECT_PURPOSE_OPTIONS,
  STUDIO_PROJECT_START_POINT_OPTIONS,
  studioProjectDefinitionFromSelection,
  studioProjectFormatDocumentTitle,
  studioProjectFormatFromLegacy,
  studioProjectFormatProfile,
  studioProjectFormatTemplate,
  type StudioAuxiliaryWorkspaceOption,
  type StudioProjectFormatProfile,
} from "../studio-project-format-catalog";
import type {
  StudioProjectCollaboration,
  StudioProjectFormat,
  StudioProjectPurpose,
  StudioProjectStartPoint,
} from "../studio-project-definition";
import { buildStudioModeLaunchHref, resolveStudioModeCreationPlan } from "../studio-mode-creation-plan";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import type { StudioProjectKind } from "../studio-project-library-store";
import { STUDIO_PROJECT_CREATE_TEMPLATES } from "../save-first/studio-project-create-options";
import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import { StudioModeWorkspacePreview } from "./StudioModeWorkspacePreview";
import { StudioProjectFormatPreview, StudioProjectFormatVisual } from "./StudioProjectFormatPreview";
import { DisabledReason } from "./StudioTaskFlow";

type Choice<T extends string> = {
  readonly id: T;
  readonly labelKo: string;
  readonly labelEn: string;
};

type AuxiliaryKind = StudioAuxiliaryWorkspaceOption["id"];

const AUXILIARY_ICONS: Readonly<Record<AuxiliaryKind, LucideIcon>> = {
  storyboard: Clapperboard,
  image: FileImage,
  "three-d": Box,
  design: LayoutTemplate,
  slides: Presentation,
};

const START_POINT_ICONS: Readonly<Record<StudioProjectStartPoint, LucideIcon>> = {
  idea: Lightbulb,
  script: FileText,
  storyboard: Clapperboard,
  files: Upload,
};

const COLLABORATION_ICONS: Readonly<Record<StudioProjectCollaboration, LucideIcon>> = {
  solo: UserRound,
  team: UsersRound,
  client: BriefcaseBusiness,
};

const CREATE_DISABLED_REASON_ID = "studio-create-disabled-reason";

function requestedFormat(
  format: string | null,
  kind: string | null,
  templateId: string | null,
): StudioProjectFormat {
  const explicit = STUDIO_PROJECT_FORMAT_PROFILES.find((profile) => profile.id === format)?.id;
  return explicit ?? studioProjectFormatFromLegacy(kind, templateId) ?? "vertical-webtoon";
}

function requestedAuxiliary(
  format: string | null,
  kind: string | null,
  templateId: string | null,
): StudioAuxiliaryWorkspaceOption | null {
  if (format || studioProjectFormatFromLegacy(kind, templateId)) return null;
  return STUDIO_AUXILIARY_WORKSPACE_OPTIONS.find((option) => option.id === kind) ?? null;
}

function normalizedRequestedTemplate(
  format: StudioProjectFormat,
  templateId: string | null,
): string | null {
  if (format === "cuttoon" && templateId === "webtoon-four-cut") return "cuttoon-square-4";
  if (format === "page-comic" && templateId === "webtoon-page") return "page-comic-digital-8";
  if (format === "motion-toon" && (templateId === "motion-webtoon" || templateId === "animation-short")) {
    return "motion-toon-vertical";
  }
  return templateId;
}

function projectStartPointFromOnboarding(
  value: WebtoonStartingPointId | undefined,
): StudioProjectStartPoint {
  if (value === "script") return "script";
  if (value === "storyboard") return "storyboard";
  if (value === "finished-art" || value === "serializing") return "files";
  return "idea";
}

function onboardingStartPointFromProject(
  value: StudioProjectStartPoint,
): WebtoonStartingPointId {
  if (value === "script") return "script";
  if (value === "storyboard") return "storyboard";
  if (value === "files") return "finished-art";
  return "idea";
}

function projectPurposeFromOnboarding(
  value: WebtoonOnboardingGoalId | undefined,
): StudioProjectPurpose {
  if (value === "pitch") return "portfolio";
  if (value === "contracted") return "client-work";
  return "serial";
}

function projectCollaborationFromOnboarding(
  value: WebtoonTeamModelId | undefined,
): StudioProjectCollaboration {
  return value && value !== "solo" ? "team" : "solo";
}

function standaloneDocumentTitle(
  kind: StudioProjectKind,
  title: string,
  locale: "ko" | "en",
): string {
  if (kind === "slides") return locale === "ko" ? "발표 자료" : "Presentation";
  if (kind === "storyboard") return locale === "ko" ? "첫 스토리보드" : "First storyboard";
  if (kind === "three-d") return locale === "ko" ? "첫 3D 장면" : "First 3D scene";
  return locale === "ko" ? `${title} 작업 문서` : `${title} working document`;
}

function hrefWithFormat(href: string, format: StudioProjectFormat): string {
  const [pathname = href, rawSearch = ""] = href.split("?", 2);
  const search = new URLSearchParams(rawSearch);
  search.set("format", format);
  return `${pathname}?${search.toString()}`;
}

function OnboardingSelect<T extends string>({
  id,
  label,
  value,
  choices,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly choices: readonly Choice<T>[];
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
  const locale = useI18n((state) => state.lang) === "ko" ? "ko" : "en";
  const requestedTemplateId = searchParams.get("template");
  const requestedSelection = webtoonOnboardingSelectionFromSearchParams(searchParams);
  const initialFormatId = requestedFormat(
    searchParams.get("format"),
    searchParams.get("kind"),
    requestedTemplateId,
  );
  const initialFormat = studioProjectFormatProfile(initialFormatId);
  const initialAuxiliary = requestedAuxiliary(
    searchParams.get("format"),
    searchParams.get("kind"),
    requestedTemplateId,
  );
  const normalizedTemplateId = normalizedRequestedTemplate(initialFormatId, requestedTemplateId);
  const initialMainTemplate = studioProjectFormatTemplate(initialFormat, normalizedTemplateId);
  const initialAuxiliaryTemplate = initialAuxiliary
    ? STUDIO_PROJECT_CREATE_TEMPLATES[initialAuxiliary.id]
      .find((candidate) => candidate.id === requestedTemplateId)?.id ?? initialAuxiliary.templateId
    : null;

  const [formatId, setFormatId] = useState<StudioProjectFormat>(initialFormatId);
  const [auxiliaryKind, setAuxiliaryKind] = useState<AuxiliaryKind | null>(initialAuxiliary?.id ?? null);
  const [templateId, setTemplateId] = useState(initialAuxiliaryTemplate ?? initialMainTemplate.id);
  const [title, setTitle] = useState(() => initialAuxiliary
    ? bt(initialAuxiliary.defaultTitleKo, initialAuxiliary.defaultTitleEn)
    : bt(initialFormat.defaultTitleKo, initialFormat.defaultTitleEn));
  const [titleEdited, setTitleEdited] = useState(false);
  const [startPoint, setStartPoint] = useState<StudioProjectStartPoint>(
    projectStartPointFromOnboarding(requestedSelection?.startingPoint),
  );
  const [purpose, setPurpose] = useState<StudioProjectPurpose>(
    projectPurposeFromOnboarding(requestedSelection?.goal),
  );
  const [collaboration, setCollaboration] = useState<StudioProjectCollaboration>(
    projectCollaborationFromOnboarding(requestedSelection?.teamModel),
  );
  const [onboardingEnabled, setOnboardingEnabled] = useState(Boolean(requestedSelection));
  const [selection, setSelection] = useState<WebtoonOnboardingSelection>(
    requestedSelection ?? DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const format = studioProjectFormatProfile(formatId);
  const auxiliary = STUDIO_AUXILIARY_WORKSPACE_OPTIONS.find((option) => option.id === auxiliaryKind) ?? null;
  const activeKind: StudioProjectKind = auxiliary?.id ?? format.projectKind;
  const mainTemplate = studioProjectFormatTemplate(format, templateId);
  const auxiliaryTemplates = auxiliary ? STUDIO_PROJECT_CREATE_TEMPLATES[auxiliary.id] : [];
  const selectedAuxiliaryTemplate = auxiliaryTemplates.find((candidate) => candidate.id === templateId)
    ?? auxiliaryTemplates[0];
  const selectedTemplateId = auxiliary
    ? selectedAuxiliaryTemplate?.id ?? auxiliary.templateId
    : mainTemplate.id;
  const selectedPageCount = auxiliary ? 1 : mainTemplate.pageCount;
  const modePlan = resolveStudioModeCreationPlan(activeKind, selectedTemplateId);
  const onboardingPlan = useMemo(() => buildWebtoonOnboardingPlan(selection), [selection]);
  const supportsProductionPlan = !auxiliary && format.projectKind === "webtoon";
  const structuredWebtoon = supportsProductionPlan && onboardingEnabled;
  const effectiveStartPoint = structuredWebtoon
    ? projectStartPointFromOnboarding(selection.startingPoint)
    : startPoint;
  const titleReady = title.trim().length > 0;
  const targetTitle = auxiliary
    ? bt(auxiliary.titleKo, auxiliary.titleEn)
    : bt(format.titleKo, format.titleEn);
  const startLabel = effectiveStartPoint === "files" && !auxiliary
    ? bt("프로젝트 만들고 파일 가져오기", "Create project and import files")
    : structuredWebtoon
      ? bt("프로젝트와 제작 계획 만들기", "Create project and production plan")
      : bt(`${targetTitle} 시작`, `Start ${targetTitle}`);

  function chooseFormat(profile: StudioProjectFormatProfile) {
    setAuxiliaryKind(null);
    setFormatId(profile.id);
    setTemplateId(profile.templates[0]!.id);
    if (!titleEdited) setTitle(bt(profile.defaultTitleKo, profile.defaultTitleEn));
    if (profile.projectKind !== "webtoon") setOnboardingEnabled(false);
    setError(null);
  }

  function chooseAuxiliary(option: StudioAuxiliaryWorkspaceOption) {
    setAuxiliaryKind(option.id);
    setTemplateId(option.templateId);
    if (!titleEdited) setTitle(bt(option.defaultTitleKo, option.defaultTitleEn));
    setOnboardingEnabled(false);
    setError(null);
  }

  function chooseStartPoint(next: StudioProjectStartPoint) {
    setStartPoint(next);
    if (supportsProductionPlan) {
      setSelection((current) => ({
        ...current,
        startingPoint: onboardingStartPointFromProject(next),
      }));
    }
  }

  function create() {
    const normalizedTitle = title.trim();
    if (creating || !normalizedTitle) return;
    setCreating(true);
    setError(null);
    try {
      const definition = auxiliary
        ? null
        : studioProjectDefinitionFromSelection(
          format,
          purpose,
          effectiveStartPoint,
          collaboration,
        );
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title: normalizedTitle,
        kind: activeKind,
        templateId: selectedTemplateId,
        primaryLocale: locale,
        definition,
        document: {
          title: auxiliary
            ? standaloneDocumentTitle(activeKind, normalizedTitle, locale)
            : studioProjectFormatDocumentTitle(format.id, normalizedTitle, locale),
          kind: modePlan.document.kind,
          defaultWorkspace: modePlan.document.workspace,
          width: modePlan.document.width,
          height: modePlan.document.height,
          pageCount: selectedPageCount,
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
      if (!auxiliary && effectiveStartPoint === "files") {
        navigate(`/studio/import?projectId=${encodeURIComponent(result.project.id)}&format=${format.id}`, {
          replace: true,
        });
        return;
      }
      if (!auxiliary && effectiveStartPoint === "idea") {
        navigate(`/studio/p/${encodeURIComponent(result.project.id)}/story`, { replace: true });
        return;
      }
      if (!auxiliary && effectiveStartPoint === "script") {
        navigate(`/studio/p/${encodeURIComponent(result.project.id)}/story?view=script`, { replace: true });
        return;
      }
      const launchHref = buildStudioModeLaunchHref(result, modePlan);
      navigate(auxiliary ? launchHref : hrefWithFormat(launchHref, format.id), { replace: true });
    } catch (cause) {
      setCreating(false);
      setError(cause instanceof Error
        ? cause.message
        : bt("새 작업을 만들지 못했습니다.", "The new work could not be created."));
    }
  }

  return (
    <div
      data-route-ready="studio-new"
      data-studio-mode-create="true"
      data-studio-outcome-create="true"
      className="min-h-[calc(100vh-4rem)] bg-bg"
    >
      <Container size="wide" className="py-4 sm:py-7">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black text-accent">
                <Sparkles size={14} aria-hidden="true" />
                {bt("새 프로젝트", "New project")}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {bt("어떤 결과물을 완성하려고 하나요?", "What do you want to finish?")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
                {bt(
                  "결과물 형식을 고르면 작품 구조, 작업실, 검수 기준과 내보내기가 함께 준비됩니다.",
                  "Choose the final outcome and ToonStudio prepares its structure, workspace, checks and exports.",
                )}
              </p>
            </div>
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
              <Upload size={16} aria-hidden="true" />
              {bt("기존 파일 바로 가져오기", "Import an existing file")}
            </Link>
          </header>

          <section className="mt-6 rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="studio-format-title">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-on-accent">1</span>
              <div>
                <h2 id="studio-format-title" className="text-lg font-black text-fg">
                  {bt("완성할 콘텐츠를 선택하세요", "Choose the final outcome")}
                </h2>
                <p className="text-xs text-fg-2">
                  {bt("도구가 아니라 독자와 시청자가 보게 될 형태를 기준으로 선택합니다.", "Choose by what readers or viewers will receive, not by a tool.")}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-studio-format-count={STUDIO_PROJECT_FORMAT_PROFILES.length}>
              {STUDIO_PROJECT_FORMAT_PROFILES.map((profile) => {
                const active = !auxiliary && profile.id === format.id;
                const outputs = locale === "ko" ? profile.outputsKo : profile.outputsEn;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={active}
                    data-studio-create-format={profile.id}
                    onClick={() => chooseFormat(profile)}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active
                        ? "border-accent bg-accent-soft/45"
                        : "border-line bg-panel/45 hover:border-line-strong hover:bg-raised",
                    )}
                  >
                    <StudioProjectFormatVisual profile={profile} active={active} className="h-32" />
                    <strong className="mt-3 block text-sm text-fg">
                      {bt(profile.titleKo, profile.titleEn)}
                    </strong>
                    <span className="mt-1 line-clamp-3 block text-xs leading-5 text-fg-2">
                      {bt(profile.descriptionKo, profile.descriptionEn)}
                    </span>
                    <span className={cn("mt-2 block text-[0.65rem] font-bold", active ? "text-fg" : "text-accent")}>
                      {bt("출력", "Output")} · {outputs.slice(0, 2).join(" · ")}
                    </span>
                  </button>
                );
              })}
            </div>

            <details className="mt-4 rounded-2xl border border-line bg-panel/35" open={Boolean(auxiliary) || undefined} data-studio-auxiliary-workspaces="true">
              <summary className="min-h-12 cursor-pointer content-center px-4 text-sm font-bold text-fg-2">
                {bt("작품 프로젝트가 아닌 단일 작업실로 시작", "Start with a standalone workspace")}
                <span className="ml-2 text-xs font-medium text-fg-2">
                  {bt("스토리보드·이미지 편집·3D·홍보·발표", "Storyboard, image, 3D, promotion or slides")}
                </span>
              </summary>
              <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-5">
                {STUDIO_AUXILIARY_WORKSPACE_OPTIONS.map((option) => {
                  const Icon = AUXILIARY_ICONS[option.id];
                  const active = auxiliary?.id === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      data-studio-auxiliary-kind={option.id}
                      onClick={() => chooseAuxiliary(option)}
                      className={cn(
                        "min-h-24 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                        active ? "border-accent bg-accent-soft/45" : "border-line bg-card hover:bg-raised",
                      )}
                    >
                      <Icon size={18} className={active ? "text-accent" : "text-fg-2"} aria-hidden="true" />
                      <strong className="mt-2 block text-xs text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                      <span className="mt-1 line-clamp-2 block text-[0.68rem] leading-5 text-fg-2">
                        {bt(option.descriptionKo, option.descriptionEn)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </details>
          </section>

          <section className="mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="studio-start-point-title">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-on-accent">2</span>
              <div>
                <h2 id="studio-start-point-title" className="text-lg font-black text-fg">
                  {bt("지금 어떤 재료를 가지고 있나요?", "What do you have right now?")}
                </h2>
                <p className="text-xs text-fg-2">
                  {bt("선택한 위치에서 가장 짧은 제작 경로로 시작합니다.", "Start from the shortest production path for your current material.")}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {STUDIO_PROJECT_START_POINT_OPTIONS.map((option) => {
                const Icon = START_POINT_ICONS[option.id];
                const active = effectiveStartPoint === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    data-studio-start-point={option.id}
                    onClick={() => chooseStartPoint(option.id)}
                    className={cn(
                      "flex min-h-24 items-start gap-3 rounded-2xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active ? "border-accent bg-accent-soft/45" : "border-line bg-panel/45 hover:bg-raised",
                    )}
                  >
                    <span className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl",
                      active ? "bg-accent text-on-accent" : "bg-card text-fg-2",
                    )}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span>
                      <strong className="block text-sm text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                      <span className="mt-1 block text-xs leading-5 text-fg-2">
                        {bt(option.descriptionKo, option.descriptionEn)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="studio-project-details-title">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-on-accent">3</span>
              <div>
                <h2 id="studio-project-details-title" className="text-lg font-black text-fg">
                  {bt("프로젝트 세부 설정", "Project details")}
                </h2>
                <p className="text-xs text-fg-2">
                  {bt("형식마다 필요한 크기와 초기 문서 구조가 다르게 준비됩니다.", "Each format prepares its own size and initial document structure.")}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                {bt("형식·초기 크기", "Format and initial size")}
                <select
                  id="studio-mode-template"
                  aria-label={bt("시작 템플릿", "Starting template")}
                  value={selectedTemplateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
                >
                  {(auxiliary ? auxiliaryTemplates : format.templates).map((option) => (
                    <option key={option.id} value={option.id}>
                      {bt(option.labelKo, option.labelEn)}
                    </option>
                  ))}
                </select>
                {!auxiliary ? (
                  <span className="mt-1.5 block text-[0.68rem] leading-5 text-fg-2">
                    {bt(mainTemplate.detailKo, mainTemplate.detailEn)}
                  </span>
                ) : null}
              </label>
            </div>

            {!auxiliary ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <fieldset>
                  <legend className="text-xs font-bold text-fg-2">{bt("제작 목적", "Production purpose")}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {STUDIO_PROJECT_PURPOSE_OPTIONS.map((option) => {
                      const active = purpose === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setPurpose(option.id)}
                          className={cn(
                            "rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                            active ? "border-accent bg-accent-soft/45" : "border-line bg-panel/45 hover:bg-raised",
                          )}
                        >
                          <strong className="block text-xs text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                          <span className="mt-1 block text-[0.68rem] leading-5 text-fg-2">
                            {bt(option.descriptionKo, option.descriptionEn)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-bold text-fg-2">{bt("작업 방식", "Collaboration")}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {STUDIO_PROJECT_COLLABORATION_OPTIONS.map((option) => {
                      const Icon = COLLABORATION_ICONS[option.id];
                      const active = collaboration === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setCollaboration(option.id)}
                          className={cn(
                            "rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                            active ? "border-accent bg-accent-soft/45" : "border-line bg-panel/45 hover:bg-raised",
                          )}
                        >
                          <Icon size={16} className={active ? "text-accent" : "text-fg-2"} aria-hidden="true" />
                          <strong className="mt-2 block text-xs text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                          <span className="mt-1 line-clamp-2 block text-[0.68rem] leading-5 text-fg-2">
                            {bt(option.descriptionKo, option.descriptionEn)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-panel/60 px-3 py-2.5 text-xs leading-5 text-fg-2">
                {bt(
                  "단일 작업실은 작품 전체 구조 없이 해당 문서와 전문 도구만 준비합니다. 나중에 작품 프로젝트로 이어 만들 수 있습니다.",
                  "A standalone workspace prepares only its document and specialist tools. You can hand it off to a full project later.",
                )}
              </p>
            )}
          </section>

          <section className="mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="studio-prepared-project-title">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-on-accent">4</span>
              <div>
                <h2 id="studio-prepared-project-title" className="text-lg font-black text-fg">
                  {bt("준비되는 프로젝트를 확인하세요", "Review what will be prepared")}
                </h2>
                <p className="text-xs text-fg-2">
                  {bt("선택 결과가 실제 작업 화면과 출력 방식에 어떻게 반영되는지 보여줍니다.", "See how your choice changes the workspace and delivery.")}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {!auxiliary ? <StudioProjectFormatPreview profile={format} locale={locale} /> : null}
              <StudioModeWorkspacePreview profile={modePlan.profile} locale={locale} />
              {!auxiliary ? (
                <div className="rounded-2xl border border-line bg-panel/45 p-4">
                  <p className="text-xs font-black text-fg-2">{bt("연결되는 작업실", "Connected workspaces")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {format.enabledWorkspaces.map((workspace) => (
                      <span key={workspace} className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-bold text-fg-2">
                        {workspace}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-fg-2">
                    {bt(
                      `${selectedPageCount}개 초기 페이지 · ${format.keyToolsKo.join(" · ")}`,
                      `${selectedPageCount} initial page${selectedPageCount === 1 ? "" : "s"} · ${format.keyToolsEn.join(" · ")}`,
                    )}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          {supportsProductionPlan ? (
            <section className="mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5" data-studio-create-optional-settings="true">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-accent">
                    {bt("회차 제작 계획까지 함께 준비", "Prepare the episode production plan")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-fg-2">
                    {bt(
                      "대본·콘티·팀 구성과 연재 주기를 반영해 첫 할 일과 제작 게이트를 만듭니다.",
                      "Use your material, team and cadence to create the first tasks and production gates.",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={onboardingEnabled}
                  onClick={() => setOnboardingEnabled((value) => !value)}
                  className={buttonClass({ variant: onboardingEnabled ? "solid" : "outline", size: "sm" })}
                >
                  {onboardingEnabled
                    ? bt("제작 계획 사용 중", "Production plan on")
                    : bt("제작 계획 추가", "Add production plan")}
                </button>
              </div>

              {onboardingEnabled ? (
                <div className="mt-4 rounded-2xl border border-line bg-panel/35 p-4">
                  <h3 className="text-base font-black text-fg">
                    {bt(onboardingPlan.titleKo, onboardingPlan.titleEn)}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-fg-2">
                    {bt(onboardingPlan.summaryKo, onboardingPlan.summaryEn)}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <OnboardingSelect<WebtoonStartingPointId>
                      id="studio-webtoon-starting-point"
                      label={bt("현재 가지고 있는 자료", "What you already have")}
                      value={selection.startingPoint}
                      choices={WEBTOON_STARTING_POINTS}
                      onChange={(startingPoint) => {
                        setSelection((current) => ({ ...current, startingPoint }));
                        setStartPoint(projectStartPointFromOnboarding(startingPoint));
                      }}
                    />
                    <OnboardingSelect<WebtoonOnboardingGoalId>
                      id="studio-webtoon-goal"
                      label={bt("이번 프로젝트 목표", "Project goal")}
                      value={selection.goal}
                      choices={WEBTOON_ONBOARDING_GOALS}
                      onChange={(goal) => {
                        setSelection((current) => ({ ...current, goal }));
                        setPurpose(projectPurposeFromOnboarding(goal));
                      }}
                    />
                    <OnboardingSelect<WebtoonTeamModelId>
                      id="studio-webtoon-team"
                      label={bt("제작 인원", "Team model")}
                      value={selection.teamModel}
                      choices={WEBTOON_TEAM_MODELS}
                      onChange={(teamModel) => {
                        setSelection((current) => ({ ...current, teamModel }));
                        setCollaboration(projectCollaborationFromOnboarding(teamModel));
                      }}
                    />
                    <OnboardingSelect<WebtoonCadenceId>
                      id="studio-webtoon-cadence"
                      label={bt("제작 주기", "Cadence")}
                      value={selection.cadence}
                      choices={WEBTOON_CADENCES}
                      onChange={(cadence) => setSelection((current) => ({ ...current, cadence }))}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="mt-4 rounded-3xl border border-accent/35 bg-accent-soft/20 p-4 sm:p-5">
            <div className="rounded-xl bg-panel/60 px-3 py-2.5 text-xs leading-5 text-fg-2">
              {bt(
                "작업은 이 기기에 자동 저장됩니다. 팀 공유와 클라우드 백업은 작업 중 언제든 연결할 수 있어요.",
                "Your work is autosaved on this device. Team sharing and cloud backup can be connected later.",
              )}
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
            {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
          </section>
        </div>
      </Container>
    </div>
  );
}
