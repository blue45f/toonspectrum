import { ArrowLeft, ArrowRight, Check, PartyPopper } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { getPwaInstallSnapshot } from "@/shared/lib/pwa-install-store";

import "./pwa-install-showcase.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("pwa-install-welcome", ko, en);

const WELCOME_KEY = "toonstudio:pwa-welcome:v1";

interface WelcomeStep {
  readonly ko: string;
  readonly en: string;
  readonly koDescription: string;
  readonly enDescription: string;
  readonly art: "home" | "offline" | "canvas";
}

const STEPS: readonly WelcomeStep[] = [
  {
    ko: "홈 화면에서 바로 시작",
    en: "Start right from your home screen",
    koDescription: "이제 툰스튜디오는 브라우저가 아닌 '앱'입니다. 아이콘 하나로 창작 공간이 열려요.",
    enDescription: "ToonStudio is now an app, not a browser tab. One icon opens your creative space.",
    art: "home",
  },
  {
    ko: "오프라인에서도 이어 그리기",
    en: "Keep drawing offline",
    koDescription: "지하철·비행기에서도 캔버스는 멈추지 않아요. 작업은 기기에 자동 저장됩니다.",
    enDescription: "The canvas keeps going on the subway or a plane. Work auto-saves on-device.",
    art: "offline",
  },
  {
    ko: "전체화면으로 몰입하기",
    en: "Immerse in fullscreen",
    koDescription: "주소창 없는 넓은 화면에서 콘티와 작화에만 집중해 보세요.",
    enDescription: "Focus on storyboards and artwork with a chromeless fullscreen canvas.",
    art: "canvas",
  },
];

function WelcomeArt({ art }: { art: WelcomeStep["art"] }) {
  if (art === "home") {
    return (
      <svg viewBox="0 0 120 90" aria-hidden="true" className="pwa-welcome__art">
        <rect x="14" y="14" width="92" height="62" rx="12" className="art-bg" />
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={26 + col * 20}
              y={24 + row * 18}
              width={12}
              height={12}
              rx={4}
              className={row === 1 && col === 1 ? "art-accent-fill" : "art-line"}
            />
          )),
        )}
        <circle cx="46" cy="42" r="10" fill="none" stroke="#fff" strokeWidth="2.5" />
        <path d="M42 42l3 3 5-6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (art === "offline") {
    return (
      <svg viewBox="0 0 120 90" aria-hidden="true" className="pwa-welcome__art">
        <path d="M28 52a14 14 0 0 1 3-27.7A19 19 0 0 1 68 20a15 15 0 0 1 21 14.6" className="art-line" fill="none" strokeWidth="3" />
        <path d="M38 62l44-28M82 62L38 34" className="art-accent-line" strokeLinecap="round" strokeWidth="3" />
        <path d="M48 74h24" className="art-line" strokeLinecap="round" strokeWidth="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true" className="pwa-welcome__art">
      <rect x="20" y="12" width="80" height="66" rx="10" className="art-bg" />
      <path d="M32 28h28M32 38h40M32 48h34" className="art-line" strokeLinecap="round" strokeWidth="3" />
      <path d="M12 22V14a4 4 0 0 1 4-4h8M108 22V14a4 4 0 0 0-4-4h-8M12 68v8a4 4 0 0 0 4 4h8M108 68v8a4 4 0 0 1-4 4h-8" className="art-accent-line" strokeLinecap="round" strokeWidth="3" fill="none" />
    </svg>
  );
}

function readWelcomed(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomed(): void {
  try {
    window.localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    // 무시
  }
}

function PwaInstallWelcomeTour({ onDone }: { onDone: () => void }) {
  useBilingualI18nRevision();
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const done = useCallback(() => {
    markWelcomed();
    onDone();
  }, [onDone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") done();
      if (event.key === "ArrowRight" && !last) setIndex((i) => i + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [done, index, last]);

  return (
    <div className="pwa-showcase__overlay" data-welcome="true">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pwa-showcase__dialog pwa-welcome"
      >
        <div className="pwa-welcome__body">
          <span className="pwa-welcome__badge">
            <PartyPopper size={16} aria-hidden="true" />
            {bi("설치 완료!", "Installed!")}
          </span>
          <WelcomeArt art={step.art} />
          <div
            className="pwa-welcome__dots"
            role="tablist"
            aria-label={bi("환영 단계", "Welcome steps")}
          >
            {STEPS.map((candidate, dotIndex) => (
              <button
                key={candidate.ko}
                type="button"
                role="tab"
                aria-selected={dotIndex === index}
                aria-label={bi(`${dotIndex + 1}단계`, `Step ${dotIndex + 1}`)}
                className="pwa-welcome__dot"
                data-active={dotIndex === index || undefined}
                onClick={() => setIndex(dotIndex)}
              />
            ))}
          </div>
          <h2 id={titleId} className="pwa-welcome__title">{bi(step.ko, step.en)}</h2>
          <p className="pwa-welcome__description">{bi(step.koDescription, step.enDescription)}</p>
          <div className="pwa-welcome__nav">
            <button
              type="button"
              className="pwa-welcome__nav-button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label={bi("이전", "Previous")}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            {last ? (
              <button type="button" className="pwa-showcase__cta pwa-welcome__cta" onClick={done}>
                <Check size={18} aria-hidden="true" />
                {bi("창작 시작하기", "Start creating")}
              </button>
            ) : (
              <button
                type="button"
                className="pwa-showcase__cta pwa-welcome__cta"
                onClick={() => setIndex((i) => i + 1)}
              >
                {bi("다음", "Next")}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="pwa-showcase__later" onClick={done}>
              {bi("건너뛰기", "Skip")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 설치된 앱(standalone)으로 처음 실행될 때 한 번만 환영 투어를 보여준다.
 */
export function PwaInstallWelcomeHost() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const snapshot = getPwaInstallSnapshot();
    if (!snapshot.standalone) return;
    if (readWelcomed()) return;
    const timer = window.setTimeout(() => setShow(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;
  return <PwaInstallWelcomeTour onDone={() => setShow(false)} />;
}
