import { BookMarked, Lightbulb, Search, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ENGINEERING_GLOSSARY,
  GLOSSARY_CATEGORIES,
  type GlossaryCategoryId,
} from "./engineering-glossary-content";
import { GLOSSARY_LINK_PAGE_LABELS, resolveGlossaryLink, type GlossaryLinkTarget } from "./engineering-glossary-links";
import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";

import { SectionArt } from "@/shared/components/section-art";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringGlossaryPage", ko, en);

const CATEGORY_BY_ID = new Map(GLOSSARY_CATEGORIES.map((category) => [category.id, category]));

/** 용어별 ‘더 읽기’ 도착지. 찾을 수 없는 id는 링크를 만들지 않는다(테스트로 전부 연결됨을 확인). */
const LINKS_BY_TERM = new Map(ENGINEERING_GLOSSARY.map((term) => [
  term.id,
  term.chapters.flatMap((id): GlossaryLinkTarget[] => {
    const target = resolveGlossaryLink(id);
    return target ? [target] : [];
  }),
]));

export function EngineeringGlossaryPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("기술 용어집 · ToonStudio", "Technology glossary · ToonStudio"));

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | GlossaryCategoryId>("all");

  const terms = useMemo(() => {
    const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
    return ENGINEERING_GLOSSARY.filter((term) => {
      if (category !== "all" && term.category !== category) return false;
      if (!normalized) return true;
      return [term.term.ko, term.term.en, term.definition.ko, term.definition.en, term.analogy.ko, term.inToonstudio.ko]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [query, category]);

  const filterButton = (active: boolean) => cx(
    "min-h-11 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
    active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
  );

  return (
    <EngineeringPageFrame pageId="glossary">
      <EngineeringPageIntro
        pageId="glossary"
        eyebrow="GLOSSARY · FOR SEMINAR Q&A"
        title={bi("기술 용어집", "Technology glossary")}
        description={bi(
          "발표에 나오는 기술 용어를 쉬운 말로 풀었습니다. 정의는 한 줄, 비유는 일상 사물, ‘툰스튜디오에서는’에는 실제 적용 위치와 선택 이유를 적었습니다.",
          "Every technical term in the talk, explained plainly: a one-line definition, an everyday analogy and, under ‘In ToonStudio’, where and why it is used.",
        )}
        aside={(
          <SectionArt
            image="learn"
            className="aspect-[16/10] w-full max-w-sm rounded-2xl border border-line object-cover"
          />
        )}
      />

      <section aria-labelledby="glossary-filter-title" className="grid gap-4 rounded-3xl border border-line/70 bg-panel/55 p-3 sm:p-4">
        <h2 id="glossary-filter-title" className="sr-only">{bi("용어 검색과 분야 필터", "Search and filter terms")}</h2>
        <label className="relative block max-w-xl">
          <span className="sr-only">{bi("용어 검색", "Search terms")}</span>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={bi("용어 검색 — 예: WASM, 스태빌라이저, 오프라인", "Search terms — e.g. WASM, stabilizer, offline")}
            className="min-h-11 w-full rounded-2xl border border-line bg-card py-3 pl-11 pr-4 text-sm text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label={bi("분야별 보기", "Filter by area")}>
          <button type="button" onClick={() => setCategory("all")} aria-pressed={category === "all"} className={filterButton(category === "all")}>
            {bi("전체", "All")} · {ENGINEERING_GLOSSARY.length}
          </button>
          {GLOSSARY_CATEGORIES.map((item) => {
            const count = ENGINEERING_GLOSSARY.filter((term) => term.category === item.id).length;
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(active ? "all" : item.id)}
                aria-pressed={active}
                title={bi(item.hint.ko, item.hint.en)}
                className={filterButton(active)}
              >
                {bi(item.label.ko, item.label.en)} · {count}
              </button>
            );
          })}
        </div>
        <p className="px-1 text-xs text-fg-3" role="status">
          {formatI18nTemplate(String(bi("{value0}개 용어", "{value0} terms")), { value0: terms.length })}
        </p>
      </section>

      <section aria-labelledby="glossary-terms-title" className="mt-6">
        <h2 id="glossary-terms-title" className="sr-only">{bi("용어 목록", "Terms")}</h2>
        {terms.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line-strong bg-card/50 p-8 text-center" role="status">
            <p className="text-base font-bold text-fg">{bi("검색 결과가 없습니다", "No matching terms")}</p>
            <p className="mt-2 text-sm text-fg-2">{bi("다른 단어로 검색하거나 분야 필터를 바꿔보세요.", "Try another keyword or change the area filter.")}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {terms.map((term) => {
              const termCategory = CATEGORY_BY_ID.get(term.category);
              const links = LINKS_BY_TERM.get(term.id) ?? [];
              return (
                <article key={term.id} id={`glossary-${term.id}`} className="flex scroll-mt-32 flex-col rounded-3xl border border-line/70 bg-card/70 p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    {termCategory ? (
                      <span className="rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                        {bi(termCategory.label.ko, termCategory.label.en)}
                      </span>
                    ) : null}
                    <h3 className="text-lg font-black text-fg">{bi(term.term.ko, term.term.en)}</h3>
                  </div>
                  <p className="mt-3 text-sm font-bold leading-7 text-fg">{bi(term.definition.ko, term.definition.en)}</p>
                  <div className="mt-3 rounded-2xl bg-raised/60 p-4">
                    <p className="flex items-center gap-2 text-xs font-black text-fg-2">
                      <Lightbulb size={14} className="text-accent-2" aria-hidden="true" />
                      {bi("쉬운 비유", "Plain analogy")}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-fg-2">{bi(term.analogy.ko, term.analogy.en)}</p>
                  </div>
                  <div className="mt-3 rounded-2xl border border-line bg-panel/50 p-4">
                    <p className="flex items-center gap-2 text-xs font-black text-fg-2">
                      <Wrench size={14} className="text-accent" aria-hidden="true" />
                      {bi("툰스튜디오에서는", "In ToonStudio")}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-fg-2">{bi(term.inToonstudio.ko, term.inToonstudio.en)}</p>
                  </div>
                  {links.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-fg-3">{bi("더 읽기:", "Read more:")}</span>
                      {links.map((target) => (
                        <Link
                          key={target.id}
                          href={target.href}
                          data-chapter-id={target.id}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-bold text-accent transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <span className="font-display text-[0.62rem] font-black uppercase tracking-[0.08em] text-fg-3">
                            {bi(GLOSSARY_LINK_PAGE_LABELS[target.page].ko, GLOSSARY_LINK_PAGE_LABELS[target.page].en)}
                          </span>
                          {bi(target.title.ko, target.title.en)}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10 rounded-3xl border border-line/70 bg-panel/60 p-6 sm:p-8" aria-labelledby="glossary-tips-title">
        <h2 id="glossary-tips-title" className="flex items-center gap-2 text-sm font-black text-accent">
          <BookMarked size={15} aria-hidden="true" />
          {bi("발표자를 위한 팁", "Speaker tips")}
        </h2>
        <ul className="mt-4 grid gap-3 text-sm leading-7 text-fg-2">
          <li>{bi("어려운 질문이 나오면 정의가 아니라 비유부터 말하세요. “WASM이 뭐죠?” → “미리 번역해 둔 책을 읽는 겁니다.”", "For hard questions, lead with the analogy, not the definition. “What is WASM?” → “Reading a pre-translated book.”")}</li>
          <li>{bi("“왜 그 기술을 골랐나?”에는 ‘툰스튜디오에서는’의 적용 위치와 이유를 그대로 인용하세요. 근거가 곧 설득입니다.", "For “why this technology?”, quote where and why from ‘In ToonStudio’. Evidence persuades.")}</li>
          <li>{bi("모르는 질문에는 “기술 스토리의 해당 챕터 근거를 확인하고 답변드리겠습니다.” — 챕터 링크가 준비돼 있습니다.", "For questions you can't answer: “Let me verify against the chapter evidence and follow up.” The chapter links are ready.")}</li>
        </ul>
      </section>
    </EngineeringPageFrame>
  );
}
