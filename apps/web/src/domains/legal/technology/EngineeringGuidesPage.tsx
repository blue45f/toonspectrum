import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  KeyRound,
  ListOrdered,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useState } from "react";

import { ENGINEERING_REUSE_BLUEPRINTS } from "./engineering-playbook-content";
import { PUBLISHED_ENGINEERING_GUIDES as ENGINEERING_GUIDES } from "./engineering-story-published-content";
import type { EngineeringGuide, EngineeringStatus } from "./engineering-story-content";
import {
  EngineeringDisclosure,
  EngineeringKeySummary,
  EngineeringLongformLayout,
  EngineeringMetaChip,
  type EngineeringTocGroup,
} from "./EngineeringLongform";
import {
  EngineeringPageFrame,
  EngineeringPageIntro,
  EngineeringStatusBadge,
} from "./EngineeringStoryUi";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringGuidesPage", ko, en);

const BODY_ID = "engineering-guides-body";

type GuideFilter = "all" | EngineeringStatus;

const FILTERS: readonly { readonly id: GuideFilter; readonly ko: string; readonly en: string }[] = [
  { id: "all", ko: "전체", en: "All" },
  { id: "live", ko: "운영", en: "Live" },
  { id: "configured", ko: "설정", en: "Configured" },
  { id: "experimental", ko: "실험", en: "Experimental" },
  { id: "documented", ko: "문서", en: "Documented" },
];

function GuideArticle({ guide }: { readonly guide: EngineeringGuide }) {
  useBilingualI18nRevision();
  return (
    <article id={guide.id} className="scroll-mt-32 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
          <Code2 size={20} aria-hidden="true" />
        </span>
        <EngineeringStatusBadge status={guide.status} />
      </div>
      <h3 className="mt-5 text-balance break-keep text-2xl font-black tracking-tight text-fg">{bi(guide.title.ko, guide.title.en)}</h3>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-fg-2">{bi(guide.summary.ko, guide.summary.en)}</p>
      <p className="mt-4 flex items-start gap-2 rounded-2xl border border-good/30 bg-good/10 px-4 py-3 text-sm leading-7 text-fg-2">
        <CheckCircle2 size={16} className="mt-1.5 shrink-0 text-good" aria-hidden="true" />
        <span><strong className="mr-1 text-fg">{bi("완성 결과", "Outcome")}</strong>{bi(guide.outcome.ko, guide.outcome.en)}</span>
      </p>
      <EngineeringDisclosure
        className="mt-5"
        summary={(
          <>
            <ListOrdered size={16} className="shrink-0 text-accent" aria-hidden="true" />
            <span>
              {formatI18nTemplate(String(bi("구현 순서 {value0}단계 · 완료 체크 {value1}개", "{value0} steps · {value1} checks")), {
                value0: guide.steps.length,
                value1: guide.checklist.length,
              })}
            </span>
          </>
        )}
      >
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section aria-labelledby={`${guide.id}-steps-title`}>
            <h4 id={`${guide.id}-steps-title`} className="text-sm font-black text-fg">{bi("구현 순서", "Implementation sequence")}</h4>
            <ol className="mt-3 grid gap-2.5">
              {guide.steps.map((step, index) => (
                <li key={step.ko} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-card/65 p-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">{index + 1}</span>
                  <span className="pt-1 text-xs leading-6 text-fg-2">{bi(step.ko, step.en)}</span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby={`${guide.id}-checklist-title`}>
            <h4 id={`${guide.id}-checklist-title`} className="text-sm font-black text-fg">{bi("완료 체크", "Completion checks")}</h4>
            <ul className="mt-3 grid gap-2.5">
              {guide.checklist.map((item) => (
                <li key={item.ko} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-card/65 p-3.5">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-good/35 bg-good/12 text-good">
                    <Check size={13} aria-hidden="true" />
                  </span>
                  <span className="text-xs leading-6 text-fg-2">{bi(item.ko, item.en)}</span>
                </li>
              ))}
            </ul>
            {guide.code ? (
              <figure className="eng-code mt-4 overflow-hidden rounded-2xl">
                <figcaption className="eng-code__header flex items-center justify-between px-4 py-2.5">
                  <span className="eng-code__label font-display text-[0.64rem] font-bold uppercase tracking-[0.15em]">{bi("구조 예시", "Structure example")}</span>
                  <Code2 size={14} aria-hidden="true" />
                </figcaption>
                <pre className="overflow-x-auto p-4 text-xs leading-6"><code>{guide.code}</code></pre>
              </figure>
            ) : null}
          </section>
        </div>
      </EngineeringDisclosure>
    </article>
  );
}

export function EngineeringGuidesPage() {
  useBilingualI18nRevision();
  const [filter, setFilter] = useState<GuideFilter>("all");
  const guides: readonly EngineeringGuide[] = filter === "all"
    ? ENGINEERING_GUIDES
    : ENGINEERING_GUIDES.filter((guide) => guide.status === filter);

  useDocumentTitle(
    bi("ToonStudio 기술 적용 가이드 · 다른 서비스에 옮기기", "ToonStudio implementation guides · Adopting the patterns elsewhere"),
  );

  const tocGroups: readonly EngineeringTocGroup[] = [
    { id: "start", items: [{ id: "blueprints", label: bi("시작 전: 재사용 청사진", "Before you start: reuse blueprints") }] },
    {
      id: "guides",
      label: formatI18nTemplate(String(bi("가이드 {value0}개", "{value0} guides")), { value0: guides.length }),
      items: guides.map((guide, index) => ({
        id: guide.id,
        label: bi(guide.title.ko, guide.title.en),
        marker: String(index + 1).padStart(2, "0"),
      })),
    },
    { id: "boundaries-group", items: [{ id: "boundaries", label: bi("적용할 때 지킬 경계", "Boundaries to keep") }] },
  ];

  return (
    <EngineeringPageFrame pageId="guides">
      <EngineeringPageIntro
        pageId="guides"
        eyebrow="IMPLEMENTATION GUIDES"
        title={bi("다른 서비스에 옮길 수 있는 단계로 정리했습니다.", "Steps another service can actually adopt.")}
        description={bi(
          "먼저 재사용 청사진으로 첫 경계와 첫 완료 기준을 정하고, 가이드마다 완성 결과 → 구현 순서 → 완료 체크 순서로 따라 합니다.",
          "Start with a reuse blueprint to pick the first boundary and milestone, then follow each guide from outcome to steps to completion checks.",
        )}
      />

      <EngineeringKeySummary
        points={[
          bi("가져가야 하는 것은 패키지가 아니라 경계입니다. 입력·출력·권위·실패·대체 경로를 유지하면 기술이 바뀌어도 계약은 지켜집니다.", "Reuse boundaries, not packages: keep inputs, outputs, authority, failure and fallback and the contract survives technology changes."),
          bi("재사용 청사진 여섯 가지에서 서비스 유형에 맞는 첫 경계·첫 완료·장애 훈련을 고릅니다.", "Pick the first boundary, milestone and failure drill for your product type from six blueprints."),
          bi("상태 필터로 운영 중인 가이드만 골라 볼 수 있고, 각 가이드는 펼쳐서 구현 순서와 완료 체크를 봅니다.", "Filter to live guides only, and expand each guide for its steps and completion checks."),
          bi("예제에는 비밀값·실제 계정을 넣지 않고, 공급자 정책과 라이선스는 적용 시점에 다시 확인합니다.", "Examples contain no secrets or real accounts; recheck provider policies and licenses at adoption time."),
        ]}
        meta={(
          <>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("청사진 {value0}", "{value0} blueprints")), { value0: ENGINEERING_REUSE_BLUEPRINTS.length })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("가이드 {value0}", "{value0} guides")), { value0: ENGINEERING_GUIDES.length })}</EngineeringMetaChip>
          </>
        )}
      />

      <EngineeringLongformLayout groups={tocGroups} bodyId={BODY_ID} tocLabel={bi("적용 가이드 목차", "Implementation guide contents")}>
        <div className="grid gap-14">
          <section id="blueprints" aria-labelledby="guides-blueprints-title" className="grid gap-5">
            <header className="grid gap-3">
              <p className="eyebrow text-accent">REUSE BLUEPRINTS</p>
              <h2 id="guides-blueprints-title" className="max-w-4xl text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {bi("시작 전: 서비스 유형별 첫 경계·첫 완료·장애 훈련", "Before you start: first boundary, milestone and failure drill by product type")}
              </h2>
            </header>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {ENGINEERING_REUSE_BLUEPRINTS.map((blueprint) => (
                <article key={blueprint.id} className="rounded-[2rem] border border-line/70 bg-card/65 p-5 shadow-sm">
                  <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
                    <Workflow size={18} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-black text-fg">{bi(blueprint.title.ko, blueprint.title.en)}</h3>
                  <p className="mt-2 text-sm leading-7 text-fg-2">{bi(blueprint.useWhen.ko, blueprint.useWhen.en)}</p>
                  <dl className="mt-4 grid gap-2.5 text-xs leading-6">
                    {([
                      [bi("첫 경계", "First boundary"), blueprint.firstBoundary],
                      [bi("첫 완료", "First milestone"), blueprint.firstMilestone],
                      [bi("장애 훈련", "Failure drill"), blueprint.failureDrill],
                      [bi("완료 증거", "Done evidence"), blueprint.doneEvidence],
                    ] as const).map(([term, value]) => (
                      <div key={term} className="rounded-2xl border border-line/60 bg-panel/65 p-3">
                        <dt className="font-black text-accent">{term}</dt>
                        <dd className="mt-1 text-fg-2">{bi(value.ko, value.en)}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="guides-list-title" className="grid gap-5">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div className="grid gap-3">
                <p className="eyebrow text-accent">GUIDES</p>
                <h2 id="guides-list-title" className="text-2xl font-black tracking-tight text-fg sm:text-3xl">
                  {bi("기능별 적용 가이드", "Guides by capability")}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={bi("가이드 상태 필터", "Guide status filters")}>
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                    className={cx(
                      "min-h-11 rounded-2xl border px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      filter === item.id
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-accent",
                    )}
                  >
                    {bi(item.ko, item.en)}
                  </button>
                ))}
              </div>
            </header>
            <p className="text-xs text-fg-3" role="status">
              {formatI18nTemplate(String(bi("{value0}개 / 전체 {value1}개 가이드", "{value0} of {value1} guides")), { value0: guides.length, value1: ENGINEERING_GUIDES.length })}
            </p>
            {guides.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-line-strong bg-card/45 p-8 text-center text-sm text-fg-2">
                {bi("이 상태의 가이드가 없습니다. ‘전체’를 선택해 보세요.", "No guides have this status. Try ‘All’.")}
              </p>
            ) : (
              guides.map((guide) => <GuideArticle key={guide.id} guide={guide} />)
            )}
          </section>

          <section id="boundaries" aria-label={bi("중요한 적용 경계", "Important implementation boundaries")} className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-[2rem] border border-warn/30 bg-warn/8 p-6">
              <AlertTriangle size={22} className="text-warn" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-black text-fg">{bi("Toss 인증을 단순 유료 제외로 설명하지 않습니다.", "Toss authentication is not reduced to a pricing decision.")}</h2>
              <p className="mt-3 text-sm leading-7 text-fg-2">
                {bi("현재 허용 공급자는 Google, Apple, Kakao, Naver와 GitHub입니다. Toss는 일반 웹 OAuth 어댑터와 적용 범위·심사·보안 운영 조건이 달라 현재 제품 범위에서 제외하며, 가격 하나만을 이유로 주장하지 않습니다.", "The current allowlist is Google, Apple, Kakao, Naver and GitHub. Toss remains outside the present scope because product, review and security operations differ from a general web OAuth adapter; price alone is not presented as the reason.")}
              </p>
            </article>
            <article className="rounded-[2rem] border border-accent/25 bg-accent-soft/20 p-6">
              <ShieldCheck size={22} className="text-accent" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-black text-fg">{bi("Testifly는 CI를 대신하지 않습니다.", "Testifly does not replace CI.")}</h2>
              <p className="mt-3 text-sm leading-7 text-fg-2">
                {bi("Vitest, Playwright, 성능·보안·라이선스 검사가 병합 판단의 정본입니다. Testifly를 연결할 때는 기능 카탈로그와 수동 피드백을 이해하기 쉽게 보여주는 선택형 포털로만 사용합니다.", "Vitest, Playwright, performance, security and license checks remain authoritative for merge decisions. When connected, Testifly is only an optional portal for understandable feature catalogues and manual feedback.")}
              </p>
            </article>
            <article className="rounded-[2rem] border border-line/70 bg-card/65 p-6">
              <KeyRound size={22} className="text-accent" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-black text-fg">{bi("공개 예제에는 비밀값을 넣지 않습니다.", "Public examples never contain secrets.")}</h2>
              <p className="mt-3 text-sm leading-7 text-fg-2">
                {bi("실제 client secret, API key, 내부 endpoint, 사용자 식별자와 운영 계정 정보는 환경 비밀 저장소에만 보관합니다. 발표 자료에는 변수 이름, 책임 경계와 실패 처리만 남깁니다.", "Real client secrets, API keys, private endpoints, user identifiers and operations accounts stay in environment secret stores. Presentation material contains only variable names, responsibility boundaries and failure handling.")}
              </p>
              <Link
                href="/about/technology/licenses"
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent hover:underline"
              >
                {bi("라이선스와 권리 점검", "Review licenses and rights")}
              </Link>
            </article>
          </section>
        </div>
      </EngineeringLongformLayout>
    </EngineeringPageFrame>
  );
}
