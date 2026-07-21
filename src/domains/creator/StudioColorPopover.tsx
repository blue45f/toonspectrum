// 재사용 색상 선택기 — 스와치 트리거 + 팝오버(네이티브 컬러/헥스 입력, 스포이드,
// 최근 색, 큐레이션 팔레트 탭). 로컬 UI 상태(열림/선택 팔레트)만 가지는 표시 컴포넌트.
import { Pipette, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_COLOR_EYEDROPPER_HINT,
  studioColorPopoverTriggerHint,
  studioPaletteFamilyHint,
  type StudioColorPopoverPurpose,
} from "./studio-color-popover-hints";
import { isValidHexColor, normalizeHexColor } from "./studio-color-utils";
import { StudioToolHintTarget } from "./StudioToolHint";

import type { StudioPalette } from "./studio-color-palettes";

import { cx } from "@/lib/cx";

// EyeDropper는 일부 브라우저에만 있는 실험적 API — 타입 정의가 없어 좁은 형태만 선언한다.
type EyeDropperResult = { sRGBHex: string };
type EyeDropperLike = { open: () => Promise<EyeDropperResult> };
type EyeDropperCtor = new () => EyeDropperLike;

const POPOVER_WIDTH_PX = 240;
const POPOVER_MAX_HEIGHT_PX = 384;
const POPOVER_GAP_PX = 6;
const VIEWPORT_PADDING_PX = 8;

function getEyeDropperCtor(): EyeDropperCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  return typeof ctor === "function" ? ctor : null;
}

export type StudioColorPopoverProps = {
  value: string;
  onChange: (color: string) => void;
  recentColors: readonly string[];
  onUseColor?: (color: string) => void;
  /** Accessible trigger name. Kept separate from native `title` tooltips. */
  label?: string;
  /** Selects copy and the action-specific rich preview for the trigger. */
  purpose?: StudioColorPopoverPurpose;
  className?: string;
  initialOpen?: boolean;
};

export function StudioColorPopover({
  value,
  onChange,
  recentColors,
  onUseColor,
  label = "색상 선택",
  purpose = "generic",
  className,
  initialOpen = false,
}: StudioColorPopoverProps): React.ReactElement {
  const [open, setOpen] = useState(initialOpen);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({
    left: VIEWPORT_PADDING_PX,
    top: VIEWPORT_PADDING_PX,
    visibility: "hidden",
    width: POPOVER_WIDTH_PX,
  });
  // 팔레트 탭 — 기본은 첫 팔레트, 선택 id로 어떤 팔레트의 색을 보여줄지 제어.
  const [palettes, setPalettes] = useState<StudioPalette[]>([]);
  const [paletteId, setPaletteId] = useState<string>("");
  // 헥스 텍스트 입력 로컬값 — 타이핑 중간 무효 상태를 허용하고 확정 시에만 반영.
  const [hexDraft, setHexDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const popupId = `studio-color-popover-${useId().replaceAll(":", "")}`;

  // 외부 value가 바뀌면 헥스 입력 표시도 동기화(부모가 다른 경로로 색을 바꾼 경우).
  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  // overflow-x:auto 툴벨트 안에서도 잘리지 않도록 body portal을 뷰포트 좌표로 배치한다.
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const updatePosition = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const popup = popupRef.current;
      if (!anchor || !popup) return;
      const viewportWidth = Math.max(1, globalThis.innerWidth || 320);
      const viewportHeight = Math.max(1, globalThis.innerHeight || 320);
      const width = Math.max(
        1,
        Math.min(POPOVER_WIDTH_PX, viewportWidth - VIEWPORT_PADDING_PX * 2)
      );
      const naturalHeight = Math.min(
        Math.max(1, popup.scrollHeight),
        POPOVER_MAX_HEIGHT_PX,
        viewportHeight - VIEWPORT_PADDING_PX * 2
      );
      const spaceBelow = Math.max(
        0,
        viewportHeight - anchor.bottom - POPOVER_GAP_PX - VIEWPORT_PADDING_PX
      );
      const spaceAbove = Math.max(
        0,
        anchor.top - POPOVER_GAP_PX - VIEWPORT_PADDING_PX
      );
      const placeBelow =
        spaceBelow >= Math.min(naturalHeight, 220) || spaceBelow >= spaceAbove;
      const availableHeight = placeBelow ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(1, Math.min(POPOVER_MAX_HEIGHT_PX, availableHeight));
      const preferredLeft =
        anchor.left + anchor.width / 2 > viewportWidth / 2
          ? anchor.right - width
          : anchor.left;
      const left = Math.min(
        Math.max(VIEWPORT_PADDING_PX, preferredLeft),
        viewportWidth - width - VIEWPORT_PADDING_PX
      );
      const top = placeBelow
        ? Math.max(
            VIEWPORT_PADDING_PX,
            Math.min(
              anchor.bottom + POPOVER_GAP_PX,
              viewportHeight - VIEWPORT_PADDING_PX - maxHeight
            )
          )
        : Math.max(
            VIEWPORT_PADDING_PX,
            anchor.top - POPOVER_GAP_PX - Math.min(naturalHeight, maxHeight)
          );
      setPopupStyle((current) => {
        if (
          current.left === left &&
          current.top === top &&
          current.width === width &&
          current.maxHeight === maxHeight &&
          current.visibility === "visible"
        ) {
          return current;
        }
        return { left, top, width, maxHeight, visibility: "visible" };
      });
    };
    const schedulePosition = () => {
      globalThis.cancelAnimationFrame?.(frame);
      frame = globalThis.requestAnimationFrame?.(updatePosition) ?? 0;
    };
    updatePosition();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedulePosition) : null;
    if (triggerRef.current) observer?.observe(triggerRef.current);
    if (popupRef.current) observer?.observe(popupRef.current);
    globalThis.addEventListener("resize", schedulePosition);
    globalThis.addEventListener("scroll", schedulePosition, true);
    return () => {
      globalThis.cancelAnimationFrame?.(frame);
      observer?.disconnect();
      globalThis.removeEventListener("resize", schedulePosition);
      globalThis.removeEventListener("scroll", schedulePosition, true);
    };
  }, [open, paletteId, palettes.length, recentColors.length]);

  useEffect(() => {
    if (!open || palettes.length > 0) return;
    let active = true;
    import("./studio-color-palettes")
      .then(({ STUDIO_PALETTES }) => {
        if (!active) return;
        setPalettes(STUDIO_PALETTES);
        setPaletteId((current) => (current || STUDIO_PALETTES[0]?.id) ?? "");
      })
      .catch((error) => {
        console.error("Failed to load studio color palettes:", error);
      });
    return () => {
      active = false;
    };
  }, [open, palettes.length]);

  // 팝오버 열림 동안 portal과 트리거 바깥을 누르면 닫는다. Escape는 트리거로 복귀한다.
  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target) || popupRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      globalThis.requestAnimationFrame?.(() => triggerRef.current?.focus({ preventScroll: true }));
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = globalThis.requestAnimationFrame?.(() =>
      hexInputRef.current?.focus({ preventScroll: true })
    );
    return () => globalThis.cancelAnimationFrame?.(frame ?? 0);
  }, [open]);

  // 색 확정 공통 경로 — 정규화 후 부모로 알리고 최근 색 기록 갱신. 비교용으로 팝오버는 닫지 않는다.
  const handleSelect = (raw: string): void => {
    const c = normalizeHexColor(raw) ?? raw;
    onChange(c);
    onUseColor?.(c);
  };

  const activePalette: StudioPalette | null = palettes.find((p) => p.id === paletteId) ?? palettes[0] ?? null;

  const eyeDropperCtor = getEyeDropperCtor();
  const triggerHint = studioColorPopoverTriggerHint(label, purpose);
  const closeAndRestoreFocus = () => {
    setOpen(false);
    globalThis.requestAnimationFrame?.(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div ref={rootRef} className={cx("relative inline-block", className)}>
      {/* 트리거 — 현재 색 스와치 */}
      <StudioToolHintTarget hint={triggerHint} preferredSide="bottom">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? popupId : undefined}
          onClick={() => setOpen((v) => !v)}
          className="h-7 w-7 cursor-pointer rounded border border-line pointer-coarse:size-11"
          style={{ background: value }}
        />
      </StudioToolHintTarget>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={popupRef}
          id={popupId}
          role="dialog"
          aria-modal="false"
          aria-label={`${label} 선택`}
          data-studio-color-popover="true"
          className="fixed z-[180] overflow-auto overscroll-contain rounded-lg border border-line bg-card p-3 shadow-[0_20px_56px_oklch(0.06_0.01_70/0.66)]"
          style={popupStyle}
        >
          {/* 헤더 + 닫기 */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.66rem] font-semibold text-fg-2">{label}</span>
            <button
              type="button"
              aria-label="닫기"
              onClick={closeAndRestoreFocus}
              className="rounded p-0.5 text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:grid pointer-coarse:size-11 pointer-coarse:place-items-center"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          {/* 네이티브 컬러 + 헥스 텍스트 + 스포이드 */}
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={isValidHexColor(value) ? value : "#000000"}
              onChange={(e) => handleSelect(e.target.value)}
              aria-label="색상 휠"
              className="h-7 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0 pointer-coarse:size-11"
            />
            <input
              ref={hexInputRef}
              type="text"
              value={hexDraft}
              spellCheck={false}
              aria-label="헥스 색상 코드"
              placeholder="#rrggbb"
              onChange={(e) => {
                const next = e.target.value;
                setHexDraft(next);
                const norm = normalizeHexColor(next);
                if (norm) handleSelect(norm);
              }}
              onBlur={(e) => {
                const norm = normalizeHexColor(e.target.value);
                if (norm) handleSelect(norm);
                else setHexDraft(value);
              }}
              className="h-7 min-w-0 flex-1 rounded border border-line bg-card px-2 text-xs tabular-nums text-fg-2 focus:outline-none focus:ring-1 focus:ring-accent pointer-coarse:h-11"
            />
            {eyeDropperCtor && (
              <StudioToolHintTarget hint={STUDIO_COLOR_EYEDROPPER_HINT} preferredSide="bottom">
                <button
                  type="button"
                  aria-label="화면에서 색 가져오기"
                  onClick={() => {
                    const ed = new eyeDropperCtor();
                    ed.open()
                      .then((r) => handleSelect(r.sRGBHex))
                      .catch(() => {});
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded border border-line text-fg-2 hover:bg-raised hover:text-fg pointer-coarse:size-11"
                >
                  <Pipette className="size-3.5" aria-hidden />
                </button>
              </StudioToolHintTarget>
            )}
          </div>

          {/* 최근 사용 색 */}
          {recentColors.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1 text-[0.6rem] font-medium uppercase tracking-wider text-fg-3">최근</p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="최근 색상">
                {recentColors.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    aria-label={`최근 색상 ${c} 선택`}
                    role="radio"
                    aria-checked={c.toLocaleLowerCase() === value.toLocaleLowerCase()}
                    onClick={() => handleSelect(c)}
                    className="h-7 w-7 cursor-pointer rounded border border-line aria-checked:ring-2 aria-checked:ring-accent aria-checked:ring-offset-1 aria-checked:ring-offset-card pointer-coarse:size-11"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 팔레트 탭 + 선택 팔레트 색 그리드 */}
          <div className="mt-2.5">
            {activePalette ? (
              <>
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {palettes.map((p) => (
                    <StudioToolHintTarget
                      key={p.id}
                      hint={studioPaletteFamilyHint(p.label, p.tip, p.id)}
                      preferredSide="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => setPaletteId(p.id)}
                        aria-pressed={p.id === activePalette.id}
                        className={cx(
                          "rounded border px-1.5 py-0.5 text-[0.66rem] transition-colors",
                          p.id === activePalette.id
                            ? "border-accent/60 bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg-2",
                          "pointer-coarse:min-h-11 pointer-coarse:px-3"
                        )}
                      >
                        {p.label}
                      </button>
                    </StudioToolHintTarget>
                  ))}
                </div>
                <div
                  className="flex flex-wrap gap-1"
                  role="radiogroup"
                  aria-label={`${activePalette.label} 팔레트`}
                >
                  {activePalette.colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`${activePalette.label} 색상 ${c} 선택`}
                      role="radio"
                      aria-checked={c.toLocaleLowerCase() === value.toLocaleLowerCase()}
                      onClick={() => handleSelect(c)}
                      className="h-7 w-7 cursor-pointer rounded border border-line aria-checked:ring-2 aria-checked:ring-accent aria-checked:ring-offset-1 aria-checked:ring-offset-card pointer-coarse:size-11"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-1" aria-label="팔레트 불러오는 중">
                {Array.from({ length: 18 }).map((_, i) => (
                  <span key={i} className="h-5 w-5 rounded border border-line bg-raised/70" />
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
