import { useEffect, useRef, useState } from "react";

import "./comic-intro.css";

export type ComicIntroVariant = "full" | "short";

export interface ComicIntroProps {
  readonly variant: ComicIntroVariant;
  readonly onDone: () => void;
}

/** 풀 버전 2.4초, 재방문용 짧은 버전 1초. 끝나기 직전에 페이드아웃을 시작한다. */
const INTRO_TIMING: Record<ComicIntroVariant, { total: number; fadeStart: number }> = {
  full: { total: 2400, fadeStart: 2180 },
  short: { total: 1000, fadeStart: 820 },
};

/**
 * 만화 컷이 넘어가듯 등장하는 짧은 인트로 오버레이.
 *
 * - 컷 3개가 차례로 미끄러져 들어오고, 걷는 캐릭터와 말풍선이 이야기를 완성한다.
 * - 스킵 버튼이나 ESC로 언제든 바로 끝낼 수 있다.
 * - 사운드나 별도 재생 UI는 붙이지 않는다 — 소리는 기존 배경음악 기능을 그대로 쓴다.
 */
export function ComicIntro({ variant, onDone }: ComicIntroProps) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    skipButtonRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };
    const dismiss = () => {
      setLeaving(true);
      window.setTimeout(finish, 160);
    };
    const { total, fadeStart } = INTRO_TIMING[variant];
    const fadeTimer = window.setTimeout(() => setLeaving(true), fadeStart);
    const doneTimer = window.setTimeout(finish, total);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [variant, onDone]);

  const skip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  return (
    <div
      className="comic-intro"
      data-comic-intro={variant}
      data-leaving={leaving ? "true" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="인트로"
    >
      <div className="comic-intro-stage" aria-hidden="true">
        <div className="comic-panel comic-panel--one">
          <p className="comic-panel-caption">오늘은 어떤 이야기를</p>
          <svg className="comic-panel-doodle" viewBox="0 0 120 60" focusable="false">
            <path d="M8 48 C 30 20, 52 44, 74 22 S 104 30, 112 14" fill="none" strokeWidth="3" strokeLinecap="round" />
            <circle cx="104" cy="12" r="4" />
          </svg>
        </div>
        <div className="comic-panel comic-panel--two">
          <div className="comic-intro-bubble">
            <p>만들까요?</p>
          </div>
          <svg className="comic-character" viewBox="0 0 120 120" focusable="false">
            <g className="comic-character-body">
              <circle cx="60" cy="34" r="20" className="comic-char-skin" />
              <path d="M40 32 a20 20 0 0 1 40 0 l0 -6 a20 14 0 0 0 -40 0 z" className="comic-char-hair" />
              <rect x="52" y="50" width="16" height="26" rx="7" className="comic-char-shirt" />
              <path d="M46 76 l6 22 M74 76 l-6 22" className="comic-char-legs" />
              <path d="M68 56 l16 -8" className="comic-char-arm" />
              <path d="M84 48 l10 -12 M94 36 l3 3 -12 4 z" className="comic-char-pencil" />
              <circle cx="53" cy="34" r="2.4" className="comic-char-eye" />
              <circle cx="67" cy="34" r="2.4" className="comic-char-eye" />
              <path d="M55 42 q5 4 10 0" className="comic-char-mouth" />
            </g>
          </svg>
        </div>
        <div className="comic-panel comic-panel--three">
          <svg className="comic-speedlines" viewBox="0 0 200 120" focusable="false">
            <g>
              <path d="M100 60 L8 8" />
              <path d="M100 60 L44 2" />
              <path d="M100 60 L100 0" />
              <path d="M100 60 L156 2" />
              <path d="M100 60 L192 8" />
              <path d="M100 60 L196 60" />
              <path d="M100 60 L192 112" />
              <path d="M100 60 L156 118" />
              <path d="M100 60 L100 120" />
              <path d="M100 60 L44 118" />
              <path d="M100 60 L8 112" />
              <path d="M100 60 L4 60" />
            </g>
          </svg>
          <p className="comic-panel-logo">
            툰스튜디오
            <span>에서 시작해요</span>
          </p>
        </div>
      </div>
      <button ref={skipButtonRef} type="button" className="comic-intro-skip" onClick={skip}>
        건너뛰기
      </button>
    </div>
  );
}
