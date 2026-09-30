/**
 * AI 배경 보조 — 퍼스펙티브 그리드 자동 생성
 *
 * 1/2/3점 투시 그리드를 SVG 패스로 생성하는 순수 로직.
 * 배경 작화 시 원근 보조선으로 사용한다.
 */

export type AiPerspectiveType = "one-point" | "two-point" | "three-point";

export interface AiPerspectiveGridOptions {
  readonly type: AiPerspectiveType;
  readonly width: number;
  readonly height: number;
  /** 소실점 위치 (캔버스 좌표). two-point는 2개, three-point는 3개 */
  readonly vanishingPoints: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** 수평선 y (one-point용, 생략 시 vanishingPoints[0].y) */
  readonly horizonY?: number;
  /** 그리드 밀도 (선 간격 px) */
  readonly spacing: number;
}

export interface AiGridLine {
  /** SVG path d */
  readonly d: string;
  readonly kind: "radial" | "horizon" | "vertical";
}

/**
 * 퍼스펙티브 그리드 선 목록 생성.
 * - radial: 각 소실점에서 방사형으로 뻗는 선
 * - horizon: 수평선
 * - vertical: (three-point) 수직 소실점 방사선
 */
export function generatePerspectiveGrid(options: {
  readonly type: AiPerspectiveType;
  readonly width: number;
  readonly height: number;
  readonly vanishingPoints: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly horizonY?: number;
  readonly spacing?: number;
}): readonly AiGridLine[] {
  const { type, width, height, vanishingPoints } = options;
  const spacing = options.spacing ?? 48;
  const lines: AiGridLine[] = [];

  const rayTo = (vx: number, vy: number, angle: number): AiGridLine => {
    // 소실점에서 angle 방향으로 캔버스 경계까지 선을 긋는다
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // 경계와 만나는 t 계산
    const candidates: number[] = [];
    if (dx > 0.0001) candidates.push((width - vx) / dx);
    else if (dx < -0.0001) candidates.push(-vx / dx);
    if (dy > 0.0001) candidates.push((height - vy) / dy);
    else if (dy < -0.0001) candidates.push(-vy / dy);
    const positive = candidates.filter((c) => c > 0);
    const t = positive.length > 0 ? Math.min(...positive) : 0;
    const ex = vx + dx * t;
    const ey = vy + dy * t;
    return {
      d: `M ${round1(vx)} ${round1(vy)} L ${round1(ex)} ${round1(ey)}`,
      kind: "radial",
    };
  };

  const neededPoints = type === "one-point" ? 1 : type === "two-point" ? 2 : 3;
  const vps = vanishingPoints.slice(0, neededPoints);

  // 방사선: 각 소실점에서 15도 간격
  for (const vp of vps) {
    for (let deg = 0; deg < 360; deg += 15) {
      lines.push(rayTo(vp.x, vp.y, (deg * Math.PI) / 180));
    }
  }

  // 수평선
  const horizonY = options.horizonY ?? vps[0]?.y ?? height / 2;
  lines.push({
    d: `M 0 ${round1(horizonY)} L ${width} ${round1(horizonY)}`,
    kind: "horizon",
  });

  // 수직 보조선 (one-point 투시에서 깊이감 표현용)
  if (type === "one-point" && vps[0]) {
    for (let x = spacing; x < width; x += spacing) {
      lines.push({ d: `M ${x} 0 L ${x} ${height}`, kind: "vertical" });
    }
  }

  return lines;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 소실점 기본 배치 제안 — 캔버스 크기로 합리적인 기본값을 만든다.
 * one-point: 중앙, two-point: 좌우 1/3, three-point: + 상단/하단
 */
export function suggestVanishingPoints(
  type: AiPerspectiveType,
  width: number,
  height: number,
): Array<{ readonly x: number; readonly y: number }> {
  const cy = height * 0.45;
  switch (type) {
    case "one-point":
      return [{ x: width / 2, y: cy }];
    case "two-point":
      return [
        { x: width * 0.15, y: cy },
        { x: width * 0.85, y: cy },
      ];
    case "three-point":
      return [
        { x: width * 0.15, y: cy },
        { x: width * 0.85, y: cy },
        { x: width / 2, y: height * 1.6 },
      ];
  }
}
