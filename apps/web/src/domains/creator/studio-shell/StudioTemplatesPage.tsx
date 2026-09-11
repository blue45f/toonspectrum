import {
  ArrowRight,
  CheckCircle2,
  Heart,
  LayoutTemplate,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_TEMPLATE_CATEGORIES,
  STUDIO_TEMPLATE_CATALOG,
  createStudioTemplateHandoff,
  defaultStudioTemplateValues,
  readStudioTemplateFavorites,
  searchStudioTemplates,
  studioTemplateStartHref,
  writeStudioTemplateFavorites,
  writeStudioTemplateHandoff,
  type StudioTemplateCatalogItem,
  type StudioTemplateCategory,
} from "../studio-template-catalog";
import { planStudioTemplateApplication } from "../studio-template-system";

type Locale = "ko" | "en";

const CATEGORY_LABELS: Readonly<
  Record<StudioTemplateCategory, Readonly<Record<Locale, string>>>
> = {
  all: { ko: "전체", en: "All" },
  webtoon: { ko: "웹툰", en: "Webtoon" },
  illustration: { ko: "일러스트", en: "Illustration" },
  promotion: { ko: "표지·홍보", en: "Cover & promotion" },
  presentation: { ko: "발표 자료", en: "Presentation" },
  storyboard: { ko: "콘티", en: "Storyboard" },
};

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function templateTitle(template: StudioTemplateCatalogItem, locale: Locale): string {
  return locale === "ko" ? template.titleKo : template.titleEn;
}

function templateDescription(template: StudioTemplateCatalogItem, locale: Locale): string {
  return locale === "ko" ? template.descriptionKo : template.descriptionEn;
}

function TemplatePreview({
  locale,
  template,
  favorite,
  onToggleFavorite,
}: {
  readonly locale: Locale;
  readonly template: StudioTemplateCatalogItem;
  readonly favorite: boolean;
  readonly onToggleFavorite: () => void;
}) {
  const plan = useMemo(
    () => planStudioTemplateApplication(
      template.definition,
      defaultStudioTemplateValues(template),
    ),
    [template],
  );
  const title = templateTitle(template, locale);

  const prepareHandoff = () => {
    if (typeof window === "undefined") return;
    writeStudioTemplateHandoff(
      window.localStorage,
      createStudioTemplateHandoff(template.id),
    );
  };

  return (
    <aside className="rounded-3xl border border-line bg-card p-5 shadow-sm lg:sticky lg:top-6 lg:self-start sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <LayoutTemplate size={22} aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={locale === "ko" ? "즐겨찾기 전환" : "Toggle favorite"}
          className={cn(
            "grid size-11 place-items-center rounded-xl border transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
            favorite
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-line bg-panel text-fg-3 hover:text-fg",
          )}
        >
          <Heart size={18} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>

      <p className="mt-5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
        {CATEGORY_LABELS[template.category][locale]}
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-fg">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-fg-2">
        {templateDescription(template, locale)}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {template.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.68rem] font-bold text-fg-2">
            {tag}
          </span>
        ))}
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-3">
          <dt className="text-[0.65rem] font-semibold text-fg-3">
            {locale === "ko" ? "권장 작업공간" : "Workspace"}
          </dt>
          <dd className="mt-1 text-sm font-black text-fg">{template.recommendedWorkspace}</dd>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <dt className="text-[0.65rem] font-semibold text-fg-3">
            {locale === "ko" ? "채울 항목" : "Editable slots"}
          </dt>
          <dd className="mt-1 text-sm font-black text-fg">{template.definition.slots.length}</dd>
        </div>
      </dl>

      <div className={cn(
        "mt-4 flex items-start gap-3 rounded-xl border p-3",
        plan.status === "ready"
          ? "border-success/30 bg-success-soft/15"
          : "border-warning/35 bg-warning-soft/15",
      )}>
        <CheckCircle2
          size={18}
          className={plan.status === "ready" ? "mt-0.5 shrink-0 text-success" : "mt-0.5 shrink-0 text-warning"}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-black text-fg">
            {plan.status === "ready"
              ? (locale === "ko" ? "안전한 기본값으로 바로 시작할 수 있어요" : "Ready with safe defaults")
              : (locale === "ko" ? "시작 전에 채울 항목이 있어요" : "Some fields need attention")}
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-3">
            {locale === "ko"
              ? "원본을 덮어쓰지 않고 새 프로젝트·문서에서 시작합니다. 이미지 에셋의 사용 권리는 적용 전에 다시 확인합니다."
              : "Starts in a new project or document without replacing originals. Image rights are checked again before use."}
          </p>
        </div>
      </div>

      <Link
        href={studioTemplateStartHref(template.id)}
        onClick={prepareHandoff}
        className={cn(
          "mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-on-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2",
        )}
      >
        {locale === "ko" ? "이 템플릿으로 시작" : "Start with this template"}
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </aside>
  );
}

/** One canonical, searchable template destination for novice and professional creation flows. */
export function StudioTemplatesPage() {
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StudioTemplateCategory>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<readonly string[]>([]);
  const [selectedId, setSelectedId] = useState(STUDIO_TEMPLATE_CATALOG[0]?.id ?? "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFavoriteIds(readStudioTemplateFavorites(window.localStorage));
  }, []);

  const templates = useMemo(() => searchStudioTemplates({
    text: query,
    category,
    favoriteIds,
    favoritesOnly,
  }), [category, favoriteIds, favoritesOnly, query]);

  const selected = useMemo(() => (
    templates.find((template) => template.id === selectedId)
    ?? templates[0]
    ?? STUDIO_TEMPLATE_CATALOG.find((template) => template.id === selectedId)
    ?? STUDIO_TEMPLATE_CATALOG[0]
  ), [selectedId, templates]);

  const toggleFavorite = (templateId: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId];
      if (typeof window === "undefined") return Object.freeze(next);
      return writeStudioTemplateFavorites(window.localStorage, next);
    });
  };

  return (
    <main className="min-h-[70vh] bg-canvas">
      <Container size="wide" className="py-8 sm:py-12">
        <header className="max-w-4xl">
          <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
            <Sparkles size={15} aria-hidden="true" /> TOONSTUDIO TEMPLATES
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-fg sm:text-5xl">
            {locale === "ko" ? "무엇을 만들지만 고르세요" : "Choose what you want to make"}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
            {locale === "ko"
              ? "웹툰, 일러스트, 홍보물, 발표 자료와 콘티의 전문 구조를 미리 준비했습니다. 복잡한 규격과 기본 레이어는 ToonStudio가 정하고, 필요할 때만 세부 설정을 바꿀 수 있습니다."
              : "Professional structures for webtoons, illustration, promotion, presentations and storyboards are prepared in advance. ToonStudio chooses safe defaults while keeping expert controls available."}
          </p>
        </header>

        <section className="mt-7 rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-5" aria-label={locale === "ko" ? "템플릿 찾기" : "Find templates"}>
          <label className="relative block">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <span className="sr-only">{locale === "ko" ? "템플릿 검색" : "Search templates"}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={locale === "ko" ? "웹툰, 피칭, 캐릭터 시트처럼 검색" : "Search webtoon, pitch, character sheet…"}
              className="min-h-12 w-full rounded-xl border border-line bg-panel pl-10 pr-4 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {STUDIO_TEMPLATE_CATEGORIES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setCategory(candidate)}
                aria-pressed={candidate === category}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-xs font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  candidate === category
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
                )}
              >
                {CATEGORY_LABELS[candidate][locale]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFavoritesOnly((current) => !current)}
              aria-pressed={favoritesOnly}
              className={cn(
                "ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
                favoritesOnly
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:text-fg",
              )}
            >
              <Heart size={14} fill={favoritesOnly ? "currentColor" : "none"} aria-hidden="true" />
              {locale === "ko" ? "즐겨찾기" : "Favorites"}
            </button>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-live="polite">
            <p className="mb-3 text-xs font-bold text-fg-3">
              {locale === "ko" ? `${templates.length}개 템플릿` : `${templates.length} templates`}
            </p>
            {templates.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => {
                  const active = selected?.id === template.id;
                  const favorite = favoriteIds.includes(template.id);
                  return (
                    <article
                      key={template.id}
                      className={cn(
                        "group rounded-2xl border bg-card p-4 shadow-sm transition",
                        active ? "border-accent/55 ring-2 ring-accent/15" : "border-line hover:border-accent/35",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(template.id)}
                          className="min-w-0 flex-1 text-left focus-visible:outline-none"
                        >
                          <span className="inline-flex rounded-full bg-accent-soft px-2 py-1 text-[0.6rem] font-black text-accent">
                            {CATEGORY_LABELS[template.category][locale]}
                          </span>
                          <h2 className="mt-3 text-base font-black leading-6 text-fg">
                            {templateTitle(template, locale)}
                          </h2>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFavorite(template.id)}
                          aria-pressed={favorite}
                          aria-label={locale === "ko" ? "즐겨찾기 전환" : "Toggle favorite"}
                          className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-panel hover:text-accent"
                        >
                          <Heart size={15} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
                        </button>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-fg-2">
                        {templateDescription(template, locale)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedId(template.id)}
                        className="mt-4 min-h-10 w-full rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-fg"
                      >
                        {locale === "ko" ? "구성 보기" : "View structure"}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-line bg-card p-10 text-center">
                <LayoutTemplate size={28} className="mx-auto text-fg-3" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-black text-fg">
                  {locale === "ko" ? "조건에 맞는 템플릿이 없어요" : "No matching templates"}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setFavoritesOnly(false);
                  }}
                  className="mt-4 min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
                >
                  {locale === "ko" ? "전체 템플릿 보기" : "Show all templates"}
                </button>
              </div>
            )}
          </section>

          {selected ? (
            <TemplatePreview
              locale={locale}
              template={selected}
              favorite={favoriteIds.includes(selected.id)}
              onToggleFavorite={() => toggleFavorite(selected.id)}
            />
          ) : null}
        </div>
      </Container>
    </main>
  );
}
