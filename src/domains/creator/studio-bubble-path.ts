/**
 * Studio Bubble Path — 말풍선 본체+꼬리를 하나의 연속 SVG path로 그린다.
 *
 * 기존 말풍선은 둥근 Rect 위에 삼각형 Line 꼬리를 따로 얹어, 본체 외곽선이 꼬리 밑동을
 * 가로질러 "이중 외곽선 이음새"가 보였다(어색함의 원인). 이 모듈은 둥근 사각형 외곽선을
 * 따라가다 꼬리가 있는 변에서만 바깥으로 삐져나갔다 돌아오는 단일 path를 만들어, 이음새
 * 없이 매끈하게 꼬리가 본체와 이어지게 한다.
 *
 * 전부 순수·결정적. 좌표는 말풍선 로컬(0,0~w,h). Konva <Path data=...>에 그대로 넣는다.
 */

export type BubbleTailDirection = "bottom" | "top" | "left" | "right";
export type BubbleTailSide = "left" | "right" | "center";

export interface BubbleTailSpec {
  direction: BubbleTailDirection;
  ratio: number; // 변을 따라 꼬리 밑동 중심 위치(0~1)
  length: number; // 바깥으로 뻗는 길이(px)
  base: number; // 꼬리 밑동 너비(px)
  side: BubbleTailSide; // 꼬리 끝이 기우는 방향(화자 쪽)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const N = (n: number): string => (Math.round(n * 100) / 100).toString();

/**
 * 둥근 사각형(+선택적 꼬리) 단일 path. r은 (w,h)/2로 자동 클램프.
 * 꼬리는 해당 변의 직선 구간(둥근 모서리 안쪽)에서만 솟아나며, 끝점은 side로 기운다.
 */
export function bubblePathData(w: number, h: number, radius: number, tail?: BubbleTailSpec | null): string {
  const r = clamp(radius, 0, Math.min(w, h) / 2);
  // 꼬리가 없으면 단순 둥근 사각형.
  if (!tail || tail.length <= 0 || tail.base <= 0) {
    return roundedRect(w, h, r);
  }
  const dir = tail.direction;
  const sideShift = tail.side === "left" ? -tail.base * 0.35 : tail.side === "right" ? tail.base * 0.35 : 0;

  if (dir === "bottom" || dir === "top") {
    const center = clamp(w * tail.ratio, r + tail.base / 2, w - r - tail.base / 2);
    const b1 = center - tail.base / 2;
    const b2 = center + tail.base / 2;
    const tip = clamp(center + sideShift, r, w - r);
    if (dir === "bottom") {
      const ty = h + tail.length;
      // 상단(좌→우)·우변·하단(우→꼬리→좌)·좌변
      return [
        `M ${N(r)} 0`,
        `H ${N(w - r)}`,
        `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`,
        `V ${N(h - r)}`,
        `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`,
        `H ${N(b2)}`,
        `L ${N(tip)} ${N(ty)}`,
        `L ${N(b1)} ${N(h)}`,
        `H ${N(r)}`,
        `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`,
        `V ${N(r)}`,
        `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`,
        "Z",
      ].join(" ");
    }
    // top
    const ty = -tail.length;
    return [
      `M ${N(r)} 0`,
      `H ${N(b1)}`,
      `L ${N(tip)} ${N(ty)}`,
      `L ${N(b2)} 0`,
      `H ${N(w - r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`,
      `V ${N(h - r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`,
      `H ${N(r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`,
      `V ${N(r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`,
      "Z",
    ].join(" ");
  }

  // left / right
  const center = clamp(h * tail.ratio, r + tail.base / 2, h - r - tail.base / 2);
  const b1 = center - tail.base / 2;
  const b2 = center + tail.base / 2;
  const tip = clamp(center + sideShift, r, h - r);
  if (dir === "left") {
    const tx = -tail.length;
    // 좌변에서 꼬리: 상단→우변→하단→좌변(아래→꼬리→위)
    return [
      `M ${N(r)} 0`,
      `H ${N(w - r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`,
      `V ${N(h - r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`,
      `H ${N(r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`,
      `V ${N(b2)}`,
      `L ${N(tx)} ${N(tip)}`,
      `L 0 ${N(b1)}`,
      `V ${N(r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`,
      "Z",
    ].join(" ");
  }
  // right
  const tx = w + tail.length;
  return [
    `M ${N(r)} 0`,
    `H ${N(w - r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`,
    `V ${N(b1)}`,
    `L ${N(tx)} ${N(tip)}`,
    `L ${N(w)} ${N(b2)}`,
    `V ${N(h - r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`,
    `H ${N(r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`,
    `V ${N(r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`,
    "Z",
  ].join(" ");
}

function roundedRect(w: number, h: number, r: number): string {
  return [
    `M ${N(r)} 0`,
    `H ${N(w - r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`,
    `V ${N(h - r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`,
    `H ${N(r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`,
    `V ${N(r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`,
    "Z",
  ].join(" ");
}
