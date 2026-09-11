import {
  ArrowRight,
  Check,
  LayoutTemplate,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import {
  STUDIO_PROJECT_TEMPLATES,
  STUDIO_TEMPLATE_CATEGORIES,
  searchStudioProjectTemplates,
  type StudioProjectTemplateDefinition,
  type StudioTemplateCategory,
} from "../studio-project-template-catalog";

type Locale = "ko" | "en";
type CategoryFilter = StudioTemplateCategory | "all";

const CATEGORY_LABELS: Readonly<Record<CategoryFilter, Readonly<Record<Locale, string>>>> = Object.freeze({
  all: { ko: "전체", en: "All" },
  webtoon: { ko: "웹툰", en: "Webtoon" },
  drawing: { ko: "그리기", en: "Drawing" },
  design: { ko: "디자인", en: "Design" },
  presentation: { ko: "발표 자료", en: "Presentation" },
  storyboard: { ko: "스토리보드", en: "Storyboard" },
  image: { ko: "이미지", en: "Image" },
  "three-d": { ko: "3D", en: "3D" },
  motion: { ko: "모션", en: "Motion" },
});

const DIFFICULTY_LABELS = {
  beginner: { ko: "쉽게 시작", en: "Easy start" },
  intermediate: { ko: "중급", en: "Intermediate" },
  professional: { ko: "전문", en: "Professional" },
} as const;

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function resolveCategory(value: string | null): CategoryFilter {
  return value === "all" || STUDIO_TEMPLATE_CATEGORIES.includes(value as StudioTemplateCategory)
    ? value as CategoryFilter
    : "all";
}

function title(template: StudioProjectTemplateDefinition, locale: Locale): string {
  return locale === "ko" ? template.titleKo : template.titleEn;
}

function description(template: StudioProjectTemplateDefinition, locale: Locale): string {
  return locale === "ko" ? template.descriptionKo : template.descriptionEn;
}

function templatePreviewLabel(template: StudioProjectTemplateDefinition): string {
  if (template.category === "webtoon") return "WEBTOON";
  if (template.category === "presentation") return "16 : 9";
  if (template.category === "three-d") return "3D SCENE";
  if (template.category === "motion") return "9 : 16";
  return template.category.toUpperCase();
}

function TemplatePreview({ template, selected }: {
  readonly template: StudioProjectTemplateDefinition;
  readonly selected: boolean;
}) {
  return (
    <div className={cn(
      "relative aspect-[16/10] overflow-hidden rounded-xl border bg-gradient-to-br from-accent-soft via-panel to-raised",
      selected ? "border-accent/50" : "border-line",
    )}>
      <div className="absolute inset-x-4 top-4 h-3 rounded-full bg-fg/10" />
      <div className="absolute left-4 top-10 h-14 w-2/5 rounded-lg border border-line/80 bg-card/80 shadow-sm" />
      <div className="absolute right-4 top-10 h-6 w-2/5 rounded-md bg-fg/10" />
      <div className="absolute bottom-4 right-4 h-10 w-2/5 rounded-lg border border-line/80 bg-card/70" />
      {template.category === "webtoon" ? (
        <div className="absolute bottom-4 left-4 top-10 w-1/4 space-y-2 rounded-lg bg-card/70 p-2">
          <div className="h-1/3 rounded bg-fg/10" />
          <div className="h-1/4 rounded bg-accent/20" />
          <div className="h-1/3 rounded bg-fg/10" />
        </div>
      ) : null}
      <span className="absolute bottom-3 left-3 rounded-full border border-line bg-card/90 px-2 py-1 text-[0.6rem] font-black tracking-wide text-fg-2">
        {templatePreviewLabel(template)}
      </span>
      {selected ? (
        <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-accent text-on-accent shadow-sm">
          <Check size={15} aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}

export function StudioTemplateHubPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const category = resolveCategory(searchParams.get("category"));
  const query = searchParams.get("q") ?? "";
  const featuredOnly = searchParams.get("featured") === "1";
  const requestedTemplate = searchParams.get("template");
  const initialTemplate = STUDIO_PROJECT_TEMPLATES.find((template) => template.id === requestedTemplate)
    ?? searchStudioProjectTemplates({ category, query, featuredOnly })[0]
    ?? STUDIO_PROJECT_TEMPLATES[0]!;
  const [selectedId, setSelectedId] = useState(initialTemplate.id);
  const selected = STUDIO_PROJECT_TEMPLATES.find((template) => template.id === selectedId)
    ?? initialTemplate;
  const [projectTitle, setProjectTitle] = useState(() => (
    locale === "ko" ? `${selected.titleKo} 프로젝트` : `${selected.titleEn} project`
  ));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templates = useMemo(() => searchStudioProjectTemplates({
    category,
    query,
    featuredOnly,
  }), [category, featuredOnly, query]);

  const patchQuery = (values: Readonly<Record<string, string | null>>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    next.sort();
    setSearchParams(next, { replace: true });
  };

  const selectTemplate = (template: StudioProjectTemplateDefinition) => {
    setSelectedId(template.id);
    setProjectTitle(locale === "ko" ? `${template.titleKo} 프로젝트` : `${template.titleEn} project`);
    setError(null);
    patchQuery({ template: template.id });
  };

  const create = () => {
    if (typeof window === "undefined" || creating || !projectTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title: projectTitle,
        kind: selected.projectKind,
        templateId: selected.id,
        document: {
          title: locale === "ko" ? `${selected.titleKo} 문서` : `${selected.titleEn} document`,
          kind: selected.documentKind,
          defaultWorkspace: selected.defaultWorkspace,
          width: selected.width,
          height: selected.height,
          pageCount: selected.pageCount,
        },
      }, window);
      navigate(result.href, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : locale === "ko"
          ? "템플릿으로 프로젝트를 만들지 못했습니다."
          : "The project could not be created from this template.");
      setCreating(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-11">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
              <LayoutTemplate size={14} aria-hidden="true" /> TOONSTUDIO TEMPLATES
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
              {locale === "ko" ? "완성된 구조에서 바로 시작" : "Start from a production-ready structure"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
              {locale === "ko"
                ? "템플릿은 이미지 한 장이 아니라 문서 종류, 작업공간, 크기, 페이지와 제작 흐름을 함께 준비합니다. 선택 후에도 모든 항목을 바꿀 수 있습니다."
                : "Templates prepare document type, workspace, dimensions, pages and production flow—not just a picture. Every setting remains editable."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/studio/assets?view=market" className={buttonClass({ variant: "outline", className: "gap-2" })}>
              <Store size={16} aria-hidden="true" />
              {locale === "ko" ? "마켓 템플릿" : "Marketplace templates"}
            </Link>
            <Link href="/studio/new" className={buttonClass({ variant: "quiet" })}>
              {locale === "ko" ? "빈 작업으로 시작" : "Start blank"}
            </Link>
          </div>
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="template-list-title">
            <h2 id="template-list-title" className="sr-only">
              {locale === "ko" ? "템플릿 목록" : "Template list"}
            </h2>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="overflow-x-auto">
                <div className="flex min-w-max gap-1 rounded-2xl border border-line bg-card p-1">
                  {(["all", ...STUDIO_TEMPLATE_CATEGORIES] as const).map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      aria-pressed={candidate === category}
                      onClick={() => patchQuery({ category: candidate === "all" ? null : candidate, template: null })}
                      className={cn(
                        "min-h-10 rounded-xl px-3 text-xs font-bold transition-colors",
                        candidate === category
                          ? "bg-accent text-on-accent"
                          : "text-fg-2 hover:bg-raised hover:text-fg",
                      )}
                    >
                      {CATEGORY_LABELS[candidate][locale]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <label className="relative block min-w-0 flex-1 lg:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" size={16} aria-hidden="true" />
                  <span className="sr-only">{locale === "ko" ? "템플릿 검색" : "Search templates"}</span>
                  <input
                    value={query}
                    onChange={(event) => patchQuery({ q: event.target.value || null, template: null })}
                    placeholder={locale === "ko" ? "용도·종류 검색" : "Search use or type"}
                    className="min-h-11 w-full rounded-xl border border-line bg-card pl-10 pr-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </label>
                <button
                  type="button"
                  aria-pressed={featuredOnly}
                  onClick={() => patchQuery({ featured: featuredOnly ? null : "1", template: null })}
                  className={cn(
                    "min-h-11 shrink-0 rounded-xl border px-3 text-xs font-bold",
                    featuredOnly
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised",
                  )}
                >
                  <Sparkles size={14} className="mr-1 inline" aria-hidden="true" />
                  {locale === "ko" ? "추천" : "Featured"}
                </button>
              </div>
            </div>

            {templates.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-line bg-card/60 py-14 text-center">
                <Search size={23} className="mx-auto text-fg-3" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-black text-fg">
                  {locale === "ko" ? "일치하는 템플릿이 없습니다" : "No matching templates"}
                </h3>
                <button type="button" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })} className={buttonClass({ variant: "quiet", size: "sm", className: "mt-3" })}>
                  {locale === "ko" ? "필터 지우기" : "Clear filters"}
                </button>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const active = template.id === selected.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectTemplate(template)}
                      className={cn(
                        "rounded-2xl border bg-card p-3 text-left shadow-sm transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                        active ? "border-accent shadow-md" : "border-line hover:border-accent/40 hover:shadow-md",
                      )}
                    >
                      <TemplatePreview template={template} selected={active} />
                      <div className="px-1 pb-1 pt-3">
                        <div className="flex items-start justify-between gap-2">
                          <b className="text-sm text-fg">{title(template, locale)}</b>
                          {template.featured ? <Sparkles size={14} className="shrink-0 text-accent" aria-label={locale === "ko" ? "추천" : "Featured"} /> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-fg-3">{description(template, locale)}</p>
                        <span className="mt-3 inline-flex rounded-full bg-panel px-2 py-1 text-[0.62rem] font-bold text-fg-2">
                          {DIFFICULTY_LABELS[template.difficulty][locale]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="xl:sticky xl:top-20 xl:self-start">
            <section className="rounded-3xl border border-line bg-card p-5 shadow-lg" aria-labelledby="selected-template-title">
              <TemplatePreview template={selected} selected />
              <p className="mt-4 text-[0.65rem] font-black uppercase tracking-[0.14em] text-accent">
                {CATEGORY_LABELS[selected.category][locale]}
              </p>
              <h2 id="selected-template-title" className="mt-1 text-xl font-black text-fg">
                {title(selected, locale)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-fg-2">{description(selected, locale)}</p>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-line bg-panel p-3">
                  <dt className="text-fg-3">{locale === "ko" ? "문서" : "Document"}</dt>
                  <dd className="mt-1 font-bold text-fg">{selected.documentKind}</dd>
                </div>
                <div className="rounded-xl border border-line bg-panel p-3">
                  <dt className="text-fg-3">{locale === "ko" ? "작업공간" : "Workspace"}</dt>
                  <dd className="mt-1 font-bold text-fg">{selected.defaultWorkspace}</dd>
                </div>
                <div className="rounded-xl border border-line bg-panel p-3">
                  <dt className="text-fg-3">{locale === "ko" ? "크기" : "Size"}</dt>
                  <dd className="mt-1 font-bold text-fg">
                    {selected.width && selected.height ? `${selected.width} × ${selected.height}` : locale === "ko" ? "자동" : "Automatic"}
                  </dd>
                </div>
                <div className="rounded-xl border border-line bg-panel p-3">
                  <dt className="text-fg-3">{locale === "ko" ? "페이지" : "Pages"}</dt>
                  <dd className="mt-1 font-bold text-fg">{selected.pageCount}</dd>
                </div>
              </dl>

              <label className="mt-4 block text-xs font-bold text-fg-2">
                {locale === "ko" ? "프로젝트 이름" : "Project name"}
                <input
                  value={projectTitle}
                  maxLength={120}
                  onChange={(event) => {
                    setProjectTitle(event.target.value);
                    setError(null);
                  }}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>

              {error ? (
                <p role="alert" className="mt-3 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-xs font-semibold text-danger">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                disabled={!projectTitle.trim() || creating}
                onClick={create}
                className={buttonClass({ size: "lg", className: "mt-4 w-full gap-2" })}
              >
                {creating
                  ? locale === "ko" ? "준비 중…" : "Preparing…"
                  : locale === "ko" ? "이 템플릿으로 시작" : "Start with this template"}
                {!creating ? <ArrowRight size={16} aria-hidden="true" /> : null}
              </button>
            </section>
          </aside>
        </div>
      </Container>
    </main>
  );
}
