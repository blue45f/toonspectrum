import { useId } from "react";

import { getCurrentUiLocale, translateAuthoredSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

// 월간/연간 운세의 빈 상태 — "10초 안에 뭘 해야 할지" 알 수 있게 설계.
// 화려한 일러스트 + 단계 도식 + 핵심 액션 1개(생년월일 입력 후 보기)만 강조.

export interface FortuneBirthGateProps {
  kind: "monthly" | "yearly";
  birthDate: string;
  birthTime: string;
  onBirthDateChange: (v: string) => void;
  onBirthTimeChange: (v: string) => void;
}

function MoonPhasesIllustration() {
  // 월간: 초승달 → 보름달로 차오르는 SVG
  const phases = [0.15, 0.4, 0.65, 0.9, 1];
  return (
    <svg viewBox="0 0 220 64" className="h-16 w-auto" role="img" aria-label="차오르는 달의 위상">
      <defs>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      {phases.map((p, i) => (
        <g key={i} transform={`translate(${28 + i * 41}, 32)`}>
          <circle r="20" fill="url(#moonGlow)" opacity="0.25" />
          <circle r="13" fill="#1e1b2e" stroke="#fbbf24" strokeOpacity="0.5" strokeWidth="1" />
          <ellipse cx={13 * (1 - p) * 0.9} cy="0" rx={13 * (1 - p)} ry="13" fill="#fbbf24" opacity={0.35 + p * 0.65} />
          {i === 4 && (
            <g>
              <circle r="17" fill="none" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 4" opacity="0.7">
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="12s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}

function YearWheelIllustration() {
  // 연간: 12개월을 도는 해/계절 바퀴 SVG
  const months = Array.from({ length: 12 }, (_, i) => i);
  const cx = 60;
  const cy = 32;
  const r = 22;
  return (
    <svg viewBox="0 0 120 64" className="h-16 w-auto" role="img" aria-label="12개월이 도는 한 해의 바퀴">
      <defs>
        <radialGradient id="sunCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.2" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="11" fill="url(#sunCore)" />
      <circle cx={cx} cy={cy} r="14" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 3" opacity="0.6">
        <animateTransform attributeName="transform" type="rotate" from="0 60 32" to="360 60 32" dur="20s" repeatCount="indefinite" />
      </circle>
      {months.map((m) => {
        const a = (m / 12) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const season = m < 2 || m === 11 ? "#93c5fd" : m < 5 ? "#86efac" : m < 8 ? "#fbbf24" : "#fca5a5";
        return <circle key={m} cx={x} cy={y} r="3.2" fill={season} opacity="0.9" />;
      })}
    </svg>
  );
}

const STEPS = [
  { n: "1", ko: "생년월일 입력", en: "Enter birth date" },
  { n: "2", ko: "월운·세운 계산", en: "Calculate luck" },
  { n: "3", ko: "별빛 리빌", en: "Starlight reveal" },
] as const;

export function FortuneBirthGate({ kind, birthDate, birthTime, onBirthDateChange, onBirthTimeChange }: FortuneBirthGateProps) {
  const locale = getCurrentUiLocale();
  const tx = (source: string) => translateAuthoredSourceText(locale, "ko", "FortuneBirthGate", source);
  const dateId = useId();
  const timeId = useId();
  const isMonthly = kind === "monthly";

  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-4 text-center">
      {/* 일러스트 히어로 */}
      <div className="flex justify-center" aria-hidden="false">
        {isMonthly ? <MoonPhasesIllustration /> : <YearWheelIllustration />}
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-bold text-fg">
          {isMonthly ? tx("이번 달의 흐름을 읽어드릴게요") : tx("올해의 큰 흐름을 보여드릴게요")}
        </h3>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-fg-2">
          {isMonthly
            ? tx("생년월일시를 입력하면 명리 월운(月運)으로 이번 달의 테마와 애정·금전·직장·건강운을 풀어드려요.")
            : tx("생년월일시를 입력하면 세운(歲運)과 12개월 월별 흐름, 최고의 달과 주의할 달을 알려드려요.")}
        </p>
      </div>

      {/* 단계 도식 — 무엇을 하게 되는지 한눈에 */}
      <ol className="flex items-center justify-center gap-1" aria-label={tx("이용 단계")}>
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold",
                  i === 0 ? "bg-accent text-on-accent shadow" : "border border-line bg-card/40 text-fg-3"
                )}
                aria-hidden="true"
              >
                {s.n}
              </span>
              <span className="whitespace-nowrap text-[10px] font-semibold text-fg-2">{tx(s.ko)}</span>
            </div>
            {i < STEPS.length - 1 && (
              <svg viewBox="0 0 24 12" className="mx-1 h-3 w-6 text-fg-3" aria-hidden="true">
                <path d="M2 6h18m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            )}
          </li>
        ))}
      </ol>

      {/* 핵심 액션: 생년월일 입력 — 입력 즉시 결과가 뜬다 */}
      <div className="rounded-2xl border border-line/50 bg-card/15 p-4 text-left">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={dateId} className="text-[11px] font-semibold text-fg-2">
              {tx("생년월일 (양력)")} <span className="text-accent">*</span>
            </label>
            <input
              id={dateId}
              type="date"
              value={birthDate}
              onChange={(e) => onBirthDateChange(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={timeId} className="text-[11px] font-semibold text-fg-2">{tx("태어난 시간 (선택)")}</label>
            <input
              id={timeId}
              type="time"
              value={birthTime}
              onChange={(e) => onBirthTimeChange(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-fg-3">
          {tx("생년월일을 입력하면 결과가 바로 펼쳐져요 · 같은 날짜에는 항상 같은 결과")}
        </p>
      </div>
    </div>
  );
}
