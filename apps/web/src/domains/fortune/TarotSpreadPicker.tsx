import { TAROT_SPREADS, type TarotSpreadId } from "@toonstudio/core/fortune";

import { getCurrentUiLocale, translateAuthoredSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

// 타로 스프레드 선택 — 카드 배치 미니 도식(SVG)으로 "뽑으면 어떻게 펼쳐지는지"를 보여준다.
// 화려함(카드 도식) + 직관성(한눈에 보이는 레이아웃)을 동시에.

export interface TarotSpreadPickerProps {
  value: TarotSpreadId;
  onChange: (spread: TarotSpreadId) => void;
}

function MiniCard({ x, y, w = 10, h = 15, highlight = false }: { x: number; y: number; w?: number; h?: number; highlight?: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx="1.5"
      fill={highlight ? "#f59e0b" : "#2a2440"}
      fillOpacity={highlight ? 0.9 : 1}
      stroke="#a78bfa"
      strokeOpacity={highlight ? 1 : 0.45}
      strokeWidth="0.8"
    />
  );
}

function SpreadDiagram({ spread }: { spread: TarotSpreadId }) {
  // 각 스프레드의 카드 배치를 미니 도식으로
  if (spread === "one") {
    return (
      <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
        <MiniCard x={15} y={10} w={10} h={16} highlight />
        <circle cx={20} cy={18} r={3} fill="none" stroke="#fbbf24" strokeWidth="0.8" opacity="0.8" />
      </svg>
    );
  }
  if (spread === "three") {
    return (
      <svg viewBox="0 0 60 40" className="h-10 w-14" aria-hidden="true">
        <MiniCard x={4} y={12} w={12} h={18} />
        <MiniCard x={24} y={8} w={12} h={18} highlight />
        <MiniCard x={44} y={12} w={12} h={18} />
      </svg>
    );
  }
  if (spread === "celtic-cross") {
    // 켈틱 크로스: 중앙 십자 + 오른쪽 기둥 4장
    return (
      <svg viewBox="0 0 70 60" className="h-12 w-14" aria-hidden="true">
        {/* 중앙 십자 */}
        <MiniCard x={14} y={18} w={11} h={17} highlight />
        <g transform="rotate(90 19.5 26.5)">
          <MiniCard x={14} y={18} w={11} h={17} />
        </g>
        <MiniCard x={14} y={2} w={11} h={17} />
        <MiniCard x={14} y={36} w={11} h={17} />
        <MiniCard x={2} y={18} w={11} h={17} />
        <MiniCard x={27} y={18} w={11} h={17} />
        {/* 오른쪽 기둥 4장 */}
        <MiniCard x={46} y={1} w={10} h={13} />
        <MiniCard x={46} y={16} w={10} h={13} />
        <MiniCard x={46} y={31} w={10} h={13} />
        <MiniCard x={46} y={46} w={10} h={13} />
      </svg>
    );
  }
  // relationship: 2열 3행
  return (
    <svg viewBox="0 0 50 60" className="h-12 w-10" aria-hidden="true">
      <MiniCard x={3} y={3} w={11} h={16} />
      <MiniCard x={36} y={3} w={11} h={16} />
      <MiniCard x={3} y={23} w={11} h={16} highlight />
      <MiniCard x={36} y={23} w={11} h={16} />
      <MiniCard x={3} y={43} w={11} h={16} />
      <MiniCard x={36} y={43} w={11} h={16} />
    </svg>
  );
}

const SPREAD_ORDER: TarotSpreadId[] = ["one", "three", "celtic-cross", "relationship"];

export function TarotSpreadPicker({ value, onChange }: TarotSpreadPickerProps) {
  const locale = getCurrentUiLocale();
  const tx = (source: string) => translateAuthoredSourceText(locale, "ko", "TarotSpreadPicker", source);

  return (
    <div role="radiogroup" aria-label={tx("타로 스프레드 선택")} className="mx-auto grid max-w-lg grid-cols-2 gap-2">
      {SPREAD_ORDER.map((id) => {
        const spread = TAROT_SPREADS[id];
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all",
              selected
                ? "border-accent bg-accent-soft/60 shadow-[0_0_18px_-6px_var(--color-accent)]"
                : "border-line bg-card/20 hover:border-accent/40 hover:bg-card/30"
            )}
          >
            <SpreadDiagram spread={id} />
            <span className="min-w-0">
              <span className={cn("block text-xs font-extrabold", selected ? "text-accent" : "text-fg")}>
                {locale.startsWith("ko") ? spread.ko : spread.en}
              </span>
              <span className="block text-[10px] font-semibold text-fg-3">
                {spread.cardCount}
                {tx("장")}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-fg-3">
                {locale.startsWith("ko") ? spread.summaryKo : spread.en}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
