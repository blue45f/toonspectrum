import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
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

import { formatTimer } from "../now";
import { RESOURCE_BUTTON } from "../navigation";
import { ACTION_BUTTON, type SessionPreset } from "./config";

function FocusSprint({ preset }: { preset: SessionPreset }) {
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
    <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="focus-sprint-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">{translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "en", "FOCUS SPRINT")}</p>
          <h2 id="focus-sprint-title" className="mt-2 text-xl font-bold text-fg">
            {preset.minutes}{translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "분 ")}{preset.label}
          </h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">{preset.start}</p>
        </div>
        <Clock size={22} className="shrink-0 text-fg-3" aria-hidden="true" />
      </div>
      <time
        className="mt-6 block font-display text-5xl font-bold tabular-nums tracking-tight text-fg"
        dateTime={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "en", "PT{v0}S"), { v0: String(remaining) })}
        aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "남은 시간 {v0}"), { v0: String(formatTimer(remaining)) })}
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
          {translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "스프린트 완료. 가장 읽히는 썸네일 하나를 선택하세요.")}</p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className={ACTION_BUTTON}
          onClick={() => setRunning((current) => !current)}
          disabled={remaining === 0}
        >
          {running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {running ? translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "일시정지") : translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "집중 시작")}
        </button>
        <button type="button" className={ACTION_BUTTON} onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "타이머 초기화")}</button>
      </div>
    </section>
  );
}

function ResearchLaunchpad({ assetHref, bookHref }: { assetHref: string; bookHref: string }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="research-launchpad-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">{translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "en", "RESEARCH LAUNCHPAD")}</p>
          <h2 id="research-launchpad-title" className="mt-2 text-xl font-bold text-fg">
            {translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "필요한 자료만 짧게 찾기")}</h2>
        </div>
        <Zap size={20} className="text-accent" aria-hidden="true" />
      </div>
      <p className="mt-2 text-sm leading-7 text-fg-2">
        {translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "탐색이 제작을 대신하지 않도록 사물·공간과 작품 조사 경로를 분리했습니다. 외부 자료의 권리와 출처는 각 카드에서 확인하세요.")}</p>
      <div className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
        <article>
          <PackageSearch size={18} className="text-accent" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "사물·공간 레퍼런스")}</h3>
          <p className="mt-1 text-xs leading-5 text-fg-3">{translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "공개 미술 자료에서 오늘의 장면 요소를 찾습니다.")}</p>
          <Link className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "en", "{v0} mt-4"), { v0: String(RESOURCE_BUTTON) })} to={assetHref}>
            {translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "창작 자료 검색 ")}<ArrowRight size={14} aria-hidden="true" />
          </Link>
        </article>
        <article>
          <Sparkles size={18} className="text-accent" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "작품·판본 리서치")}</h3>
          <p className="mt-1 text-xs leading-5 text-fg-3">{translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "관련 키워드의 작품과 판본 메타데이터를 비교합니다.")}</p>
          <Link className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "en", "{v0} mt-4"), { v0: String(RESOURCE_BUTTON) })} to={bookHref}>
            {translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "글로벌 판본 검색 ")}<ArrowRight size={14} aria-hidden="true" />
          </Link>
        </article>
      </div>
      <Link className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "en", "{v0} mt-5"), { v0: String(RESOURCE_BUTTON) })} to="/research">
        {translateCurrentStaticSourceText("domains.creator.resources.now.page.NowFocusResearch", "ko", "연구 보드 전체 열기")}</Link>
    </section>
  );
}

export function NowFocusResearch({
  sessionPreset,
  assetHref,
  bookHref,
}: {
  sessionPreset: SessionPreset;
  assetHref: string;
  bookHref: string;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <FocusSprint key={sessionPreset.id} preset={sessionPreset} />
      <ResearchLaunchpad assetHref={assetHref} bookHref={bookHref} />
    </section>
  );
}
