import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
/**
 * Circular lettering controls for ToonStudio.
 * Keeps typography terminology concise and aligned with the shared Studio panel language.
 */

import { Compass } from "lucide-react";
import { useMemo } from "react";

import {
  layoutCircularText,
  type CircularTextOptions,
  type CircularTextResult,
} from "./studio-circular-text";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export interface StudioCircularTextPanelProps {
  readonly text: string;
  readonly enabled: boolean;
  readonly options: CircularTextOptions;
  readonly onToggleEnabled: (enabled: boolean) => void;
  readonly onOptionsChange: (options: CircularTextOptions) => void;
  readonly className?: string;
}

export function StudioCircularTextPanel({
  text,
  enabled,
  options,
  onToggleEnabled,
  onOptionsChange,
  className,
}: StudioCircularTextPanelProps) {
  const layout = useMemo<CircularTextResult>(() => {
    if (!text || !enabled) {
      return Object.freeze({ glyphs: Object.freeze([]), totalSpanDeg: 0 });
    }
    return layoutCircularText(text, options);
  }, [text, enabled, options]);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs text-fg shadow-sm",
        className,
      )}
      data-testid="studio-circular-text-panel"
    >
      {/* Header with toggle */}
      <div className="flex items-center justify-between border-b border-line/60 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-fg-2">
          <Compass size={15} className="text-accent" aria-hidden />
          <span>원형 글자 배치</span>
        </div>
        <button
          type="button"
          onClick={() => onToggleEnabled(!enabled)}
          // 고급 조판 디스클로저 안에서만 보이므로 advanced. 선언이 없는 상호작용 요소는
          // 밀도 감사가 unclassified-control 로 보고한다.
          data-inspector-control-id="typography.circular.enabled"
          data-inspector-priority="advanced"
          className={buttonClass({
            size: "sm",
            variant: enabled ? "solid" : "outline",
            className: cn(
              "h-6 px-2 text-[11px] font-medium transition-colors",
              enabled
                ? "border-accent bg-accent text-on-accent"
                : "border-line text-fg-3 hover:bg-raised hover:text-fg",
            ),
          })}
        >
          {enabled ? "사용 중" : "사용 안 함"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-fg-3">
        효과음이나 제목 글자를 원을 따라 배치하고 방향·간격을 바로 조절합니다.
      </p>

      {enabled && (
        <>
          {/* Real-time SVG preview */}
          <div className="relative flex h-36 flex-col items-center justify-center overflow-hidden rounded-xl border border-line/70 bg-panel/55 p-2">
            <svg
              viewBox="0 0 200 200"
              className="h-32 w-32 overflow-visible text-accent"
            >
              {/* Circle guideline */}
              <circle
                cx="100"
                cy="100"
                r={Math.min(80, Math.max(20, options.radius / 2))}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.2}
                strokeDasharray="3 3"
              />
              <circle
                cx="100"
                cy="100"
                r={2}
                fill="currentColor"
                fillOpacity={0.4}
              />
              {/* Glyphs */}
              {layout.glyphs.map((g) => {
                // normalize coordinates to 200x200 viewBox
                const nx =
                  100 +
                  ((g.x - options.centerX) / Math.max(1, options.radius)) *
                    Math.min(80, Math.max(20, options.radius / 2));
                const ny =
                  100 +
                  ((g.y - options.centerY) / Math.max(1, options.radius)) *
                    Math.min(80, Math.max(20, options.radius / 2));

                return (
                  <text
                    key={g.index}
                    x={nx}
                    y={ny}
                    transform={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.text.StudioCircularTextPanel", "en", "rotate({v0}, {v1}, {v2})"), { v0: String(g.rotationDeg), v1: String(nx), v2: String(ny) })}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="currentColor"
                    fontSize="13"
                    fontWeight="bold"
                  >
                    {g.char}
                  </text>
                );
              })}
            </svg>
            <div className="absolute bottom-1 right-2 text-[10px] text-fg-3">
              총 전개각: {Math.round(layout.totalSpanDeg)}°
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2.5 pt-1">
            {/* Radius slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-fg-3">반경</span>
                <span className="font-semibold tabular-nums text-fg-2">
                  {Math.round(options.radius)}px
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={300}
                step={2}
                value={options.radius}
                aria-label="원형 글자 반경"
                onChange={(e) =>
                  onOptionsChange({
                    ...options,
                    radius: Number(e.target.value),
                  })
                }
                data-inspector-control-id="typography.circular.radius"
                data-inspector-priority="advanced"
                className="h-6 w-full cursor-pointer accent-accent"
              />
            </div>

            {/* Start Angle slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-fg-3">시작 각도</span>
                <span className="font-semibold text-slate-200">
                  {Math.round(options.startAngleDeg ?? -90)}°
                </span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={options.startAngleDeg ?? -90}
                aria-label="원형 글자 시작 각도"
                onChange={(e) =>
                  onOptionsChange({
                    ...options,
                    startAngleDeg: Number(e.target.value),
                  })
                }
                data-inspector-control-id="typography.circular.start-angle"
                data-inspector-priority="advanced"
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-400"
              />
            </div>

            {/* Direction toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-fg-3">진행 방향</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onOptionsChange({ ...options, direction: "clockwise" })
                  }
                  data-inspector-control-id="typography.circular.direction.clockwise"
                  data-inspector-priority="advanced"
                  className={buttonClass({
                    size: "sm",
                    variant:
                      (options.direction ?? "clockwise") === "clockwise"
                        ? "solid"
                        : "ghost",
                    className: cn(
                      "h-6 px-2 text-[10px]",
                      (options.direction ?? "clockwise") === "clockwise"
                        ? "border-accent/45 bg-accent-soft text-fg"
                        : "text-fg-3 hover:bg-raised hover:text-fg",
                    ),
                  })}
                >
                  {translateCurrentStaticSourceText("domains.creator.text.StudioCircularTextPanel", "ko", "시계방향")}</button>
                <button
                  type="button"
                  onClick={() =>
                    onOptionsChange({
                      ...options,
                      direction: "counter-clockwise",
                    })
                  }
                  data-inspector-control-id="typography.circular.direction.counter-clockwise"
                  data-inspector-priority="advanced"
                  className={buttonClass({
                    size: "sm",
                    variant:
                      options.direction === "counter-clockwise"
                        ? "solid"
                        : "ghost",
                    className: cn(
                      "h-6 px-2 text-[10px]",
                      options.direction === "counter-clockwise"
                        ? "bg-slate-700 text-white"
                        : "text-slate-400",
                    ),
                  })}
                >
                  {translateCurrentStaticSourceText("domains.creator.text.StudioCircularTextPanel", "ko", "반시계방향")}</button>
              </div>
            </div>

            {/* Orientation toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-fg-3">글자 방향</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onOptionsChange({ ...options, orientation: "outward" })
                  }
                  data-inspector-control-id="typography.circular.orientation.outward"
                  data-inspector-priority="advanced"
                  className={buttonClass({
                    size: "sm",
                    variant:
                      (options.orientation ?? "outward") === "outward"
                        ? "solid"
                        : "ghost",
                    className: cn(
                      "h-6 px-2 text-[10px]",
                      (options.orientation ?? "outward") === "outward"
                        ? "bg-slate-700 text-white"
                        : "text-slate-400",
                    ),
                  })}
                >
                  {translateCurrentStaticSourceText("domains.creator.text.StudioCircularTextPanel", "ko", "바깥쪽")}</button>
                <button
                  type="button"
                  onClick={() =>
                    onOptionsChange({ ...options, orientation: "inward" })
                  }
                  data-inspector-control-id="typography.circular.orientation.inward"
                  data-inspector-priority="advanced"
                  className={buttonClass({
                    size: "sm",
                    variant:
                      options.orientation === "inward" ? "solid" : "ghost",
                    className: cn(
                      "h-6 px-2 text-[10px]",
                      options.orientation === "inward"
                        ? "bg-slate-700 text-white"
                        : "text-slate-400",
                    ),
                  })}
                >
                  {translateCurrentStaticSourceText("domains.creator.text.StudioCircularTextPanel", "ko", "안쪽")}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
