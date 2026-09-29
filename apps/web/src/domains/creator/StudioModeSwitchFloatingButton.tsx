/**
 * Studio Mode Switch Floating Button (스튜디오 ↔ 심플 모드 전환 플로팅 버튼)
 *
 * CLIP STUDIO PAINT Ver.4.1.0 Parity:
 * - One-tap floating switch between "Studio Mode" (전문가 작업 영역) and "Simple Mode" (미니멀 심플 모드).
 * - Compact, accessible HUD button with keyboard shortcut hint.
 *
 * 배치: 좌하단 고정. 우하단은 BackToTop(z-70)·FloatingControls 클러스터가 쓰므로 겹치지 않게
 * 좌측에 둔다. z-40 으로 전역 모달 아래에 둔다.
 */

import { Layers, Sparkles } from "lucide-react";

import { localizeStudioText } from "./studio-localize-text";

import { useT } from "@/shared/lib/i18n";
import "@/shared/components/ui/floating-menu.css";

export interface StudioModeSwitchFloatingButtonProps {
  readonly currentMode: "studio" | "simple";
  readonly onToggleMode: () => void;
  readonly className?: string;
}

export function StudioModeSwitchFloatingButton({
  currentMode,
  onToggleMode,
  className = "",
}: StudioModeSwitchFloatingButtonProps) {
  const t = useT();
  const isSimple = currentMode === "simple";
  const toStudioLabel = localizeStudioText(t, "스튜디오 모드로 전환", "studio.modeSwitch.toStudio");
  const toSimpleLabel = localizeStudioText(t, "심플 모드로 전환", "studio.modeSwitch.toSimple");
  const studioModeLabel = localizeStudioText(t, "스튜디오 모드", "studio.modeSwitch.studioMode");
  const simpleModeLabel = localizeStudioText(t, "심플 모드", "studio.modeSwitch.simpleMode");

  return (
    <button
      type="button"
      onClick={onToggleMode}
      aria-label={isSimple ? toStudioLabel : toSimpleLabel}
      title={isSimple ? toStudioLabel : toSimpleLabel}
      className={`ts-float ts-float-interactive ts-float-enter fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-fg max-md:bottom-[calc(9rem+env(safe-area-inset-bottom))] ${className}`}
    >
      {isSimple ? (
        <>
          <Layers className="size-4 text-accent" aria-hidden="true" />
          <span>{studioModeLabel}</span>
        </>
      ) : (
        <>
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          <span>{simpleModeLabel}</span>
        </>
      )}
    </button>
  );
}
