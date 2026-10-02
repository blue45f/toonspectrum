import { useCallback, useEffect, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";

import type { ComicIntroProps } from "./ComicIntro";

/** 한 번 본 사용자는 짧게, 처음 보는 사용자는 풀 버전으로 보여준다. */
const SEEN_KEY = "toonstudio-comic-intro-seen-v1";

type IntroOverlayComponent = ComponentType<ComicIntroProps>;

/**
 * 만화 인트로를 페이지 로드 뒤에 붙이는 얇은 호스트.
 *
 * - 오버레이 청크는 `window load` 이후에 동적 import로 불러온다 — 첫 화면(LCP)과 경합하지 않는다.
 * - `prefers-reduced-motion`이면 아예 띄우지 않는다.
 * - 풀 버전을 끝까지 보거나 건너뛰면 본 것으로 기록하고, 다음부터는 1초짜리 짧은 버전만 나간다.
 */
export function ComicIntroHost() {
  const [Overlay, setOverlay] = useState<IntroOverlayComponent | null>(null);
  const [variant, setVariant] = useState<ComicIntroProps["variant"]>("full");

  useEffect(() => {
    // matchMedia가 없는 환경(jsdom 등)에서는 인트로를 띄우지 않는다.
    if (typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      let seen = false;
      try {
        seen = window.localStorage.getItem(SEEN_KEY) !== null;
      } catch {
        // 저장소를 못 읽는 환경(시크릿 모드 등)에서는 처음 보는 것으로 취급한다.
      }
      setVariant(seen ? "short" : "full");
      void import("./ComicIntro").then((module) => {
        if (!cancelled) setOverlay(() => module.ComicIntro);
      });
    };

    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }
    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
    };
  }, []);

  const handleDone = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // 기록 실패는 무시한다 — 다음 방문에서 풀 버전이 한 번 더 나올 뿐이다.
    }
    setOverlay(null);
  }, []);

  if (!Overlay) return null;
  // 라우트 스테이지의 스태킹 컨텍스트 안에 갇히면 헤더 뒤로 숨으므로 body로 포털한다.
  return createPortal(<Overlay variant={variant} onDone={handleDone} />, document.body);
}
