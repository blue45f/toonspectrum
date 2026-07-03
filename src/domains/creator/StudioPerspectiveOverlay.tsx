/**
 * Studio Perspective Overlay — 원근자 소실점 핸들 + 부채꼴 안내선(Konva).
 * StudioPage 의 <Stage> 트리 안에서만 동작할 수 있어(react-konva 는 별도 트리로
 * 포탈될 수 없음) lazy-load 하지 않고 일반 import 로 쓴다 — ClipMaskGroup.tsx 와 동일한
 * 이유의 예외. 상태 없는 순수 프레젠테이션(fully-controlled, StudioPage 가 좌표를 소유).
 */
import { Circle as KCircle, Group, Line } from "react-konva/lib/ReactKonvaCore";

import { perspectiveFanRays, type VanishingPoint } from "./studio-perspective-guide";

import type Konva from "konva";
import type { ReactElement } from "react";

export type StudioPerspectiveOverlayProps = {
  points: VanishingPoint[];
  canvasWidth: number;
  canvasHeight: number;
  effScale: number;
  onMovePoint: (id: string, x: number, y: number) => void;
};

const VP_COLOR = "#f97316"; // 대칭자(#0ea5e9)와 시각적으로 구분되는 색.

export function StudioPerspectiveOverlay({
  points,
  canvasWidth,
  canvasHeight,
  effScale,
  onMovePoint,
}: StudioPerspectiveOverlayProps): ReactElement {
  const fanRays = perspectiveFanRays(points, canvasWidth, canvasHeight);

  return (
    <>
      {fanRays.map((ray, index) => (
        <Line
          key={`${ray.vpId}-${index}`}
          points={[ray.x1, ray.y1, ray.x2, ray.y2]}
          stroke={VP_COLOR}
          strokeWidth={1 / effScale}
          dash={[4 / effScale, 4 / effScale]}
          opacity={0.5}
          listening={false}
        />
      ))}
      {points.map((vp) => (
        <Group key={vp.id}>
          <KCircle
            x={vp.x}
            y={vp.y}
            radius={8 / effScale}
            fill={VP_COLOR}
            stroke="#ffffff"
            strokeWidth={2 / effScale}
            draggable
            name="vp-handle"
            onMouseEnter={(e: Konva.KonvaEventObject<MouseEvent>) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "move";
            }}
            onMouseLeave={(e: Konva.KonvaEventObject<MouseEvent>) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "default";
            }}
            onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
              // 대칭축 핸들과 달리 캔버스 밖 좌표도 허용한다(의도적, 클램프 없음).
              onMovePoint(vp.id, e.target.x(), e.target.y());
            }}
          />
        </Group>
      ))}
    </>
  );
}
