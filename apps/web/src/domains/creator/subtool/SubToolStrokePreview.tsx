import { useEffect, useRef, type ReactElement } from "react";

import { SUBTOOL_BLEND_MODE_LABELS, type SubToolParams } from "./subtool-params";
import { renderSubToolStrokePreview } from "./subtool-stroke-render";

/**
 * 서브툴 미리보기 스트로크 렌더러 (React 래퍼).
 * 실제 렌더 로직은 `subtool-stroke-render.ts`의 순수 함수에 있다.
 */

interface SubToolStrokePreviewProps {
  readonly params: SubToolParams;
  readonly className?: string;
}

const PREVIEW_WIDTH = 560;
const PREVIEW_HEIGHT = 120;

export function SubToolStrokePreview({
  params,
  className,
}: SubToolStrokePreviewProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio =
      typeof window !== "undefined" && window.devicePixelRatio
        ? window.devicePixelRatio
        : 1;
    canvas.width = Math.round(PREVIEW_WIDTH * ratio);
    canvas.height = Math.round(PREVIEW_HEIGHT * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    renderSubToolStrokePreview(ctx, PREVIEW_WIDTH, PREVIEW_HEIGHT, params);
  }, [params]);

  const blendLabel = SUBTOOL_BLEND_MODE_LABELS[params.blending.mode];

  return (
    <figure className={className}>
      <canvas
        ref={canvasRef}
        data-testid="subtool-stroke-preview"
        role="img"
        aria-label={`서브툴 미리보기 획 (팁 ${Math.round(params.tip.size)}px, 혼합 ${blendLabel})`}
        className="h-[7.5rem] w-full rounded-lg border border-line bg-card"
        style={{ width: "100%", height: "7.5rem" }}
      />
      <figcaption className="mt-1 text-[0.62rem] text-fg-3">
        파라미터가 반영된 간이 미리보기입니다.
      </figcaption>
    </figure>
  );
}
