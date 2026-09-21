import { useLayoutEffect, useRef, useState } from "react";

/** Preserve a numeric draft while typing; clearing a channel must not paint it black. */
export function StudioColorChannelInput({ label, value, min, max, step = 1, onChange }: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const editing = useRef(false);
  const composing = useRef(false);
  const initial = useRef(value);
  const latest = useRef(value);
  const previous = useRef(value);
  useLayoutEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (value !== latest.current) { editing.current = false; initial.current = value; setRaw(null); }
    latest.current = value;
  }, [value]);
  const begin = () => {
    if (editing.current) return;
    editing.current = true; initial.current = value; latest.current = value;
  };
  const preview = (text: string) => {
    begin(); setRaw(text);
    if (composing.current || !text.trim()) return;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    const precision = Math.max(0, (String(step).split(".")[1] ?? "").length);
    const normalized = Number((Math.round(Math.max(min, Math.min(max, parsed)) / step) * step).toFixed(precision));
    if (normalized === latest.current) return;
    latest.current = normalized; onChange(normalized);
  };
  return <input type="number" min={min} max={max} step={step} value={raw ?? String(value)} aria-label={label}
    onFocus={begin}
    onChange={(event) => preview(event.currentTarget.value)}
    onCompositionStart={() => { begin(); composing.current = true; }}
    onCompositionEnd={(event) => { composing.current = false; preview(event.currentTarget.value); }}
    onBlur={(event) => {
      if (composing.current) { composing.current = false; event.stopPropagation(); }
      editing.current = false; setRaw(null);
    }}
    onKeyDown={(event) => {
      if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape" && editing.current) {
        event.preventDefault(); event.stopPropagation();
        const original = initial.current; editing.current = false; latest.current = original; setRaw(null);
        onChange(original);
      } else if (event.key === "Enter") {
        setRaw(null); editing.current = false; event.currentTarget.select();
      }
    }}
    className="min-h-9 w-16 shrink-0 rounded-lg border border-line bg-card px-1 text-center font-mono text-xs tabular-nums text-fg focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11" />;
}
