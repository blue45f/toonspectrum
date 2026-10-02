import { samplePaper } from "../texture/paper-grain";

import { createBristleState, stepBristle } from "./bristle-bundle";
import { friction } from "./friction";
import { createGraphiteState, stepGraphite } from "./graphite-deposit";
import { createNibFlexState, stepNibFlex } from "./nib-flex";
import { applyHysteresis, createTipContactState, stepTipContact } from "./tip-contact";
import { velocityDeposit } from "./velocity-deposit";

import type { BristleState } from "./bristle-bundle";
import type { GraphiteState } from "./graphite-deposit";
import type { NibFlexState } from "./nib-flex";
import type { TipContactState } from "./tip-contact";
import type { ContactFootprint, ModeledSample } from "../core/types";
import type { PaperField, PaperSpec } from "../texture/paper-grain";

/**
 * 팁 접촉 물리 스펙(프리셋에 직렬화되는 순수 데이터)과 고정 dt(1/240 s) 모델.
 */

export type ContactModelKind = "hertz" | "felt" | "bristle" | "nib" | "graphite" | "none";

export interface NibSpec {
  /** 고유 진동수 ωn(rad/s). G펜 ≈ 180(≈ 2π·30). */
  stiffness: number;
  /** 감쇠비 ζ. 0이면 임계 감쇠(1). */
  damping: number;
  /** 이 압력 이하에서는 닙이 벌어지지 않는다. */
  threshold: number;
  /** 최대 벌어짐(px). */
  gapMax: number;
  /** 폭 = baseWidth + gap·widthGain. */
  widthGain: number;
  /** 닙 기본 폭(px). */
  baseWidth: number;
  /** ry = 폭·aspect/2. */
  aspect: number;
}

export interface BristleSpec {
  /** 폭 = w0·(1 + spreadGain·p). */
  spreadGain: number;
  /** 기울기 비대칭 계수. */
  tiltGain: number;
  /** 각도 추종 시상수(ms). */
  followTauMs: number;
  /** 붓모 가닥 수(질감 위상 시드에 사용). */
  strands: number;
}

export interface GraphiteSpec {
  /** 압력 → 접촉 계수. */
  contactGain: number;
  /** 요철 임계. */
  bumpThreshold: number;
}

export interface VelocitySpec {
  /** 이 속도(px/ms)에서 도포 0. */
  vMax: number;
  /** 이 속도부터 끊김 시작. */
  vBreak: number;
  /** 이 속도 아래에서 수분 공급 증가. */
  vSlow: number;
  /** flowScale 지수 γ. */
  gamma: number;
  waterBase: number;
  slowGain: number;
}

export interface FrictionSpec {
  mu0: number;
  muGrain: number;
  jitterGain: number;
  /** flow × (1 − mu·flowLoss). */
  flowLoss: number;
}

export interface PhysicsSpec {
  contact: ContactModelKind;
  /** Hertz 지수 n(반경 ∝ p^(1/n)). */
  exponent: number;
  /** 팁 반경 배율(1 = tip.sizePx/2). */
  baseRadius: number;
  hysteresisUpMs: number;
  hysteresisDownMs: number;
  nib?: NibSpec;
  bristle?: BristleSpec;
  graphite?: GraphiteSpec;
  velocity: VelocitySpec;
  friction: FrictionSpec;
}

export const DEFAULT_VELOCITY_SPEC: VelocitySpec = {
  vMax: 6,
  vBreak: 2.5,
  vSlow: 0.3,
  gamma: 0.6,
  waterBase: 0,
  slowGain: 0,
};

export const DEFAULT_FRICTION_SPEC: FrictionSpec = {
  mu0: 0.1,
  muGrain: 0.2,
  jitterGain: 0.4,
  flowLoss: 0.15,
};

export const DEFAULT_NIB_SPEC: NibSpec = {
  stiffness: 180,
  damping: 1,
  threshold: 0.05,
  gapMax: 6,
  widthGain: 1,
  baseWidth: 0.8,
  aspect: 1,
};

export const DEFAULT_BRISTLE_SPEC: BristleSpec = {
  spreadGain: 1.5,
  tiltGain: 0.6,
  followTauMs: 30,
  strands: 24,
};

export const DEFAULT_GRAPHITE_SPEC: GraphiteSpec = { contactGain: 1, bumpThreshold: 0.3 };

export const DEFAULT_PHYSICS_SPEC: PhysicsSpec = {
  contact: "hertz",
  exponent: 3,
  baseRadius: 1,
  hysteresisUpMs: 12,
  hysteresisDownMs: 40,
  velocity: DEFAULT_VELOCITY_SPEC,
  friction: DEFAULT_FRICTION_SPEC,
};

/** 고정 물리 틱(초). 240 Hz. */
export const PHYSICS_DT_S = 1 / 240;
export const PHYSICS_DT_MS = 1000 / 240;

export interface PhysicsModelOptions {
  /** 팁 반경(px) = tip.sizePx / 2. */
  tipRadiusPx: number;
  /** 종이 샘플링 규약(마찰·그레인). null이면 종이 없음. */
  paperSpec: PaperSpec | null;
}

interface TickInput {
  x: number;
  y: number;
  pressure: number;
  velocity: number;
  altitudeDeg: number;
  dirX: number;
  dirY: number;
}

const f = Math.fround;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 팁 접촉 물리 모델. `step(sample, dtMs)`는 dtMs를 1/240 s 틱으로 나눠 전진하며
 * 틱 사이 입력은 직전 표본과 선형 보간한다(누적기가 잔여 시간을 이월).
 * 상태는 모두 Float32Array라 같은 입력이면 같은 발자국이다.
 */
export class PhysicsModel {
  private readonly spec: PhysicsSpec;
  private readonly paper: PaperField | null;
  private readonly paperSpec: PaperSpec | null;
  private readonly seed: number;
  private readonly radius: number;
  private contact: TipContactState = createTipContactState();
  private graphiteRadius: TipContactState = createTipContactState();
  private nib: NibFlexState | null = null;
  private bristle: BristleState | null = null;
  private graphite: GraphiteState = createGraphiteState();
  private accumulatorMs = 0;
  private prev: TickInput | null = null;
  private last: ContactFootprint | null = null;

  constructor(spec: PhysicsSpec, paper: PaperField | null, seed: number, opts: PhysicsModelOptions) {
    this.spec = spec;
    this.paper = paper;
    this.paperSpec = opts.paperSpec;
    this.seed = seed >>> 0;
    this.radius = f(Math.max(0.05, opts.tipRadiusPx * spec.baseRadius));
    this.reset();
  }

  reset(initialPressure = 0): void {
    this.contact = createTipContactState();
    this.graphiteRadius = createTipContactState();
    this.graphite = createGraphiteState();
    this.nib = this.spec.contact === "nib" ? createNibFlexState(this.spec.nib ?? DEFAULT_NIB_SPEC, initialPressure) : null;
    this.bristle = this.spec.contact === "bristle" ? createBristleState(this.seed) : null;
    this.accumulatorMs = 0;
    this.prev = null;
    this.last = null;
  }

  step(sample: ModeledSample, dtMs: number): ContactFootprint {
    const cur: TickInput = {
      x: sample.x,
      y: sample.y,
      pressure: clamp01(sample.pressure),
      velocity: Math.max(0, sample.velocity),
      altitudeDeg: sample.altitudeDeg,
      dirX: sample.dirX,
      dirY: sample.dirY,
    };
    if (sample.phase === "down" || !this.prev) {
      this.reset(cur.pressure);
    }
    const prev = this.prev ?? cur;
    this.accumulatorMs += Math.max(0, dtMs);
    let ticks = Math.floor(this.accumulatorMs / PHYSICS_DT_MS);
    if (ticks === 0 && !this.last) ticks = 1;
    this.accumulatorMs = Math.max(0, this.accumulatorMs - ticks * PHYSICS_DT_MS);
    let fp = this.last;
    for (let i = 0; i < ticks; i += 1) {
      const a = (i + 1) / ticks;
      fp = this.tick(prev, cur, a);
    }
    if (!fp) fp = this.tick(prev, cur, 1);
    this.prev = cur;
    this.last = fp;
    return fp;
  }

  private tick(prev: TickInput, cur: TickInput, a: number): ContactFootprint {
    const p = f(prev.pressure + (cur.pressure - prev.pressure) * a);
    const v = f(prev.velocity + (cur.velocity - prev.velocity) * a);
    const alt = f(prev.altitudeDeg + (cur.altitudeDeg - prev.altitudeDeg) * a);
    let dx = prev.dirX + (cur.dirX - prev.dirX) * a;
    let dy = prev.dirY + (cur.dirY - prev.dirY) * a;
    const dl = Math.hypot(dx, dy);
    if (dl > 1e-6) {
      dx /= dl;
      dy /= dl;
    } else {
      dx = cur.dirX;
      dy = cur.dirY;
    }
    const x = prev.x + (cur.x - prev.x) * a;
    const y = prev.y + (cur.y - prev.y) * a;
    const spec = this.spec;
    const R = this.radius;
    let rx = R;
    let ry = R;
    let angle = 0;
    let asymmetry = 0;
    let nibGap = 0;
    let grain = 0;
    switch (spec.contact) {
      case "none":
        // 고정 폭(샤프펜슬 등). graphite 스펙이 있으면 반경은 고정한 채 그레인 응답만 계산한다.
        if (spec.graphite) {
          grain = stepGraphite(this.graphite, { pressure: p }, PHYSICS_DT_MS, spec.graphite).grain;
        }
        break;
      case "hertz":
      case "felt": {
        const out = stepTipContact(this.contact, { pressure: p }, PHYSICS_DT_MS, {
          baseRadius: R,
          exponent: spec.exponent,
          p0: 0.5,
          feltK: 1.5,
          hysteresisUpMs: spec.hysteresisUpMs,
          hysteresisDownMs: spec.hysteresisDownMs,
          model: spec.contact,
        });
        rx = out.rx;
        ry = out.ry;
        break;
      }
      case "nib": {
        const nibSpec = spec.nib ?? DEFAULT_NIB_SPEC;
        const st = this.nib ?? createNibFlexState(nibSpec, p);
        this.nib = st;
        const out = stepNibFlex(st, { pressure: p }, PHYSICS_DT_MS, nibSpec);
        rx = out.rx;
        ry = out.ry;
        nibGap = out.nibGap;
        break;
      }
      case "bristle": {
        const bSpec = spec.bristle ?? DEFAULT_BRISTLE_SPEC;
        const st = this.bristle ?? createBristleState(this.seed);
        this.bristle = st;
        const out = stepBristle(st, { pressure: p, altitudeDeg: alt, dirX: dx, dirY: dy }, PHYSICS_DT_MS, {
          ...bSpec,
          baseRadius: R,
        });
        rx = out.rx;
        ry = out.ry;
        angle = out.angle;
        asymmetry = out.asymmetry;
        break;
      }
      case "graphite": {
        const gSpec = spec.graphite ?? DEFAULT_GRAPHITE_SPEC;
        const target = f(R * (0.5 + 0.5 * p));
        const r = applyHysteresis(this.graphiteRadius, target, PHYSICS_DT_MS, spec.hysteresisUpMs, spec.hysteresisDownMs);
        rx = r;
        ry = r;
        grain = stepGraphite(this.graphite, { pressure: p }, PHYSICS_DT_MS, gSpec).grain;
        break;
      }
    }
    const vel = velocityDeposit(v, spec.velocity);
    let deposit = vel.depositStrength;
    if (this.paper && this.paperSpec) {
      const paperSample = samplePaper(this.paper, x, y, this.paperSpec);
      deposit = f(deposit * friction(dx, dy, paperSample.dir, spec.friction).flowScale);
      if (spec.contact !== "graphite" && this.paperSpec.enabled) {
        grain = f(clamp01(1 - p * this.paperSpec.pressureInfluence));
      }
    }
    return {
      rx: f(Math.max(0.01, rx)),
      ry: f(Math.max(0.01, ry)),
      angle,
      depositStrength: deposit,
      breakup: vel.breakup,
      grain,
      water: vel.water,
      asymmetry,
      nibGap,
    };
  }
}
