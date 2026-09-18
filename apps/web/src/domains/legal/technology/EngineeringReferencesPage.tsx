import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bug,
  CheckCircle2,
  FileCode2,
  Search,
  ShieldCheck,
  TestTube2,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ENGINEERING_REFERENCES,
  ENGINEERING_REFERENCE_RELATION_META,
  ENGINEERING_TROUBLESHOOTING_CASES,
  type EngineeringReferenceRelation,
} from "./engineering-story-deep-dive-content";
import { type EngineeringEvidenceKind } from "./engineering-story-content";
import {
  EngineeringPageIntro,
  EngineeringStatusBadge,
  EngineeringStoryNav,
} from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import { cx } from "@/shared/lib/cx";
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision, formatI18nTemplate } from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("EngineeringReferencesPage", ko, en);

const RELATION_FILTERS = ["all", "used", "evaluated", "inspired", "alternative"] as const;
type RelationFilter = (typeof RELATION_FILTERS)[number];

const RELATION_STYLES: Record<EngineeringReferenceRelation, string> = {
  used: "border-success/35 bg-success-soft/25 text-success",
  evaluated: "border-warning/35 bg-warning-soft/25 text-warning",
  inspired: "border-accent/35 bg-accent-soft text-accent",
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
  const locale = useEngineeringLocale();

  const [relation, setRelation] = useState<RelationFilter>("all");
  const [query, setQuery] = useState("");
  const search = normalized(query);

  useDocumentTitle(
    bi("ToonStudio 기술 참고 자료와 트러블슈팅", "ToonStudio technical references and troubleshooting"),
  );

  const references = useMemo(
    () => ENGINEERING_REFERENCES.filter((reference) => {
      if (relation !== "all" && reference.relation !== relation) return false;
      if (!search) return true;
      return normalized([
        reference.title,
        bi((reference.category).ko, (reference.category).en),
        bi((reference.summary).ko, (reference.summary).en),
        bi((reference.applied).ko, (reference.applied).en),
        bi((reference.caution).ko, (reference.caution).en),
        ...reference.evidence.map((item) => `${bi((item.label).ko, (item.label).en)} ${item.path}`),
      ].join(" ")).includes(search);
    }),
    [locale, relation, search],
  );

  const troubleshooting = useMemo(
    () => ENGINEERING_TROUBLESHOOTING_CASES.filter((item) => {
      if (!search) return true;
      return normalized([
        bi((item.area).ko, (item.area).en),
        bi((item.title).ko, (item.title).en),
        bi((item.symptom).ko, (item.symptom).en),
        bi((item.wrongTurn).ko, (item.wrongTurn).en),
        bi((item.rootCause).ko, (item.rootCause).en),
        bi((item.resolution).ko, (item.resolution).en),
        bi((item.regression).ko, (item.regression).en),
        bi((item.lesson).ko, (item.lesson).en),
        ...item.evidence.map((entry) => `${bi((entry.label).ko, (entry.label).en)} ${entry.path}`),
      ].join(" ")).includes(search);
    }),
    [locale, search],
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow="REFERENCES · TROUBLESHOOTING"
        title={
          bi("사용한 기술, 참고한 제품과 실패에서 얻은 교훈을 분리해 공개합니다.", "Used technology, product references and lessons from failure are published separately.")
        }
        description={
          bi("설치된 기술과 검토만 한 후보를 같은 말로 소개하지 않습니다. 트러블슈팅 기록은 증상, 잘못된 접근, 실제 원인, 해결, 회귀 검사와 다른 프로젝트에 옮길 교훈까지 연결합니다.", "Installed technology and evaluated candidates are never presented as the same thing. Troubleshooting records connect symptoms, rejected approaches, root causes, fixes, regressions and lessons reusable elsewhere.")
        }
        aside={
          <div className="rounded-3xl border border-warning/30 bg-warning-soft/15 p-5">
            <ShieldCheck size={20} className="text-warning" aria-hidden="true" />
            <p className="mt-4 text-sm font-black text-fg">
              {bi("비교는 영감이지 동등성 주장이 아닙니다.", "A comparison is inspiration, not a parity claim.")}
            </p>
            <p className="mt-2 text-xs leading-6 text-fg-2">
              {bi("기능 동등성은 실제 benchmark, 파일 round-trip과 사용자 흐름 검증이 있을 때만 별도로 주장합니다.", "Feature parity is claimed separately only with benchmarks, file round trips and verified user journeys.")
              }
            </p>
          </div>
        }
      />

      <section aria-labelledby="reference-filter-title">
        <h2 id="reference-filter-title" className="sr-only">
          {bi("참고 자료 검색과 분류", "Search and classify references")}
        </h2>
        <div className="grid gap-3 rounded-3xl border border-line/70 bg-panel/55 p-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center">
          <label className="relative block">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
              aria-hidden="true"
            />
            <span className="sr-only">{bi("기술·제품·오류 검색", "Search technology, products and failures")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={bi("Worker, PWA, Blender, API, 오류 경로 검색", "Search Worker, PWA, Blender, APIs or failure paths")}
              className="min-h-11 w-full rounded-2xl border border-line bg-card py-2.5 pl-10 pr-4 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={bi("참고 관계 필터", "Reference relationship filter")}>
            {RELATION_FILTERS.map((item) => {
              const copy = item === "all"
                ? { ko: "전체", en: "All" }
                : ENGINEERING_REFERENCE_RELATION_META[item].label;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={relation === item}
                  onClick={() => setRelation(item)}
                  className={cx(
                    "min-h-10 rounded-2xl border px-4 py-2 text-xs font-bold transition-colors",
                    relation === item
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-accent",
                  )}
                >
                  {bi((copy).ko, (copy).en)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="reference-products-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-accent">USED · EVALUATED · INSPIRED · ALTERNATIVE</p>
            <h2 id="reference-products-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
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
              <article
                key={reference.id}
                id={reference.id}
                data-reference-card="true"
                className="scroll-mt-28 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={cx(
                    "inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[0.66rem] font-bold",
                    RELATION_STYLES[reference.relation],
                  )}>
                    {bi((ENGINEERING_REFERENCE_RELATION_META[reference.relation].label).ko, (ENGINEERING_REFERENCE_RELATION_META[reference.relation].label).en)}
                  </span>
                  <EngineeringStatusBadge status={reference.status} locale={locale} />
                </div>
                <p className="mt-5 font-display text-[0.66rem] font-black uppercase tracking-[0.15em] text-fg-3">
                  {bi((reference.category).ko, (reference.category).en)}
                </p>
                <h3 className="mt-2 text-xl font-black tracking-tight text-fg sm:text-2xl">{reference.title}</h3>
                <p className="mt-3 text-sm leading-7 text-fg-2">{bi((reference.summary).ko, (reference.summary).en)}</p>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-success/25 bg-success-soft/15 p-4">
                    <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-success">
                      {bi("가져온 원칙", "Applied lesson")}
                    </dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((reference.applied).ko, (reference.applied).en)}</dd>
                  </div>
                  <div className="rounded-2xl border border-warning/25 bg-warning-soft/10 p-4">
                    <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-warning">
                      {bi("과장 방지", "Caution")}
                    </dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((reference.caution).ko, (reference.caution).en)}</dd>
                  </div>
                </dl>

                <details className="group mt-5 rounded-2xl border border-line/70 bg-card/55 open:bg-card/75">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-black text-fg marker:hidden">
                    <span>{bi("저장소 근거", "Repository evidence")}</span>
                    <ArrowRight size={14} className="text-accent transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <ul className="space-y-2 border-t border-line/70 p-4">
                    {reference.evidence.map((item) => {
                      const Icon = EVIDENCE_ICONS[item.kind];
                      return (
                        <li key={`${item.kind}-${item.path}`} className="flex min-w-0 items-start gap-3 rounded-xl bg-panel/75 p-3">
                          <Icon size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-fg">{bi((item.label).ko, (item.label).en)}</p>
                            <code className="mt-1 block overflow-x-auto whitespace-nowrap font-mono text-[0.66rem] text-fg-3">{item.path}</code>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-line-strong bg-card/45 p-8 text-center">
            <Search size={22} className="mx-auto text-fg-3" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-fg">{bi("일치하는 참고 자료가 없습니다.", "No matching references.")}</p>
          </div>
        )}
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="troubleshooting-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-danger">FAILURE → CAUSE → FIX → REGRESSION</p>
            <h2 id="troubleshooting-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bi("재현 가능한 트러블슈팅 아카이브", "Reproducible troubleshooting archive")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
              {bi("단순 해결 팁이 아니라 같은 장애가 다시 생기지 않게 만든 코드·테스트까지 기록합니다. 검색어는 아래 장애 기록에도 적용됩니다.", "These are not isolated tips: each record includes the code or test that prevents the same incident from returning. Search applies here as well.")
              }
            </p>
          </div>
          <span className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg-3">
            {formatI18nTemplate(String(bi("{value0}개 사건", "{value0} incidents")), { value0: troubleshooting.length })}
          </span>
        </div>

        <div className="mt-7 space-y-4">
          {troubleshooting.map((item) => (
            <details
              key={item.id}
              id={item.id}
              className="group scroll-mt-28 rounded-[2rem] border border-line/70 bg-panel/55 shadow-sm open:bg-panel/75"
            >
              <summary className="grid min-h-20 cursor-pointer list-none gap-3 p-5 marker:hidden sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-6">
                <span className="grid size-11 place-items-center rounded-2xl border border-danger/25 bg-danger-soft/15 text-danger">
                  <Bug size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[0.66rem] font-black uppercase tracking-[0.15em] text-fg-3">{bi((item.area).ko, (item.area).en)}</span>
                  <span className="mt-1 block text-lg font-black text-fg sm:text-xl">{bi((item.title).ko, (item.title).en)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <EngineeringStatusBadge status={item.status} locale={locale} />
                  <ArrowRight size={17} className="text-accent transition-transform group-open:rotate-90" aria-hidden="true" />
                </span>
              </summary>

              <div className="border-t border-line/70 p-5 sm:p-6">
                <dl className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-danger/25 bg-danger-soft/10 p-4">
                    <dt className="flex items-center gap-2 text-[0.66rem] font-black uppercase tracking-[0.13em] text-danger">
                      <AlertTriangle size={14} aria-hidden="true" />
                      {bi("증상", "Symptom")}
                    </dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.symptom).ko, (item.symptom).en)}</dd>
                  </div>
                  <div className="rounded-2xl border border-warning/25 bg-warning-soft/10 p-4">
                    <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-warning">{bi("잘못된 접근", "Wrong turn")}</dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.wrongTurn).ko, (item.wrongTurn).en)}</dd>
                  </div>
                  <div className="rounded-2xl border border-line bg-card/65 p-4">
                    <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-fg-3">{bi("실제 원인", "Root cause")}</dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.rootCause).ko, (item.rootCause).en)}</dd>
                  </div>
                  <div className="rounded-2xl border border-accent/25 bg-accent-soft/20 p-4">
                    <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-accent">{bi("해결", "Resolution")}</dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.resolution).ko, (item.resolution).en)}</dd>
                  </div>
                  <div className="rounded-2xl border border-success/25 bg-success-soft/15 p-4">
                    <dt className="flex items-center gap-2 text-[0.66rem] font-black uppercase tracking-[0.13em] text-success">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {bi("회귀 검사", "Regression")}
                    </dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.regression).ko, (item.regression).en)}</dd>
                  </div>
                  <div className="rounded-2xl border border-info/25 bg-info-soft/15 p-4">
                    <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-info">{bi("재사용 교훈", "Transferable lesson")}</dt>
                    <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.lesson).ko, (item.lesson).en)}</dd>
                  </div>
                </dl>

                <ul className="mt-4 grid gap-2 lg:grid-cols-2">
                  {item.evidence.map((entry) => {
                    const Icon = EVIDENCE_ICONS[entry.kind];
                    return (
                      <li key={`${entry.kind}-${entry.path}`} className="flex min-w-0 items-start gap-3 rounded-2xl border border-line/70 bg-card/65 p-4">
                        <Icon size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-fg">{bi((entry.label).ko, (entry.label).en)}</p>
                          <code className="mt-1 block overflow-x-auto whitespace-nowrap font-mono text-[0.66rem] text-fg-3">{entry.path}</code>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>
          ))}
        </div>
      </section>
    </Container>
  );
}
