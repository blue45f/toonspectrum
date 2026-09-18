import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  KeyRound,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ALL_ENGINEERING_GUIDES as ENGINEERING_GUIDES,
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
import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringGuidesPage", ko, en);

const FILTERS: readonly { readonly id: "all" | EngineeringStatus; readonly ko: string; readonly en: string }[] = [
  { id: "all", ko: "전체", en: "All" },
  { id: "live", ko: "운영", en: "Live" },
  { id: "configured", ko: "설정", en: "Configured" },
  { id: "experimental", ko: "실험", en: "Experimental" },
  { id: "documented", ko: "문서", en: "Documented" },
];

export function EngineeringGuidesPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const guides = filter === "all"
    ? ENGINEERING_GUIDES
    : ENGINEERING_GUIDES.filter((guide) => guide.status === filter);

  useDocumentTitle(
    bi("ToonStudio 기술 적용 가이드 · 다른 프로젝트에서 재사용하기", "ToonStudio implementation guides · Reuse the engineering patterns"),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow="IMPLEMENTATION GUIDES"
        title={
          bi("설명에서 끝내지 않고, 다른 서비스에 옮길 수 있는 단계로 정리했습니다.", "The story is translated into steps another service can actually adopt.")
        }
        description={
          bi("각 가이드는 결과, 구현 순서와 완료 체크리스트를 함께 제공합니다. 코드 예시는 비밀값과 실제 계정 정보를 포함하지 않으며, 공급자 정책과 라이선스는 적용 시점에 다시 검토해야 합니다.", "Each guide includes the intended outcome, implementation order and completion checklist. Examples contain no secrets or real account data, and provider policies and licenses must be reviewed at adoption time.")
        }
        aside={
          <div className="rounded-3xl border border-accent/25 bg-accent-soft/35 p-5">
            <Wrench size={20} className="text-accent" aria-hidden="true" />
            <p className="mt-4 text-sm font-black text-fg">
              {bi("가져가야 하는 것은 패키지가 아니라 경계입니다.", "Reuse boundaries, not just packages.")}
            </p>
            <p className="mt-2 text-xs leading-6 text-fg-2">
              {bi("입력·출력·권위·실패·대체 경로를 유지하면 기술을 바꿔도 제품 계약을 지킬 수 있습니다.", "Preserve inputs, outputs, authority, failure and fallback so the product contract survives technology changes.")
              }
            </p>
          </div>
        }
      />

      <section aria-labelledby="guide-filter-title">
        <h2 id="guide-filter-title" className="sr-only">
          {bi("가이드 상태 필터", "Guide status filters")}
        </h2>
        <div className="flex flex-wrap gap-2 rounded-3xl border border-line/70 bg-panel/55 p-3">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cx(
                "min-h-10 rounded-2xl border px-4 py-2 text-xs font-bold transition-colors",
                filter === item.id
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-accent",
              )}
            >
              {bi((item).ko, (item).en)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-5" aria-live="polite">
        {guides.map((guide) => (
          <article key={guide.id} id={guide.id} className="scroll-mt-28 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7 lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                  <Code2 size={20} aria-hidden="true" />
                </span>
                <EngineeringStatusBadge status={guide.status} locale={locale} />
              </div>
              <span className="rounded-full border border-line bg-card px-3 py-1.5 text-[0.68rem] font-bold text-fg-3">
                {bi("재사용 단위", "Reusable unit")}
              </span>
            </div>

            <div className="mt-6 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <h2 className="text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
                  {bi((guide.title).ko, (guide.title).en)}
                </h2>
                <p className="mt-4 text-sm leading-7 text-fg-2">{bi((guide.summary).ko, (guide.summary).en)}</p>

                <div className="mt-6 rounded-3xl border border-success/30 bg-success-soft/20 p-5">
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-success">
                    <CheckCircle2 size={15} aria-hidden="true" />
                    {bi("완성 결과", "Outcome")}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-fg-2">{bi((guide.outcome).ko, (guide.outcome).en)}</p>
                </div>

                {"code" in guide && guide.code ? (
                  <div className="mt-5 overflow-hidden rounded-3xl border border-line/70 bg-[#101812] text-[#e7f4e5]">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                      <span className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-[#9fc690]">
                        {bi("구조 예시", "Structure example")}
                      </span>
                      <Code2 size={14} aria-hidden="true" />
                    </div>
                    <pre className="overflow-x-auto p-4 text-xs leading-6"><code>{guide.code}</code></pre>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <section aria-labelledby={`${guide.id}-steps-title`}>
                  <h3 id={`${guide.id}-steps-title`} className="text-sm font-black text-fg">
                    {bi("구현 순서", "Implementation sequence")}
                  </h3>
                  <ol className="mt-4 space-y-3">
                    {guide.steps.map((step, index) => (
                      <li key={step.ko} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-card/65 p-4">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">
                          {index + 1}
                        </span>
                        <p className="pt-1 text-xs leading-6 text-fg-2">{bi((step).ko, (step).en)}</p>
                      </li>
                    ))}
                  </ol>
                </section>

                <section aria-labelledby={`${guide.id}-checklist-title`}>
                  <h3 id={`${guide.id}-checklist-title`} className="text-sm font-black text-fg">
                    {bi("완료 체크", "Completion checks")}
                  </h3>
                  <ul className="mt-4 space-y-3">
                    {guide.checklist.map((item) => (
                      <li key={item.ko} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-card/65 p-4">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-success/35 bg-success-soft/20 text-success">
                          <Check size={13} aria-hidden="true" />
                        </span>
                        <p className="text-xs leading-6 text-fg-2">{bi((item).ko, (item).en)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-2" aria-label={bi("중요한 적용 경계", "Important implementation boundaries")}>
        <article className="rounded-[2rem] border border-warning/30 bg-warning-soft/15 p-6 sm:p-7">
          <AlertTriangle size={22} className="text-warning" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black text-fg">
            {bi("Toss 인증을 단순 유료 제외로 설명하지 않습니다.", "Toss authentication is not reduced to a pricing decision.")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-fg-2">
            {bi("현재 허용 공급자는 Google, Apple, Kakao, Naver와 GitHub입니다. Toss는 일반 웹 OAuth 어댑터와 적용 범위·심사·보안 운영 조건이 달라 현재 제품 범위에서 제외하며, 가격 하나만을 이유로 주장하지 않습니다.", "The current allowlist is Google, Apple, Kakao, Naver and GitHub. Toss remains outside the present scope because product, review and security operations differ from a general web OAuth adapter; price alone is not presented as the reason.")}
          </p>
        </article>

        <article className="rounded-[2rem] border border-accent/25 bg-accent-soft/25 p-6 sm:p-7">
          <ShieldCheck size={22} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black text-fg">
            {bi("Testifly는 CI를 대신하지 않습니다.", "Testifly does not replace CI.")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-fg-2">
            {bi("Vitest, Playwright, 성능·보안·라이선스 검사가 merge 판단의 정본입니다. Testifly를 연결할 때는 기능 카탈로그와 수동 피드백을 이해하기 쉽게 보여주는 선택형 포털로만 사용합니다.", "Vitest, Playwright, performance, security and license checks remain authoritative for merge decisions. When connected, Testifly is only an optional portal for understandable feature catalogues and manual feedback.")
            }
          </p>
        </article>
      </section>

      <section className="mt-10 rounded-[2rem] border border-line/70 bg-card/65 p-6 sm:p-8" aria-labelledby="guides-next-title">
        <KeyRound size={23} className="text-accent" aria-hidden="true" />
        <h2 id="guides-next-title" className="mt-4 text-2xl font-black text-fg">
          {bi("공개 예제에는 비밀값을 넣지 않습니다.", "Public examples never contain secrets.")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
          {bi("실제 client secret, API key, 내부 endpoint, 사용자 식별자와 운영 계정 정보는 환경 비밀 저장소에만 보관합니다. 발표 자료에는 변수 이름, 책임 경계와 실패 처리만 남깁니다.", "Real client secrets, API keys, private endpoints, user identifiers and operations accounts stay in environment secret stores. Presentation material contains only variable names, responsibility boundaries and failure handling.")
          }
        </p>
        <Link
          href="/about/technology/licenses"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-panel px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent"
        >
          {bi("라이선스와 권리 점검", "Review licenses and rights")}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>
    </Container>
  );
}
