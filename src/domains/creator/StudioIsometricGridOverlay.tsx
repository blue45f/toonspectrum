/**
 * Studio Isometric Grid Overlay — 아이소메트릭 그리드 평행선 다발 + 드래그 가능한 기준점
 * 핸들(Konva). StudioPage 의 <Stage> 트리 안에서만 동작할 수 있어(react-konva 는 별도
 * 트리로 포탈될 수 없음) lazy-load 하지 않고 일반 import 로 쓴다 — StudioPerspectiveOverlay.tsx
 * 와 동일한 이유의 예외. 상태 없는 순수 프레젠테이션(fully-controlled, StudioPage 가 좌표를 소유).
 */
import { Circle as KCircle, Group, Line } from "react-konva/lib/ReactKonvaCore";

import { isometricGridLines, type IsometricGridConfig } from "./studio-isometric-grid";

import type Konva from "konva";
import type { ReactElement } from "react";

export type StudioIsometricGridOverlayProps = {
  config: IsometricGridConfig;
  canvasWidth: number;
  canvasHeight: number;
  effScale: number;
  onMoveOrigin: (x: number, y: number) => void;
};

// 원근자 소실점(#f97316)/대칭자(#0ea5e9)와 시각적으로 구분되는 색.
const GRID_COLOR = "#a855f7";

export function StudioIsometricGridOverlay({
  config,
  canvasWidth,
  canvasHeight,
  effScale,
  onMoveOrigin,
}: StudioIsometricGridOverlayProps): ReactElement {
  const lines = isometricGridLines(config, canvasWidth, canvasHeight);

  return (
    <>
      {lines.map((line, index) => (
        <Line
          key={`${line.axisIndex}-${index}`}
          points={[line.x1, line.y1, line.x2, line.y2]}
          stroke={GRID_COLOR}
          // 수직축(axisIndex 2)을 살짝 더 진하게 그려 기준축으로 눈에 띄게 한다.
          strokeWidth={(line.axisIndex === 2 ? 1 : 0.75) / effScale}
          opacity={line.axisIndex === 2 ? 0.4 : 0.28}
          listening={false}
        />
      ))}
      <Group>
        <KCircle
          x={config.originX}
          y={config.originY}
          radius={8 / effScale}
          fill={GRID_COLOR}
          stroke="#ffffff"
          strokeWidth={2 / effScale}
          draggable
          name="isometric-origin-handle"
          onMouseEnter={(e: Konva.KonvaEventObject<MouseEvent>) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = "move";
          }}
          onMouseLeave={(e: Konva.KonvaEventObject<MouseEvent>) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = "default";
          }}
          onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
            // 원근자 소실점 핸들과 동일하게 캔버스 밖 좌표도 허용한다(의도적, 클램프 없음).
            onMoveOrigin(e.target.x(), e.target.y());
          }}
        />
      </Group>
    </>
  );
}
