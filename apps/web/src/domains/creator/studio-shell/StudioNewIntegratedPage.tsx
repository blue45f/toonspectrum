import {
  Box,
  Clapperboard,
  FileImage,
  Images,
  LayoutTemplate,
  PanelsTopLeft,
  PenTool,
  Presentation,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  ensureInitialStudioProjectDocument,
  studioProjectDocumentHref,
} from "../studio-project-document-store";
import {
  createStudioProject,
  markStudioProjectOpened,
  permanentlyDeleteStudioProject,
  trashStudioProject,
  type StudioProjectKind,
} from "../studio-project-library-store";

type Locale = "ko" | "en";

interface ProjectKindOption {
  readonly id: StudioProjectKind;
  readonly icon: typeof PenTool;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly defaultTitleKo: string;
  readonly defaultTitleEn: string;
  readonly featured: boolean;
}

const PROJECT_KIND_OPTIONS: readonly ProjectKindOption[] = Object.freeze([
  {
    id: "webtoon",
    icon: PanelsTopLeft,
    titleKo: "웹툰",
    titleEn: "Webtoon",
    descriptionKo: "세로 원고, 컷, 말풍선과 모바일 미리보기를 함께 시작합니다.",
    descriptionEn: "Start with a vertical manuscript, panels, balloons and mobile preview.",
    defaultTitleKo: "새 웹툰",
    defaultTitleEn: "New webtoon",
    featured: true,
  },
  {
    id: "illustration",
    icon: PenTool,
    titleKo: "일러스트",
    titleEn: "Illustration",
    descriptionKo: "레이어와 전문 브러시가 준비된 빈 그림 문서를 만듭니다.",
    descriptionEn: "Create a blank art document with layers and professional brushes.",
    defaultTitleKo: "새 일러스트",
    defaultTitleEn: "New illustration",
    featured: true,
  },
  {
    id: "design",
    icon: LayoutTemplate,
    titleKo: "표지·홍보 디자인",
    titleEn: "Cover and promotion",
    descriptionKo: "표지, 썸네일과 SNS 홍보물을 템플릿 기반으로 만듭니다.",
    descriptionEn: "Create covers, thumbnails and social promotion from templates.",
    defaultTitleKo: "새 디자인",
    defaultTitleEn: "New design",
    featured: true,
  },
  {
    id: "slides",
    icon: Presentation,
    titleKo: "발표 자료",
    titleEn: "Presentation",
    descriptionKo: "작품 피칭과 제작 공유용 슬라이드를 구조적으로 시작합니다.",
    descriptionEn: "Start structured slides for pitching and production sharing.",
    defaultTitleKo: "새 발표 자료",
    defaultTitleEn: "New presentation",
    featured: true,
  },
  {
    id: "storyboard",
    icon: Clapperboard,
    titleKo: "스토리보드",
    titleEn: "Storyboard",
    descriptionKo: "대본, 장면, 샷과 애니매틱 타이밍을 연결합니다.",
    descriptionEn: "Connect script, scenes, shots and animatic timing.",
    defaultTitleKo: "새 스토리보드",
    defaultTitleEn: "New storyboard",
    featured: true,
  },
  {
    id: "image",
    icon: FileImage,
    titleKo: "이미지 편집",
    titleEn: "Image editing",
    descriptionKo: "사진 보정, 합성, 배경 제거와 비파괴 편집을 시작합니다.",
    descriptionEn: "Start retouching, compositing, background removal and non-destructive editing.",
    defaultTitleKo: "새 이미지 작업",
    defaultTitleEn: "New image project",
    featured: true,
  },
  {
    id: "three-d",
    icon: Box,
    titleKo: "3D 장면",
    titleEn: "3D scene",
    descriptionKo: "웹툰 배경·포즈·카메라와 분리 렌더를 준비합니다.",
    descriptionEn: "Prepare webtoon backgrounds, poses, cameras and layered render passes.",
    defaultTitleKo: "새 3D 장면",
    defaultTitleEn: "New 3D scene",
    featured: false,
  },
  {
    id: "animation",
    icon: Images,
    titleKo: "애니메이션·모션",
    titleEn: "Animation and motion",
    descriptionKo: "장면, 음성, 자막과 타임라인을 한 프로젝트에서 관리합니다.",
    descriptionEn: "Manage scenes, voice, captions and timeline in one project.",
    defaultTitleKo: "새 모션 프로젝트",
    defaultTitleEn: "New motion project",
    featured: false,
  },
]);

const TEMPLATE_OPTIONS: Readonly<Record<StudioProjectKind, readonly Readonly<{
  id: string;
  labelKo: string;
  labelEn: string;
}>[]>> = Object.freeze({
  webtoon: Object.freeze([
    { id: "webtoon-vertical", labelKo: "세로 웹툰", labelEn: "Vertical webtoon" },
    { id: "webtoon-four-cut", labelKo: "4컷·컷툰", labelEn: "Four-panel comic" },
    { id: "webtoon-page", labelKo: "페이지 만화", labelEn: "Page comic" },
  ]),
  illustration: Object.freeze([
    { id: "illustration-portrait", labelKo: "인물 일러스트", labelEn: "Character illustration" },
    { id: "illustration-landscape", labelKo: "배경 일러스트", labelEn: "Environment illustration" },
  ]),
  image: Object.freeze([
    { id: "image-edit", labelKo: "빈 이미지 편집", labelEn: "Blank image edit" },
    { id: "image-composite", labelKo: "합성 작업", labelEn: "Composite" },
  ]),
  design: Object.freeze([
    { id: "design-cover", labelKo: "작품 표지", labelEn: "Series cover" },
    { id: "design-social", labelKo: "SNS 홍보", labelEn: "Social promotion" },
    { id: "design-thumbnail", labelKo: "연재 썸네일", labelEn: "Episode thumbnail" },
  ]),
  slides: Object.freeze([
    { id: "slides-pitch", labelKo: "작품 피칭", labelEn: "Series pitch" },
    { id: "slides-production", labelKo: "제작 공유", labelEn: "Production review" },
  ]),
  storyboard: Object.freeze([
    { id: "storyboard-webtoon", labelKo: "웹툰 콘티", labelEn: "Webtoon storyboard" },
    { id: "storyboard-video", labelKo: "영상 콘티", labelEn: "Video storyboard" },
  ]),
  "three-d": Object.freeze([
    { id: "3d-background", labelKo: "웹툰 배경", labelEn: "Webtoon background" },
    { id: "3d-pose", labelKo: "캐릭터 포즈", labelEn: "Character pose" },
  ]),
  animation: Object.freeze([
    { id: "motion-webtoon", labelKo: "모션 웹툰", labelEn: "Motion webtoon" },
    { id: "animation-short", labelKo: "세로 쇼츠", labelEn: "Vertical short" },
  ]),
});

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function label(option: ProjectKindOption, locale: Locale): string {
  return locale === "ko" ? option.titleKo : option.titleEn;
}

function defaultTitle(option: ProjectKindOption, locale: Locale): string {
  return locale === "ko" ? option.defaultTitleKo : option.defaultTitleEn;
}

export function StudioNewIntegratedPage() {
  const navigate = useNavigate();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const [kind, setKind] = useState<StudioProjectKind>("webtoon");
  const selected = PROJECT_KIND_OPTIONS.find((option) => option.id === kind) ?? PROJECT_KIND_OPTIONS[0]!;
  const [title, setTitle] = useState(() => defaultTitle(selected, locale));
  const [titleEdited, setTitleEdited] = useState(false);
  const [templateId, setTemplateId] = useState(() => TEMPLATE_OPTIONS.webtoon[0]?.id ?? "webtoon-vertical");
  const [description, setDescription] = useState("");
  const [primaryLocale, setPrimaryLocale] = useState(locale === "ko" ? "ko-KR" : "en-US");
  const [showMore, setShowMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleKinds = useMemo(
    () => PROJECT_KIND_OPTIONS.filter((option) => option.featured || showMore),
    [showMore],
  );
  const templates = TEMPLATE_OPTIONS[kind];

  const selectKind = (next: ProjectKindOption) => {
    setKind(next.id);
    setTemplateId(TEMPLATE_OPTIONS[next.id][0]?.id ?? `${next.id}-blank`);
    if (!titleEdited) setTitle(defaultTitle(next, locale));
    setError(null);
  };

  const create = () => {
    if (typeof window === "undefined" || creating) return;
    setCreating(true);
    setError(null);
    let projectId: string | null = null;
    try {
      const createdAt = new Date().toISOString();
      const project = createStudioProject(window.localStorage, {
        title,
        kind,
        templateId,
        description,
        primaryLocale,
        createdAt,
      }, { target: window });
      projectId = project.id;
      const document = ensureInitialStudioProjectDocument(window.localStorage, {
        projectId: project.id,
        projectTitle: project.title,
        projectKind: project.kind,
        createdAt,
        target: window,
      });
      markStudioProjectOpened(
        window.localStorage,
        project.id,
        document.id,
        { at: createdAt, target: window },
      );
      navigate(studioProjectDocumentHref(document), { replace: true });
    } catch (cause) {
      if (projectId) {
        try {
          trashStudioProject(window.localStorage, projectId, { target: window });
          permanentlyDeleteStudioProject(window.localStorage, projectId, { target: window });
        } catch {
          // Keep the recoverable project entry when rollback is not possible.
        }
      }
      setError(cause instanceof Error
        ? cause.message
        : locale === "ko"
          ? "프로젝트를 만들지 못했습니다."
          : "The project could not be created.");
      setCreating(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
                <Sparkles size={14} aria-hidden="true" /> TOONSTUDIO CREATE
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
                {locale === "ko" ? "무엇을 만들까요?" : "What are you making?"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2 sm:text-base">
                {locale === "ko"
                  ? "종류와 이름만 고르면 권장 문서와 작업공간을 자동으로 준비합니다. 크기와 세부 구조는 나중에 바꿀 수 있습니다."
                  : "Choose a type and name. ToonStudio prepares the recommended document and workspace; dimensions and structure remain editable."}
              </p>
            </div>
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
              {locale === "ko" ? "파일 가져오기" : "Import a file"}
            </Link>
          </div>

          <section className="mt-7" aria-labelledby="project-kind-title">
            <h2 id="project-kind-title" className="text-sm font-black text-fg">
              {locale === "ko" ? "만들 작업" : "Project type"}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleKinds.map((option) => {
                const active = option.id === kind;
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectKind(option)}
                    className={cn(
                      "min-h-36 rounded-2xl border p-4 text-left transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
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
                    <b className="mt-3 block text-base text-fg">{label(option, locale)}</b>
                    <span className="mt-1 block text-xs leading-5 text-fg-3">
                      {locale === "ko" ? option.descriptionKo : option.descriptionEn}
                    </span>
                  </button>
                );
              })}
            </div>
            {!showMore ? (
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className={buttonClass({ variant: "quiet", size: "sm", className: "mt-2" })}
              >
                {locale === "ko" ? "3D·애니메이션도 보기" : "Show 3D and animation"}
              </button>
            ) : null}
          </section>

          <section className="mt-7 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-7" aria-labelledby="project-details-title">
            <h2 id="project-details-title" className="text-xl font-black text-fg">
              {locale === "ko" ? "바로 시작할 준비" : "Ready to begin"}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-fg-2">
                {locale === "ko" ? "프로젝트 이름" : "Project name"}
                <input
                  autoFocus
                  value={title}
                  maxLength={120}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTitleEdited(true);
                    setError(null);
                  }}
                  className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-base font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="text-xs font-bold text-fg-2">
                {locale === "ko" ? "시작 템플릿" : "Starting template"}
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {locale === "ko" ? template.labelKo : template.labelEn}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <details className="mt-4 rounded-2xl border border-line bg-panel/50 p-4">
              <summary className="min-h-10 cursor-pointer text-sm font-bold text-fg">
                {locale === "ko" ? "설명과 기본 언어" : "Description and primary language"}
              </summary>
              <div className="mt-3 grid gap-4 md:grid-cols-[1fr_14rem]">
                <label className="text-xs font-bold text-fg-2">
                  {locale === "ko" ? "설명 (선택)" : "Description (optional)"}
                  <textarea
                    value={description}
                    maxLength={1_000}
                    rows={3}
                    onChange={(event) => setDescription(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </label>
                <label className="text-xs font-bold text-fg-2">
                  {locale === "ko" ? "기본 언어" : "Primary language"}
                  <select
                    value={primaryLocale}
                    onChange={(event) => setPrimaryLocale(event.target.value)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
                  >
                    <option value="ko-KR">한국어</option>
                    <option value="en-US">English</option>
                    <option value="ja-JP">日本語</option>
                    <option value="zh-CN">简体中文</option>
                    <option value="zh-TW">繁體中文</option>
                    <option value="es-ES">Español</option>
                  </select>
                </label>
              </div>
            </details>

            {error ? (
              <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm font-semibold text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/studio" className={buttonClass({ variant: "quiet" })}>
                {locale === "ko" ? "내 작업으로 돌아가기" : "Back to My work"}
              </Link>
              <button
                type="button"
                disabled={!title.trim() || creating}
                onClick={create}
                className={buttonClass({ size: "lg", className: "min-w-44" })}
              >
                {creating
                  ? locale === "ko" ? "준비 중…" : "Preparing…"
                  : locale === "ko" ? `${label(selected, locale)} 시작` : `Start ${label(selected, locale)}`}
              </button>
            </div>
          </section>
        </div>
      </Container>
    </main>
  );
}
