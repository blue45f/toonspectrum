import { useMemo } from "react";

import {
  drawMonthlyFortune,
  drawYearlyFortune,
  type MonthlyFortune,
  type TodayCategoryScores,
  type YearlyFortune,
} from "@toonstudio/core";
import { getCurrentUiLocale, translateAuthoredSourceText } from "@/shared/lib/i18n-bilingual-copy";

import { FortuneReveal } from "./FortuneReveal";
import { FortuneVoiceNarration } from "./FortuneVoiceNarration";

// 월간/연간 운세 패널 — 백엔드 API 없이 @toonstudio/core로 클라이언트에서 직접 계산.
// 명리 규칙(월운·세운) 기반이므로 같은 생년월일·같은 기간에는 항상 같은 결과.

export interface FortunePeriodPanelProps {
  kind: "monthly" | "yearly";
  birthDate: string;
  birthTime?: string;
  characterId?: string;
}

type Tx = (source: string) => string;

const CATEGORY_META = [
  { key: "love", ko: "애정운", en: "Love", emoji: "💕" },
  { key: "money", ko: "금전운", en: "Money", emoji: "💰" },
  { key: "work", ko: "직장운", en: "Work", emoji: "💼" },
  { key: "health", ko: "건강운", en: "Health", emoji: "🌿" },
] as const;

function CategoryBars({ scores, tx }: { scores: TodayCategoryScores; tx: Tx }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CATEGORY_META.map(({ key, ko, en, emoji }) => {
        const v = scores[key] ?? 0;
        return (
          <div key={key} className="rounded-xl border border-line/45 bg-card/20 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold text-fg-2">{emoji} {tx(ko)}</span>
              <span className="text-sm font-extrabold text-fg">{v}<span className="text-[10px] font-semibold text-fg-3">{tx("점")}</span></span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/40" aria-hidden="true">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-pink-500 to-amber-400"
                style={{ width: `${v}%` }}
              />
            </div>
            <span className="sr-only">{`${en}: ${v}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function ResultVoiceButton({ text, characterId }: { text: string; characterId?: string }) {
  return (
    <FortuneVoiceNarration
      text={text}
      characterId={characterId}
      className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:text-fg"
    />
  );
}

function PeriodErrorState({ tx, onRetry }: { tx: Tx; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-sm space-y-4 rounded-2xl border border-line bg-card/30 p-6 text-center">
      {/* 흐린 달 일러스트 */}
      <svg viewBox="0 0 80 80" className="mx-auto h-16 w-16 opacity-60" role="img" aria-label={tx("구름에 가린 달")}>
        <circle cx="40" cy="40" r="22" fill="#fbbf24" opacity="0.25" />
        <path d="M18 52 Q40 30 62 52 Q50 44 40 48 Q30 44 18 52" fill="#64748b" opacity="0.7" />
        <path d="M22 58 Q40 40 58 58" fill="none" stroke="#64748b" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
      </svg>
      <div className="space-y-1">
        <p className="text-sm font-bold text-fg">{tx("운세를 계산하지 못했어요")}</p>
        <p className="text-xs leading-relaxed text-fg-2">
          {tx("생년월일이 올바른지 확인해 주세요. 날짜를 다시 입력하면 바로 다시 계산해 드려요.")}
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-accent px-5 py-2.5 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2"
        >
          {tx("생년월일 다시 입력하기")}
        </button>
      )}
    </div>
  );
}

function MonthlyResultView({ result, characterId, tx, locale }: { result: MonthlyFortune; characterId?: string; tx: Tx; locale: string }) {
  const m = result;
  const summary = locale.startsWith("ko") ? m.summaryKo : m.summaryEn;
  return (
    <FortuneReveal score={m.monthLuck.score} label={tx("이달의 운세 지수")}>
      <div className="space-y-4 px-1 pb-2">
        <div className="rounded-xl border border-line/45 bg-card/20 p-4 text-left">
          <p className="text-sm font-bold text-fg">
            {m.year}{tx("년")} {m.month}{tx("월")} · {m.monthLuck.pillar}{tx("월")} — {m.monthLuck.themeName}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">{m.monthLuck.themeFocus}</p>
          <p className="mt-2 text-[11px] text-fg-3">
            {tx("일간")}: {m.dayMaster} · {tx("월간지와의 관계")}: {m.monthLuck.relationTenGod}
          </p>
        </div>
        <CategoryBars scores={m.categories} tx={tx} />
        <p className="text-xs leading-relaxed text-fg-2">{summary}</p>
        <ResultVoiceButton text={summary} characterId={characterId} />
      </div>
    </FortuneReveal>
  );
}

function YearlyResultView({ result, characterId, tx, locale }: { result: YearlyFortune; characterId?: string; tx: Tx; locale: string }) {
  const y = result;
  const summary = locale.startsWith("ko") ? y.summaryKo : y.summaryEn;
  const best = y.months.find((mm) => mm.month === y.bestMonth);
  const caution = y.months.find((mm) => mm.month === y.cautionMonth);
  return (
    <FortuneReveal score={y.score} label={tx("올해의 운세 지수")}>
      <div className="space-y-4 px-1 pb-2">
        <div className="rounded-xl border border-line/45 bg-card/20 p-4 text-left">
          <p className="text-sm font-bold text-fg">
            {y.year}{tx("년")} · {y.yearPillar}{tx("년")} — {y.themeName}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">{y.themeFocus}</p>
          <p className="mt-2 text-[11px] text-fg-3">
            {tx("일간")}: {y.dayMaster} · {tx("세운 관계")}: {y.relationTenGod}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-[11px] font-bold text-emerald-400">🌟 {tx("최고의 달")}</p>
            <p className="mt-1 text-lg font-extrabold text-fg">{y.bestMonth}{tx("월")}</p>
            <p className="text-[11px] text-fg-3">{best?.pillar}{tx("월")} · {best?.score}{tx("점")}</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[11px] font-bold text-amber-400">⚠️ {tx("주의할 달")}</p>
            <p className="mt-1 text-lg font-extrabold text-fg">{y.cautionMonth}{tx("월")}</p>
            <p className="text-[11px] text-fg-3">{caution?.pillar}{tx("월")} · {caution?.score}{tx("점")}</p>
          </div>
        </div>
        <div className="rounded-xl border border-line/45 bg-card/20 p-4">
          <p className="mb-3 text-[11px] font-bold text-fg-2">📊 {tx("월별 흐름")}</p>
          <div className="flex items-end gap-1" role="img" aria-label={tx("월별 운세 흐름 차트")}>
            {y.months.map((mm) => {
              const h = Math.max(8, Math.round(((mm.score - 50) / 50) * 72));
              const hot = mm.month === y.bestMonth;
              const cold = mm.month === y.cautionMonth;
              return (
                <div key={mm.month} className="flex flex-1 flex-col items-center gap-1" title={`${mm.month}${tx("월")} ${mm.score}${tx("점")}`}>
                  <div
                    className={`w-full rounded-t ${hot ? "bg-emerald-400" : cold ? "bg-amber-400" : "bg-violet-400/70"}`}
                    style={{ height: h }}
                  />
                  <span className="text-[9px] text-fg-3">{mm.month}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-fg-3">
            {tx("상반기 평균")} {y.firstHalfAvg}{tx("점")} · {tx("하반기 평균")} {y.secondHalfAvg}{tx("점")}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-fg-2">{summary}</p>
        <ResultVoiceButton text={summary} characterId={characterId} />
      </div>
    </FortuneReveal>
  );
}

export function FortunePeriodPanel({ kind, birthDate, birthTime, characterId }: FortunePeriodPanelProps) {
  const locale = getCurrentUiLocale();
  const tx: Tx = (source) => translateAuthoredSourceText(locale, "ko", "FortunePeriodPanel", source);
  const result = useMemo<{ monthly?: MonthlyFortune; yearly?: YearlyFortune; error?: string }>(() => {
    try {
      if (kind === "monthly") return { monthly: drawMonthlyFortune(birthDate, birthTime || undefined) };
      return { yearly: drawYearlyFortune(birthDate, birthTime || undefined) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [kind, birthDate, birthTime]);

  if (result.error) {
    return <PeriodErrorState tx={tx} />;
  }
  if (result.monthly) {
    return (
      <div className="space-y-5">
        <MonthlyResultView result={result.monthly} characterId={characterId} tx={tx} locale={locale} />
      </div>
    );
  }
  if (result.yearly) {
    return (
      <div className="space-y-5">
        <YearlyResultView result={result.yearly} characterId={characterId} tx={tx} locale={locale} />
      </div>
    );
  }
  return null;
}
