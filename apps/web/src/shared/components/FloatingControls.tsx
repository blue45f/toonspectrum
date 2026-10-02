import { useFx } from "@toonstudio/core/fx";
import { Moon, Music2, Settings2, Sun, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppearanceTrigger } from "./appearance/AppearanceTrigger";
import { LanguagePicker } from "./LanguagePicker";

import { cx } from "@/shared/lib/cx";
import { useI18n, useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { requestSiteOstPanelToggle } from "@/shared/lib/site-background-music";
import { useTheme } from "@/shared/lib/theme";

import "./ui/floating-menu.css";

/**
 * FloatingControls — 웹 앱의 플로팅 설정 컨트롤 클러스터.
 *
 * 다크모드·디자인 테마·언어·(선택) 효과음 토글.
 *  - 데스크톱: 한 줄로 펼쳐 두고 무동작 시 흐려진다(근접·스크롤·초점으로 복귀).
 *  - 휴대폰: 하단 탭 위 오른쪽에 단일 ⚙ 토글 하나만 띄우고, 누르면 위로 펼친다.
 *    OST 알약은 따로 띄우지 않고 이 묶음 안의 🎵 버튼으로 연다(떠 있는 요소 수를 줄인다).
 *
 * @example 웹 App
 *   <FloatingControls placement="bottom-right" />
 */
export interface FloatingControlsProps {
  /** 사운드(SFX) 토글 노출. 기본 false (클릭 이펙트 제거 후 불필요). */
  showSound?: boolean;
  /**
   * @deprecated BGM 컨트롤은 제거됨. prop 은 호환용으로 무시된다.
   */
  showBgm?: boolean;
  /** 다크/주간 테마 토글 노출. 기본 true. */
  showTheme?: boolean;
  /** 언어 셀렉트 노출. 기본 true. */
  showLang?: boolean;
  /**
   * 고정 위치 프리셋.
   *  - "bottom-left" (기본): 좌하단(웹) — 모바일에선 우하단 단일 토글로 회피.
   *  - "bottom-right": 우하단.
   *  - "static"      : 위치 클래스 없음(부모가 배치 — 기존 웹 래퍼 호환).
   */
  placement?: "bottom-left" | "bottom-right" | "static";
  /** 인터랙션 없을 때 숨김까지(ms). 기본 4000. */
  hideAfterMs?: number;
  /** 근접 포인터로 깨우는 반경(px). 기본 120. 0이면 근접 감지 비활성. */
  wakeRadiusPx?: number;
  /** 추가 클래스(루트). */
  className?: string;
}

const PILL =
  "ts-float ts-float-interactive grid size-11 place-items-center rounded-full";

/**
 * 휴대폰 위치는 `--site-float-base`(하단 탭 높이 + 간격 + 안전 영역)를 따른다.
 * 값은 app/styles/sitewide-visual-ux.css 의 모바일 플로팅 계층 계약이 실제 하단 탭 유무로 정한다.
 */
const PLACEMENT_CLASS: Record<NonNullable<FloatingControlsProps["placement"]>, string> = {
  "bottom-left": "fixed z-40 bottom-4 left-4 max-md:bottom-[var(--site-float-base)] max-md:left-auto max-md:right-4",
  "bottom-right": "fixed right-4 bottom-4 z-40 max-md:bottom-[var(--site-float-base)]",
  static: "",
};

// 좁은 화면의 fixed 컨트롤은 본문을 가리지 않도록 모두 단일 토글로 접는다.
// static만 부모가 레이아웃을 소유하므로 항상 펼친다.
const COLLAPSIBLE: Record<NonNullable<FloatingControlsProps["placement"]>, boolean> = {
  "bottom-left": true,
  "bottom-right": true,
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
  const t = useT();
  const bt = useBilingual("FloatingControls");
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const fx = useFx();
  const soundOn = fx.audio.sfxEnabled && !fx.audio.muted;

  const isDark = theme === "dark";
  const [visible, setVisible] = useState(true);
  // 모바일 접힘 패널 펼침 상태(데스크톱에선 무시 — 항상 펼침).
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapsible = COLLAPSIBLE[placement];

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setVisible(false), hideAfterMs);
  }, [clearHideTimer, hideAfterMs]);

  /** 포인터가 올라와 있거나 초점이 안에 있는 동안에는 흐려지지 않는다. */
  const hold = useCallback(() => {
    clearHideTimer();
    setVisible(true);
  }, [clearHideTimer]);

  const reveal = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // 첫 노출 뒤 자동 숨김을 한 번 예약하고, 해제 시 타이머를 정리한다.
  useEffect(() => {
    scheduleHide();
    return clearHideTimer;
  }, [clearHideTimer, scheduleHide]);

  // 근접 포인터 감지 + 스크롤 — 클러스터 근처로 마우스가 오거나 스크롤하면 깨운다(터치는 hover 가 대신).
  // 포인터 이동은 프레임당 한 번만 거리를 계산한다(고주사율 마우스에서 이벤트마다 레이아웃을 읽지 않는다).
  useEffect(() => {
    let frame = 0;
    let pointer: { readonly x: number; readonly y: number } | null = null;
    const checkProximity = () => {
      frame = 0;
      const rect = rootRef.current?.getBoundingClientRect();
      if (!pointer || !rect) return;
      const dx = pointer.x - (rect.left + rect.width / 2);
      const dy = pointer.y - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) <= wakeRadiusPx + Math.max(rect.width, rect.height) / 2) reveal();
    };
    const onMove = (event: PointerEvent) => {
      if (wakeRadiusPx <= 0) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(checkProximity);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", reveal, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", reveal);
    };
  }, [reveal, wakeRadiusPx]);

  const closeMobilePanel = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  // 모바일 펼침: 바깥을 누르거나 Esc를 누르면 닫는다. Esc는 토글로 초점을 돌려준다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      closeMobilePanel(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      // 언어 검색 같은 내부 대화상자가 Esc를 먼저 처리하면 그대로 둔다.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      closeMobilePanel(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMobilePanel, open]);

  const toggleSound = () => {
    if (fx.audio.muted) fx.setMuted(false);
    fx.setSfxEnabled(!soundOn);
  };

  const ostLabel = bt("오리지널 OST 열기", "Open the original OST");

  // 펼쳐진 컨트롤들(데스크톱 행 / 모바일 펼침 패널 공용). 휴대폰 패널은 한 열(44px)을 지키도록
  // 언어 선택을 아이콘만 남긴 compact 로 그린다.
  const renderControls = (compact: boolean) => (
    <>
      {/* 선택적 SFX 토글 — 기본 비노출. 전역 클릭 이펙트/BGM UI 는 제거됨. */}
      {showSound && (
        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundOn ? t("control.sound.disable") : t("control.sound.enable")}
          aria-pressed={soundOn}
          title={soundOn ? t("control.sound.disable") : t("control.sound.enable")}
          data-no-sfx
          className={cx(
            PILL,
            soundOn ? "ts-float-active" : "text-fg-2 hover:text-fg"
          )}
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      )}

      {/* 다크/주간 테마 토글 */}
      {showTheme && (
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? t("control.theme.light") : t("control.theme.dark")}
          aria-pressed={isDark}
          title={isDark ? t("control.theme.light") : t("control.theme.dark")}
          className={cx(PILL, "text-fg-2 hover:text-fg")}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      )}

      {showTheme && <AppearanceTrigger className={cx(PILL, "text-fg-2 hover:text-fg")} />}

      {/* 닫힌 상태에는 현재 언어만 남기고 전체 카탈로그는 검색할 때만 지연 렌더한다. */}
      {showLang && (
        <LanguagePicker
          value={lang}
          onChange={setLang}
          ariaLabel={t("control.language.label")}
          compact={compact}
          triggerClassName={cx("ts-float ts-float-interactive rounded-full", compact && "size-11")}
        />
      )}
    </>
  );

  return (
    <div
      ref={rootRef}
      data-floating-controls="true"
      data-floating-controls-open={open || undefined}
      className={cx(PLACEMENT_CLASS[placement], className)}
      onMouseEnter={hold}
      onMouseLeave={scheduleHide}
      onFocusCapture={hold}
      onBlurCapture={scheduleHide}
    >
      {/* 펼친 행 — 무동작 시 흐려지며 물러나고(hover/focus/근접 시 복귀).
          접힘형은 데스크톱(md+)에서 보이고, static 배치는 항상 보인다. */}
      <div
        aria-hidden={!visible || undefined}
        inert={!visible || undefined}
        className={cx(
          "items-center gap-2 transition-[opacity,transform] duration-500 ease-out",
          collapsible ? "hidden md:flex" : "flex",
          "motion-reduce:opacity-100 hover:opacity-100 focus-within:opacity-100",
          visible ? "opacity-100" : "pointer-events-none translate-y-1 opacity-0"
        )}
      >
        {renderControls(false)}
      </div>

      {/* 모바일(접힘형만): 단일 토글 — 콘텐츠를 가리지 않게 면적 최소화. 탭하면 위로 펼침. */}
      {collapsible && (
        <div className="flex flex-col items-end gap-2 md:hidden">
          {open && (
            <div className="flex flex-col items-center gap-2 motion-safe:animate-fade-up">
              {renderControls(true)}
              {/* OST 플레이어가 마운트된 화면에서만 보인다(floating-menu.css). */}
              <button
                type="button"
                data-floating-ost-toggle
                onClick={() => {
                  setOpen(false);
                  requestSiteOstPanelToggle();
                }}
                aria-label={ostLabel}
                title={ostLabel}
                className={cx(PILL, "text-fg-2 hover:text-fg")}
              >
                <Music2 size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <button
            ref={toggleRef}
            type="button"
            data-floating-controls-toggle
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? t("control.settings.close") : bt("화면·언어·OST 설정", "Display, language and OST settings")}
            title={open ? t("control.settings.close") : t("control.cluster.open")}
            className={cx(
              PILL,
              "size-12",
              open ? "ts-float-active" : "text-fg-2 hover:text-fg"
            )}
          >
            {open ? <X size={18} aria-hidden="true" /> : <Settings2 size={18} aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}

export default FloatingControls;
