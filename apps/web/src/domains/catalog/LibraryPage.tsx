import { ChevronRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { LibraryView } from "@/shared/components/library-view";
import { Container } from "@/shared/components/section";
import Link from "@/shared/navigation/router-link";
import { useApp } from "@/shared/lib/store";

const TABS = ["shelf", "rated", "diary", "alerts", "taste", "collections"] as const;

/** "서재 → 취향 분석 → 추천" 3단계 미니 다이어그램 — 서재가 추천으로 이어지는 흐름을 한눈에. */
const JOURNEY_STEPS = [
  { label: "서재에 모으기", desc: "관심 작품 저장·평가", href: "/library" },
  { label: "취향 분석", desc: "나의 취향 스펙트럼 확인", href: "/library?tab=taste" },
  { label: "맞춤 추천", desc: "취향 기반 다음 작품", href: "/recommend" },
] as const;

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const tab = TABS.find((entry) => entry === searchParams.get("tab")) ?? "shelf";
  const loggedIn = useApp((s) => Boolean(s.userId));
  const currentStep = tab === "taste" ? 1 : 0;

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <header className="mb-5 sm:mb-7">
        <p className="eyebrow text-accent">MY LIBRARY</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">내 서재</h1>
        <p className="lede mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          관심 작품과 평가를 모으면, 툰스튜디오이 당신의 취향 스펙트럼을 분석해 다음 작품을 추천합니다.{" "}
          {loggedIn
            ? "서재·평가·컬렉션은 계정에 동기화됩니다. 감상 일기와 이 기기 관찰 이력은 현재 브라우저에 저장됩니다."
            : "비로그인 상태에서는 서재와 감상 기록이 이 브라우저에 저장되며, 로그인하면 서재·평가·컬렉션이 계정에 동기화됩니다."}
        </p>
        <ol aria-label="서재에서 추천까지 3단계" className="mt-5 flex max-w-xl items-stretch">
          {JOURNEY_STEPS.map((step, index) => (
            <li key={step.href} className="flex min-w-0 flex-1 items-stretch">
              <Link
                href={step.href}
                aria-current={index === currentStep ? "step" : undefined}
                className="group flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border border-line bg-card/60 p-2.5 transition-colors hover:border-accent/45 hover:bg-accent-soft/40 sm:p-3"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.72rem] font-bold text-accent"
                  >
                    {index + 1}
                  </span>
                  <span className="truncate text-xs font-bold text-fg sm:text-sm">{step.label}</span>
                </span>
                <span className="pl-[1.875rem] text-[0.68rem] leading-snug text-fg-3 sm:text-xs">
                  {step.desc}
                </span>
              </Link>
              {index < JOURNEY_STEPS.length - 1 && (
                <span aria-hidden="true" className="grid w-5 shrink-0 place-items-center text-fg-3 sm:w-6">
                  <ChevronRight size={14} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </header>
      <LibraryView initialTab={tab} />
    </Container>
  );
}
