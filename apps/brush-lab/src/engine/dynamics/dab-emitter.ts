import { hashU32, Pcg32 } from "../core/rng";

import { dabColor } from "./color-dynamics";
import { evaluateMappingProduct } from "./mapping-curves";
import { scatterOffset } from "./scatter";

import type { DabBatch } from "../core/dab-layout";
import type { ContactFootprint, DabInstance, ModeledSample, Rgba } from "../core/types";
import type { BrushProgram, BrushTipSpec } from "../presets/program-schema";

/**
 * 스트로크 동역학 → dab 배치. 경로 길이를 적분해 간격마다 dab를 놓고 압력·발자국을 보간한다.
 * - spacing = program.deposition.spacing × max(rx, ry) (최소 0.25 px)
 * - 적응 간격(설계 보충 §4.3): 표본 사이에서 발자국 반경이 ADAPTIVE_RADIUS_JUMP(10%) 넘게 변하면
 *   그 구간의 간격을 절반으로 줄여 폭 급변(닙 벌어짐·붓 눌림)을 매끄럽게 잇는다.
 * - 시간 기반 dab: deposition.timeDabsPerSecond > 0이면 경과 시간 × 비율 × 간격만큼 가상 거리를 누적해
 *   정지 상태에서도 같은 자리에 dab이 쌓인다(잉크 고임·에어브러시 누적).
 * - 시작 테이퍼: taperStartPx 구간에서 반경 × smoothstep(진행 거리)
 * - 끝 테이퍼: 마지막 taperEndPx 구간의 dab를 보류했다가 end()에서 축소해 방출
 * - dual tip: 같은 위치에 flags.dualTip dab 1개 추가
 * 같은 (program, seed, 입력)이면 같은 DabInstance[]가 나온다(결정성 검증 단위).
 */

export const DEFAULT_STROKE_COLOR: Rgba = [0, 0, 0, 1];
export const MIN_SPACING_PX = 0.25;
/** 적응 간격 임계: 인접 표본 사이 최대 반경 변화율. */
export const ADAPTIVE_RADIUS_JUMP = 0.1;
/** 정지 상태 시간 기반 dab의 1회 호출당 상한(폭주 방지, fail-visible 아님: 입력 간격이 이보다 길면 간격이 늘어난다). */
export const MAX_TIME_DABS_PER_STEP = 64;

export interface DabEmitterOptions {
  /** sRGB straight. 기본 검정. */
  color?: Rgba;
}

interface PathPoint {
  x: number;
  y: number;
  sample: ModeledSample;
  fp: ContactFootprint;
}

interface PendingDab {
  dab: DabInstance;
  dual: DabInstance | null;
  pathPos: number;
}

const TWO_PI = Math.PI * 2;

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return a + d * t;
}

function lerpFootprint(a: ContactFootprint, b: ContactFootprint, t: number): ContactFootprint {
  return {
    rx: lerp(a.rx, b.rx, t),
    ry: lerp(a.ry, b.ry, t),
    angle: lerpAngle(a.angle, b.angle, t),
    depositStrength: lerp(a.depositStrength, b.depositStrength, t),
    breakup: lerp(a.breakup, b.breakup, t),
    grain: lerp(a.grain, b.grain, t),
    water: lerp(a.water, b.water, t),
    asymmetry: lerp(a.asymmetry, b.asymmetry, t),
    nibGap: lerp(a.nibGap, b.nibGap, t),
  };
}

function lerpSample(a: ModeledSample, b: ModeledSample, t: number): ModeledSample {
  let dx = lerp(a.dirX, b.dirX, t);
  let dy = lerp(a.dirY, b.dirY, t);
  const l = Math.hypot(dx, dy);
  if (l > 1e-6) {
    dx /= l;
    dy /= l;
  } else {
    dx = b.dirX;
    dy = b.dirY;
  }
  return {
    ...b,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    tMs: lerp(a.tMs, b.tMs, t),
    pressure: lerp(a.pressure, b.pressure, t),
    velocity: lerp(a.velocity, b.velocity, t),
    altitudeDeg: lerp(a.altitudeDeg, b.altitudeDeg, t),
    azimuthDeg: lerp(a.azimuthDeg, b.azimuthDeg, t),
    dirX: dx,
    dirY: dy,
  };
}

export class DabEmitter {
  private readonly program: BrushProgram;
  private readonly seed: number;
  private readonly baseColor: Rgba;
  private rng: Pcg32;
  private strokeColor: [number, number, number, number] = [0, 0, 0, 1];
  private prev: PathPoint | null = null;
  private distSinceLast = 0;
  private pathLen = 0;
  private dabIndex = 0;
  private pending: PendingDab[] = [];

  constructor(program: BrushProgram, seed: number, opts: DabEmitterOptions = {}) {
    this.program = program;
    this.seed = seed >>> 0;
    this.baseColor = opts.color ?? DEFAULT_STROKE_COLOR;
    this.rng = new Pcg32(this.seed, 7);
    this.begin();
  }

  begin(): void {
    this.rng = new Pcg32(this.seed, 7);
    this.strokeColor = dabColor(this.baseColor, this.program.colorDynamics, this.rng);
    this.prev = null;
    this.distSinceLast = 0;
    this.pathLen = 0;
    this.dabIndex = 0;
    this.pending = [];
  }

  /** 발자국 기준 dab 간격(px). */
  private spacingFor(fp: ContactFootprint, scale = 1): number {
    return Math.max(MIN_SPACING_PX, this.program.deposition.spacing * scale * Math.max(fp.rx, fp.ry));
  }

  /** 반환: 이 호출에서 out에 추가된 dab 수. */
  emit(samples: readonly ModeledSample[], footprints: readonly ContactFootprint[], out: DabBatch): number {
    let added = 0;
    const rate = this.program.deposition.timeDabsPerSecond;
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      const fp = footprints[i];
      if (!s || !fp) continue;
      if (!this.prev) {
        this.prev = { x: s.x, y: s.y, sample: s, fp };
        this.distSinceLast = 0;
        added += this.place(s, fp, 0, out);
        continue;
      }
      const p = this.prev;
      const segLen = Math.hypot(s.x - p.x, s.y - p.y);
      // 시간 기반 dab: 경과 시간을 간격 단위의 가상 거리로 누적한다.
      if (rate > 0) {
        const dtMs = Math.max(0, s.tMs - p.sample.tMs);
        this.distSinceLast += ((dtMs * rate) / 1000) * this.spacingFor(fp);
      }
      if (segLen < 1e-6) {
        // 정지: 누적된 가상 거리만큼 같은 자리에 dab을 놓는다.
        const spacing = this.spacingFor(fp);
        let n = 0;
        while (this.distSinceLast >= spacing && n < MAX_TIME_DABS_PER_STEP) {
          this.distSinceLast -= spacing;
          added += this.place(s, fp, this.pathLen, out);
          n += 1;
        }
        if (n >= MAX_TIME_DABS_PER_STEP) this.distSinceLast = 0;
        this.prev = { x: s.x, y: s.y, sample: s, fp };
        continue;
      }
      // 적응 간격: 반경이 급변하는 구간은 간격을 절반으로.
      const rPrev = Math.max(p.fp.rx, p.fp.ry);
      const rCur = Math.max(fp.rx, fp.ry);
      const adaptive = Math.abs(rCur - rPrev) / Math.max(rPrev, 1e-3) > ADAPTIVE_RADIUS_JUMP ? 0.5 : 1;
      let d = 0;
      for (;;) {
        const u = d / segLen;
        const fpU = lerpFootprint(p.fp, fp, u);
        const spacing = this.spacingFor(fpU, adaptive);
        const need = Math.max(0, spacing - this.distSinceLast);
        if (d + need > segLen) {
          this.distSinceLast += segLen - d;
          break;
        }
        d += need;
        this.distSinceLast = 0;
        const t = d / segLen;
        added += this.place(lerpSample(p.sample, s, t), lerpFootprint(p.fp, fp, t), this.pathLen + d, out);
      }
      this.pathLen += segLen;
      this.prev = { x: s.x, y: s.y, sample: s, fp };
      added += this.release(out, false);
    }
    return added;
  }

  /** 끝 테이퍼: 보류 dab를 축소해 방출한다. */
  end(out: DabBatch): number {
    return this.release(out, true);
  }

  private place(sample: ModeledSample, fp: ContactFootprint, pathPos: number, out: DabBatch): number {
    const prog = this.program;
    const index = this.dabIndex;
    this.dabIndex += 1;
    const sc = scatterOffset(this.rng, prog.strokeDynamics.scatter);
    const color = prog.colorDynamics.perDab ? dabColor(this.baseColor, prog.colorDynamics, this.rng) : this.strokeColor;
    if (prog.edge.dryBreakup > 0) {
      const u = this.rng.nextF32();
      if (u < fp.breakup * prog.edge.dryBreakup) return 0;
    }
    const progress = Math.min(1, pathPos / Math.max(1, this.pathLen + 1));
    const sizeScale = evaluateMappingProduct(prog.strokeDynamics.size, sample, progress, this.rng);
    const flowScale = evaluateMappingProduct(prog.strokeDynamics.flow, sample, progress, this.rng);
    let taper = 1;
    if (prog.edge.taperStartPx > 0) taper = smoothstep(pathPos / prog.edge.taperStartPx);
    const scale = Math.max(0, sizeScale) * taper * sc.dScale;
    const rx = Math.max(0.01, fp.rx * scale);
    const ry = Math.max(0.01, fp.ry * scale);
    let angle = prog.tip.angleRad + sc.dAngle;
    switch (prog.strokeDynamics.rotationFollow) {
      case "direction":
        angle += Math.atan2(sample.dirY, sample.dirX);
        break;
      case "tilt":
        angle += (sample.azimuthDeg * Math.PI) / 180;
        break;
      case "none":
        angle += fp.angle;
        break;
    }
    const model = prog.deposition.model;
    const flow = Math.min(1, Math.max(0, prog.deposition.flow * fp.depositStrength * flowScale));
    const wetMedia = model === "wet-flow" || model === "impasto";
    const dab: DabInstance = {
      x: sample.x + sc.dx,
      y: sample.y + sc.dy,
      rx,
      ry,
      angle,
      hardness: prog.tip.hardness,
      flow,
      shapeExp: prog.tip.shapeExp,
      r: color[0],
      g: color[1],
      b: color[2],
      a: color[3],
      tipKind: prog.tip.kind,
      seed: hashU32(index, 0x5a6b, this.seed) & 0x00ff_ffff,
      grain: prog.paper.enabled ? Math.min(1, Math.max(0, fp.grain)) : 0,
      wet: wetMedia && prog.wet ? Math.min(1, Math.max(0, fp.water)) : 0,
      pigmentMass: wetMedia ? flow : 0,
      erase: model === "eraser",
      smudge: model === "smudge",
      dualTip: false,
      lockAlpha: false,
      impasto: model === "impasto",
      deposition: model,
    };
    const dual = prog.deposition.dual ? this.dualOf(dab, prog.deposition.dual, index) : null;
    if (prog.edge.taperEndPx > 0) {
      this.pending.push({ dab, dual, pathPos });
      return 0;
    }
    return this.push(dab, dual, out);
  }

  private dualOf(base: DabInstance, tip: BrushTipSpec, index: number): DabInstance {
    const ratio = tip.sizePx / Math.max(1e-3, this.program.tip.sizePx);
    return {
      ...base,
      rx: Math.max(0.01, base.rx * ratio),
      ry: Math.max(0.01, base.ry * ratio * tip.aspect),
      angle: base.angle + tip.angleRad,
      hardness: tip.hardness,
      shapeExp: tip.shapeExp,
      tipKind: tip.kind,
      seed: hashU32(index, 0x6c7d, this.seed ^ tip.seed) & 0x00ff_ffff,
      dualTip: true,
    };
  }

  private push(dab: DabInstance, dual: DabInstance | null, out: DabBatch): number {
    let n = 0;
    if (out.push(dab)) n += 1;
    if (dual && out.push(dual)) n += 1;
    return n;
  }

  private release(out: DabBatch, final: boolean): number {
    if (this.pending.length === 0) return 0;
    const taperEnd = this.program.edge.taperEndPx;
    let added = 0;
    if (!final) {
      const safeBefore = this.pathLen - taperEnd;
      while (this.pending.length > 0) {
        const head = this.pending[0];
        if (!head || head.pathPos > safeBefore) break;
        this.pending.shift();
        added += this.push(head.dab, head.dual, out);
      }
      return added;
    }
    const total = this.pathLen;
    for (const item of this.pending) {
      const s = smoothstep((total - item.pathPos) / taperEnd);
      const scaleDab = (d: DabInstance): DabInstance => ({
        ...d,
        rx: Math.max(0.01, d.rx * s),
        ry: Math.max(0.01, d.ry * s),
      });
      added += this.push(scaleDab(item.dab), item.dual ? scaleDab(item.dual) : null, out);
    }
    this.pending = [];
    return added;
  }
}
