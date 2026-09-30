import { useId, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface AiIntensityControlProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly label?: string;
}

/**
 * AI 강도 조절 슬라이더 — 은은하게 ↔ 강하게.
 * 키보드 접근 가능, reduced-motion에서는 전환 애니메이션 제거.
 */
export function AiIntensityControl({ value, onChange, label }: AiIntensityControlProps) {
  const t = useBilingual("ai-assist");
  const inputId = useId();
  const [focused, setFocused] = useState(false);

  const displayLabel = label ?? t("AI 강도", "AI intensity");
  const levelLabel =
    value < 0.34
      ? t("은은하게", "Subtle")
      : value < 0.67
        ? t("자연스럽게", "Natural")
        : t("강하게", "Strong");

  return (
    <div className="ai-intensity">
      <div className="ai-intensity__header">
        <label htmlFor={inputId} className="ai-intensity__label">
          {displayLabel}
        </label>
        <span className="ai-intensity__level" aria-live="polite">
          {levelLabel}
        </span>
      </div>
      <div className={`ai-intensity__track${focused ? " ai-intensity__track--focused" : ""}`}>
        <span className="ai-intensity__endpoint" aria-hidden="true">
          {t("은은", "Soft")}
        </span>
        <input
          id={inputId}
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="ai-intensity__slider"
          aria-valuetext={levelLabel}
        />
        <span className="ai-intensity__endpoint" aria-hidden="true">
          {t("강함", "Bold")}
        </span>
      </div>
    </div>
  );
}
