import { useId } from "react";

import { STABILIZER_MAX } from "./studio-brush";
import {
  STUDIO_STABILIZER_MODES,
  type StudioStabilizerMode,
} from "./studio-stroke-stabilizer";

import { cx } from "@/lib/cx";

export interface StudioLineCorrectionControlsProps {
  stabilizer: number;
  onStabilizerChange: (value: number) => void;
  mode: StudioStabilizerMode;
  onModeChange: (value: StudioStabilizerMode) => void;
  postCorrection: number;
  onPostCorrectionChange: (value: number) => void;
  preserveCorners: boolean;
  onPreserveCornersChange: (value: boolean) => void;
  density?: "compact" | "touch";
  className?: string;
}
export function StudioLineCorrectionControls({
  stabilizer,
  onStabilizerChange,
  mode,
  onModeChange,
  postCorrection,
  onPostCorrectionChange,
  preserveCorners,
  onPreserveCornersChange,
  density = "compact",
  className,
}: StudioLineCorrectionControlsProps) {
  const descriptionId = useId();
  const touch = density === "touch";
  const selectedMode = STUDIO_STABILIZER_MODES.find((candidate) => candidate.id === mode)
    ?? STUDIO_STABILIZER_MODES[1];

  return (
    <section
      aria-label="선 보정"
      className={cx(
        "border-t border-line/35",
        touch ? "mt-2.5 space-y-2.5 pt-2.5" : "space-y-2 pt-2",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cx("font-semibold text-fg-2", touch ? "text-xs" : "text-[0.7rem]")}>선 보정</span>
        <span className="text-[0.62rem] tabular-nums text-fg-3">
          입력 {stabilizer} · 후보정 {postCorrection}
        </span>
      </div>

      <label className={cx("flex items-center justify-between gap-2 text-fg-3", touch ? "text-[0.7rem]" : "text-xs")}>
        <span>입력 안정화</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <input
            type="range"
            min={0}
            max={STABILIZER_MAX}
            step={1}
            value={stabilizer}
            onChange={(event) => onStabilizerChange(Number(event.target.value))}
            aria-label="입력 선 보정 강도"
            className={cx("cursor-pointer accent-accent", touch ? "h-10 w-full max-w-52" : "w-24")}
          />
          <span className="w-5 text-right tabular-nums">{stabilizer}</span>
        </span>
      </label>

      <label className={cx("flex items-center justify-between gap-3 text-fg-3", touch ? "min-h-11 text-[0.7rem]" : "text-xs")}>
        <span className="shrink-0">보정 방식</span>
        <select
          value={mode}
          onChange={(event) => onModeChange(event.target.value as StudioStabilizerMode)}
          aria-describedby={descriptionId}
          className={cx(
            "min-w-0 rounded-lg border border-line bg-card px-2 text-fg outline-none focus:border-accent",
            touch ? "min-h-11 flex-1 text-xs" : "h-7 w-32 text-xs"
          )}
        >
          {STUDIO_STABILIZER_MODES.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
          ))}
        </select>
      </label>
      <p id={descriptionId} className="text-[0.62rem] leading-relaxed text-fg-3">
        {selectedMode.description}
      </p>

      <label className={cx("flex items-center justify-between gap-2 text-fg-3", touch ? "text-[0.7rem]" : "text-xs")}>
        <span title="펜을 놓은 뒤 좌표를 한 번 더 정리합니다.">그린 후 보정</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <input
            type="range"
            min={0}
            max={STABILIZER_MAX}
            step={1}
            value={postCorrection}
            onChange={(event) => onPostCorrectionChange(Number(event.target.value))}
            aria-label="그린 후 선 보정 강도"
            className={cx("cursor-pointer accent-accent", touch ? "h-10 w-full max-w-52" : "w-24")}
          />
          <span className="w-5 text-right tabular-nums">{postCorrection}</span>
        </span>
      </label>

      <label
        className={cx(
          "flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-card/45 px-2.5 text-fg-2",
          touch ? "min-h-11 text-xs" : "min-h-8 text-xs"
        )}
      >
        <span>
          <span className="block font-medium">각진 선 보존</span>
          {touch ? <span className="block text-[0.62rem] leading-relaxed text-fg-3">말풍선·의상 모서리가 둥글어지는 것을 방지</span> : null}
        </span>
        <input
          type="checkbox"
          checked={preserveCorners}
          onChange={(event) => onPreserveCornersChange(event.target.checked)}
          className={cx("shrink-0 rounded accent-accent", touch ? "size-5" : "size-4")}
        />
      </label>
    </section>
  );
}
