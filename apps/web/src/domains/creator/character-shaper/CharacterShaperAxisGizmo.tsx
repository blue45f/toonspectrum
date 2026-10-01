/**
 * 뷰포트 오른쪽 위의 축 방향 표시(참조 아트의 XYZ 기즈모).
 *
 * 실제 렌더 카메라의 회전을 매 프레임 읽어 세 축을 그린다. React 상태를 거치지 않고 SVG 속성만
 * 바꾸며, 값이 바뀐 프레임에만 DOM을 건드린다. 조작 도구가 아니라 현재 시점을 알려 주는 표시다.
 */
import { useEffect, useRef } from "react";

import {
  CHARACTER_AXES,
  CHARACTER_AXIS_GIZMO_CENTER,
  CHARACTER_AXIS_GIZMO_SIZE,
  projectCharacterAxes,
} from "./character-shaper-axis";

import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

const SIZE = CHARACTER_AXIS_GIZMO_SIZE;
const CENTER = CHARACTER_AXIS_GIZMO_CENTER;
const LABEL_OFFSET = 7;
/** 뷰 행렬(column-major)에서 세 월드 축의 화면 x·y·깊이 성분 위치. */
const ROTATION_INDICES = [0, 1, 2, 4, 5, 6, 8, 9, 10] as const;
const ROTATION_EPSILON = 1e-4;

interface ViewMatrixSource {
  readonly current?: {
    readonly camera?: { readonly matrixWorldInverse?: { readonly elements: ArrayLike<number> } } | null;
  } | null;
}

function readViewElements(h: StudioVrmPoserHost): ArrayLike<number> | null {
  const source = h.captureRef as ViewMatrixSource | undefined;
  return source?.current?.camera?.matrixWorldInverse?.elements ?? null;
}

export function CharacterShaperAxisGizmo({ h }: { readonly h: StudioVrmPoserHost }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hostRef = useRef(h);
  useEffect(() => { hostRef.current = h; });
  const ready = h.status === "ready";

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    let frame = 0;
    // 회전 부분(열 0·1·2의 x·y·z)만 비교해 카메라가 움직인 프레임에만 계산하고 DOM을 바꾼다.
    const last = new Float64Array(ROTATION_INDICES.length).fill(Number.NaN);
    const rotationChanged = (elements: ArrayLike<number>): boolean => {
      let changed = false;
      ROTATION_INDICES.forEach((elementIndex, slot) => {
        const value = Number(elements[elementIndex] ?? 0);
        const previous = last[slot];
        if (previous === undefined || Number.isNaN(previous) || Math.abs(value - previous) > ROTATION_EPSILON) changed = true;
        last[slot] = value;
      });
      return changed;
    };
    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      const svg = svgRef.current;
      const elements = readViewElements(hostRef.current);
      if (!svg || !elements || !rotationChanged(elements)) return;
      for (const item of projectCharacterAxes(elements)) {
        const group = svg.querySelector<SVGGElement>(`[data-axis="${item.axis}"]`);
        if (!group) continue;
        // 깊이 순서대로 다시 붙여 앞쪽 축이 위에 그려지게 한다.
        svg.appendChild(group);
        const line = group.querySelector("line");
        const label = group.querySelector("text");
        const facingAway = item.depth < -0.2;
        line?.setAttribute("x2", item.x.toFixed(2));
        line?.setAttribute("y2", item.y.toFixed(2));
        group.setAttribute("opacity", facingAway ? "0.45" : "1");
        const dx = item.x - CENTER;
        const dy = item.y - CENTER;
        const length = Math.hypot(dx, dy) || 1;
        label?.setAttribute("x", (item.x + (dx / length) * LABEL_OFFSET).toFixed(2));
        label?.setAttribute("y", (item.y + (dy / length) * LABEL_OFFSET).toFixed(2));
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [ready]);

  if (!ready) return null;
  return (
    <svg
      ref={svgRef}
      aria-hidden
      data-character-axis-gizmo="true"
      className="character-axis-gizmo"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
    >
      <circle cx={CENTER} cy={CENTER} r={CENTER - 2} className="character-axis-gizmo__ring" />
      {CHARACTER_AXES.map((axis) => (
        <g key={axis} data-axis={axis} className={`character-axis-gizmo__axis character-axis-gizmo__axis--${axis}`}>
          <line x1={CENTER} y1={CENTER} x2={CENTER} y2={CENTER} />
          <text x={CENTER} y={CENTER} textAnchor="middle" dominantBaseline="central">{axis.toUpperCase()}</text>
        </g>
      ))}
    </svg>
  );
}
