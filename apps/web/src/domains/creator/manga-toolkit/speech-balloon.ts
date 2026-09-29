/**
 * 만화 전용 툴킷 — 말풍선(SpeechBalloon) 데이터 모델과 기하 유틸.
 *
 * 말풍선은 본문(body rect)과 베지어 꼬리(tail)로 구성된다.
 * 렌더는 `balloonBodySvgPath` / `balloonTailSvgPath` 가 반환하는 SVG path를 사용한다.
 */

/** 2D 점. */
export interface BalloonPoint {
  x: number;
  y: number;
}

/** 말풍선 프리셋. 8종. */
export type BalloonPreset =
  | "normal" // 일반 말풍선 (타원)
  | "thought" // 생각 풍선 (타원 + 꼬리 구름)
  | "shout" // 외침 (스파이크 외곽)
  | "whisper" // 속삭임 (점선)
  | "rectangle" // 사각 (모서리 둥근 사각형)
  | "cloud" // 구름 (뭉게뭉게 외곽)
  | "spiky" // 각진 (톱니 외곽)
  | "double"; // 이중 타원 (강조)

/** 꼬리: 시작점·제어점·끝점(말풍선 꼭지) 베지어. */
export interface BalloonTail {
  /** 본문과 만나는 시작점. */
  start: BalloonPoint;
  /** 베지어 제어점. */
  control: BalloonPoint;
  /** 꼬리 끝점(말하는 쪽을 향함). */
  tip: BalloonPoint;
}

/** 말풍선. */
export interface SpeechBalloon {
  id: string;
  preset: BalloonPreset;
  /** 본문 사각 영역 (타원/사각/구름 모두 이 rect에 내접하는 형태로 그려짐). */
  body: { x: number; y: number; w: number; h: number };
  /** 꼬리. 없으면 꼬리 없이 본문만 그린다. */
  tail?: BalloonTail;
  /** 풍선 내부 텍스트. */
  text: string;
  /** 채우기/선 색. */
  fillColor: string;
  textColor: string;
  lineColor: string;
  /** 테두리 굵기 px. */
  lineWidth: number;
}

/** 프리셋 메타 정보 (패널 프리셋 선택 UI용). */
export interface BalloonPresetInfo {
  preset: BalloonPreset;
  name: string;
  description: string;
  /** 꼬리를 기본으로 그리는 프리셋인지. */
  defaultTail: boolean;
}

export const BALLOON_PRESETS: readonly BalloonPresetInfo[] = [
  { preset: "normal", name: "일반 말풍선", description: "기본 타원형 말풍선", defaultTail: true },
  { preset: "thought", name: "생각 풍선", description: "구름 꼬리가 이어지는 내면의 생각", defaultTail: true },
  { preset: "shout", name: "외침", description: "날카로운 스파이크 외곽의 외침", defaultTail: true },
  { preset: "whisper", name: "속삭임", description: "점선 테두리의 조용한 대사", defaultTail: true },
  { preset: "rectangle", name: "사각", description: "내레이션·해설용 사각형", defaultTail: false },
  { preset: "cloud", name: "구름", description: "뭉게뭉게한 구름 외곽", defaultTail: true },
  { preset: "spiky", name: "각진", description: "톱니 외곽의 강한 감정", defaultTail: true },
  { preset: "double", name: "이중", description: "이중 타원 강조 대사", defaultTail: true },
] as const;

/** 숫자를 SVG path에 넣기 좋게 반올림한다. */
function num(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}`;
}

/** 타원(또는 원) 외곽에서 tip을 향한 연결점. body rect의 타원 외곽과 직선의 교차점을 구한다. */
export function balloonBodyConnectionPoint(
  body: SpeechBalloon["body"],
  tip: BalloonPoint,
): BalloonPoint {
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  const rx = Math.max(0.001, body.w / 2);
  const ry = Math.max(0.001, body.h / 2);
  const dx = tip.x - cx;
  const dy = tip.y - cy;
  if (dx === 0 && dy === 0) return { x: cx + rx, y: cy };
  const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  return { x: cx + dx * t, y: cy + dy * t };
}

/** 사각 body의 외곽에서 tip을 향한 연결점 (rectangle 프리셋용). */
export function balloonRectConnectionPoint(
  body: SpeechBalloon["body"],
  tip: BalloonPoint,
): BalloonPoint {
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  const dx = tip.x - cx;
  const dy = tip.y - cy;
  if (dx === 0 && dy === 0) return { x: body.x + body.w, y: cy };
  const tx = dx === 0 ? Number.POSITIVE_INFINITY : body.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : body.h / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

/**
 * 꼬리 끝점을 이동한다 (드래그 편집).
 * tip만 옮기고 시작점/제어점은 유지하되, 제어점이 없으면 start와 tip의 중간점으로 만든다.
 * 원본 말풍선을 변경하지 않고 새 객체를 반환한다.
 */
export function moveTailTip(balloon: SpeechBalloon, point: BalloonPoint): SpeechBalloon {
  const existing = balloon.tail;
  if (!existing) {
    const start = balloonBodyConnectionPoint(balloon.body, point);
    const control = {
      x: (start.x + point.x) / 2,
      y: (start.y + point.y) / 2,
    };
    return { ...balloon, tail: { start, control, tip: { ...point } } };
  }
  return {
    ...balloon,
    tail: { ...existing, tip: { ...point } },
  };
}

/**
 * 꼬리 시작점을 본문 외곽에 다시 연결한다.
 * tip을 기준으로 연결점을 다시 계산하고, 제어점은 start→tip 중간점으로 이동한다.
 */
export function reconnectTail(balloon: SpeechBalloon): SpeechBalloon {
  const tail = balloon.tail;
  if (!tail) return balloon;
  const rectangular = balloon.preset === "rectangle";
  const start = rectangular
    ? balloonRectConnectionPoint(balloon.body, tail.tip)
    : balloonBodyConnectionPoint(balloon.body, tail.tip);
  return {
    ...balloon,
    tail: {
      start,
      control: { x: (start.x + tail.tip.x) / 2, y: (start.y + tail.tip.y) / 2 },
      tip: { ...tail.tip },
    },
  };
}

/** 꼬리 베지어 시작점의 접선 방향 (드래그 핸들/화살표용). */
export function balloonTailStartDirection(balloon: SpeechBalloon): BalloonPoint | null {
  const tail = balloon.tail;
  if (!tail) return null;
  const dx = tail.control.x - tail.start.x;
  const dy = tail.control.y - tail.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** 타원 본문 SVG path (원호 2개). */
function ellipsePath(body: SpeechBalloon["body"]): string {
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  const rx = Math.max(0.001, body.w / 2);
  const ry = Math.max(0.001, body.h / 2);
  return (
    `M ${num(cx - rx)} ${num(cy)} ` +
    `A ${num(rx)} ${num(ry)} 0 1 0 ${num(cx + rx)} ${num(cy)} ` +
    `A ${num(rx)} ${num(ry)} 0 1 0 ${num(cx - rx)} ${num(cy)} Z`
  );
}

/** 둥근 사각형 본문 SVG path. */
function roundedRectPath(body: SpeechBalloon["body"], radius: number): string {
  const r = Math.max(0, Math.min(radius, body.w / 2, body.h / 2));
  const { x, y, w, h } = body;
  return (
    `M ${num(x + r)} ${num(y)} ` +
    `H ${num(x + w - r)} Q ${num(x + w)} ${num(y)} ${num(x + w)} ${num(y + r)} ` +
    `V ${num(y + h - r)} Q ${num(x + w)} ${num(y + h)} ${num(x + w - r)} ${num(y + h)} ` +
    `H ${num(x + r)} Q ${num(x)} ${num(y + h)} ${num(x)} ${num(y + h - r)} ` +
    `V ${num(y + r)} Q ${num(x)} ${num(y)} ${num(x + r)} ${num(y)} Z`
  );
}

/** 스파이크/톱니 외곽 SVG path. 본문 rect의 타원 둘레를 spikes개의 뾰족점으로 잇는다. */
function spikyPath(body: SpeechBalloon["body"], spikes: number): string {
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  const rx = body.w / 2;
  const ry = body.h / 2;
  const count = Math.max(6, Math.floor(spikes));
  let d = "";
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    const outerX = cx + Math.cos(angle) * rx * 1.18;
    const outerY = cy + Math.sin(angle) * ry * 1.18;
    const midAngle = (Math.PI * 2 * (i + 0.5)) / count;
    const innerX = cx + Math.cos(midAngle) * rx * 0.92;
    const innerY = cy + Math.sin(midAngle) * ry * 0.92;
    d += i === 0 ? `M ${num(outerX)} ${num(outerY)} ` : `L ${num(outerX)} ${num(outerY)} `;
    d += `L ${num(innerX)} ${num(innerY)} `;
  }
  return `${d}Z`;
}

/** 구름 외곽 SVG path. 타원 둘레에 뭉게 구름 반원을 이어 붙인다. */
function cloudPath(body: SpeechBalloon["body"], bumps: number): string {
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  const rx = body.w / 2;
  const ry = body.h / 2;
  const count = Math.max(8, Math.floor(bumps));
  let d = "";
  for (let i = 0; i < count; i += 1) {
    const a0 = (Math.PI * 2 * i) / count;
    const a1 = (Math.PI * 2 * (i + 1)) / count;
    const x0 = cx + Math.cos(a0) * rx;
    const y0 = cy + Math.sin(a0) * ry;
    const x1 = cx + Math.cos(a1) * rx;
    const y1 = cy + Math.sin(a1) * ry;
    const midA = (a0 + a1) / 2;
    const bumpX = cx + Math.cos(midA) * rx * 1.22;
    const bumpY = cy + Math.sin(midA) * ry * 1.22;
    d += i === 0 ? `M ${num(x0)} ${num(y0)} ` : "";
    d += `Q ${num(bumpX)} ${num(bumpY)} ${num(x1)} ${num(y1)} `;
  }
  return `${d}Z`;
}

/**
 * 말풍선 본문 SVG path를 생성한다 (렌더용).
 * thought 프리셋은 타원 본문을, 구름 꼬리는 `balloonTailSvgPath`로 그린다.
 */
export function balloonBodySvgPath(balloon: SpeechBalloon): string {
  switch (balloon.preset) {
    case "rectangle":
      return roundedRectPath(balloon.body, 10);
    case "cloud":
      return cloudPath(balloon.body, 14);
    case "shout":
      return spikyPath(balloon.body, 18);
    case "spiky":
      return spikyPath(balloon.body, 12);
    case "thought":
    case "normal":
    case "whisper":
    case "double":
    default:
      return ellipsePath(balloon.body);
  }
}

/** double 프리셋의 안쪽 타원 path. 다른 프리셋은 null. */
export function balloonInnerSvgPath(balloon: SpeechBalloon): string | null {
  if (balloon.preset !== "double") return null;
  const inset = 8;
  return ellipsePath({
    x: balloon.body.x + inset,
    y: balloon.body.y + inset,
    w: Math.max(0.001, balloon.body.w - inset * 2),
    h: Math.max(0.001, balloon.body.h - inset * 2),
  });
}

/**
 * 꼬리 SVG path를 생성한다 (렌더용).
 * - 일반: 시작점 주변 두 점과 끝점을 잇는 채운 삼각형(곡선) 꼬리.
 * - thought: 꼬리를 따라 작아지는 구름 원 3개.
 * 꼬리가 없으면 null.
 */
export function balloonTailSvgPath(balloon: SpeechBalloon): string | null {
  const tail = balloon.tail;
  if (!tail) return null;

  if (balloon.preset === "thought") {
    // 꼬리를 따라 작아지는 구름 3개
    const circles: string[] = [];
    const sizes = [7, 5, 3.5];
    for (let i = 0; i < sizes.length; i += 1) {
      const t = (i + 1) / (sizes.length + 1);
      const x = tail.start.x + (tail.tip.x - tail.start.x) * t;
      const y = tail.start.y + (tail.tip.y - tail.start.y) * t;
      const r = sizes[i]!;
      circles.push(
        `M ${num(x - r)} ${num(y)} ` +
          `A ${num(r)} ${num(r)} 0 1 0 ${num(x + r)} ${num(y)} ` +
          `A ${num(r)} ${num(r)} 0 1 0 ${num(x - r)} ${num(y)} Z`,
      );
    }
    return circles.join(" ");
  }

  // 꼬리 너비: 본문 너비의 16% (최소 8px)
  const halfWidth = Math.max(8, balloon.body.w * 0.08);
  const dx = tail.tip.x - tail.start.x;
  const dy = tail.tip.y - tail.start.y;
  const len = Math.hypot(dx, dy);
  let nx = -dy;
  let ny = dx;
  if (len > 0.0001) {
    nx /= len;
    ny /= len;
  } else {
    nx = 0;
    ny = 1;
  }
  const left = { x: tail.start.x + nx * halfWidth, y: tail.start.y + ny * halfWidth };
  const right = { x: tail.start.x - nx * halfWidth, y: tail.start.y - ny * halfWidth };
  return (
    `M ${num(left.x)} ${num(left.y)} ` +
    `Q ${num(tail.control.x)} ${num(tail.control.y)} ${num(tail.tip.x)} ${num(tail.tip.y)} ` +
    `Q ${num(tail.control.x)} ${num(tail.control.y)} ${num(right.x)} ${num(right.y)} Z`
  );
}

/** whisper 프리셋의 꼬리/본문은 점선으로 그려야 한다. */
export function balloonIsDashed(balloon: SpeechBalloon): boolean {
  return balloon.preset === "whisper";
}

/** 새 말풍선의 기본값. 꼬리는 프리셋 기본값에 따라 본문 하단으로 붙인다. */
export function createBalloon(
  id: string,
  preset: BalloonPreset,
  body: SpeechBalloon["body"],
  overrides?: Partial<SpeechBalloon>,
): SpeechBalloon {
  const info = BALLOON_PRESETS.find((p) => p.preset === preset);
  const balloon: SpeechBalloon = {
    id,
    preset,
    body: { ...body },
    text: "",
    fillColor: "#ffffff",
    textColor: "#111111",
    lineColor: "#111111",
    lineWidth: 2,
    ...overrides,
  };
  if (info?.defaultTail && !balloon.tail) {
    const tip = { x: body.x + body.w * 0.75, y: body.y + body.h + 36 };
    return reconnectTail({ ...balloon, tail: { start: tip, control: tip, tip } });
  }
  return balloon;
}
