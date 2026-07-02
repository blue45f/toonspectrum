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
  // 꼬리 끝 기울기(화자 방향). 0.45로 키워 더 자연스러운 lean(현재 호출은 side:center라 시각변화 없음, 선반영).
  const sideShift = tail.side === "left" ? -tail.base * 0.45 : tail.side === "right" ? tail.base * 0.45 : 0;
  // 꼬리 밑동이 둥근 모서리 직선구간 안에 들도록 안전 마진(곡률 충돌 방지).
  const safe = r * 0.8;
  // 테이퍼: 밑동→끝 변을 직선 대신 이차베지어로 본체 쪽 0.55 지점으로 당겨 코미포/클립스튜디오식 부드러운 수렴.
  const TAPER = 0.55;

  if (dir === "bottom" || dir === "top") {
    const center = clamp(w * tail.ratio, r + tail.base / 2 + safe, w - r - tail.base / 2 - safe);
    const b1 = center - tail.base / 2;
    const b2 = center + tail.base / 2;
    const tip = clamp(center + sideShift, r + safe, w - r - safe);
    if (dir === "bottom") {
      const ty = h + tail.length;
      const cy = h + (ty - h) * TAPER;
      return [
        `M ${N(r)} 0`,
        `H ${N(w - r)}`,
        `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`,
        `V ${N(h - r)}`,
        `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`,
        `H ${N(b2)}`,
        `Q ${N((b2 + tip) / 2)} ${N(cy)} ${N(tip)} ${N(ty)}`,
        `Q ${N((tip + b1) / 2)} ${N(cy)} ${N(b1)} ${N(h)}`,
        `H ${N(r)}`,
        `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`,
        `V ${N(r)}`,
        `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`,
        "Z",
      ].join(" ");
    }
    // top
    const ty = -tail.length;
    const cy = ty * TAPER; // 본체변(0)→tip 사이 0.55 지점
    return [
      `M ${N(r)} 0`,
      `H ${N(b1)}`,
      `Q ${N((b1 + tip) / 2)} ${N(cy)} ${N(tip)} ${N(ty)}`,
      `Q ${N((tip + b2) / 2)} ${N(cy)} ${N(b2)} 0`,
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
  const center = clamp(h * tail.ratio, r + tail.base / 2 + safe, h - r - tail.base / 2 - safe);
  const b1 = center - tail.base / 2;
  const b2 = center + tail.base / 2;
  const tip = clamp(center + sideShift, r + safe, h - r - safe);
  if (dir === "left") {
    const tx = -tail.length;
    const cx = tx * TAPER;
    return [
      `M ${N(r)} 0`,
      `H ${N(w - r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`,
      `V ${N(h - r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`,
      `H ${N(r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`,
      `V ${N(b2)}`,
      `Q ${N(cx)} ${N((b2 + tip) / 2)} ${N(tx)} ${N(tip)}`,
      `Q ${N(cx)} ${N((tip + b1) / 2)} 0 ${N(b1)}`,
      `V ${N(r)}`,
      `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`,
      "Z",
    ].join(" ");
  }
  // right
  const tx = w + tail.length;
  const cx = w + (tx - w) * TAPER;
  return [
    `M ${N(r)} 0`,
    `H ${N(w - r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`,
    `V ${N(b1)}`,
    `Q ${N(cx)} ${N((b1 + tip) / 2)} ${N(tx)} ${N(tip)}`,
    `Q ${N(cx)} ${N((tip + b2) / 2)} ${N(w)} ${N(b2)}`,
    `V ${N(h - r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`,
    `H ${N(r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`,
    `V ${N(r)}`,
    `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`,
    "Z",
  ].join(" ");
}

/* ── 다중 꼬리(최대 3) — 두 화자 동시 대사/합창 말풍선 ─────────────────────
 * 단일 꼬리 bubblePathData는 하위호환을 위해 그대로 두고(출력 바이트 동일 보장),
 * 다중 꼬리는 둘레를 한 바퀴 걷는 일반화 워커로 만든다. 각 변에서 꼬리들을
 * 진행 방향 순서로 정렬해 홈(notch)을 이어 붙인다. 겹치면 진행 방향으로 밀어낸다.
 */

export const BUBBLE_MAX_TAILS = 3;

interface NotchPlan {
  b1: number; // 밑동 시작(진행 방향 기준 앞쪽)
  b2: number; // 밑동 끝
  tip: number; // 끝점의 변 방향 좌표
  len: number; // 바깥으로 뻗는 길이
}

/** 한 변 위 꼬리들을 진행 좌표로 정렬·클램프하고 겹침을 밀어내 홈 계획을 만든다. */
function planNotches(tails: BubbleTailSpec[], span: number, r: number): NotchPlan[] {
  const safe = r * 0.8;
  const GAP = 4; // 인접 홈 사이 최소 간격(px)
  const plans = tails
    .filter((t) => t.length > 0 && t.base > 0)
    .map((t) => {
      const half = t.base / 2;
      const center = clamp(span * t.ratio, r + half + safe, span - r - half - safe);
      const sideShift = t.side === "left" ? -t.base * 0.45 : t.side === "right" ? t.base * 0.45 : 0;
      return {
        center,
        half,
        len: t.length,
        tip: clamp(center + sideShift, r + safe, span - r - safe),
      };
    })
    .sort((a, b) => a.center - b.center);

  // 겹침 해소 — 앞에서부터 진행 방향으로 밀어내고, 범위를 벗어나면 그 홈은 버린다.
  const out: NotchPlan[] = [];
  let cursor = 0;
  for (const p of plans) {
    const minB1 = Math.max(p.center - p.half, cursor + (out.length > 0 ? GAP : 0));
    const b1 = minB1;
    const b2 = b1 + p.half * 2;
    if (b2 > span - r * 0.8 - 0.5) continue; // 변 밖으로 밀려나면 스킵(안전)
    const drift = b1 + p.half - p.center;
    out.push({ b1, b2, tip: clamp(p.tip + drift, b1 - p.half, b2 + p.half), len: p.len });
    cursor = b2;
  }
  return out;
}

/**
 * 다중 꼬리 말풍선 단일 path. tails가 0개면 roundedRect, 1개여도 동작(단일 꼬리와
 * 시각적으로 동일 규약: 테이퍼 0.55 이차베지어). 최대 BUBBLE_MAX_TAILS개.
 */
export function bubblePathDataMulti(w: number, h: number, radius: number, tails: readonly BubbleTailSpec[]): string {
  const r = clamp(radius, 0, Math.min(w, h) / 2);
  const valid = tails.filter((t) => t && t.length > 0 && t.base > 0).slice(0, BUBBLE_MAX_TAILS);
  if (valid.length === 0) return roundedRect(w, h, r);
  const TAPER = 0.55;

  const byDir = (d: BubbleTailDirection) => valid.filter((t) => t.direction === d);
  const top = planNotches(byDir("top"), w, r);
  const right = planNotches(byDir("right"), h, r);
  const bottom = planNotches(byDir("bottom"), w, r);
  const left = planNotches(byDir("left"), h, r);

  const parts: string[] = [`M ${N(r)} 0`];
  // 윗변: x 증가 방향. 홈은 b1→tip→b2 순.
  for (const nt of top) {
    const ty = -nt.len;
    const cy = ty * TAPER;
    parts.push(`H ${N(nt.b1)}`, `Q ${N((nt.b1 + nt.tip) / 2)} ${N(cy)} ${N(nt.tip)} ${N(ty)}`, `Q ${N((nt.tip + nt.b2) / 2)} ${N(cy)} ${N(nt.b2)} 0`);
  }
  parts.push(`H ${N(w - r)}`, `A ${N(r)} ${N(r)} 0 0 1 ${N(w)} ${N(r)}`);
  // 오른변: y 증가 방향.
  for (const nt of right) {
    const tx = w + nt.len;
    const cx = w + nt.len * TAPER;
    parts.push(`V ${N(nt.b1)}`, `Q ${N(cx)} ${N((nt.b1 + nt.tip) / 2)} ${N(tx)} ${N(nt.tip)}`, `Q ${N(cx)} ${N((nt.tip + nt.b2) / 2)} ${N(w)} ${N(nt.b2)}`);
  }
  parts.push(`V ${N(h - r)}`, `A ${N(r)} ${N(r)} 0 0 1 ${N(w - r)} ${N(h)}`);
  // 아랫변: x 감소 방향 — 정렬은 증가 기준이므로 역순 순회, 홈은 b2→tip→b1.
  for (const nt of [...bottom].reverse()) {
    const ty = h + nt.len;
    const cy = h + nt.len * TAPER;
    parts.push(`H ${N(nt.b2)}`, `Q ${N((nt.b2 + nt.tip) / 2)} ${N(cy)} ${N(nt.tip)} ${N(ty)}`, `Q ${N((nt.tip + nt.b1) / 2)} ${N(cy)} ${N(nt.b1)} ${N(h)}`);
  }
  parts.push(`H ${N(r)}`, `A ${N(r)} ${N(r)} 0 0 1 0 ${N(h - r)}`);
  // 왼변: y 감소 방향 — 역순 순회, 홈은 b2→tip→b1.
  for (const nt of [...left].reverse()) {
    const tx = -nt.len;
    const cx = tx * TAPER;
    parts.push(`V ${N(nt.b2)}`, `Q ${N(cx)} ${N((nt.b2 + nt.tip) / 2)} ${N(tx)} ${N(nt.tip)}`, `Q ${N(cx)} ${N((nt.tip + nt.b1) / 2)} 0 ${N(nt.b1)}`);
  }
  parts.push(`V ${N(r)}`, `A ${N(r)} ${N(r)} 0 0 1 ${N(r)} 0`, "Z");
  return parts.join(" ");
}

/** 저장 문서의 추가 꼬리 배열을 안전하게 정규화한다(주 꼬리 외 최대 2개). */
export function normalizeExtraTails(raw: unknown): BubbleTailSpec[] {
  if (!Array.isArray(raw)) return [];
  const dirs: BubbleTailDirection[] = ["bottom", "top", "left", "right"];
  const sides: BubbleTailSide[] = ["left", "right", "center"];
  const out: BubbleTailSpec[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<BubbleTailSpec>;
    if (!dirs.includes(e.direction as BubbleTailDirection)) continue;
    out.push({
      direction: e.direction as BubbleTailDirection,
      ratio: clamp(typeof e.ratio === "number" && Number.isFinite(e.ratio) ? e.ratio : 0.5, 0, 1),
      length: clamp(typeof e.length === "number" && Number.isFinite(e.length) ? e.length : 26, 4, 200),
      base: clamp(typeof e.base === "number" && Number.isFinite(e.base) ? e.base : 18, 4, 120),
      side: sides.includes(e.side as BubbleTailSide) ? (e.side as BubbleTailSide) : "center",
    });
    if (out.length >= BUBBLE_MAX_TAILS - 1) break;
  }
  return out;
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
