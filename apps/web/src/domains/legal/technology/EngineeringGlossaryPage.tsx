import { BookMarked, Lightbulb, Search, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ENGINEERING_GLOSSARY,
  GLOSSARY_CATEGORIES,
  type GlossaryCategoryId,
} from "./engineering-glossary-content";
import { EngineeringStoryNav } from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringGlossaryPage", ko, en);

function localized(
  value: { readonly ko: string; readonly en: string },
  locale: string,
): string {
  return locale.startsWith("en") ? value.en : value.ko;
}

export function EngineeringGlossaryPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();
  useDocumentTitle(
    bi(
      "기술 용어집 · ToonStudio",
      "Technology glossary · ToonStudio",
    ),
  );

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | GlossaryCategoryId>("all");

  const terms = useMemo(() => {
    const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
    return ENGINEERING_GLOSSARY.filter((term) => {
      if (category !== "all" && term.category !== category) return false;
      if (!normalized) return true;
      const haystack = [
        term.term.ko,
        term.term.en,
        term.definition.ko,
        term.definition.en,
        term.analogy.ko,
        term.inToonstudio.ko,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, category]);

  const categoryLabel = (id: GlossaryCategoryId): string =>
    localized(
      GLOSSARY_CATEGORIES.find((c) => c.id === id)?.label ?? { ko: id, en: id },
      locale,
    );

  return (
    <main>
      <AboutSectionNav />
      <Container className="py-10 sm:py-14">
        <p className="text-xs font-bold tracking-widest text-accent">
          {bi("세미나 Q&A 방어용", "FOR SEMINAR Q&A")}
        </p>
        <h1 className="mt-3 text-3xl font-black text-fg sm:text-4xl">
          {bi("기술 용어집", "Technology glossary")}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-fg-2">
          {bi(
            "발표에서 나오는 모든 기술 용어를 쉬운 말로 풀었습니다. 정의는 한 줄, 비유는 일상 사물, 그리고 “툰스튜디오에서는”에는 실제 파일명과 선택 이유를 적었습니다. 청중 질문이 나오면 이 페이지에서 바로 답을 찾으세요.",
            "Every technical term in the talk, explained plainly: a one-line definition, an everyday analogy, and — under “In ToonStudio” — the actual file names and reasons behind each choice. When the audience asks, find the answer right here.",
          )}
        </p>

        <EngineeringStoryNav className="mt-8" />

        <div className="mt-8 flex flex-col gap-4">
          <label className="relative block max-w-xl">
            <span className="sr-only">{bi("용어 검색", "Search terms")}</span>
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-3"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={bi(
                "용어 검색 — 예: WASM, 스태빌라이저, 오프라인",
                "Search terms — e.g. WASM, stabilizer, offline",
              )}
              className="w-full rounded-2xl border border-line bg-card py-3 pl-11 pr-4 text-sm text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
            />
          </label>

          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={bi("분야별 보기", "Filter by area")}
          >
            <button
              type="button"
              onClick={() => setCategory("all")}
              aria-pressed={category === "all"}
              className={cx(
                "rounded-full border px-4 py-2 text-sm font-bold transition-colors",
                category === "all"
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              {bi("전체", "All")} · {ENGINEERING_GLOSSARY.length}
            </button>
            {GLOSSARY_CATEGORIES.map((cat) => {
              const count = ENGINEERING_GLOSSARY.filter(
                (term) => term.category === cat.id,
              ).length;
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(active ? "all" : cat.id)}
                  aria-pressed={active}
                  title={localized(cat.hint, locale)}
                  className={cx(
                    "rounded-full border px-4 py-2 text-sm font-bold transition-colors",
                    active
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {localized(cat.label, locale)} · {count}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-6 text-sm text-fg-3" role="status">
          {bi(
            `${terms.length}개 용어`,
            `${terms.length} terms`,
          )}
        </p>

        {terms.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-line bg-card p-8 text-center">
            <p className="text-base font-bold text-fg">
              {bi("검색 결과가 없습니다", "No matching terms")}
            </p>
            <p className="mt-2 text-sm text-fg-2">
              {bi(
                "다른 단어로 검색하거나 분야 필터를 바꿔보세요.",
                "Try another keyword or change the area filter.",
              )}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {terms.map((term) => (
              <article
                key={term.id}
                id={`glossary-${term.id}`}
                className="flex flex-col rounded-3xl border border-line/70 bg-card p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-accent/35 bg-accent-soft/40 px-3 py-1 text-xs font-bold text-accent">
                    {categoryLabel(term.category)}
                  </span>
                  <h2 className="text-lg font-black text-fg">
                    {localized(term.term, locale)}
                  </h2>
                </div>

                <p className="mt-4 text-sm font-bold leading-7 text-fg">
                  {localized(term.definition, locale)}
                </p>

                <div className="mt-4 rounded-2xl bg-raised/60 p-4">
                  <p className="flex items-center gap-2 text-xs font-black tracking-wide text-fg-2">
                    <Lightbulb size={14} aria-hidden="true" />
                    {bi("쉬운 비유", "Plain analogy")}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-fg-2">
                    {localized(term.analogy, locale)}
                  </p>
                </div>

                <div className="mt-3 rounded-2xl border border-line bg-panel/50 p-4">
                  <p className="flex items-center gap-2 text-xs font-black tracking-wide text-fg-2">
                    <Wrench size={14} aria-hidden="true" />
                    {bi("툰스튜디오에서는", "In ToonStudio")}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-fg-2">
                    {localized(term.inToonstudio, locale)}
                  </p>
                </div>

                {term.chapters.length > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-fg-3">
                      {bi("더 읽기:", "Read more:")}
                    </span>
                    {term.chapters.map((chapterId) => (
                      <Link
                        key={chapterId}
                        href={`/about/technology/story#${chapterId}`}
                        className="rounded-full border border-line px-3 py-1 font-bold text-accent hover:border-accent/50"
                      >
                        {chapterId}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <section className="mt-10 rounded-3xl border border-line/70 bg-panel/60 p-6 sm:p-8">
          <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-accent">
            <BookMarked size={14} aria-hidden="true" />
            {bi("발표자를 위한 팁", "SPEAKER TIPS")}
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-fg-2">
            <li>
              {bi(
                "어려운 질문이 나오면 정의가 아니라 비유부터 말하세요. “WASM이 뭐죠?” → “미리 번역해 둔 책을 읽는 겁니다.”",
                "For hard questions, lead with the analogy, not the definition. “What is WASM?” → “Reading a pre-translated book.”",
              )}
            </li>
            <li>
              {bi(
                "“왜 그 기술을 골랐나?”에는 “툰스튜디오에서는”의 파일명과 숫자를 그대로 인용하세요. 근거가 곧 설득입니다.",
                "For “why this technology?”, quote the file names and numbers from “In ToonStudio” verbatim. Evidence persuades.",
              )}
            </li>
            <li>
              {bi(
                "모르는 질문에는 “좋은 질문입니다. 기술 스토리의 해당 챕터 근거를 확인하고 답변드리겠습니다.” — 챕터 링크가 준비돼 있습니다.",
                "For questions you can't answer: “Great question — let me verify against the chapter evidence and follow up.” The chapter links are ready.",
              )}
            </li>
          </ul>
        </section>
      </Container>
    </main>
  );
}
