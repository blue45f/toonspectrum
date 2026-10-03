import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import "./ui/floating-menu.css";

const SHOW_AFTER_PX = 640; // 한 화면 남짓 내려갔을 때부터 노출(짧은 페이지에선 안 뜸)

// 긴 페이지(랭킹·검색·탐색·상세)에서 빠르게 최상단으로 돌아가는 플로팅 버튼.
// 전역 1개만 마운트한다. 우하단 고정 — 좌하단 테마/언어 스위처와 충돌하지 않는다.
// 스크롤 동작은 prefers-reduced-motion 을 존중(감소 선호 시 즉시 점프).
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const t = useT();

  useEffect(() => {
    let scrollFrame: number | null = null;
    const updateVisibility = () => setVisible(globalThis.scrollY > SHOW_AFTER_PX);
    const onScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = globalThis.requestAnimationFrame(() => {
        scrollFrame = null;
        updateVisibility();
      });
    };
    updateVisibility(); // 초기 위치 반영(딥링크로 중간에 진입한 경우)
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (scrollFrame !== null) globalThis.cancelAnimationFrame(scrollFrame);
      globalThis.removeEventListener("scroll", onScroll);
    };
  }, []);

  const onClick = () => {
    const reduce =
      typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
    globalThis.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // 키보드 사용자가 본문 시작으로 자연스럽게 이어가도록 포커스도 최상단 랜드마크로 옮긴다.
    document.getElementById("main-content")?.focus({ preventScroll: true });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("common.backToTop")}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      data-back-to-top="true"
      className={cn(
        // 우하단 플로팅 스택(위→아래): BackToTop → FloatingControls 행 → (모바일) 하단 탭바.
        // 데스크톱: FloatingControls 행(bottom 1rem + 44px = 상단 60px) 위 4.5rem 에 둬 겹치지 않는다.
        // 모바일: 하단 탭 위 한 열의 맨 위 칸(--site-float-top-bottom). ⚙·음성 안내가 있으면 그 위로 올라간다.
        // 전역 모달(z80+) 아래인 z-70 유지. 마켓 스티키 바가 있을 땐 floating-menu.css 가 더 위로 올린다.
        "ts-float fixed bottom-[4.5rem] right-4 z-[70] grid size-11 place-items-center rounded-full text-fg-2 transition-[opacity,transform,color,border-color] duration-200 ease-out-expo hover:text-accent max-md:bottom-[var(--site-float-top-bottom)] max-md:right-4",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      )}
    >
      <ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
