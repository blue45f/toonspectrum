import { useAmbientBgm, useFx } from "@toonspectrum/core/fx";
import { Languages, Moon, Music, Settings2, Sun, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cx } from "@/lib/cx";
import { useI18n, type Lang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/**
 * FloatingControls — 웹(/)·토스(apps/toss) **공유** 플로팅 컨트롤 클러스터.
 *
 * 단일 출처(NO fork): 사운드(SFX)·BGM·다크모드·언어 토글을 하나의 클러스터로 묶는다.
 * 좁은 화면(모바일)에선 콘텐츠를 가리지 않도록 **단일 토글(⚙)로 접어** 면적을 최소화하고,
 * 탭하면 컨트롤들이 위로 펼쳐진다. 넓은 화면(데스크톱)에선 펼친 행을 그대로 노출하되 무동작 시
 * 부드럽게 물러난다(opacity↓). 어떤 컨트롤을 노출할지는 prop 으로만 갈라 채널 차이를 표현한다
 *  - 웹  : 사운드 + BGM + 다크모드 + 언어(기본값 전부 ON).
 *  - 토스: 사운드 + BGM 만(`showTheme={false} showLang={false}` — 토스 미니앱은 단일 다크 테마).
 *
 * 모든 토글 훅(테마·언어·오디오)은 프레임워크 비종속 zustand/fx 스토어라 양 채널에서 안전하다.
 * 노출 안 되는 컨트롤도 훅은 호출되지만(React 규칙) 렌더만 건너뛴다 — 부작용/구독 비용은 미미.
 *
 * 자동 숨김(데스크톱):
 *  - 마운트 후 `hideAfterMs`(기본 4000) 지나면 흐려지며 물러난다(완전 제거 X — 포인터 이벤트 유지).
 *  - 클러스터 hover / 내부 포커스 / 근접 포인터 이동 / 스크롤 시 다시 노출 + 타이머 리셋.
 *  - prefers-reduced-motion 사용자는 opacity 전환만 무효화되고(항상 보임) 토글은 그대로 동작.
 *
 * 접근성: 토글은 각각 aria-pressed/aria-label, 언어는 role="group". 모바일 접힘 패널은
 * aria-expanded 토글 버튼으로 펼친다. 숨김 상태에서도 DOM 에 남아 키보드 포커스로 즉시 복귀.
 *
 * @example 토스 App (사운드 + BGM 만, 하단 탭바 위로 띄움)
 *   import { FloatingControls } from "@/components/FloatingControls";
 *   <FloatingControls showTheme={false} showLang={false} placement="above-nav" />
 *
 * @example 웹 App (전체)
 *   <FloatingControls placement="bottom-left" />
 */
export interface FloatingControlsProps {
  /** 사운드(SFX) 토글 노출. 기본 true. */
  showSound?: boolean;
  /** BGM 토글 노출. 기본 true. */
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
   *  - "static"      : 위치 클래스 없음(부모가 배치 — 기존 웹 래퍼 호환).
   */
  placement?: "bottom-left" | "bottom-right" | "above-nav" | "static";
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
  static: "",
};

// 좁은 화면의 fixed 컨트롤은 본문을 가리지 않도록 모두 단일 토글로 접는다.
// static만 부모가 레이아웃을 소유하므로 항상 펼친다.
const COLLAPSIBLE: Record<NonNullable<FloatingControlsProps["placement"]>, boolean> = {
  "bottom-left": true,
  "bottom-right": true,
  "above-nav": true,
  static: false,
};

export function FloatingControls({
  showSound = true,
  showBgm = true,
  showTheme = true,
  showLang = true,
  placement = "bottom-left",
  hideAfterMs = 4000,
  wakeRadiusPx = 120,
  className,
}: FloatingControlsProps) {
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const fx = useFx();
  const { enabled: bgmOn, mood: bgmMood, toggle: toggleBgm, next: nextBgm } = useAmbientBgm();
  const soundOn = fx.audio.sfxEnabled && !fx.audio.muted;

  const isDark = theme === "dark";
  const [visible, setVisible] = useState(true);
  // 모바일 접힘 패널 펼침 상태(데스크톱에선 무시 — 항상 펼침).
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), hideAfterMs);
  }, [hideAfterMs]);

  const reveal = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // 초기 노출 후 자동 숨김 예약.
  useEffect(() => {
    scheduleHide();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scheduleHide]);

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
  }, [wakeRadiusPx, reveal]);

  const toggleSound = () => {
    if (fx.audio.muted) fx.setMuted(false);
    fx.setSfxEnabled(!soundOn);
  };

  const handleBgmClick = (e: React.MouseEvent) => {
    if (bgmOn && e.shiftKey) {
      nextBgm();
    } else {
      toggleBgm();
    }
  };

  // 펼쳐진 컨트롤들(데스크톱 행 / 모바일 펼침 패널 공용).
  const controls = (
    <>
      {/* 사운드(SFX) — 클릭 'tick' 등 효과음 on/off(영속). 자기 자신은 data-no-sfx */}
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

      {/* 배경음악(생성형 앰비언트 BGM) — 기본 OFF, 켜면 첫 클릭에서 언락 + 무드 로테이션 */}
      {showBgm && (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={handleBgmClick}
            aria-label={bgmOn ? "배경음악 끄기" : "배경음악 켜기"}
            aria-pressed={bgmOn}
            title={bgmOn ? `배경음악 켜짐 · 현재: ${bgmMood} (Shift+클릭시 다음 곡)` : "배경음악 켜기"}
            data-no-sfx
            className={cx(
              PILL,
              bgmOn ? "border-accent/45 text-accent" : "border-line text-fg-2 hover:text-fg"
            )}
          >
            <Music size={16} className={bgmOn ? "animate-pulse" : "opacity-70"} />
          </button>
          {bgmOn && (
            <button
              type="button"
              onClick={() => nextBgm()}
              title={`다음 애니 BGM 무드로 변경 (현재: ${bgmMood})`}
              className="inline-flex h-11 items-center rounded-full border border-line bg-panel/95 px-2.5 text-xs font-semibold text-fg-2 shadow-lg backdrop-blur hover:bg-raised hover:text-fg"
            >
              🔄 {bgmMood}
            </button>
          )}
        </div>
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
