import { Check } from "lucide-react";
import { useId, useRef, useState } from "react";

/** One Tab stop per color set. Arrow navigation never applies a color. */
export function StudioColorSwatches({ title, colors, value, onChoose }: {
  readonly title: string;
  readonly colors: readonly string[];
  readonly value: string;
  readonly onChoose: (color: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const entry = focused && colors.includes(focused) ? focused : colors.includes(value) ? value : colors[0];
  return <section className="space-y-2" aria-label={title}>
    <h4 className="text-xs font-semibold text-fg-2">{title}</h4>
    {colors.length ? <>
      <p id={id} className="sr-only">방향키로 이동하고 Enter 또는 Space로 선택하세요. Home과 End로 처음과 마지막 색에 이동합니다.</p>
      <div ref={root} className="grid grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1.5 pointer-coarse:grid-cols-[repeat(auto-fill,minmax(44px,1fr))]"
        role="group" aria-label={`${title} 목록`} aria-describedby={id}>
        {colors.map((color, index) => <button key={color} type="button" aria-label={`${title} ${color} 적용`}
          aria-pressed={color === value} tabIndex={color === entry ? 0 : -1}
          onFocus={() => setFocused(color)} onClick={() => onChoose(color)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
            const firstTop = buttons[0]?.getBoundingClientRect().top ?? 0;
            const nextRow = buttons.findIndex((item) => Math.abs(item.getBoundingClientRect().top - firstTop) > 1);
            const columns = nextRow > 0 ? nextRow : colors.length;
            const next = event.key === "Home" ? 0 : event.key === "End" ? colors.length - 1
              : event.key === "ArrowLeft" ? (index - 1 + colors.length) % colors.length
                : event.key === "ArrowRight" ? (index + 1) % colors.length
                  : Math.max(0, Math.min(colors.length - 1, index + (event.key === "ArrowDown" ? columns : -columns)));
            buttons[next]?.focus({ preventScroll: true });
            buttons[next]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
          }}
          className="relative min-h-9 min-w-0 rounded-md border border-line-strong focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11"
          style={{ background: color }}>
          {color === value ? <Check size={16} aria-hidden className="mx-auto text-white [filter:drop-shadow(0_1px_1px_black)]" /> : null}
        </button>)}
      </div>
    </> : <p className="text-xs leading-relaxed text-fg-2">{title === "최근 선택 색" ? "확정한 색상이 없습니다. 색을 적용하면 이곳에 쌓입니다." : "이 원고에 지정된 색상이 없습니다. 이미지의 색상 추출 결과는 별도로 표시됩니다."}</p>}
  </section>;
}
