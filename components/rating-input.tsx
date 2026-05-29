"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type RatingScale } from "@/lib/store";

const SCALE_LABEL: Record<RatingScale, string> = {
  star: "별점",
  ten: "10점",
  hundred: "100점",
};

// 0~5(store) → 표시 스케일
export function toScale(v: number, scale: RatingScale): string {
  if (scale === "ten") return (v * 2).toFixed(1).replace(/\.0$/, "");
  if (scale === "hundred") return String(Math.round(v * 20));
  return v.toFixed(1);
}
export function scaleMax(scale: RatingScale): string {
  return scale === "ten" ? "10" : scale === "hundred" ? "100" : "5";
}

export function ScaleSwitcher({ className }: { className?: string }) {
  const scale = useApp((s) => s.ratingScale);
  const setScale = useApp((s) => s.setRatingScale);
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-panel p-0.5", className)}>
      {(["star", "ten", "hundred"] as RatingScale[]).map((s) => (
        <button
          key={s}
          onClick={() => setScale(s)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            scale === s ? "bg-raised text-fg" : "text-fg-3 hover:text-fg-2"
          )}
        >
          {SCALE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

// 가변 별점 입력 — 스토어의 ratingScale 에 따라 입력 방식 전환. 항상 0~5로 정규화 저장.
export function RatingInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const scale = useApp((s) => s.ratingScale);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  if (scale === "star") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="flex" onMouseLeave={() => setHover(null)}>
          {Array.from({ length: 5 }).map((_, i) => {
            const base = i + 1;
            return (
              <span key={i} className="relative">
                {/* 왼쪽 절반 = 0.5 */}
                <button
                  aria-label={`${base - 0.5}점`}
                  onMouseEnter={() => setHover(base - 0.5)}
                  onClick={() => onChange(base - 0.5)}
                  className="absolute inset-y-0 left-0 z-10 w-1/2"
                />
                <button
                  aria-label={`${base}점`}
                  onMouseEnter={() => setHover(base)}
                  onClick={() => onChange(base)}
                  className="absolute inset-y-0 right-0 z-10 w-1/2"
                />
                <span className="relative block px-0.5">
                  <Star size={30} className="text-line-strong" strokeWidth={1.5} />
                  <span
                    className="absolute inset-0 overflow-hidden px-0.5"
                    style={{ width: `${Math.max(0, Math.min(1, shown - i)) * 100}%` }}
                  >
                    <Star size={30} className="fill-accent text-accent" strokeWidth={1.5} />
                  </span>
                </span>
              </span>
            );
          })}
        </div>
        <span className="numeral text-lg text-fg">
          {shown.toFixed(1)}
          <span className="text-sm text-fg-3"> / 5</span>
        </span>
      </div>
    );
  }

  if (scale === "ten") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex gap-1" onMouseLeave={() => setHover(null)}>
          {Array.from({ length: 10 }).map((_, i) => {
            const pt = i + 1;
            const active = shown * 2 >= pt;
            return (
              <button
                key={i}
                aria-label={`${pt}점`}
                onMouseEnter={() => setHover(pt / 2)}
                onClick={() => onChange(pt / 2)}
                className={cn(
                  "h-8 flex-1 rounded-md border transition-colors",
                  active ? "border-accent bg-accent" : "border-line bg-raised hover:border-line-strong"
                )}
              />
            );
          })}
        </div>
        <span className="numeral text-lg text-fg">
          {(shown * 2).toFixed(1).replace(/\.0$/, "")}
          <span className="text-sm text-fg-3"> / 10</span>
        </span>
      </div>
    );
  }

  // hundred — 슬라이더
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 20)}
        onChange={(e) => onChange(Number(e.target.value) / 20)}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-raised accent-accent"
        style={{
          background: `linear-gradient(90deg, var(--color-accent) ${value * 20}%, var(--color-raised) ${value * 20}%)`,
        }}
      />
      <span className="numeral w-16 text-right text-lg text-fg">
        {Math.round(value * 20)}
        <span className="text-sm text-fg-3"> / 100</span>
      </span>
    </div>
  );
}
