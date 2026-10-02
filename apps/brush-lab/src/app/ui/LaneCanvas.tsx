import { useEffect, useRef, useState } from "react";

import { clearCanvas, presentLabImage } from "../../platform/canvas-present";

import type { LabImage } from "../../engine/core/types";
import type { ReactNode } from "react";

/** readback 이미지 1장을 `putImageData`로 올리는 캔버스. 표시 실패는 캔버스 위에 오류로 드러낸다. */
export interface ImageCanvasProps {
  image: LabImage | null;
  /** 이미지가 없을 때의 논리 크기(px, 정사각). */
  size: number;
  label: string;
  className?: string;
  canvasRef?: (el: HTMLCanvasElement | null) => void;
}

export function ImageCanvas({ image, size, label, className, canvasRef }: ImageCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    try {
      if (image) {
        presentLabImage(canvas, image);
      } else {
        canvas.width = size;
        canvas.height = size;
        clearCanvas(canvas);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [image, size]);
  return (
    <>
      <canvas
        ref={(el) => {
          ref.current = el;
          if (canvasRef) canvasRef(el);
        }}
        className={className}
        role="img"
        aria-label={label}
        width={image?.width ?? size}
        height={image?.height ?? size}
      />
      {error ? (
        <div className="lab-canvas-error" role="alert">
          캔버스 표시 실패: {error}
        </div>
      ) : null}
    </>
  );
}

export interface LaneCanvasProps {
  slot: "A" | "B";
  laneLabel: string;
  image: LabImage | null;
  size: number;
  pixelHash: string | null;
  live?: boolean;
  stageRef?: (el: HTMLDivElement | null) => void;
  presentRef?: (el: HTMLCanvasElement | null) => void;
  previewRef?: (el: HTMLCanvasElement | null) => void;
  children?: ReactNode;
}

/** A/B 슬롯 캔버스: 정본 레이어 + 예측·입력 궤적 미리보기 레이어(scratch). */
export function LaneCanvas({
  slot,
  laneLabel,
  image,
  size,
  pixelHash,
  live = false,
  stageRef,
  presentRef,
  previewRef,
  children,
}: LaneCanvasProps) {
  const hashText = pixelHash ? `pixelHash ${pixelHash}` : "결과 없음";
  return (
    <figure className="lab-canvas-frame">
      <figcaption>
        <strong>{slot}</strong> · {laneLabel}{" "}
        {live ? <span className="lab-badge lab-badge--warn">실시간 입력</span> : null}
      </figcaption>
      <div
        ref={stageRef}
        className={`lab-canvas-stage${live ? " lab-canvas-stage--live" : ""}`}
        data-testid={`lab-stage-${slot}`}
        aria-label={live ? `${slot} 레인 실시간 입력 영역(펜·마우스로 그린다)` : undefined}
      >
        <ImageCanvas
          image={image}
          size={size}
          label={`${slot} 레인(${laneLabel}) 결과 — ${hashText}`}
          canvasRef={presentRef}
        />
        <canvas
          ref={previewRef}
          className="lab-canvas-preview"
          width={size}
          height={size}
          aria-hidden="true"
          data-testid={`lab-preview-${slot}`}
        />
      </div>
      <p className="lab-muted lab-mono">{hashText}</p>
      {children}
    </figure>
  );
}
