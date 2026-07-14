import { useFx } from "@toonspectrum/core/fx";
import { Languages, Moon, Settings2, Sun, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cx } from "@/lib/cx";
import { useI18n, type Lang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/**
 * FloatingControls — 웹(/)·토스(apps/toss) **공유** 플로팅 컨트롤 클러스터.
 *
 * 다크모드·언어·(선택) 효과음 토글. 전역 클릭 이펙트·BGM 컨트롤은 제품에서 제거됨.
 *  - 웹  : 다크모드 + 언어(기본). 사운드 토글은 기본 숨김.
 *  - 토스: 필요 시 showSound 만 켤 수 있음.
 *
 * @example 웹 App
 *   <FloatingControls placement="bottom-left" />
 */
export interface FloatingControlsProps {
  /** 사운드(SFX) 토글 노출. 기본 false (클릭 이펙트 제거 후 불필요). */
  showSound?: boolean;
  /**
   * @deprecated BGM 컨트롤은 제거됨. prop 은 호환용으로 무시된다.
   */
  showBgm?: boolean;
  /** 다크/주간 테마 토글 노출. 기본 true(토스는 false). */
  showTheme?: boolean;
  /** 언어(KO/EN) 토글 노출. 기본 true(토스는 false). */
  showLang?: boolean;
  /**
   * 고정 위치 프리셋.
   *  - "bottom-left" (기본): 좌하단(웹) — 모바일에선 우하단 단일 토글로 회피.
   *  - "bottom-right": 우하단.
   *  - "above-nav"   : 우하단이되 하단 탭바 위로 띄움(토스 BottomNav 회피, safe-area 반영).
   *  - "above-ad-nav": 우하단 고정 배너와 하단 탭바를 모두 피해 띄움.
   *  - "static"      : 위치 클래스 없음(부모가 배치 — 기존 웹 래퍼 호환).
   */
  placement?: "bottom-left" | "bottom-right" | "above-nav" | "above-ad-nav" | "static";
  /** 인터랙션 없을 때 숨김까지(ms). 기본 4000. */
  hideAfterMs?: number;
  /** 근접 포인터로 깨우는 반경(px). 기본 120. 0이면 근접 감지 비활성. */
  wakeRadiusPx?: number;
  /** 추가 클래스(루트). */
  className?: string;
}

const PILL =
  "grid size-11 place-items-center rounded-full border bg-panel/95 shadow-lg shadow-[oklch(0.1_0.02_70/0.35)] backdrop-blur transition-colors";

const LANG_OPTS: { id: Lang; label: string }[] = [
  { id: "ko", label: "KO" },
  { id: "en", label: "EN" },
];

const PLACEMENT_CLASS: Record<NonNullable<FloatingControlsProps["placement"]>, string> = {
  // 모바일: 우하단(하단 탭바 ~56px + safe-area 위로 띄움). 데스크톱: 좌하단.
  "bottom-left": "fixed z-40 bottom-4 left-4 max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-md:left-auto max-md:right-4",
  "bottom-right": "fixed right-4 bottom-4 z-40",
  // 토스 BottomNav(~66px) 위로 safe-area 반영해 띄운다.
  "above-nav": "fixed right-3.5 z-[60] bottom-[calc(82px+env(safe-area-inset-bottom))]",
  // 토스 표준 고정 배너(96px) + BottomNav 위. 광고 클릭 영역과 컨트롤이 겹치면 안 된다.
  "above-ad-nav": "fixed right-3.5 z-[60] bottom-[calc(178px+env(safe-area-inset-bottom))]",
  static: "",
};

// 좁은 화면의 fixed 컨트롤은 본문을 가리지 않도록 모두 단일 토글로 접는다.
// static만 부모가 레이아웃을 소유하므로 항상 펼친다.
const COLLAPSIBLE: Record<NonNullable<FloatingControlsProps["placement"]>, boolean> = {
  "bottom-left": true,
  "bottom-right": true,
  "above-nav": true,
  "above-ad-nav": true,
  static: false,
};

export function FloatingControls({
  showSound = false,
  showBgm: _showBgm = false,
  showTheme = true,
  showLang = true,
  placement = "bottom-left",
  hideAfterMs = 4000,
  wakeRadiusPx = 120,
  className,
}: FloatingControlsProps) {
  void _showBgm;
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const fx = useFx();
  const soundOn = fx.audio.sfxEnabled && !fx.audio.muted;

  const isDark = theme === "dark";
  const [visible, setVisible] = useState(true);
  // 모바일 접힘 패널 펼침 상태(데스크톱에선 무시 — 항상 펼침).
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), hideAfterMs);
  };

  const reveal = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(true);
    scheduleHide();
  };

  // 초기 노출 후 자동 숨김 예약.
  useEffect(() => {
    scheduleHide();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  });

  // 근접 포인터 감지 + 스크롤 — 클러스터 근처로 마우스가 오거나 스크롤하면 깨운다(터치는 hover 가 대신).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (wakeRadiusPx <= 0) return;
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const near = Math.hypot(dx, dy) <= wakeRadiusPx + Math.max(rect.width, rect.height) / 2;
      if (near) reveal();
    };
    const onScroll = () => reveal();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
    };
  });

  const toggleSound = () => {
    if (fx.audio.muted) fx.setMuted(false);
    fx.setSfxEnabled(!soundOn);
  };

  // 펼쳐진 컨트롤들(데스크톱 행 / 모바일 펼침 패널 공용).
  const controls = (
    <>
      {/* 선택적 SFX 토글 — 기본 비노출. 전역 클릭 이펙트/BGM UI 는 제거됨. */}
      {showSound && (
        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundOn ? "효과음 끄기" : "효과음 켜기"}
          aria-pressed={soundOn}
          title={soundOn ? "효과음 켜짐" : "효과음 켜기"}
          data-no-sfx
          className={cx(
            PILL,
            soundOn ? "border-accent/45 text-accent" : "border-line text-fg-2 hover:text-fg"
          )}
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      )}

      {/* 다크/주간 테마 토글 — 토스에선 showTheme={false} */}
      {showTheme && (
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "주간 모드로 전환" : "야간 모드로 전환"}
          aria-pressed={isDark}
          title={isDark ? "주간 모드" : "야간 모드"}
          className={cx(PILL, "border-line text-fg-2 hover:text-fg")}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      )}

      {/* KO/EN 언어 토글 — 토스에선 showLang={false} */}
      {showLang && (
        <div
          className="inline-flex h-11 items-center gap-1 rounded-full border border-line bg-panel/95 p-0.5 shadow-lg shadow-[oklch(0.1_0.02_70/0.35)] backdrop-blur"
          role="group"
          aria-label="언어 선택 / Language"
        >
          <Languages size={13} className="ml-1.5 text-fg-3" aria-hidden />
          {LANG_OPTS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setLang(o.id)}
              aria-pressed={lang === o.id}
              className={cx(
                "rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors",
                lang === o.id ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </>
  );

  const collapsible = COLLAPSIBLE[placement];

  return (
    <div
      ref={rootRef}
      className={cx(PLACEMENT_CLASS[placement], className)}
      onMouseEnter={reveal}
      onMouseLeave={scheduleHide}
      onFocusCapture={reveal}
      onBlurCapture={scheduleHide}
    >
      {/* 펼친 행 — 무동작 시 흐려지며 물러나고(hover/focus/근접 시 복귀).
          접힘형(웹)에선 데스크톱(md+)에서만 보이고, 비접힘형(토스/static)에선 항상 보인다. */}
      <div
        className={cx(
          "items-center gap-2 transition-[opacity,transform] duration-500 ease-out",
          collapsible ? "hidden md:flex" : "flex",
          "motion-reduce:opacity-100 hover:opacity-100 focus-within:opacity-100",
          visible ? "opacity-100" : "translate-y-1 opacity-40"
        )}
      >
        {controls}
      </div>

      {/* 모바일(접힘형만): 단일 토글 — 콘텐츠를 가리지 않게 면적 최소화. 탭하면 위로 펼침. */}
      {collapsible && (
        <div className="flex flex-col items-end gap-2 md:hidden">
          {open && (
            <div className="flex flex-col items-center gap-2 motion-safe:animate-fade-up">{controls}</div>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "설정 닫기" : "사운드·테마·언어 설정"}
            title="설정"
            className={cx(
              PILL,
              "size-12",
              open ? "border-accent/45 text-accent" : "border-line-strong text-fg-2 hover:text-fg"
            )}
          >
            {open ? <X size={18} /> : <Settings2 size={18} />}
          </button>
        </div>
      )}
    </div>
  );
}

export default FloatingControls;
