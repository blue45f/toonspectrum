/**
 * Studio Bubble Physics — 말풍선 물리 시뮬레이션 순수 코어.
 *
 * 논문 기반:
 *  Fruchterman, Reingold, "Graph Drawing by Force-directed Placement",
 *  Software: Practice and Experience, 1991.
 *  - 반발력(repulsion): 모든 말풍선 쌍이 서로 밀어낸다 (겹침 해소).
 *  - 인력(attraction): 각 말풍선은 앵커(화자/선호 위치)에 스프링으로 끌린다.
 *  - 온도(temperature) 기반 감쇠: 시뮬레이션이 진행될수록 움직임이 줄어 수렴한다.
 *
 * 용도:
 *  1. 자동 배치 후 겹침 해소 (auto-layout의 후처리).
 *  2. 드래그 시 스프링-댐퍼 물리 (놓으면 탄성으로 제자리).
 *  3. 꼬리 탄성 곡선: 말풍선이 앵커에서 멀어질수록 꼬리가 휘는 정도 계산.
 *
 * 전부 순수·결정적. 렌더 루프는 호출부가 담당한다.
 */

import { clamp, formatCoord } from "./studio-bubble-math";

export interface PhysicsBalloon {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 앵커점 (화자 얼굴 중심 등). 없으면 현재 위치가 선호 위치. */
  anchorX?: number;
  anchorY?: number;
  /** 고정 여부 (사용자가 직접 놓은 말풍선 등). */
  pinned?: boolean;
}

export interface PhysicsStepOptions {
  /** 반발력 계수. 기본 1.0. */
  repulsion?: number;
  /** 앵커 스프링 강성. 기본 0.02. */
  anchorStiffness?: number;
  /** 감쇠율 (0~1). 기본 0.85. */
  damping?: number;
  /** 최대 이동량(px/스텝). 기본 40. */
  maxStep?: number;
  /** 겹침 판정 여백(px). 기본 8. */
  margin?: number;
}

export interface PhysicsBalloonState extends PhysicsBalloon {
  vx: number;
  vy: number;
}

const centerX = (b: PhysicsBalloonState): number => b.x + b.w / 2;
const centerY = (b: PhysicsBalloonState): number => b.y + b.h / 2;

/**
 * 물리 상태를 초기화한다 (속도 0).
 */
export function initPhysicsState(
  balloons: readonly PhysicsBalloon[]
): PhysicsBalloonState[] {
  return balloons.map((b) => ({ ...b, vx: 0, vy: 0 }));
}

interface ForceAccumulator {
  fx: number[];
  fy: number[];
}

/**
 * 반발력을 계산한다 (Fruchterman-Reingold식 변형).
 * 두 말풍선이 "겹침 영향권"에 있을 때만 서로 밀어낸다.
 */
function accumulateRepulsion(
  states: readonly PhysicsBalloonState[],
  forces: ForceAccumulator,
  repulsion: number,
  margin: number
): void {
  const n = states.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = states[i];
      const b = states[j];
      const dx = centerX(b) - centerX(a);
      const dy = centerY(b) - centerY(a);
      const dist = Math.hypot(dx, dy);
      const minDist = (a.w + b.w) / 2 + (a.h + b.h) / 2 + margin * 2;
      if (dist >= minDist) continue;
      const overlap = minDist - dist;
      // 겹침이 클수록 강하게 밀어낸다.
      const force = repulsion * overlap * overlap * 0.05;
      const ux = dist > 1e-6 ? dx / dist : 1;
      const uy = dist > 1e-6 ? dy / dist : 0;
      forces.fx[i] -= force * ux;
      forces.fy[i] -= force * uy;
      forces.fx[j] += force * ux;
      forces.fy[j] += force * uy;
    }
  }
}

/**
 * 앵커 스프링 힘을 계산한다. pinned 말풍선은 건너뛴다.
 */
function accumulateAnchorSpring(
  states: readonly PhysicsBalloonState[],
  forces: ForceAccumulator,
  anchorStiffness: number
): void {
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (s.pinned) continue;
    const anchorX = s.anchorX ?? centerX(s);
    const anchorY = s.anchorY ?? centerY(s);
    forces.fx[i] += (anchorX - centerX(s)) * anchorStiffness;
    forces.fy[i] += (anchorY - centerY(s)) * anchorStiffness;
  }
}

/**
 * 힘을 semi-implicit Euler로 적분한다 (감쇠 + 스텝 클램프).
 */
function integrateForces(
  states: readonly PhysicsBalloonState[],
  forces: ForceAccumulator,
  damping: number,
  maxStep: number
): PhysicsBalloonState[] {
  return states.map((s, i) => {
    if (s.pinned) return { ...s, vx: 0, vy: 0 };
    let vx = (s.vx + forces.fx[i]) * damping;
    let vy = (s.vy + forces.fy[i]) * damping;
    const stepLen = Math.hypot(vx, vy);
    if (stepLen > maxStep) {
      vx = (vx / stepLen) * maxStep;
      vy = (vy / stepLen) * maxStep;
    }
    return { ...s, vx, vy, x: s.x + vx, y: s.y + vy };
  });
}

/**
 * force-directed 1스텝을 수행한다.
 *
 * - 반발: 두 말풍선 중심 거리 d에 대해 겹침²에 비례해 밀어낸다.
 *   (Fruchterman-Reingold의 f_r(d) = k²/d 형태를 변형)
 * - 앵커 스프링: `anchorStiffness * (anchor - center)` 로 당긴다.
 * - pinned 말풍선은 움직이지 않는다.
 */
export function stepBalloonPhysics(
  states: PhysicsBalloonState[],
  options: PhysicsStepOptions = {}
): PhysicsBalloonState[] {
  const {
    repulsion = 1.0,
    anchorStiffness = 0.02,
    damping = 0.85,
    maxStep = 40,
    margin = 8,
  } = options;

  const forces: ForceAccumulator = {
    fx: new Array<number>(states.length).fill(0),
    fy: new Array<number>(states.length).fill(0),
  };
  accumulateRepulsion(states, forces, repulsion, margin);
  accumulateAnchorSpring(states, forces, anchorStiffness);
  return integrateForces(states, forces, damping, maxStep);
}

/**
 * 수렴할 때까지(또는 최대 스텝까지) 시뮬레이션을 돌린다.
 * 최대 이동량이 epsilon 아래로 떨어지면 수렴으로 본다.
 */
export function relaxBalloonLayout(
  balloons: readonly PhysicsBalloon[],
  options: PhysicsStepOptions & { maxIterations?: number; epsilon?: number } = {}
): PhysicsBalloonState[] {
  const { maxIterations = 120, epsilon = 0.5, ...stepOpts } = options;
  let states = initPhysicsState(balloons);
  for (let i = 0; i < maxIterations; i++) {
    const prev = states;
    states = stepBalloonPhysics(states, stepOpts);
    let maxMove = 0;
    for (let j = 0; j < states.length; j++) {
      maxMove = Math.max(
        maxMove,
        Math.abs(states[j].x - prev[j].x),
        Math.abs(states[j].y - prev[j].y)
      );
    }
    if (maxMove < epsilon) break;
  }
  return states;
}

// ── 드래그 스프링-댐퍼 ────────────────────────────────────────────────────

export interface DragSpringState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 드래그 중 목표점 (포인터). */
  targetX: number;
  targetY: number;
}

/**
 * 드래그 중인 말풍선의 스프링-댐퍼 1스텝.
 * stiffness가 높을수록 포인터에 딱 붙고, damping이 낮을수록 출렁인다.
 */
export function stepDragSpring(
  s: DragSpringState,
  stiffness = 0.35,
  damping = 0.72
): DragSpringState {
  const ax = (s.targetX - s.x) * stiffness;
  const ay = (s.targetY - s.y) * stiffness;
  const vx = (s.vx + ax) * damping;
  const vy = (s.vy + ay) * damping;
  return { ...s, vx, vy, x: s.x + vx, y: s.y + vy };
}

/**
 * 드래그 해제 후 원래 위치로 돌아가는 탄성 1스텝.
 */
export function stepReturnSpring(
  s: DragSpringState,
  homeX: number,
  homeY: number,
  stiffness = 0.12,
  damping = 0.8
): DragSpringState {
  return stepDragSpring({ ...s, targetX: homeX, targetY: homeY }, stiffness, damping);
}

// ── 꼬리 탄성 곡선 ────────────────────────────────────────────────────────

export interface ElasticTailSpec {
  /** 꼬리 밑동 중심 (말풍선 로컬 좌표). */
  baseX: number;
  baseY: number;
  /** 꼬리 끝 목표점 (말풍선 로컬 좌표, 보통 화자 방향). */
  tipX: number;
  tipY: number;
  /** 휘어짐 계수 (-1..1). 양수면 진행 방향 오른쪽으로 휜다. */
  bend: number;
  /** 탄성 출렁임 (0 = 정적, 1 = 최대). 드래그 중 속도에 비례해 커진다. */
  wobble: number;
}

/**
 * 탄성 꼬리 곡선을 SVG path 조각으로 만든다.
 * wobble이 크면 꼬리가 출렁이는 3차 베지어 곡선이 된다.
 */
export function elasticTailPath(spec: ElasticTailSpec): string {
  const { baseX, baseY, tipX, tipY, bend, wobble } = spec;
  const N = formatCoord;
  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const len = Math.hypot(dx, dy) || 1;
  // 수직 방향 (휨 축).
  const nx = -dy / len;
  const ny = dx / len;
  const bendOffset = clamp(bend, -1, 1) * len * 0.25;
  const wobbleOffset = clamp(wobble, 0, 1) * len * 0.12;
  // 제어점 2개: 밑동 쪽과 끝 쪽.
  const c1x = baseX + dx * 0.3 + nx * (bendOffset + wobbleOffset);
  const c1y = baseY + dy * 0.3 + ny * (bendOffset + wobbleOffset);
  const c2x = baseX + dx * 0.7 + nx * (bendOffset - wobbleOffset);
  const c2y = baseY + dy * 0.7 + ny * (bendOffset - wobbleOffset);
  return `M ${N(baseX)} ${N(baseY)} C ${N(c1x)} ${N(c1y)}, ${N(c2x)} ${N(c2y)}, ${N(tipX)} ${N(tipY)}`;
}

/**
 * 드래그 속도에서 꼬리 출렁임(wobble)을 계산한다.
 * 속도가 빠를수록 꼬리가 출렁인다 (0..1).
 */
export function wobbleFromVelocity(vx: number, vy: number): number {
  const speed = Math.hypot(vx, vy);
  return clamp(speed / 30, 0, 1);
}
