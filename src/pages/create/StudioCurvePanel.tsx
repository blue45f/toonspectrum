/**
 * Studio Curve Panel
 * 인터랙티브 SVG 톤 커브 에디터 — 프리셋 칩 + 드래그 가능한 제어점.
 * studio-curves 엔진의 CurvePoint[]를 props로 읽고 onChange/onReset으로만 쓴다.
 * 로컬 상태는 드래그 중인 점 인덱스(drag) 하나뿐 — 나머지는 부모가 소유하는 표시 컴포넌트.
 * 좌표 변환은 svgRef의 getBoundingClientRect로 CSS 스케일을 보정한다(브라우저 전용, 테스트 대상 아님).
 */
import { useRef, useState } from "react";

import { RotateCcw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  addCurvePoint,
  CURVE_PRESETS,
  isIdentityCurve,
  moveCurvePoint,
  normalizeCurve,
  removeCurvePoint,
  type CurvePoint,
} from "./studio-curves";

// SVG 기하 — 정사각 플롯. PAD만큼 안쪽 여백을 두고 150x150 영역에 0..255 도메인을 매핑한다.
const SIZE = 170;
const PAD = 10;
const PLOT = SIZE - 2 * PAD; // 150
const AXIS_MAX = 255;
// 더블클릭 히트테스트 반경(SVG 단위) — 이 안에 점이 있으면 "점 위", 없으면 "빈 영역"으로 본다.
const HIT_RADIUS = 10;

// 프리셋 칩 — StudioLevelsPanel과 동일 idiom(활성 시 accent 보더 + raised 배경).
const CHIP_CLASS =
  "rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg";

/** 0..255로 반올림·클램프(엔진과 동일 규칙 — 화면 좌표 역변환 시 사용). */
function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > AXIS_MAX) return AXIS_MAX;
  return Math.round(value);
}

// 커브 도메인(0..255) → SVG 좌표. y는 위가 밝은 출력이 되도록 뒤집는다.
function toSvgX(x: number): number {
  return PAD + (x / AXIS_MAX) * PLOT;
}
function toSvgY(y: number): number {
  return PAD + (1 - y / AXIS_MAX) * PLOT;
}

export function StudioCurvePanel({
  points,
  onChange,
  onReset,
}: {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  onReset: () => void;
}): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  // 드래그 중인 제어점 인덱스(없으면 null) — 이 컴포넌트의 유일한 로컬 상태.
  const [drag, setDrag] = useState<number | null>(null);

  // 안전장치 — 외부 points가 비정상이어도 항상 정규화본으로 그린다(끝점 0/255, x 오름차순).
  const curve = normalizeCurve(points);
  const identity = isIdentityCurve(curve);

  // 화면 좌표(clientX/Y) → 커브 도메인 좌표(0..255). 스케일 보정 + 0 나눗셈 방어.
  // 측정 불가(미마운트/0폭)면 null.
  const clientToCurve = (clientX: number, clientY: number): { cx: number; cy: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    // 렌더 크기와 viewBox(SIZE) 비율로 SVG 로컬 좌표를 구한다.
    const px = (clientX - rect.left) * (SIZE / rect.width);
    const py = (clientY - rect.top) * (SIZE / rect.height);
    const cx = clampAxis(((px - PAD) / PLOT) * AXIS_MAX);
    const cy = clampAxis((1 - (py - PAD) / PLOT) * AXIS_MAX);
    return { cx, cy };
  };

  // 더블클릭 위치에서 가장 가까운 제어점 인덱스를 찾는다(SVG 단위 거리, HIT_RADIUS 이내). 없으면 -1.
  const hitTestPoint = (clientX: number, clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return -1;
    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return -1;
    const px = (clientX - rect.left) * (SIZE / rect.width);
    const py = (clientY - rect.top) * (SIZE / rect.height);
    let best = -1;
    let bestDist = HIT_RADIUS;
    for (let i = 0; i < curve.length; i++) {
      const dx = px - toSvgX(curve[i]!.x);
      const dy = py - toSvgY(curve[i]!.y);
      const dist = Math.hypot(dx, dy);
      if (dist <= bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  };

  // 드래그 중 포인터 이동 — 현재 점을 새 좌표로 옮긴다(끝점은 엔진이 x를 고정).
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (drag === null) return;
    const c = clientToCurve(e.clientX, e.clientY);
    if (!c) return;
    onChange(moveCurvePoint(curve, drag, c.cx, c.cy));
  };

  // 드래그 종료(놓거나 SVG 밖으로 나감).
  const endDrag = (): void => {
    if (drag !== null) setDrag(null);
  };

  // 더블클릭 — 점 위면 중간점 삭제, 빈 영역이면 그 지점에 점 추가.
  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const idx = hitTestPoint(e.clientX, e.clientY);
    if (idx > 0 && idx < curve.length - 1) {
      // 중간점만 삭제 가능(끝점은 엔진이 거부 → no-op).
      onChange(removeCurvePoint(curve, idx));
      return;
    }
    if (idx === -1) {
      // 빈 영역 — 클릭 위치에 점 추가.
      const c = clientToCurve(e.clientX, e.clientY);
      if (c) onChange(addCurvePoint(curve, c.cx, c.cy));
    }
    // 끝점 더블클릭은 무시(삭제 불가).
  };

  // 폴리라인 좌표 문자열 — 모든 점을 SVG 좌표로 변환해 잇는다.
  const polyPoints = curve.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(" ");

  // 4x4 격자 내부선 위치(테두리 제외한 3개 분할선).
  const gridLines = [1, 2, 3].map((n) => PAD + (n / 4) * PLOT);

  return (
    <div className="space-y-2">
      {/* 헤더 + 항등 복귀 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">톤 커브 (Curves)</p>
        <button
          type="button"
          onClick={onReset}
          disabled={identity}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="톤 커브를 제거하고 원본 톤으로 되돌립니다."
        >
          <RotateCcw className="size-3.5" />
          원본으로
        </button>
      </div>

      {/* 프리셋 칩 — 절대 곡선으로 덮어쓴다(누적 아님). "기본"은 항등일 때 활성 표시. */}
      <div className="flex flex-wrap gap-1.5">
        {CURVE_PRESETS.map((preset) => {
          const active = preset.id === "linear" && identity;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(normalizeCurve(preset.points))}
              title={preset.tip}
              className={cn(CHIP_CLASS, active && "border-accent bg-raised text-fg")}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* 인터랙티브 커브 — 격자/대각 기준선 + 폴리라인 + 드래그 핸들. */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[180px] mx-auto touch-none select-none bg-card rounded border border-line"
        role="img"
        aria-label="톤 커브 편집기"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onDoubleClick={handleDoubleClick}
      >
        {/* 4x4 격자 — 옅은 line 색. */}
        {gridLines.map((g) => (
          <line key={`v${g}`} x1={g} y1={PAD} x2={g} y2={SIZE - PAD} className="stroke-line/30" strokeWidth={0.75} />
        ))}
        {gridLines.map((g) => (
          <line key={`h${g}`} x1={PAD} y1={g} x2={SIZE - PAD} y2={g} className="stroke-line/30" strokeWidth={0.75} />
        ))}
        {/* 항등 기준 대각선(좌하단→우상단) — 비교용 옅은 가이드. */}
        <line
          x1={PAD}
          y1={SIZE - PAD}
          x2={SIZE - PAD}
          y2={PAD}
          className="stroke-line/60"
          strokeWidth={0.75}
          strokeDasharray="3 3"
        />
        {/* 현재 곡선. */}
        <polyline points={polyPoints} className="stroke-accent" strokeWidth={1.5} fill="none" strokeLinejoin="round" />
        {/* 제어점 핸들 — 포인터 다운으로 드래그 시작. */}
        {curve.map((p, i) => (
          <circle
            key={i}
            cx={toSvgX(p.x)}
            cy={toSvgY(p.y)}
            r={4}
            className="fill-accent cursor-grab"
            onPointerDown={(e) => {
              // 핸들에 포인터를 묶어 SVG 밖으로 빠르게 끌어도 이동 이벤트를 계속 받는다.
              e.currentTarget.setPointerCapture?.(e.pointerId);
              setDrag(i);
            }}
          />
        ))}
      </svg>

      <p className="text-[0.6rem] text-fg-4">점 드래그로 톤 조절 · 더블클릭으로 추가/삭제</p>
    </div>
  );
}
