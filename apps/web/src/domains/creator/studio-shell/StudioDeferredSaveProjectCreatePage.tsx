import {
  Box,
  Clapperboard,
  FileImage,
  Images,
  LayoutTemplate,
  PanelsTopLeft,
  PenTool,
  Presentation,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_PROJECT_CREATE_KINDS,
  STUDIO_PROJECT_CREATE_TEMPLATES,
  type StudioProjectCreateKindOption,
} from "../save-first/studio-project-create-options";
import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import type { StudioProjectKind } from "../studio-project-library-store";

type Locale = "ko" | "en";

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

function requestedProjectKind(kind: string | null, templateId: string | null): StudioProjectKind | null {
  const explicit = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind)?.id;
  if (explicit) return explicit;
  if (!templateId) return null;
  return STUDIO_PROJECT_CREATE_KINDS.find((option) =>
    STUDIO_PROJECT_CREATE_TEMPLATES[option.id].some((template) => template.id === templateId)
  )?.id ?? null;
}

export function StudioDeferredSaveProjectCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const requestedTemplateId = searchParams.get("template");
  const requestedKindId = requestedProjectKind(searchParams.get("kind"), requestedTemplateId);
  const initialKind = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === requestedKindId)
    ?? STUDIO_PROJECT_CREATE_KINDS[0]!;
  const initialTemplateId = STUDIO_PROJECT_CREATE_TEMPLATES[initialKind.id]
    .find((template) => template.id === requestedTemplateId)?.id
    ?? STUDIO_PROJECT_CREATE_TEMPLATES[initialKind.id][0]?.id
    ?? "webtoon-vertical";

  const [kind, setKind] = useState<StudioProjectKind>(initialKind.id);
  const [title, setTitle] = useState(() => defaultTitle(initialKind, locale));
  const [titleEdited, setTitleEdited] = useState(false);
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [showMoreKinds, setShowMoreKinds] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind) ?? initialKind;
  const visibleKinds = useMemo(
    () => STUDIO_PROJECT_CREATE_KINDS.filter((option) => option.featured || showMoreKinds),
    [showMoreKinds],
  );

  const selectKind = (option: StudioProjectCreateKindOption) => {
    setKind(option.id);
    setTemplateId(STUDIO_PROJECT_CREATE_TEMPLATES[option.id][0]?.id ?? `${option.id}-blank`);
    if (!titleEdited) setTitle(defaultTitle(option, locale));
    setError(null);
  };

  const create = () => {
    if (typeof window === "undefined" || creating || !title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title,
        kind,
        templateId,
        primaryLocale: locale === "ko" ? "ko-KR" : "en-US",
      }, window);
      ensureStudioSaveProfile(window.localStorage, result.project.id, {
        provider: "browser",
        autoSave: true,
        createVersions: true,
        target: window,
      });
      navigate(`${result.href}&uiMode=basic&startTool=draw`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : locale === "ko"
          ? "임시 작업을 시작하지 못했습니다."
          : "The temporary work could not be started.");
      setCreating(false);
    }
  };

  const startLabel = locale === "ko"
    ? `${selected.titleKo} 시작`
    : `Start ${selected.titleEn}`;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
                <Sparkles size={14} aria-hidden="true" /> TOONSTUDIO CREATE
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
                {locale === "ko" ? "바로 만들기 시작하세요" : "Start creating right away"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
                {locale === "ko"
                  ? "작업 종류와 시작 형식만 고르면 됩니다. 처음에는 이 기기에 임시 자동저장하고, 다 그린 뒤 저장을 누를 때 파일이나 개인 드라이브를 선택합니다."
                  : "Choose only the work type and starting format. ToonStudio keeps a temporary local autosave first, then asks for a file or personal drive when you explicitly save."}
              </p>
            </div>
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
              {locale === "ko" ? "파일 가져오기" : "Import files"}
            </Link>
          </header>

          <section className="mt-7" aria-labelledby="project-kind-title">
            <h2 id="project-kind-title" className="text-base font-black text-fg">
              {locale === "ko" ? "1. 만들 작업" : "1. Project type"}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                        ? "border-accent bg-accent-soft/40 shadow-sm"
                        : "border-line bg-card hover:border-accent/40 hover:bg-raised",
                    )}
                  >
                    <span className={cn(
                      "grid size-10 place-items-center rounded-xl",
                      active ? "bg-accent text-on-accent" : "bg-panel text-fg-2",
                    )}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <b className="mt-3 block text-base text-fg">{projectTitle(option, locale)}</b>
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

          <section className="mt-7 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-7" aria-labelledby="project-settings-title">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Sparkles size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 id="project-settings-title" className="text-xl font-black text-fg">
                  {locale === "ko" ? "2. 이름과 시작 형식" : "2. Name and starting format"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-fg-3">
                  {locale === "ko"
                    ? "공개 제목·소개·장르·저장 위치는 지금 정하지 않아도 됩니다."
                    : "A public title, synopsis, genre and save destination are not required now."}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-fg-2">
                {locale === "ko" ? "프로젝트 이름" : "Project name"}
                <input
                  value={title}
                  maxLength={120}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setTitle(event.target.value);
                    setTitleEdited(true);
                  }}
                  className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="text-xs font-bold text-fg-2">
                {locale === "ko" ? "시작 템플릿" : "Starting template"}
                <select
                  value={templateId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setTemplateId(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  {STUDIO_PROJECT_CREATE_TEMPLATES[kind].map((option) => (
                    <option key={option.id} value={option.id}>
                      {locale === "ko" ? option.labelKo : option.labelEn}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="mt-5 flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft/15 p-4" aria-label={locale === "ko" ? "임시 자동저장 안내" : "Temporary autosave notice"}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-success">
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-black text-fg">
                {locale === "ko" ? "그리는 동안은 자동으로 임시 저장됩니다" : "Your work is temporarily autosaved while you draw"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-fg-2">
                {locale === "ko"
                  ? "내 작업의 ‘임시 작업’에서 언제든 이어갈 수 있습니다. 저장 버튼을 처음 누르면 파일·Google Drive·Dropbox·OneDrive 중에서 고릅니다."
                  : "Resume it from Temporary work at any time. The first explicit Save lets you choose a file, Google Drive, Dropbox or OneDrive."}
              </p>
            </div>
          </section>

          {error ? (
            <p role="alert" className="mt-5 rounded-xl border border-danger/35 bg-danger-soft/15 px-4 py-3 text-sm font-semibold text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Link href="/studio" className={buttonClass({ variant: "quiet" })}>
              {locale === "ko" ? "내 작업으로" : "Back to My work"}
            </Link>
            <button
              type="button"
              disabled={creating || !title.trim()}
              onClick={create}
              className={buttonClass({ className: "min-w-44" })}
            >
              {creating ? (locale === "ko" ? "준비 중…" : "Preparing…") : startLabel}
            </button>
          </div>
        </div>
      </Container>
    </div>
  );
}
