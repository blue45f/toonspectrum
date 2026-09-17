import {
  ArrowRight,
  CheckCircle2,
  Code2,
  FileCode2,
  FileText,
  GitBranch,
  TestTube2,
  Workflow,
} from "lucide-react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ALL_ENGINEERING_CHAPTERS as ENGINEERING_CHAPTERS,
  ENGINEERING_STATUS_META,
  type EngineeringEvidenceKind,
  type EngineeringStatus,
} from "./engineering-story-content";
import {
  EngineeringPageIntro,
  EngineeringStatusBadge,
  EngineeringStoryNav,
} from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";

const EVIDENCE_ICONS: Record<EngineeringEvidenceKind, typeof Code2> = {
  code: FileCode2,
  test: TestTube2,
  workflow: Workflow,
  document: FileText,
};

const STATUS_ORDER: readonly EngineeringStatus[] = [
  "live",
  "configured",
  "experimental",
  "documented",
  "planned",
];

export function EngineeringStoryPage() {
  const locale = useEngineeringLocale();
  const ko = locale === "ko";

  useDocumentTitle(
    ko
      ? "ToonStudio 제작 기술 스토리 · 문제부터 검증까지"
      : "ToonStudio engineering story · From problem to verification",
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow={`ENGINEERING STORY · ${ENGINEERING_CHAPTERS.length} CHAPTERS`}
        title={
          ko
            ? "기술 이름이 아니라, 문제와 판단의 순서로 설명합니다."
            : "The story follows problems and decisions, not a list of technology names."
        }
        description={
          ko
            ? "각 챕터는 문제, 선택한 경계, 사용자 가치, 포기한 것과 코드·테스트·워크플로 근거를 함께 제공합니다. 운영 경로와 실험, 문서와 설계를 같은 말로 표시하지 않습니다."
            : "Each chapter connects the problem, chosen boundary, user value, tradeoff and evidence in code, tests or workflows. Live, experimental, documented and planned work are never presented as the same thing."
        }
        aside={
          <div className="rounded-3xl border border-line/70 bg-card/70 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-fg-3">
              {ko ? "읽는 방법" : "How to read"}
            </p>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {ko
                ? "요약은 공개 설명이고, 펼친 영역은 세미나·스터디용 깊이입니다. 경로 표시는 실제 근거의 위치를 뜻하며 비밀값은 포함하지 않습니다."
                : "The summary is public-facing; expanded sections provide seminar and study depth. Paths point to evidence locations and never include secrets."
              }
            </p>
          </div>
        }
      />

      <section aria-labelledby="story-status-legend-title">
        <h2 id="story-status-legend-title" className="sr-only">
          {ko ? "상태 범례" : "Status legend"}
        </h2>
        <div className="flex flex-wrap gap-2 rounded-3xl border border-line/70 bg-panel/55 p-4">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="flex items-center gap-2 rounded-2xl bg-card/55 px-2 py-1.5">
              <EngineeringStatusBadge status={status} locale={locale} />
              <span className="hidden text-xs text-fg-3 lg:inline">
                {ENGINEERING_STATUS_META[status].description[locale]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-8 xl:grid-cols-[17rem_minmax(0,1fr)] xl:items-start">
        <aside className="xl:sticky xl:top-24">
          <nav
            aria-label={ko ? "기술 스토리 목차" : "Engineering story table of contents"}
            className="rounded-3xl border border-line/70 bg-panel/70 p-3 shadow-sm"
          >
            <p className="px-3 py-2 font-display text-[0.66rem] font-black uppercase tracking-[0.16em] text-fg-3">
              {ko ? `${ENGINEERING_CHAPTERS.length}개 챕터` : `${ENGINEERING_CHAPTERS.length} chapters`}
            </p>
            <ol className="mt-1 max-h-[65dvh] space-y-0.5 overflow-y-auto overscroll-contain pr-1">
              {ENGINEERING_CHAPTERS.map((chapter) => (
                <li key={chapter.id}>
                  <a
                    href={`#${chapter.id}`}
                    className="group flex min-h-10 items-start gap-2.5 rounded-xl px-3 py-2 text-xs leading-5 text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                  >
                    <span className="mt-0.5 font-display font-black text-accent">
                      {String(chapter.order).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">{chapter.title[locale]}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          {ENGINEERING_CHAPTERS.map((chapter) => (
            <article
              key={chapter.id}
              id={chapter.id}
              className="scroll-mt-28 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7 lg:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.17em] text-accent">
                  {chapter.eyebrow}
                </p>
                <EngineeringStatusBadge status={chapter.status} locale={locale} />
              </div>

              <h2 className="mt-5 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {chapter.title[locale]}
              </h2>
              <p className="mt-4 max-w-4xl text-base leading-8 text-fg-2">
                {chapter.thesis[locale]}
              </p>

              <dl className="mt-7 grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl border border-line/65 bg-card/65 p-5">
                  <dt className="font-display text-[0.66rem] font-black uppercase tracking-[0.15em] text-danger">
                    {ko ? "문제" : "Problem"}
                  </dt>
                  <dd className="mt-3 text-sm leading-7 text-fg-2">{chapter.problem[locale]}</dd>
                </div>
                <div className="rounded-3xl border border-line/65 bg-card/65 p-5">
                  <dt className="font-display text-[0.66rem] font-black uppercase tracking-[0.15em] text-accent">
                    {ko ? "선택" : "Decision"}
                  </dt>
                  <dd className="mt-3 text-sm leading-7 text-fg-2">{chapter.decision[locale]}</dd>
                </div>
                <div className="rounded-3xl border border-line/65 bg-card/65 p-5">
                  <dt className="font-display text-[0.66rem] font-black uppercase tracking-[0.15em] text-success">
                    {ko ? "사용자 가치" : "User value"}
                  </dt>
                  <dd className="mt-3 text-sm leading-7 text-fg-2">{chapter.userValue[locale]}</dd>
                </div>
                <div className="rounded-3xl border border-line/65 bg-card/65 p-5">
                  <dt className="font-display text-[0.66rem] font-black uppercase tracking-[0.15em] text-warning">
                    {ko ? "대가와 한계" : "Tradeoff"}
                  </dt>
                  <dd className="mt-3 text-sm leading-7 text-fg-2">{chapter.tradeoff[locale]}</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-2" aria-label={ko ? "관련 기술" : "Related technologies"}>
                {chapter.technologies.map((technology) => (
                  <span
                    key={technology}
                    className="rounded-full border border-line bg-card/75 px-3 py-1.5 font-display text-[0.68rem] font-semibold text-fg-2"
                  >
                    {technology}
                  </span>
                ))}
              </div>

              <details className="group mt-7 rounded-3xl border border-line/70 bg-card/45 open:bg-card/70">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-sm font-bold text-fg marker:hidden">
                  <span className="flex items-center gap-2">
                    <GitBranch size={17} className="text-accent" aria-hidden="true" />
                    {ko ? "근거와 다른 프로젝트 적용 순서" : "Evidence and reuse sequence"}
                  </span>
                  <span className="text-accent transition-transform group-open:rotate-90" aria-hidden="true">
                    <ArrowRight size={16} />
                  </span>
                </summary>
                <div className="grid gap-6 border-t border-line/70 p-5 lg:grid-cols-2">
                  <section aria-labelledby={`${chapter.id}-evidence-title`}>
                    <h3 id={`${chapter.id}-evidence-title`} className="text-sm font-black text-fg">
                      {ko ? "확인 가능한 근거" : "Inspectable evidence"}
                    </h3>
                    <ul className="mt-4 space-y-3">
                      {chapter.evidence.map((item) => {
                        const Icon = EVIDENCE_ICONS[item.kind];
                        return (
                          <li key={`${item.kind}-${item.path}`} className="rounded-2xl border border-line/65 bg-panel/65 p-4">
                            <div className="flex items-start gap-3">
                              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                                <Icon size={15} aria-hidden="true" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-fg">{item.label[locale]}</p>
                                <code className="mt-2 block overflow-x-auto whitespace-nowrap font-mono text-[0.68rem] text-fg-3">
                                  {item.path}
                                </code>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <section aria-labelledby={`${chapter.id}-reuse-title`}>
                    <h3 id={`${chapter.id}-reuse-title`} className="text-sm font-black text-fg">
                      {ko ? "다른 프로젝트에 적용" : "Apply in another project"}
                    </h3>
                    <ol className="mt-4 space-y-3">
                      {chapter.reuseSteps.map((step, index) => (
                        <li key={step.ko} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-4">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">
                            {index + 1}
                          </span>
                          <p className="pt-0.5 text-xs leading-6 text-fg-2">{step[locale]}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              </details>
            </article>
          ))}
        </div>
      </div>

      <section className="mt-12 rounded-[2rem] border border-accent/25 bg-accent-soft/35 p-6 sm:p-8" aria-labelledby="story-next-title">
        <CheckCircle2 size={24} className="text-accent" aria-hidden="true" />
        <h2 id="story-next-title" className="mt-4 text-2xl font-black tracking-tight text-fg">
          {ko ? "읽은 내용을 바로 구현 기준으로 바꾸세요." : "Turn the story into an implementation checklist."}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
          {ko
            ? "가이드 페이지에서는 로그인, 저장, 브러시, 성능, 데이터 수집, 품질, 인프라와 AI를 독립적으로 가져갈 수 있는 단계와 점검 항목을 제공합니다."
            : "The guides page turns authentication, storage, brushes, performance, acquisition, quality, infrastructure and AI into reusable steps and checks."
          }
        </p>
        <Link
          href="/about/technology/guides"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
        >
          {ko ? "적용 가이드 열기" : "Open implementation guides"}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>
    </Container>
  );
}
