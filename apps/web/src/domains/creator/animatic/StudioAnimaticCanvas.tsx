import { useLayoutEffect, useRef } from "react";

import { planStudioAnimaticPreview, sampleStudioAnimaticPreview, type StudioAnimaticPreviewSample } from "../studio-animatic-timeline";
import { drawStudioAnimaticFrame, type StudioAnimaticImages } from "./studio-animatic-renderer";

import type { StudioAnimaticWorkspaceSnapshot } from "./studio-animatic-workspace";

export function StudioAnimaticCanvas({ snapshot, images, sample, timeMs = 0, thumbnail = false, label = "스토리보드 원고 미리보기" }: {
  snapshot: StudioAnimaticWorkspaceSnapshot;
  images: StudioAnimaticImages;
  sample?: StudioAnimaticPreviewSample;
  timeMs?: number;
  thumbnail?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = thumbnail ? 120 : 360;
  const height = thumbnail ? 68 : 640;
  useLayoutEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    const planned = planStudioAnimaticPreview(snapshot.timeline, false);
    const at = sample ?? (planned.ok ? sampleStudioAnimaticPreview(snapshot.timeline, planned.plan, timeMs, false) : null);
    if (at) drawStudioAnimaticFrame(context, width, height, snapshot, at, images);
  }, [height, images, sample, snapshot, timeMs, width]);
  return <canvas ref={ref} width={width} height={height} role="img" aria-label={label}
    data-studio-animatic-artwork={thumbnail ? "thumbnail" : "preview"}
    className={thumbnail ? "mb-2 h-16 w-full rounded-lg object-contain" : "h-full max-h-full w-full object-contain"} />;
}
