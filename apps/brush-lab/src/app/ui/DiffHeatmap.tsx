import { ImageCanvas } from "./LaneCanvas";

import type { LabImage } from "../../engine/core/types";

export interface DiffHeatmapProps {
  /** bench `compareLanes`가 만든 ΔE 차이맵. A·B 결과가 모두 있어야 생긴다. */
  image: LabImage | null;
  size: number;
}

/** A 대 B ΔE 차이맵 표시. */
export function DiffHeatmap({ image, size }: DiffHeatmapProps) {
  return (
    <figure className="lab-canvas-frame">
      <figcaption>
        <strong>차이맵</strong> · ΔE 색상 램프(A 대 B)
      </figcaption>
      <div className="lab-canvas-stage">
        <ImageCanvas image={image} size={size} label="A/B 차이맵(ΔE)" />
      </div>
      <p className="lab-muted">
        {image ? "어두울수록 일치, 밝을수록 ΔE가 크다(램프 상한 ΔE 10)." : "A·B 결과가 모두 있어야 계산한다."}
      </p>
    </figure>
  );
}
