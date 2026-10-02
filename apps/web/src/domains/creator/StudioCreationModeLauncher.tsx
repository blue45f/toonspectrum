import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_CREATION_MODE_EVENT,
  type StudioCreationMode,
} from "./studio-creation-mode";

const ICON_ROOT = "/brand/toonstudio-premium-icons";

interface StudioCreationModeDefinition {
  readonly id: StudioCreationMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly art: string;
  readonly accent: string;
}
/**
 * "캐릭터"는 3D 캐릭터 만들기(셰이퍼)를, "배경"은 장면·3D 배경 메뉴를 연다. 처음 쓰는 사람이 3D 진입점을
 * 찾지 못하던 문제라 설명에 "3D"를 직접 적는다(툴바에 3D 도구를 고정하지 않아도 여기서 바로 보인다).
 */
const CREATION_MODES: readonly StudioCreationModeDefinition[] = [
  {
    id: "draw",
    labelKo: "드로잉",
    labelEn: "Drawing",
    descriptionKo: "브러시·선화·채색",
    descriptionEn: "Brushes, line art, color",
    art: "canvas.webp",
    accent: "violet",
  },
  {
    id: "story",
    labelKo: "스토리",
    labelEn: "Story",
    descriptionKo: "컷·대사·말풍선",
    descriptionEn: "Panels, dialogue, balloons",
    art: "story.webp",
    accent: "blue",
  },
  {
    id: "character",
    labelKo: "캐릭터",
    labelEn: "Characters",
    descriptionKo: "3D 캐릭터·포즈·의상",
    descriptionEn: "3D characters, poses, outfits",
    art: "character.webp",
    accent: "pink",
  },
  {
    id: "background",
    labelKo: "배경",
    labelEn: "Backgrounds",
    descriptionKo: "장면·원근·3D 배경",
    descriptionEn: "Scenes, perspective, 3D",
    art: "background.webp",
    accent: "cyan",
  },
  {
    id: "assets",
    labelKo: "에셋",
    labelEn: "Assets",
    descriptionKo: "소재·이미지·참고",
    descriptionEn: "Materials, images, references",
    art: "assets.webp",
    accent: "amber",
  },
  {
    id: "ai",
    labelKo: "AI 디렉터",
    labelEn: "AI director",
    descriptionKo: "구도·연출·생성",
    descriptionEn: "Composition, direction, generation",
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
  const bt = useBilingual("StudioCreationModeLauncher");
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

  // 좁은 레일에서는 글자 줄이 CSS 로 접히므로 이름과 풍선 도움말을 속성으로 직접 단다(이름 없는 버튼 방지).
  const triggerLabel = bt("만들기 · 작업 모드 고르기", "Create · choose a work mode");
  const triggerHint = bt(
    "만들기 — 드로잉·스토리·3D 캐릭터·3D 배경 중 작업 모드를 고릅니다",
    "Create — pick a work mode: drawing, story, 3D characters or 3D backgrounds",
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn("studio-creation-mode-trigger", className)}
        aria-label={triggerLabel}
        title={triggerHint}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? `${titleId}-palette` : undefined}
        onClick={toggle}
      >
        <span className="studio-creation-mode-trigger__art" aria-hidden="true">
          <img src={`${ICON_ROOT}/create.webp`} alt="" />
        </span>
        <span className="studio-creation-mode-trigger__copy">
          <strong>{bt("만들기", "Create")}</strong>
          <small>{bt("작업 모드", "Work mode")}</small>
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
              <h2 id={titleId}>{bt("무엇을 만들까요?", "What will you make?")}</h2>
              <p>{bt("필요한 도구와 패널을 한 번에 준비합니다.", "Gets the tools and panels ready in one step.")}</p>
            </div>
            <button
              type="button"
              aria-label={bt("작업 모드 닫기", "Close work modes")}
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
                  <strong>{bt(mode.labelKo, mode.labelEn)}</strong>
                  <small>{bt(mode.descriptionKo, mode.descriptionEn)}</small>
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
