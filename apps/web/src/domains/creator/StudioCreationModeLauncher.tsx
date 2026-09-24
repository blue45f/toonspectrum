import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/utils";

import {
  STUDIO_CREATION_MODE_EVENT,
  type StudioCreationMode,
} from "./studio-creation-mode";

const ICON_ROOT = "/brand/toonstudio-premium-icons";

interface StudioCreationModeDefinition {
  readonly id: StudioCreationMode;
  readonly label: string;
  readonly description: string;
  readonly art: string;
  readonly accent: string;
}
const CREATION_MODES: readonly StudioCreationModeDefinition[] = [
  {
    id: "draw",
    label: "드로잉",
    description: "브러시·선화·채색",
    art: "canvas.webp",
    accent: "violet",
  },
  {
    id: "story",
    label: "스토리",
    description: "컷·대사·말풍선",
    art: "story.webp",
    accent: "blue",
  },
  {
    id: "character",
    label: "캐릭터",
    description: "표정·포즈·의상",
    art: "character.webp",
    accent: "pink",
  },
  {
    id: "background",
    label: "배경",
    description: "장면·원근·3D",
    art: "background.webp",
    accent: "cyan",
  },
  {
    id: "assets",
    label: "에셋",
    description: "소재·이미지·참고",
    art: "assets.webp",
    accent: "amber",
  },
  {
    id: "ai",
    label: "AI 디렉터",
    description: "구도·연출·생성",
    art: "ai-director.webp",
    accent: "aurora",
  },
] as const;

interface StudioCreationModeLauncherProps {
  readonly className?: string;
  readonly onSelectMode: (mode: StudioCreationMode) => void;
}

interface PalettePosition {
  readonly left: number;
  readonly top: number;
}
function resolvePalettePosition(trigger: HTMLElement): PalettePosition {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(430, Math.max(320, window.innerWidth - 24));
  const estimatedHeight = 392;
  const left = Math.min(
    Math.max(12, rect.right + 12),
    Math.max(12, window.innerWidth - width - 12),
  );
  const top = Math.min(
    Math.max(12, rect.top - 4),
    Math.max(12, window.innerHeight - estimatedHeight - 12),
  );
  return { left, top };
}

export function StudioCreationModeLauncher({
  className,
  onSelectMode,
}: StudioCreationModeLauncherProps) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PalettePosition>({ left: 82, top: 84 });

  const runMode = useCallback((mode: StudioCreationMode) => {
    onSelectMode(mode);
    setOpen(false);
  }, [onSelectMode]);
  useEffect(() => {
    const onRequested = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: StudioCreationMode }>).detail?.mode;
      if (!mode || !CREATION_MODES.some((item) => item.id === mode)) return;
      runMode(mode);
    };
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, onRequested);
    return () => window.removeEventListener(STUDIO_CREATION_MODE_EVENT, onRequested);
  }, [runMode]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) setPosition(resolvePalettePosition(triggerRef.current));
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (paletteRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    update();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const toggle = () => {
    if (triggerRef.current) setPosition(resolvePalettePosition(triggerRef.current));
    setOpen((value) => !value);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn("studio-creation-mode-trigger", className)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? `${titleId}-palette` : undefined}
        onClick={toggle}
      >
        <span className="studio-creation-mode-trigger__art" aria-hidden="true">
          <img src={`${ICON_ROOT}/create.webp`} alt="" />
        </span>
        <span className="studio-creation-mode-trigger__copy">
          <strong>만들기</strong>
          <small>작업 모드</small>
        </span>
        <Sparkles size={13} aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={paletteRef}
          id={`${titleId}-palette`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="studio-creation-mode-palette"
          style={{ left: position.left, top: position.top }}
          data-studio-creation-mode-palette="true"
        >
          <header className="studio-creation-mode-palette__header">
            <div>
              <span>CREATOR WORKSPACES</span>
              <h2 id={titleId}>무엇을 만들까요?</h2>
              <p>필요한 도구와 패널을 한 번에 준비합니다.</p>
            </div>
            <button
              type="button"
              aria-label="작업 모드 닫기"
              onClick={() => setOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="studio-creation-mode-palette__grid">
            {CREATION_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                data-studio-creation-mode={mode.id}
                data-accent={mode.accent}
                onClick={() => runMode(mode.id)}
              >
                <span className="studio-creation-mode-palette__art" aria-hidden="true">
                  <img src={`${ICON_ROOT}/${mode.art}`} alt="" />
                </span>
                <span className="studio-creation-mode-palette__copy">
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </span>
                <span className="studio-creation-mode-palette__arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
