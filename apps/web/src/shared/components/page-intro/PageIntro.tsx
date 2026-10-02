/**
 * 페이지 진입 인트로 — 담당 라우트(마켓/커뮤니티/플레이/펜카페/홍보)에 가벼운 진입 연출을 얹는다.
 *
 * - 풀스크린 스플래시가 아니다: 작은 중앙 모티프 + 옅은 광원 베일, 1초 내외로 사라진다.
 * - 페이지 분위기별 모션: 마켓=카드 팡팡, 커뮤니티=말풍선 상승, 플레이=통통 튐,
 *   펜카페=펜 스트로크, 홍보=반짝 버스트.
 * - 클릭/ESC로 즉시 건너뛰기, `prefers-reduced-motion`이면 렌더하지 않는다.
 * - 세션·경로당 1회만 재생한다.
 * - 본문 `[data-intro-item]` 자식들은 스태거로 등장한다(스켈레톤→콘텐츠 전환과 자연스럽게 이어짐).
 *
 * 상수·유틸은 page-intro-utils.ts에 있다(react-refresh/only-export-components 준수).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  alreadySeen,
  markSeen,
  PAGE_INTRO_DURATION_MS,
  prefersReducedMotion,
  type PageIntroVariant,
} from "./page-intro-utils";
import "./page-intro.css";

function IntroMotif({ variant }: { variant: PageIntroVariant }) {
  if (variant === "market") {
    return (
      <div className="page-intro__motif" data-motif="market" aria-hidden="true">
        <span className="pi-card" style={{ "--i": 0 } as CSSProperties} />
        <span className="pi-card" style={{ "--i": 1 } as CSSProperties} />
        <span className="pi-card" style={{ "--i": 2 } as CSSProperties} />
      </div>
    );
  }
  if (variant === "community") {
    return (
      <div className="page-intro__motif" data-motif="community" aria-hidden="true">
        <span className="pi-bubble" style={{ "--i": 0 } as CSSProperties} />
        <span className="pi-bubble pi-bubble--alt" style={{ "--i": 1 } as CSSProperties} />
      </div>
    );
  }
  if (variant === "play") {
    return (
      <div className="page-intro__motif" data-motif="play" aria-hidden="true">
        <span className="pi-dot" style={{ "--i": 0 } as CSSProperties} />
        <span className="pi-dot" style={{ "--i": 1 } as CSSProperties} />
        <span className="pi-dot" style={{ "--i": 2 } as CSSProperties} />
      </div>
    );
  }
  if (variant === "pencafe") {
    return (
      <div className="page-intro__motif" data-motif="pencafe" aria-hidden="true">
        <svg viewBox="0 0 96 64" className="pi-pen" aria-hidden="true">
          <path className="pi-pen__stroke" d="M8 48 C 28 12, 52 60, 88 20" fill="none" />
          <path className="pi-pen__nib" d="M84 12 l10 2 -6 8 -6 -2 z" />
        </svg>
      </div>
    );
  }
  if (variant === "promote") {
    return (
      <div className="page-intro__motif" data-motif="promote" aria-hidden="true">
        <span className="pi-burst" style={{ "--i": 0 } as CSSProperties} />
        <span className="pi-burst" style={{ "--i": 1 } as CSSProperties} />
        <span className="pi-burst" style={{ "--i": 2 } as CSSProperties} />
        <span className="pi-burst" style={{ "--i": 3 } as CSSProperties} />
        <span className="pi-core" />
      </div>
    );
  }
  return (
    <div className="page-intro__motif" data-motif="default" aria-hidden="true">
      <span className="pi-ring" />
    </div>
  );
}

type Phase = "playing" | "leaving" | "done";

function PageIntroView({ variant, pathname, children }: {
  variant: PageIntroVariant;
  pathname: string;
  children: ReactNode;
}) {
  const t = useBilingual("PageIntro");
  const [phase, setPhase] = useState<Phase>(() =>
    prefersReducedMotion() || alreadySeen(pathname) ? "done" : "playing",
  );
  const phaseRef = useRef<Phase>(phase);

  const finish = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "leaving";
    markSeen(pathname);
    setPhase("leaving");
    // leave 타이머는 finish가 직접 소유한다. phase 변경 시 실행되는 아래 effect의
    // cleanup이 이 타이머를 지우면 베일이 is-leaving 상태로 영원히 남으므로,
    // effect cleanup에서는 auto 타이머만 정리한다.
    window.setTimeout(() => {
      phaseRef.current = "done";
      setPhase("done");
    }, 200);
  }, [pathname]);

  useEffect(() => {
    if (phase !== "playing") return;
    const autoTimer = window.setTimeout(finish, PAGE_INTRO_DURATION_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(autoTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [phase, finish]);

  return (
    <div
      className="page-intro"
      data-page-intro={phase === "done" ? "done" : "playing"}
      data-page-intro-variant={variant}
    >
      {phase !== "done" ? (
        <div
          className={`page-intro__veil${phase === "leaving" ? " is-leaving" : ""}`}
          onClick={finish}
          role="presentation"
          aria-hidden="true"
        >
          <IntroMotif variant={variant} />
          <p className="page-intro__skip-hint">
            {t("클릭 또는 ESC로 건너뛰기", "Click or press ESC to skip")}
          </p>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * 라우트 원소에 감싸는 진입점. 경로가 바뀌면 key로 리마운트되어 페이지마다 인트로가 재생된다.
 */
export function PageIntro({ variant, children }: {
  variant: PageIntroVariant;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  return (
    <PageIntroView key={pathname} variant={variant} pathname={pathname}>
      {children}
    </PageIntroView>
  );
}
