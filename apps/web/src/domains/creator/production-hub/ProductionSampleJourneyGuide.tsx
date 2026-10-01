import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { PRODUCTION_SAMPLE_STEPS, type ProductionSampleLocation } from "./production-sample-journey";
import { ProductionSampleBadge } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/**
 * 샘플 프로젝트 체험 안내. 어느 화면에 있든 같은 자리에서
 * "지금 몇 번째 단계인지"와 "다음에 어디로 가면 되는지"를 보여 준다.
 * 진행 위치는 현재 주소에서 계산하므로 따로 저장하지 않는다.
 */
export function ProductionSampleJourneyGuide({ location }: { readonly location: ProductionSampleLocation }) {
  const bt = useBilingual("ProductionSampleJourneyGuide");
  const index = PRODUCTION_SAMPLE_STEPS.findIndex((step) => step.location === location);
  const next = PRODUCTION_SAMPLE_STEPS[index + 1] ?? (index === -1 ? PRODUCTION_SAMPLE_STEPS[0] : undefined);
  return (
    <section
      data-production-sample-journey="true"
      aria-labelledby="production-sample-journey-title"
      className="mb-4 rounded-2xl border border-warn/30 bg-gradient-to-r from-warn/10 via-card to-card p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <ProductionSampleBadge label={bt("샘플 프로젝트", "Sample project")} />
            <h2 id="production-sample-journey-title" className="text-sm font-black text-fg">
              {bt("밤의 우편배달부 12화로 협업 흐름 체험하기", "Try the collaboration flow with episode 12")}
            </h2>
          </div>
          <p className="mt-1 text-[0.6875rem] text-fg-3 sm:hidden">
            {bt("예시 데이터 · 이 브라우저에서만 동작", "Example data · runs only in this browser")}
          </p>
          <p className="mt-1.5 hidden text-xs leading-5 text-fg-2 sm:block">
            {bt(
              "사람·일정·원고는 모두 예시입니다. 서버 없이 이 브라우저에서만 동작하며, 새로고침하면 처음 상태로 돌아갑니다. 내 프로젝트와 섞이지 않습니다.",
              "People, dates and pages are examples. It runs only in this browser without a server, resets on reload and never mixes with your projects.",
            )}
          </p>
        </div>
        {next ? (
          <Link className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })} to={next.href}>
            {index === -1 ? bt("체험 시작", "Start") : bt("다음:", "Next:")} {bt(next.label.ko, next.label.en)}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })} to="/production">
            {bt("체험 끝 · 제작 관리 홈", "Done · Production home")}
          </Link>
        )}
      </div>
      <ol className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={bt("체험 순서", "Tour steps")}>
        {PRODUCTION_SAMPLE_STEPS.map((step, stepIndex) => {
          const Icon = step.icon;
          const current = stepIndex === index;
          const done = index !== -1 && stepIndex < index;
          return (
            <li key={step.id} className="min-w-[9.5rem] flex-1">
              <Link
                to={step.href}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex h-full min-h-11 items-center gap-2 rounded-xl border px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                  current
                    ? "border-accent bg-accent-soft"
                    : done
                      ? "border-good/30 bg-good/10 hover:border-good/60"
                      : "border-line bg-panel/70 hover:border-accent/40",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg text-[0.6875rem] font-black",
                    current ? "bg-accent text-on-accent" : done ? "bg-good/15 text-good" : "bg-raised text-fg-2",
                  )}
                >
                  {current ? <Icon className="size-3.5" aria-hidden="true" /> : stepIndex + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-xs font-bold", current ? "text-accent" : "text-fg")}>
                    {bt(step.label.ko, step.label.en)}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-fg-3">{bt(step.hint.ko, step.hint.en)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default ProductionSampleJourneyGuide;
