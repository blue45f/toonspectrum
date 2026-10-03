import {
  ArrowRight,
  Clock,
  PackageSearch,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { formatTimer } from "../now";
import { RESOURCE_BUTTON } from "../navigation";
import { ACTION_BUTTON, type SessionPreset } from "./config";

/** 선택한 세션 길이의 집중 타이머 — 세션을 바꾸면 `key`로 새로 시작한다. */
export function FocusSprint({ preset }: { preset: SessionPreset }) {
  const [remaining, setRemaining] = useState(preset.seconds);
  const [running, setRunning] = useState(false);
  const elapsedPercent = Math.round(((preset.seconds - remaining) / preset.seconds) * 100);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  function reset() {
    setRunning(false);
    setRemaining(preset.seconds);
  }

  return (
    <section id="focus-sprint" className="scroll-mt-28 rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="focus-sprint-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">FOCUS SPRINT</p>
          <h2 id="focus-sprint-title" className="mt-2 text-xl font-bold text-fg">
            {preset.minutes}분 {preset.label}
          </h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">{preset.start}</p>
        </div>
        <Clock size={22} className="shrink-0 text-fg-3" aria-hidden="true" />
      </div>
      <time
        className="mt-6 block font-display text-5xl font-bold tabular-nums tracking-tight text-fg"
        dateTime={`PT${remaining}S`}
        aria-label={`남은 시간 ${formatTimer(remaining)}`}
      >
        {formatTimer(remaining)}
      </time>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
          style={{ width: `${elapsedPercent}%` }}
        />
      </div>
      {remaining === 0 && (
        <p className="mt-3 font-semibold text-good" role="status">
          스프린트 완료. 가장 읽히는 썸네일 하나를 선택하세요.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className={ACTION_BUTTON}
          onClick={() => setRunning((current) => !current)}
          disabled={remaining === 0}
        >
          {running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {running ? "일시정지" : "집중 시작"}
        </button>
        <button type="button" className={ACTION_BUTTON} onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" /> 타이머 초기화
        </button>
      </div>
    </section>
  );
}

/**
 * 오늘 장면에 필요한 자료만 짧게 찾기 — 사물·공간 레퍼런스와 작품·판본 조사를 오늘의 검색어로 바로 열고,
 * 더 넓은 조사는 리서치 데스크로 잇는다(오늘의 영감 → 리서치 → 제작 동선).
 */
export function ResearchLaunchpad({ assetHref, bookHref }: { assetHref: string; bookHref: string }) {
  const bt = useBilingual("NowResearchLaunchpad");
  const routes = [
    {
      icon: PackageSearch,
      title: bt("사물·공간 레퍼런스", "Objects & places"),
      body: bt("공개 미술 자료에서 오늘의 장면 요소를 찾습니다.", "Find today's scene elements in open art collections."),
      href: assetHref,
      action: bt("창작 자료 검색", "Search references"),
    },
    {
      icon: Sparkles,
      title: bt("작품·판본 리서치", "Works & editions"),
      body: bt("관련 키워드의 작품과 판본 정보를 비교합니다.", "Compare works and editions for related keywords."),
      href: bookHref,
      action: bt("글로벌 판본 검색", "Search editions"),
    },
  ] as const;
  return (
    <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6" aria-labelledby="research-launchpad-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.14em] text-accent">RESEARCH LAUNCHPAD</p>
          <h2 id="research-launchpad-title" className="mt-1 text-xl font-bold text-fg">
            {bt("필요한 자료만 짧게 찾기", "Grab just the references you need")}
          </h2>
          <p className="mt-1 break-keep text-sm leading-6 text-fg-2 max-sm:hidden">
            {bt("오늘의 검색어로 바로 열고, 권리·출처는 각 카드에서 확인하세요.", "Open with today's keywords; check rights and sources on each card.")}
          </p>
        </div>
        <Link className={`${RESOURCE_BUTTON} gap-1.5`} to="/research">
          <Zap size={15} className="text-accent" aria-hidden="true" /> {bt("리서치 데스크 열기", "Open research desk")}
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {routes.map((route) => {
          const Icon = route.icon;
          return (
            <Link
              key={route.href}
              to={route.href}
              className="group flex min-h-11 items-start gap-3 rounded-xl border border-line bg-canvas/60 p-3 transition-colors sm:p-4 hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
            >
              <Icon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0">
                <strong className="block text-sm text-fg">{route.title}</strong>
                <span className="mt-0.5 block break-keep text-sm leading-6 text-fg-2 max-sm:hidden">{route.body}</span>
                <span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-accent">
                  {route.action} <ArrowRight size={14} aria-hidden="true" />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
