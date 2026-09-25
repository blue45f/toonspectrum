import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Clock3,
  Handshake,
  Image,
  PackageCheck,
  PanelsTopLeft,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/shared/lib/utils";

const STORAGE_KEY = "toonstudio:production-sample-journey:v1";

const STEPS = [
  {
    id: "brief",
    label: "작품 브리프 확인",
    description: "독자·장르·한 줄 소개와 지켜야 할 기준을 확인합니다.",
    href: "/production/projects/sample-project/planning",
    minutes: 1,
    icon: BookOpenText,
  },
  {
    id: "episode",
    label: "회차·컷 흐름 보기",
    description: "12화의 장면과 컷이 제작 공정으로 어떻게 이어지는지 봅니다.",
    href: "/production/projects/sample-project/episodes",
    minutes: 2,
    icon: PanelsTopLeft,
  },
  {
    id: "manuscript",
    label: "원고와 버전 비교",
    description: "콘티·선화·채색·통합본의 정본과 피드백을 확인합니다.",
    href: "/production/projects/sample-project/manuscripts",
    minutes: 2,
    icon: Image,
  },
  {
    id: "handoff",
    label: "작업 넘기기 확인",
    description: "다음 작업자가 지킬 내용과 차단 질문을 분리해 확인합니다.",
    href: "/production/projects/sample-project/handoff",
    minutes: 1,
    icon: Handshake,
  },
  {
    id: "review",
    label: "검수·수정 흐름",
    description: "수정 요청, 승인 기준과 게시를 막는 의견을 확인합니다.",
    href: "/production/projects/sample-project/review",
    minutes: 2,
    icon: BadgeCheck,
  },
  {
    id: "delivery",
    label: "권리·출고 준비",
    description: "크레딧·권리·보상과 최종 전달 조건을 점검합니다.",
    href: "/production/projects/sample-project/rights",
    minutes: 2,
    icon: PackageCheck,
  },
] as const;

const TOTAL_MINUTES = STEPS.reduce((sum, step) => sum + step.minutes, 0);

function readProgress(): number {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number.parseInt(window.sessionStorage.getItem(STORAGE_KEY) ?? "0", 10);
    return Number.isFinite(value) ? Math.min(STEPS.length, Math.max(0, value)) : 0;
  } catch {
    return 0;
  }
}

export function ProductionSampleJourneyGuide() {
  const [progress, setProgress] = useState(readProgress);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(progress));
    } catch {
      // Session progress remains available in memory when storage is blocked.
    }
  }, [progress]);

  const nextStep = STEPS[Math.min(progress, STEPS.length - 1)]!;
  const complete = progress >= STEPS.length;

  return (
    <section
      data-production-sample-journey="true"
      className="relative mb-4 overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft via-card to-panel p-4 shadow-lg sm:p-5"
      aria-labelledby="production-sample-journey-title"
    >
      <span aria-hidden="true" className="absolute -right-16 -top-20 size-56 rounded-full border border-accent/20" />
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/30 bg-card px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] text-accent">
              10 MIN SAMPLE
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-fg-3">
              <Clock3 size={14} aria-hidden="true" /> 약 {TOTAL_MINUTES}분
            </span>
          </div>
          <h2 id="production-sample-journey-title" className="mt-3 font-display text-xl font-black tracking-[-0.035em] text-fg sm:text-2xl">
            밤의 우편배달부 12화를 따라 제작 전 과정을 확인하세요
          </h2>
          <p className="mt-2 text-xs leading-6 text-fg-2 sm:text-sm">
            기능 이름을 외우지 않아도 됩니다. 브리프에서 출고까지 실제 샘플 데이터로 이동하며 각 단계의 결과를 확인합니다. 샘플은 내 프로젝트와 분리됩니다.
          </p>
        </div>
        <div className="flex min-w-[14rem] flex-col gap-2 rounded-2xl border border-line bg-panel/75 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-fg-2">진행 {progress}/{STEPS.length}</span>
            <span className="text-fg-3">{Math.round((progress / STEPS.length) * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-raised" aria-hidden="true">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width]" style={{ width: `${(progress / STEPS.length) * 100}%` }} />
          </div>
          {complete ? (
            <button
              type="button"
              onClick={() => setProgress(0)}
              className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl border border-good/35 bg-good/10 px-4 text-xs font-black text-good"
            >
              다시 둘러보기
            </button>
          ) : (
            <Link
              to={nextStep.href}
              onClick={() => setProgress((current) => Math.min(STEPS.length, current + 1))}
              className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-on-accent hover:bg-accent-2"
            >
              {progress === 0 ? "샘플 제작 흐름 시작" : "다음 단계 열기"}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      <ol className="relative mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {STEPS.map((step, index) => {
          const done = index < progress;
          const active = index === progress && !complete;
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <Link
                to={step.href}
                onClick={() => setProgress((current) => Math.max(current, index + 1))}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex h-full min-h-32 flex-col rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm",
                  done
                    ? "border-good/30 bg-good/10"
                    : active
                      ? "border-accent/45 bg-card shadow-sm"
                      : "border-line bg-panel/65 hover:border-accent/30",
                )}
              >
                <span className={cn(
                  "grid size-9 place-items-center rounded-xl border",
                  done ? "border-good/30 bg-good/10 text-good" : active ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-card text-fg-3",
                )}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <strong className="mt-3 text-xs font-black leading-5 text-fg">{index + 1}. {step.label}</strong>
                <span className="mt-1 line-clamp-2 text-[0.68rem] leading-5 text-fg-3">{step.description}</span>
                <span className="mt-auto pt-2 text-[0.62rem] font-bold text-accent">{step.minutes}분 · 열기</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default ProductionSampleJourneyGuide;
