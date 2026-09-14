import {
  Box,
  Clapperboard,
  Cloud,
  FileArchive,
  FileImage,
  HardDrive,
  Images,
  LayoutTemplate,
  LockKeyhole,
  PanelsTopLeft,
  PenTool,
  Presentation,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import type { StudioProjectKind } from "../studio-project-library-store";
import {
  STUDIO_PROJECT_CREATE_KINDS,
  STUDIO_PROJECT_CREATE_STORAGE,
  STUDIO_PROJECT_CREATE_TEMPLATES,
  type StudioProjectCreateKindOption,
} from "../save-first/studio-project-create-options";
import {
  ensureStudioSaveProfile,
  markStudioStorageBindingSynced,
  recordStudioManualSave,
  type StudioStorageProvider,
} from "../save-first/studio-save-profile";
import {
  buildStudioProjectPackage,
  saveStudioProjectPackage,
} from "../save-first/studio-project-package";
import { StudioQuickStart } from "./StudioQuickStart";

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

const STORAGE_ICONS: Partial<Record<StudioStorageProvider, LucideIcon>> = {
  browser: HardDrive,
  "local-file": FileArchive,
  "toonstudio-cloud": Cloud,
  "google-drive": Cloud,
  dropbox: Cloud,
  onedrive: Cloud,
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

function SectionHeading({
  icon: Icon,
  step,
  title,
  detail,
}: {
  readonly icon: LucideIcon;
  readonly step: number;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-xl font-black text-fg">{step}. {title}</h2>
        <p className="mt-1 text-xs leading-5 text-fg-3">{detail}</p>
      </div>
    </div>
  );
}

export function StudioSaveFirstProjectCreatePage() {
  const navigate = useNavigate();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const initialKind = STUDIO_PROJECT_CREATE_KINDS[0]!;
  const [kind, setKind] = useState<StudioProjectKind>(initialKind.id);
  const [title, setTitle] = useState(() => defaultTitle(initialKind, locale));
  const [titleEdited, setTitleEdited] = useState(false);
  const [templateId, setTemplateId] = useState(
    STUDIO_PROJECT_CREATE_TEMPLATES[initialKind.id][0]?.id ?? "webtoon-vertical",
  );
  const [storageProvider, setStorageProvider] = useState<StudioStorageProvider>("browser");
  const [autoSave, setAutoSave] = useState(true);
  const [createVersions, setCreateVersions] = useState(true);
  const [showMoreKinds, setShowMoreKinds] = useState(false);
  const [showMoreStorage, setShowMoreStorage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = STUDIO_PROJECT_CREATE_KINDS.find((option) => option.id === kind) ?? initialKind;
  const visibleKinds = useMemo(
    () => STUDIO_PROJECT_CREATE_KINDS.filter((option) => option.featured || showMoreKinds),
    [showMoreKinds],
  );
  const visibleStorage = useMemo(
    () => STUDIO_PROJECT_CREATE_STORAGE.filter((_, index) => index < 3 || showMoreStorage),
    [showMoreStorage],
  );

  const selectKind = (option: StudioProjectCreateKindOption) => {
    setKind(option.id);
    setTemplateId(STUDIO_PROJECT_CREATE_TEMPLATES[option.id][0]?.id ?? `${option.id}-blank`);
    if (!titleEdited) setTitle(defaultTitle(option, locale));
    setError(null);
  };

  const create = async () => {
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
      const profile = ensureStudioSaveProfile(window.localStorage, result.project.id, {
        provider: storageProvider,
        autoSave,
        createVersions,
        target: window,
      });

      if (storageProvider === "local-file") {
        try {
          const packageResult = buildStudioProjectPackage({
            project: result.project,
            documents: [result.document],
            profile,
          });
          await saveStudioProjectPackage(packageResult, window);
          markStudioStorageBindingSynced(
            window.localStorage,
            result.project.id,
            "local-file:canonical",
            { remotePath: packageResult.fileName, revision: profile.revision + 1 },
            { target: window },
          );
          recordStudioManualSave(window.localStorage, result.project.id, { target: window });
        } catch (cause) {
          if (!(cause instanceof DOMException && cause.name === "AbortError")) {
            console.warn("Initial ToonStudio package save failed; the browser copy remains available.", cause);
          }
        }
      }

      navigate(`${result.href}&uiMode=basic&startTool=draw`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : locale === "ko"
          ? "비공개 작업을 만들지 못했습니다."
          : "The private project could not be created.");
      setCreating(false);
    }
  };

  const startLabel = locale === "ko"
    ? `${selected.titleKo} 시작`
    : `Start ${selected.titleEn}`;

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
                <LockKeyhole size={14} aria-hidden="true" /> TOONSTUDIO PRIVATE WORK
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
                {locale === "ko" ? "먼저 안전하게 저장할 작업을 만드세요" : "Create work that is saved safely first"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
                {locale === "ko"
                  ? "모든 새 작업은 나만 보기로 시작합니다. 저장 위치와 자동 저장만 정하면 되고 공개 정보는 게시할 때만 입력합니다."
                  : "Every project starts owner-only. Choose storage and autosave now; public metadata is requested only when publishing."}
              </p>
            </div>
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
              {locale === "ko" ? "기존 작품 가져오기" : "Import existing work"}
            </Link>
          </div>

          <StudioQuickStart locale={locale} />

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
                      active ? "border-accent bg-accent-soft/40 shadow-sm" : "border-line bg-card hover:border-accent/40 hover:bg-raised",
                    )}
                  >
                    <span className={cn("grid size-10 place-items-center rounded-xl", active ? "bg-accent text-on-accent" : "bg-panel text-fg-2")}>
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
              <button type="button" onClick={() => setShowMoreKinds(true)} className={buttonClass({ variant: "quiet", size: "sm", className: "mt-2" })}>
                {locale === "ko" ? "3D·애니메이션도 보기" : "Show 3D and animation"}
              </button>
            ) : null}
          </section>

          <section className="mt-7 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-7" aria-labelledby="project-settings-title">
            <SectionHeading
              icon={Sparkles}
              step={2}
              title={locale === "ko" ? "작업 이름과 시작 형식" : "Name and starting format"}
              detail={locale === "ko" ? "공개 제목·소개·장르·연령 등급은 지금 필요하지 않습니다." : "A public title, synopsis, genre and rating are not required now."}
            />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-fg-2">
                {locale === "ko" ? "프로젝트 이름" : "Project name"}
                <input
                  value={title}
                  maxLength={120}
                  onChange={(event) => {
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
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  {STUDIO_PROJECT_CREATE_TEMPLATES[kind].map((option) => (
                    <option key={option.id} value={option.id}>{locale === "ko" ? option.labelKo : option.labelEn}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="mt-7" aria-labelledby="storage-title">
            <SectionHeading
              icon={ShieldCheck}
              step={3}
              title={locale === "ko" ? "저장 위치" : "Save location"}
              detail={locale === "ko" ? "어느 위치를 골라도 공개되지 않으며, 원격 저장소는 인증과 첫 동기화 전까지 백업 완료로 표시하지 않습니다." : "No choice publishes the project. Remote storage is not marked backed up until authentication and first sync complete."}
            />
            <div role="radiogroup" aria-labelledby="storage-title" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleStorage.map((option) => {
                const active = storageProvider === option.id;
                const Icon = STORAGE_ICONS[option.id] ?? Cloud;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStorageProvider(option.id)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active ? "border-accent bg-accent-soft/35" : "border-line bg-card hover:border-accent/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className={cn("grid size-10 place-items-center rounded-xl", active ? "bg-accent text-on-accent" : "bg-panel text-fg-2")}>
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="rounded-full bg-panel px-2 py-1 text-[0.62rem] font-black text-fg-3">
                        {locale === "ko" ? option.badgeKo : option.badgeEn}
                      </span>
                    </div>
                    <b className="mt-3 block text-sm text-fg">{locale === "ko" ? option.titleKo : option.titleEn}</b>
                    <span className="mt-1 block text-xs leading-5 text-fg-3">{locale === "ko" ? option.descriptionKo : option.descriptionEn}</span>
                  </button>
                );
              })}
            </div>
            {!showMoreStorage ? (
              <button type="button" onClick={() => setShowMoreStorage(true)} className={buttonClass({ variant: "quiet", size: "sm", className: "mt-2" })}>
                {locale === "ko" ? "다른 원격 저장소 보기" : "Show more remote storage"}
              </button>
            ) : null}
          </section>

          <section className="mt-7 rounded-2xl border border-line bg-card p-5" aria-labelledby="save-behavior-title">
            <h2 id="save-behavior-title" className="text-base font-black text-fg">
              {locale === "ko" ? "4. 저장 방식" : "4. Save behavior"}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel/45 p-3">
                <input type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} className="mt-1 size-4" />
                <span><b className="block text-sm text-fg">{locale === "ko" ? "작업 중 자동 저장" : "Autosave while working"}</b><small className="mt-1 block leading-5 text-fg-3">{locale === "ko" ? "편집 내용을 브라우저 작업 사본에 계속 보존합니다." : "Continuously preserve edits in the browser working copy."}</small></span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel/45 p-3">
                <input type="checkbox" checked={createVersions} onChange={(event) => setCreateVersions(event.target.checked)} className="mt-1 size-4" />
                <span><b className="block text-sm text-fg">{locale === "ko" ? "중요한 변경 시 버전 생성" : "Create versions for important changes"}</b><small className="mt-1 block leading-5 text-fg-3">{locale === "ko" ? "내보내기·제출·게시 전 복구 지점을 남깁니다." : "Keep recovery points before export, submission and publishing."}</small></span>
              </label>
            </div>
          </section>

          {error ? <p role="alert" className="mt-5 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm font-semibold text-danger">{error}</p> : null}

          <div className="mt-7 flex flex-col gap-3 rounded-3xl border border-accent/30 bg-accent-soft/20 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-black text-fg"><LockKeyhole size={16} aria-hidden="true" />{locale === "ko" ? "나만 보기 · 미게시로 생성" : "Created owner-only and unpublished"}</p>
              <p className="mt-1 text-xs leading-5 text-fg-3">
                {storageProvider === "browser"
                  ? locale === "ko" ? "생성 후 저장소 화면에서 파일 또는 원격 백업을 추가할 수 있습니다." : "Add a file or remote backup from Storage after creation."
                  : storageProvider === "local-file"
                    ? locale === "ko" ? "작업을 만든 뒤 .toonstudio 파일 저장 위치를 바로 선택합니다." : "Choose the .toonstudio file location immediately after creation."
                    : locale === "ko" ? "생성 후 선택한 저장소 인증과 첫 동기화를 진행합니다." : "Authenticate and complete the first sync after creation."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void create(); }}
              disabled={creating || !title.trim()}
              className={buttonClass({ size: "lg", className: "min-w-40 gap-2" })}
            >
              {creating ? (locale === "ko" ? "저장 준비 중…" : "Preparing save…") : startLabel}
            </button>
          </div>
        </div>
      </Container>
    </main>
  );
}
