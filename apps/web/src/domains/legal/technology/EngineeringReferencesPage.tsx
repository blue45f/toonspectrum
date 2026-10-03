import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileCode2,
  Search,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  ENGINEERING_REFERENCE_PRODUCTS,
  ENGINEERING_REFERENCE_ROLE_META,
} from "./engineering-field-notes-content";
import type { EngineeringEvidenceKind } from "./engineering-story-content";
import {
  ENGINEERING_REFERENCES,
  ENGINEERING_REFERENCE_RELATION_META,
  type EngineeringReferenceRelation,
} from "./engineering-story-deep-dive-content";
import { EngineeringSeminarResources } from "./EngineeringSeminarResources";
import {
  EngineeringPageFrame,
  EngineeringPageIntro,
  EngineeringStatusBadge,
} from "./EngineeringStoryUi";

import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import "./engineering-surfaces.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringReferencesPage", ko, en);

const RELATION_FILTERS = ["all", "used", "evaluated", "inspired", "alternative"] as const;
type RelationFilter = (typeof RELATION_FILTERS)[number];

const RELATION_STYLES: Record<EngineeringReferenceRelation, string> = {
  used: "border-good/40 bg-good/12 text-good",
  evaluated: "border-warn/40 bg-warn/12 text-warn",
  inspired: "border-accent/40 bg-accent-soft text-accent",
  alternative: "border-line-strong bg-raised text-fg-2",
};

const EVIDENCE_ICONS: Record<EngineeringEvidenceKind, typeof FileCode2> = {
  code: FileCode2,
  test: TestTube2,
  workflow: Workflow,
  document: BookOpen,
};

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function EngineeringReferencesPage() {
  useBilingualI18nRevision();
  const [relation, setRelation] = useState<RelationFilter>("all");
  const [query, setQuery] = useState("");
  const search = normalized(query);

  useDocumentTitle(bi("ToonStudio 기술 참고 자료 · 사용·평가·참고 구분", "ToonStudio technical references · Used, evaluated and inspired"));

  const references = useMemo(
    () => ENGINEERING_REFERENCES.filter((reference) => {
      if (relation !== "all" && reference.relation !== relation) return false;
      if (!search) return true;
      return normalized([
        reference.title,
        bi(reference.category.ko, reference.category.en),
        bi(reference.summary.ko, reference.summary.en),
        bi(reference.applied.ko, reference.applied.en),
        bi(reference.caution.ko, reference.caution.en),
        ...reference.evidence.map((item) => `${bi(item.label.ko, item.label.en)} ${item.path}`),
      ].join(" ")).includes(search);
    }),
    [relation, search],
  );

  const products = useMemo(
    () => ENGINEERING_REFERENCE_PRODUCTS.filter((product) => !search || normalized([
      product.name,
      bi(product.lesson.ko, product.lesson.en),
      bi(product.applied.ko, product.applied.en),
      bi(product.boundary.ko, product.boundary.en),
    ].join(" ")).includes(search)),
    [search],
  );

  return (
    <EngineeringPageFrame pageId="references">
      <EngineeringPageIntro
        pageId="references"
        eyebrow="REFERENCES · USED · EVALUATED · INSPIRED"
        title={bi("사용한 기술과 참고한 제품을 같은 말로 소개하지 않습니다.", "Used technology and referenced products are never described the same way.")}
        description={bi(
          "설치해 쓰는 기술, 검토만 한 후보, 제품·UX 참고와 대안을 구분하고 저장소 근거를 연결합니다. 장애와 교훈은 심화 노트에서 이어집니다.",
          "Installed technology, evaluated candidates, product or UX inspiration and alternatives stay separate, each linked to repository evidence. Incidents and lessons continue in the field notes.",
        )}
        aside={(
          <div className="rounded-3xl border border-warn/30 bg-warn/8 p-5">
            <ShieldCheck size={20} className="text-warn" aria-hidden="true" />
            <p className="mt-3 text-sm font-black text-fg">{bi("비교는 영감이지 동등성 주장이 아닙니다.", "A comparison is inspiration, not a parity claim.")}</p>
            <p className="mt-2 text-xs leading-6 text-fg-2">
              {bi("기능 동등성은 실제 벤치마크, 파일 왕복과 사용자 흐름 검증이 있을 때만 따로 주장합니다.", "Feature parity is claimed separately only with benchmarks, file round trips and verified user journeys.")}
            </p>
          </div>
        )}
      />

      <section aria-labelledby="reference-filter-title">
        <h2 id="reference-filter-title" className="sr-only">{bi("참고 자료 검색과 분류", "Search and classify references")}</h2>
        <div className="grid gap-3 rounded-3xl border border-line/70 bg-panel/55 p-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center">
          <label className="relative block">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <span className="sr-only">{bi("기술·제품 검색", "Search technology and products")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={bi("예: Worker, Blender, Phaser, Yjs", "e.g. Worker, Blender, Phaser, Yjs")}
              className="min-h-11 w-full rounded-2xl border border-line bg-card py-2.5 pl-10 pr-4 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={bi("참고 관계 필터", "Reference relationship filter")}>
            {RELATION_FILTERS.map((item) => {
              const copy = item === "all" ? { ko: "전체", en: "All" } : ENGINEERING_REFERENCE_RELATION_META[item].label;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={relation === item}
                  onClick={() => setRelation(item)}
                  className={cx(
                    "min-h-11 rounded-2xl border px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    relation === item ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-accent",
                  )}
                >
                  {bi(copy.ko, copy.en)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="reference-map-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-accent">USED · EVALUATED · INSPIRED · ALTERNATIVE</p>
            <h2 id="reference-map-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bi("기술·제품·자료 참고 지도", "Technology, product and source-reference map")}
            </h2>
          </div>
          <p className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg-3" role="status">
            {formatI18nTemplate(String(bi("{value0}개 결과", "{value0} results")), { value0: references.length })}
          </p>
        </div>

        {references.length ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {references.map((reference) => (
              <article key={reference.id} id={reference.id} data-reference-card="true" className="scroll-mt-32 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={cx("inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[0.66rem] font-bold", RELATION_STYLES[reference.relation])}>
                    {bi(ENGINEERING_REFERENCE_RELATION_META[reference.relation].label.ko, ENGINEERING_REFERENCE_RELATION_META[reference.relation].label.en)}
                  </span>
                  <EngineeringStatusBadge status={reference.status} />
                </div>
                <p className="mt-4 font-display text-[0.66rem] font-black uppercase tracking-[0.15em] text-fg-3">{bi(reference.category.ko, reference.category.en)}</p>
                <h3 className="mt-2 text-xl font-black tracking-tight text-fg">{reference.title}</h3>
                <p className="mt-2 text-sm leading-7 text-fg-2">{bi(reference.summary.ko, reference.summary.en)}</p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-good/30 bg-good/8 p-4">
                    <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-good">{bi("가져온 원칙", "Applied lesson")}</dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi(reference.applied.ko, reference.applied.en)}</dd>
                  </div>
                  <div className="rounded-2xl border border-warn/30 bg-warn/8 p-4">
                    <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-warn">{bi("과장 방지", "Caution")}</dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi(reference.caution.ko, reference.caution.en)}</dd>
                  </div>
                </dl>
                <details className="group mt-4 rounded-2xl border border-line/70 bg-card/55 open:bg-card/75">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs font-black text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                    <span>{bi("저장소 근거", "Repository evidence")}</span>
                    <ArrowRight size={14} className="text-accent transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                  </summary>
                  <ul className="grid gap-2 border-t border-line/70 p-3">
                    {reference.evidence.map((item) => {
                      const Icon = EVIDENCE_ICONS[item.kind];
                      return (
                        <li key={`${item.kind}-${item.path}`} className="flex min-w-0 items-start gap-3 rounded-xl bg-panel/75 p-3">
                          <Icon size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-fg">{bi(item.label.ko, item.label.en)}</span>
                            <code className="eng-code mt-1 block overflow-x-auto whitespace-nowrap rounded-lg px-2 py-1 font-mono text-[0.66rem]">{item.path}</code>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <ActionableEmptyState
            className="mt-6"
            icon={Search}
            art="search"
            title={bi("일치하는 참고 자료가 없습니다.", "No matching references.")}
            description={bi("검색어를 바꾸거나 관계 필터를 전체로 돌리면 다시 나타납니다.", "Change the search term or reset the relationship filter to see them again.")}
            primary={{ href: "/about/technology", label: bi("기술 허브로 가기", "Go to the engineering hub") }}
          >
            <button
              type="button"
              onClick={() => { setQuery(""); setRelation("all"); }}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 hover:border-accent/50 hover:text-accent"
            >
              {bi("검색·필터 초기화", "Reset search & filters")}
            </button>
          </ActionableEmptyState>
        )}
      </section>

      <section id="reference-products" className="scroll-mt-32 py-14 sm:py-16" aria-labelledby="reference-products-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-accent">REFERENCE PRODUCTS · ADOPTION BOUNDARIES</p>
            <h2 id="reference-products-title" className="mt-3 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bi("참고한 제품과 실제로 채택한 패턴, 채택하지 않은 이유", "Reference products, applied patterns and why others were not adopted")}
            </h2>
          </div>
          <p className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg-3" role="status">
            {formatI18nTemplate(String(bi("{value0}개 제품", "{value0} products")), { value0: products.length })}
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const role = ENGINEERING_REFERENCE_ROLE_META[product.role];
            return (
              <article key={product.id} className="flex flex-col rounded-[1.75rem] border border-line/70 bg-panel/60 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-10 place-items-center rounded-2xl border border-line bg-card text-accent">
                    <Sparkles size={18} aria-hidden="true" />
                  </span>
                  <span className="rounded-full border border-line bg-card px-3 py-1.5 text-[0.66rem] font-black text-fg-2" title={bi(role.description.ko, role.description.en)}>
                    {bi(role.label.ko, role.label.en)}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-black text-fg">{product.name}</h3>
                <dl className="mt-3 flex-1 space-y-3 text-xs leading-6">
                  <div>
                    <dt className="font-black text-accent">{bi("참고한 점", "Lesson")}</dt>
                    <dd className="mt-1 text-fg-2">{bi(product.lesson.ko, product.lesson.en)}</dd>
                  </div>
                  <div>
                    <dt className="font-black text-good">{bi("적용", "Applied")}</dt>
                    <dd className="mt-1 text-fg-2">{bi(product.applied.ko, product.applied.en)}</dd>
                  </div>
                  <div>
                    <dt className="font-black text-warn">{bi("경계", "Boundary")}</dt>
                    <dd className="mt-1 text-fg-2">{bi(product.boundary.ko, product.boundary.en)}</dd>
                  </div>
                </dl>
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-line-strong bg-card px-3 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {bi("공식 사이트", "Official site")}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </article>
            );
          })}
        </div>
      </section>

      <EngineeringSeminarResources query={query} />

      <p className="mt-8 text-sm text-fg-2">
        {bi("실제 장애와 교훈은 ", "Real incidents and lessons are in ")}
        <Link href="/about/technology/field-notes#incidents" className="font-bold text-accent hover:underline">{bi("심화 노트의 장애 기록", "the field-notes incident log")}</Link>
        {bi("에서 이어집니다.", ".")}
      </p>
    </EngineeringPageFrame>
  );
}
