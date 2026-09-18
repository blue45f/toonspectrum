import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  hexToHsv,
  hsvToHex,
  type HsvColor,
} from "./studio-color-harmony-engine";

export interface StudioColorQuickPickerProps {
  readonly value: string;
  readonly onPreview: (hex: string) => void;
  readonly onCommit?: (hex: string) => void;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function StudioColorQuickPicker({
  value,
  onPreview,
  onCommit,
}: StudioColorQuickPickerProps) {
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(value));
  const svRef = useRef<HTMLButtonElement>(null);
  const draggingSvRef = useRef(false);
  const latestHexRef = useRef(value);

  useEffect(() => {
    const next = hexToHsv(value);
    latestHexRef.current = value;
    setHsv((current) =>
      next.s === 0 ? { ...next, h: current.h } : next,
    );
  }, [value]);

  const publish = useCallback(
    (next: HsvColor, commit = false) => {
      const normalized = {
        h: ((Math.round(next.h) % 360) + 360) % 360,
        s: clampPercent(next.s),
        v: clampPercent(next.v),
      };
      const hex = hsvToHex(normalized.h, normalized.s, normalized.v);
      latestHexRef.current = hex;
      setHsv(normalized);
      onPreview(hex);
      if (commit) onCommit?.(hex);
    },
    [onCommit, onPreview],
  );

  const updateSvFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      publish({
        ...hsv,
        s: (x / rect.width) * 100,
        v: (1 - y / rect.height) * 100,
      });
    },
    [hsv, publish],
  );

  const finishSv = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggingSvRef.current) return;
    updateSvFromPointer(event.clientX, event.clientY);
    draggingSvRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    onCommit?.(latestHexRef.current);
  };

  const handleSvKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 10 : 2;
    let saturation = hsv.s;
    let brightness = hsv.v;
    if (event.key === "ArrowLeft") saturation -= step;
    else if (event.key === "ArrowRight") saturation += step;
    else if (event.key === "ArrowDown") brightness -= step;
    else if (event.key === "ArrowUp") brightness += step;
    else return;
    event.preventDefault();
    publish({ ...hsv, s: saturation, v: brightness }, true);
  };

  const pureHue = `hsl(${hsv.h} 100% 50%)`;

  return (
    <div className="space-y-2" data-studio-quick-color-picker="true">
      <button
        ref={svRef}
        type="button"
        role="slider"
        aria-label={translateCurrentStaticSourceText("domains.creator.StudioColorQuickPicker", "ko", "채도와 명도")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v)}
        aria-valuetext={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioColorQuickPicker", "ko", "채도 {v0}%, 명도 {v1}%"), { v0: String(Math.round(hsv.s)), v1: String(Math.round(hsv.v)) })}
        onPointerDown={(event) => {
          draggingSvRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSvFromPointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (draggingSvRef.current) updateSvFromPointer(event.clientX, event.clientY);
        }}
        onPointerUp={finishSv}
        onPointerCancel={finishSv}
        onKeyDown={handleSvKeyDown}
        className="relative h-36 w-full touch-none overflow-hidden rounded-xl border border-white/15 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14),0_8px_20px_rgba(0,0,0,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ backgroundColor: pureHue }}
      >
        <span
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to right,#fff,transparent)" }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to top,#000,transparent)" }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.9),0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: value }}
          aria-hidden
        />
      </button>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[0.6rem] font-medium text-fg-3">
          <span>{translateCurrentStaticSourceText("domains.creator.StudioColorQuickPicker", "ko", "색조")}</span>
          <span className="font-mono tabular-nums">H {Math.round(hsv.h)}° · S {Math.round(hsv.s)} · V {Math.round(hsv.v)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={Math.round(hsv.h)}
          aria-label={translateCurrentStaticSourceText("domains.creator.StudioColorQuickPicker", "ko", "빠른 색조")}
          onChange={(event) => publish({ ...hsv, h: Number(event.currentTarget.value) })}
          onPointerUp={() => onCommit?.(latestHexRef.current)}
          onPointerCancel={() => onCommit?.(latestHexRef.current)}
          onKeyUp={(event) => {
            if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
              onCommit?.(latestHexRef.current);
            }
          }}
          onBlur={() => onCommit?.(latestHexRef.current)}
          className="h-3 w-full cursor-pointer appearance-none rounded-full border border-white/15 bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.8)]"
          style={{
            background:
              "linear-gradient(to right,#f00 0%,#ff0 16.66%,#0f0 33.33%,#0ff 50%,#00f 66.66%,#f0f 83.33%,#f00 100%)",
          }}
        />
      </div>
    </div>
  );
}
