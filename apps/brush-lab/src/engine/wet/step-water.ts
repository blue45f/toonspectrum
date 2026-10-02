import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";

import { LBM_CX, LBM_CY, LBM_LINK_CLASS, LBM_LINK_OWNER_IS_UPSTREAM, LBM_OPP, LBM_W } from "./lbm-d2q9";
import { buildPaddedSnapshots, computeEdgeDelta, PCH } from "./padded";
import { PAD_CELLS, PAD_SIZE, tilePaperFor } from "./paper-wet";
import { WET_PHYSICS } from "./params";
import { WET_CH, WET_EXT_CH } from "./state";

import type { PaddedTile } from "./padded";
import type { TilePaper, WetPaperSource } from "./paper-wet";
import type { WetParams } from "./params";
import type { WetState } from "./state";

/**
 * 수채·수묵·구아슈 물 스텝(CPU 참조). 한 서브스텝 = LBM 1 반복 + 물 교환 + 안료 수송·침착 + 건조(경화).
 *
 * 3층(Curtis 1997 개념): 표면층 ws(코어 `water`), 흐름층 ρ(확장 풀 f0..f8의 합 — MoXi 식 D2Q9 LBM), 모세관층 s.
 *  1) 흐름층: 다공성 부분 bounce-back LBM(링크 κ = 1 − (1 − κ_종이)·φ(ρ_링크)), 체적 가속(모세관 흡입·종이 기울기·
 *     에지 바깥 흐름·중력), |u| ≤ uMax. 활성 집합 밖·종이 가장자리는 벽(no-slip).
 *  2) 물 교환: 표면 → 흐름/모세관 흡수(seep), 모세관층 확산(문턱 이상에서만, 링크 차단 적용), 증발(전선 가중).
 *  3) 안료: 흐름층 속도 u로 상류 이류(면 속도 × λ) + 확산, 침착(얇을수록·골일수록·섬유·아교일수록 빠름), 재부유(재습윤),
 *     물이 사라지면 침착 → 경화(cure)하면 (1 − rewet)만큼 고정(D).
 * 모든 수식은 이전 상태 스냅샷(패딩 18×18)에서 읽어 gather 방식으로 새 상태를 쓰므로 타일 순회 순서와 무관하고
 * 물·안료 총량이 보존된다(증발·잔량 접힘은 장부에 기록).
 *
 * 2026-10-01 보정 기록(64×64 CPU 실험, 원판 r=12, ws 0.8, 안료 질량 0.12): 이 스텝의 상수는 `WET_PHYSICS`가 단일 원천이다.
 */

export interface WaterStepReceipt {
  /** 이 스텝에서 증발한 물(표면·흐름·모세관 층 + 0으로 접힌 잔량). */
  evaporated: number;
  /** 표면층에서 흐름/모세관층으로 이동한 물(내부 이동, 장부에 영향 없음). */
  seeped: number;
  /** 재부유한 침착 안료 질량. */
  lifted: number;
}

export interface WaterStepInput {
  state: WetState;
  params: WetParams;
  /** 서브스텝 길이(ms). */
  hMs: number;
  paper: WetPaperSource;
  /** 순회할 활성 타일(결정적 순서). */
  tiles: readonly number[];
}

// 가져온 상수·배열은 모듈 지역 값으로 복사한다(번들러/로더에 따라 가져온 바인딩 접근이 getter 호출이라 핫 루프에서 느리다).
const TP = TILE_PIXELS;
const TS = TILE_SIZE;
const PC = PAD_CELLS;
const PS = PAD_SIZE;
const CXA = Int32Array.from(LBM_CX);
const CYA = Int32Array.from(LBM_CY);
const OPPA = Int32Array.from(LBM_OPP);
const WA = Float64Array.from(LBM_W);
/** 링크 클래스 → 평탄 κ 배열 오프셋(클래스·PAD_CELLS). */
const CLS_OFF = Int32Array.from(LBM_LINK_CLASS, (c) => c * PAD_CELLS);
const UPSTREAM = Uint8Array.from(LBM_LINK_OWNER_IS_UPSTREAM.map((b) => (b ? 1 : 0)));
const OFF = new Int32Array(9);
for (let i = 0; i < 9; i += 1) OFF[i] = (CYA[i] ?? 0) * PS + (CXA[i] ?? 0);
const FIN = new Float64Array(9);
/** 이번 스텝 모세관 링크 물 유량(이웃 q → 이 셀, 양수 = 유입). 안료 운반이 읽는다. */
const JIN = new Float64Array(9);
const FEQ = new Float64Array(9);
const NEAR = new Uint8Array(PAD_CELLS);
const NEAR_CAP = new Uint8Array(PAD_CELLS);
const FACE_OFF = Int32Array.of(-1, 1, -PS, PS);
/** 링크 확산 가중(D2Q9 가중 비 면 : 대각 = 4 : 1을 합이 2가 되도록 정규화: 면 2/3, 대각 1/6 → 등방 D = 계수). */
const LW = Float64Array.of(0, 2 / 3, 2 / 3, 2 / 3, 2 / 3, 1 / 6, 1 / 6, 1 / 6, 1 / 6);
const NEIGH8 = Int32Array.of(-PS - 1, -PS, -PS + 1, -1, 1, PS - 1, PS, PS + 1);
const MASS_EPS = 1e-9;
const PCH_F0 = PCH.f0;
const PCH_RHO = PCH.rho;
const PCH_WS = PCH.ws;
const PCH_S = PCH.s;
const PCH_G0 = PCH.g0;
const PCH_UX = PCH.ux;
const PCH_UY = PCH.uy;
const PCH_DELTA = PCH.delta;
const PCH_B = PCH.b;

/** 서브스텝 상수(파라미터와 h에서 한 번 계산). GPU 호스트가 같은 값을 uniform으로 올릴 수 있도록 export한다(`makeWaterKernel`이 단일 원천). */
export interface WaterKernel {
  surfTension: number;
  alpha: number;
  beta: number;
  capScale: number;
  dc: number;
  thetaC: number;
  kc: number;
  es: number;
  ef: number;
  ec: number;
  dryTail: number;
  edgeBoost: number;
  etaEdge: number;
  khFlow: number;
  gAx: number;
  gAy: number;
  dp: number;
  /** 1 / (1 − k0): 링크 전도율을 평균 전도율 대비 상대값으로 만든다. */
  invGref: number;
  /** 그래뉼레이션 골 방향 안료 이동 계수 = grainDriftScale·granulation. */
  grainDrift: number;
  /** 안료 에지 이동 계수 = edgeDriftScale·edgeDarkening. */
  edgeDrift: number;
  lambda: number;
  rhoK: number;
  omegaK: number;
  pin: number;
  gran: number;
  glueGain: number;
  dryBrush: number;
  rewet: number;
  cureLimit: number;
  /** 모세관 확산이 일어날 수 있는 최소 포화(이보다 옅은 곳은 가벼운 경로). */
  sWake: number;
  hf: number;
  omegaLbm: number;
  tau: number;
}

export function makeWaterKernel(params: WetParams, hMs: number): WaterKernel {
  const hf = hMs / WET_PHYSICS.nominalStepMs;
  const es = params.evaporation * hMs;
  return {
    surfTension: params.surfaceTension,
    alpha: 0.5 * params.capillary,
    beta: params.seepSplit,
    capScale: 0.5 + params.absorptivity,
    dc: params.capillaryDiffusion * hf,
    thetaC: params.wetThreshold,
    kc: params.capillaryForce,
    es,
    ef: es * params.evapFlowRatio,
    ec: es * params.evapCapillaryRatio,
    dryTail: hMs / params.dryingMs,
    edgeBoost: WET_PHYSICS.edgeBoostScale * params.edgeDarkening,
    etaEdge: WET_PHYSICS.edgeFlowScale * params.edgeDarkening,
    khFlow: WET_PHYSICS.heightFlowScale * params.granulation,
    gAx: WET_PHYSICS.gravityScale * params.gravity[0],
    gAy: WET_PHYSICS.gravityScale * params.gravity[1],
    dp: WET_PHYSICS.pigmentDiffusionScale * params.diffusion,
    invGref: 1 / Math.max(0.03, 1 - params.fiberBlocking),
    grainDrift: WET_PHYSICS.grainDriftScale * params.granulation,
    edgeDrift: WET_PHYSICS.edgeDriftScale * params.edgeDarkening,
    lambda: params.pigmentMobility,
    rhoK: params.depositRate * hf,
    omegaK: params.liftRate * hf,
    pin: params.pinning,
    gran: WET_PHYSICS.granulationGain * params.granulation,
    glueGain: params.glueGain,
    dryBrush: params.dryBrush,
    rewet: params.rewet,
    cureLimit: Math.max(1, Math.round((WET_PHYSICS.cureFraction * params.dryingMs) / hMs)),
    sWake: 0.5 * params.wetThreshold * WET_PHYSICS.capacityBase * (0.5 + params.absorptivity),
    hf,
    omegaLbm: 1 / WET_PHYSICS.lbmTau,
    tau: WET_PHYSICS.lbmTau,
  };
}

interface Accum {
  evaporated: number;
  seeped: number;
  lifted: number;
}

/**
 * 타일 1개의 새 상태를 쓴다. 반환값: 타일을 계속 활성으로 둘지(젖음·부유 안료·경화 대기가 남았는가).
 */
function stepTile(
  k: WaterKernel,
  pt: PaddedTile,
  tp: TilePaper,
  core: Float32Array,
  ext: Float32Array,
  acc: Accum,
): boolean {
  const P = pt.data;
  const valid = pt.valid;
  const rhoMin = WET_PHYSICS.rhoMin;
  const waterEps = WET_PHYSICS.waterEps;
  const rhoFull = WET_PHYSICS.rhoFull;
  const uMax = WET_PHYSICS.uMax;
  const u2Max = uMax * uMax;
  const aMax = WET_PHYSICS.accelMax;
  const kFlat = tp.kappaFlat;
  const capBaseA = tp.capBase;
  const absorbA = tp.absorb;
  const hA = tp.h;
  const kbarA = tp.kbar;
  const faceOutMax = WET_PHYSICS.faceOutMax;
  const diagOutMax = WET_PHYSICS.diagOutMax;
  const depthRef = WET_PHYSICS.depthRef;
  const thinBoost = WET_PHYSICS.thinBoost;
  const surfaceCap = WET_PHYSICS.surfaceCap;
  const dryBrushDepth = WET_PHYSICS.dryBrushDepth;
  const pinSpeedRef = WET_PHYSICS.pinSpeedRef;
  const pinStatic = WET_PHYSICS.pinStaticFraction;
  const capScale = k.capScale;
  const wOff = WET_CH.water * TP;
  const vxOff = WET_CH.velocityX * TP;
  const vyOff = WET_CH.velocityY * TP;
  const gOff = WET_CH.pigmentR * TP;
  const dOff = WET_CH.fixedR * TP;
  const fOff = WET_EXT_CH.lbm0 * TP;
  const rhoOff = WET_EXT_CH.rho * TP;
  const sOff = WET_EXT_CH.capillary * TP;
  const cureOff = WET_EXT_CH.cure * TP;
  const hardOff = WET_EXT_CH.hardR * TP;
  const sT = k.surfTension;
  const sWake = k.sWake;
  const bWake = WET_PHYSICS.wetBlurWake;
  const bOff = WET_EXT_CH.wetBlur * TP;
  let keep = false;

  // 1) 이웃 포함 젖음 여부(표면·흐름층 물·부유 안료·젖음 블러가 있는 셀과 그 이웃만 전체 경로로 처리한다).
  //    모세관 물만 있는 셀(그 이웃 포함)은 모세관 확산 + 증발만 하는 중간 경로로 처리한다.
  const wetFlag = NEAR;
  const capFlag = NEAR_CAP;
  for (let p = 0; p < PC; p += 1) {
    wetFlag[p] =
      (P[PCH_WS * PC + p] ?? 0) + (P[PCH_RHO * PC + p] ?? 0) > 0 ||
      (P[(PCH_G0 + 3) * PC + p] ?? 0) > 0 ||
      (P[PCH_B * PC + p] ?? 0) >= bWake
        ? 1
        : 0;
    capFlag[p] = (P[PCH_S * PC + p] ?? 0) >= sWake ? 1 : 0;
  }

  for (let ly = 0; ly < TS; ly += 1) {
    for (let lx = 0; lx < TS; lx += 1) {
      const i = ly * TS + lx;
      const p = (ly + 1) * PS + (lx + 1);
      let near = wetFlag[p] === 1;
      if (!near) {
        for (let n = 0; n < 8; n += 1) {
          if (wetFlag[p + (NEIGH8[n] ?? 0)] === 1) {
            near = true;
            break;
          }
        }
      }
      const s0 = P[PCH_S * PC + p] ?? 0;
      const d3 = core[dOff + 3 * TP + i] ?? 0;

      if (!near) {
        // ---- 가벼운 경로: 모세관 확산(모세관 물이 근처에 있을 때)·잔수 증발·경화만(B는 깨움 기준 미만이라 0) ----
        ext[bOff + i] = 0;
        let capNear = capFlag[p] === 1;
        if (!capNear) {
          for (let n = 0; n < 8; n += 1) {
            if (capFlag[p + (NEIGH8[n] ?? 0)] === 1) {
              capNear = true;
              break;
            }
          }
        }
        let s = s0;
        if (capNear) {
          const capL = (capBaseA[p] ?? 0.7) * capScale;
          const th0 = s0 / capL;
          for (let q = 1; q < 9; q += 1) {
            const qn = p + (OFF[q] ?? 0);
            if (valid[qn] === 0) continue;
            const sN = P[PCH_S * PC + qn] ?? 0;
            const capN = (capBaseA[qn] ?? 0.7) * capScale;
            const cbar = 0.5 * (capL + capN);
            if (!(Math.max(s0, sN) > k.thetaC * cbar)) continue;
            const kk = kFlat[(CLS_OFF[q] ?? 0) + (UPSTREAM[q] === 1 ? p : qn)] ?? 0;
            let j = k.dc * (LW[q] ?? 0) * (1 - kk) * cbar * (sN / capN - th0);
            if (j > 0) {
              const lim = 0.1 * sN;
              if (j > lim) j = lim;
            } else {
              const lim = -0.1 * s0;
              if (j < lim) j = lim;
            }
            s += j;
          }
        }
        if (s > 0) {
          let ev = k.ec + s * k.dryTail * 0.5;
          if (ev > s) ev = s;
          s -= ev;
          acc.evaporated += ev;
          if (s < waterEps) {
            acc.evaporated += s;
            s = 0;
          }
          ext[sOff + i] = s;
          if (s > 0) keep = true;
        }
        if (d3 > MASS_EPS) {
          const cure = ext[cureOff + i] ?? 0;
          if (cure <= k.cureLimit) {
            const next = cure + 1;
            ext[cureOff + i] = next;
            if (next > k.cureLimit) {
              for (let c = 0; c < 4; c += 1) {
                const dv = core[dOff + c * TP + i] ?? 0;
                ext[hardOff + c * TP + i] = (ext[hardOff + c * TP + i] ?? 0) + (1 - k.rewet) * dv;
                core[dOff + c * TP + i] = k.rewet * dv;
              }
            } else {
              keep = true;
            }
          }
        }
        continue;
      }

      // ---- 전체 경로 ----
      const ws0 = P[PCH_WS * PC + p] ?? 0;
      const rho0 = P[PCH_RHO * PC + p] ?? 0;
      const capB = capBaseA[p] ?? 0.7;
      const cap = capB * capScale;

      // (0) 젖음 블러 B: 한 걸음 헬름홀츠 완화(이웃 평균 쪽으로 + 젖음 w를 주입). 마른 셀은 빨리 식는다.
      let bNew: number;
      {
        const wd = ws0 + rho0;
        const wI = wd >= WET_PHYSICS.wetBlurFull ? 1 : wd / WET_PHYSICS.wetBlurFull;
        const bp = P[PCH_B * PC + p] ?? 0;
        let sumB = 0;
        for (let n = 0; n < 4; n += 1) {
          const q = p + (FACE_OFF[n] ?? 0);
          sumB += valid[q] === 1 ? (P[PCH_B * PC + q] ?? 0) : bp;
        }
        const kB = wd > rhoMin ? WET_PHYSICS.wetBlurKeepWet : WET_PHYSICS.wetBlurKeepDry;
        bNew = (1 - kB) * wI + kB * 0.25 * sumB;
        if (bNew < bWake) bNew = 0;
        ext[bOff + i] = bNew;
        if (bNew > 0) keep = true;
      }

      // (1) LBM: 풀 스트리밍 + 다공성 부분 bounce-back
      FIN[0] = P[PCH_F0 * PC + p] ?? 0;
      let rho1 = FIN[0];
      let jx = 0;
      let jy = 0;
      for (let q = 1; q < 9; q += 1) {
        const y = p - (OFF[q] ?? 0);
        const opp = OPPA[q] ?? 0;
        const fo = P[opp * PC + p] ?? 0;
        let v: number;
        if (valid[y] === 0) {
          v = fo;
        } else {
          const kp = kFlat[(CLS_OFF[q] ?? 0) + (UPSTREAM[q] === 1 ? y : p)] ?? 0;
          let x = ((rho0 + (P[PCH_RHO * PC + y] ?? 0)) * 0.5) / rhoFull;
          if (x > 1) x = 1;
          const phi = x * (1 - sT + sT * x);
          const kap = 1 - (1 - kp) * phi;
          v = (1 - kap) * (P[q * PC + y] ?? 0) + kap * fo;
        }
        FIN[q] = v;
        rho1 += v;
        jx += (CXA[q] ?? 0) * v;
        jy += (CYA[q] ?? 0) * v;
      }
      rho1 = Math.fround(rho1);

      // (2) 체적 가속: 모세관 흡입, 종이 기울기, 에지 바깥 흐름, 중력
      const sc0 = s0 / cap;
      const pE = p + 1;
      const pW = p - 1;
      const pN = p - PS;
      const pS = p + PS;
      const scE = valid[pE] === 1 ? (P[PCH_S * PC + pE] ?? 0) / ((capBaseA[pE] ?? 0.7) * capScale) : sc0;
      const scW = valid[pW] === 1 ? (P[PCH_S * PC + pW] ?? 0) / ((capBaseA[pW] ?? 0.7) * capScale) : sc0;
      const scN = valid[pN] === 1 ? (P[PCH_S * PC + pN] ?? 0) / ((capBaseA[pN] ?? 0.7) * capScale) : sc0;
      const scS = valid[pS] === 1 ? (P[PCH_S * PC + pS] ?? 0) / ((capBaseA[pS] ?? 0.7) * capScale) : sc0;
      let ax = -k.kc * (scE - scW) * 0.5 - k.khFlow * ((hA[pE] ?? 0) - (hA[pW] ?? 0)) * 0.5;
      let ay = -k.kc * (scS - scN) * 0.5 - k.khFlow * ((hA[pS] ?? 0) - (hA[pN] ?? 0)) * 0.5;
      ax += k.etaEdge * ((P[PCH_DELTA * PC + pE] ?? 0) - (P[PCH_DELTA * PC + pW] ?? 0)) * 0.5 + k.gAx;
      ay += k.etaEdge * ((P[PCH_DELTA * PC + pS] ?? 0) - (P[PCH_DELTA * PC + pN] ?? 0)) * 0.5 + k.gAy;
      const a2 = ax * ax + ay * ay;
      if (a2 > aMax * aMax) {
        const sc = aMax / Math.sqrt(a2);
        ax *= sc;
        ay *= sc;
      }

      // (3) 속도(이류용 거시 속도, 평형용 이동 속도) — 마하 상한
      let ux = 0;
      let uy = 0;
      let uex = 0;
      let uey = 0;
      if (rho1 > 1e-7) {
        const inv = 1 / rho1;
        ux = jx * inv + 0.5 * ax;
        uy = jy * inv + 0.5 * ay;
        uex = jx * inv + k.tau * ax;
        uey = jy * inv + k.tau * ay;
        const m1 = ux * ux + uy * uy;
        if (m1 > u2Max) {
          const sc = uMax / Math.sqrt(m1);
          ux *= sc;
          uy *= sc;
        }
        const m2 = uex * uex + uey * uey;
        if (m2 > u2Max) {
          const sc = uMax / Math.sqrt(m2);
          uex *= sc;
          uey *= sc;
        }
      }

      // (4) 충돌(BGK)
      const usq = 1.5 * (uex * uex + uey * uey);
      for (let q = 0; q < 9; q += 1) {
        const cu = 3 * ((CXA[q] ?? 0) * uex + (CYA[q] ?? 0) * uey);
        const feq = (WA[q] ?? 0) * rho1 * (1 + cu + 0.5 * cu * cu - usq);
        FEQ[q] = FIN[q] - k.omegaLbm * (FIN[q] - feq);
      }

      // (5) 모세관층 확산(문턱 이상, 8링크 — 섬유 전도율 1 − κ 적용, 링크 기증 한도 10%로 8링크 합 80% 이하 → 양수 유지)
      let s1 = s0;
      {
        const th0 = sc0;
        for (let q = 1; q < 9; q += 1) {
          JIN[q] = 0;
          const qn = p + (OFF[q] ?? 0);
          if (valid[qn] === 0) continue;
          const sN = P[PCH_S * PC + qn] ?? 0;
          const capN = (capBaseA[qn] ?? 0.7) * capScale;
          const cbar = 0.5 * (cap + capN);
          if (!(Math.max(s0, sN) > k.thetaC * cbar)) continue;
          const kk = kFlat[(CLS_OFF[q] ?? 0) + (UPSTREAM[q] === 1 ? p : qn)] ?? 0;
          let j = k.dc * (LW[q] ?? 0) * (1 - kk) * cbar * (sN / capN - th0);
          if (j > 0) {
            const lim = 0.1 * sN;
            if (j > lim) j = lim;
          } else {
            const lim = -0.1 * s0;
            if (j < lim) j = lim;
          }
          s1 += j;
          JIN[q] = j;
        }
      }

      // (6) 표면층: 상한 초과분은 흐름층으로, 흡수(seep)는 모세관 용량과 (1 − s/c)에 비례
      let ws = ws0;
      let flowAdd = 0;
      if (ws > surfaceCap) {
        flowAdd += ws - surfaceCap;
        ws = surfaceCap;
      }
      const absorb = absorbA[p] ?? 0.5;
      if (ws > 0) {
        const room = cap - s1;
        let frac = k.alpha * absorb * (1 - s1 / cap) * k.hf;
        if (frac < 0) frac = 0;
        if (frac > 1) frac = 1;
        let seep = ws * frac;
        if (k.beta > 0 && seep * k.beta > room) seep = room > 0 ? room / k.beta : 0;
        ws -= seep;
        s1 += k.beta * seep;
        flowAdd += (1 - k.beta) * seep;
        acc.seeped += seep;
      }

      // (7) 증발(젖음 전선 가중)
      let front = 0;
      const wtx = ws0 + rho0;
      if (wtx > rhoMin) {
        for (let n = 0; n < 4; n += 1) {
          const q = p + (FACE_OFF[n] ?? 0);
          if (valid[q] === 0) continue;
          const v = 1 - ((P[PCH_WS * PC + q] ?? 0) + (P[PCH_RHO * PC + q] ?? 0)) / (wtx + 1e-6);
          if (v > front) front = v;
        }
      }
      const boost = 1 + k.edgeBoost * front;
      let evS = k.es * boost + ws * k.dryTail;
      if (evS > ws) evS = ws;
      ws -= evS;
      let rhoTot = rho1 + flowAdd;
      let evF = k.ef * boost + rhoTot * k.dryTail;
      if (evF > rhoTot) evF = rhoTot;
      const rhoAfter = rhoTot - evF;
      let evC = 0;
      if (ws <= 0 && rhoAfter < rhoMin && s1 > 0) {
        evC = k.ec * boost + s1 * k.dryTail * 0.5;
        if (evC > s1) evC = s1;
        s1 -= evC;
      }
      acc.evaporated += evS + evF + evC;
      rhoTot = rhoAfter;

      // 잔량 접힘
      let residual = false;
      if (ws + rhoTot + s1 < waterEps) {
        acc.evaporated += ws + rhoTot + s1;
        ws = 0;
        rhoTot = 0;
        s1 = 0;
        residual = true;
      }

      // 새 분포 기록(증발·흡수 반영: 비례 축소 + f0 가산)
      const scaleF = rho1 > 0 ? (rho1 - Math.min(evF, rho1)) / rho1 : 0;
      if (residual) {
        for (let q = 0; q < 9; q += 1) ext[fOff + q * TP + i] = 0;
        ext[rhoOff + i] = 0;
      } else {
        const add0 = flowAdd - Math.max(0, evF - rho1);
        for (let q = 0; q < 9; q += 1) {
          let v = (FEQ[q] ?? 0) * scaleF;
          if (q === 0) v += add0;
          ext[fOff + q * TP + i] = v;
        }
        ext[rhoOff + i] = rhoTot;
      }
      ext[sOff + i] = s1;
      core[wOff + i] = ws;

      // (8) 안료: 8링크 확산(섬유 전도율 (1 − κ)/(1 − k0)) + 4면 상류 이류, 링크 유출 상한, gather
      const g0 = P[(PCH_G0 + 3) * PC + p] ?? 0;
      const wetX = ws0 + rho0 > rhoMin;
      const uxo = P[PCH_UX * PC + p] ?? 0;
      const uyo = P[PCH_UY * PC + p] ?? 0;
      let outTotal = 0;
      let gr = 0;
      let gg = 0;
      let gb = 0;
      let gm = 0;
      for (let q = 1; q < 9; q += 1) {
        const qn = p + (OFF[q] ?? 0);
        if (valid[qn] === 0) continue;
        const wetN = (P[PCH_WS * PC + qn] ?? 0) + (P[PCH_RHO * PC + qn] ?? 0) > rhoMin;
        const dx = CXA[q] ?? 0;
        const dy = CYA[q] ?? 0;
        const kk = kFlat[(CLS_OFF[q] ?? 0) + (UPSTREAM[q] === 1 ? p : qn)] ?? 0;
        const diff = wetX && wetN ? k.dp * (LW[q] ?? 0) * (1 - kk) * k.invGref : 0;
        let adv = 0;
        let advIn = 0;
        // 모세관 운반: 이 링크로 모세관 물이 흐르면 기증 셀 안료의 (이동도 × 유량 / 기증 셀 총 물)이 같이 간다.
        // 도착 셀이 마른(표면·흐름층 물 없음) 곳이면 곧바로 침착해 번짐 후광(깃털)이 된다.
        const jq = JIN[q] ?? 0;
        if (jq > 0) {
          const wn = (P[PCH_WS * PC + qn] ?? 0) + (P[PCH_RHO * PC + qn] ?? 0) + (P[PCH_S * PC + qn] ?? 0);
          advIn += (k.lambda * jq) / (wn + 1e-6);
        } else if (jq < 0) {
          adv += (-k.lambda * jq) / (ws0 + rho0 + s0 + 1e-6);
        }
        if (q <= 4) {
          const ufx = 0.5 * (uxo + (P[PCH_UX * PC + qn] ?? 0));
          const ufy = 0.5 * (uyo + (P[PCH_UY * PC + qn] ?? 0));
          const un = ufx * dx + ufy * dy;
          if (un > 0) adv += k.lambda * un;
          else advIn -= k.lambda * un;
          // 에지 이동(Curtis FlowOutward): 젖은 두 셀 사이에서 블러 B가 높은 안쪽에서 낮은 바깥쪽(젖음 전선)으로 안료가 모인다.
          if (k.edgeDrift > 0 && wetX && wetN) {
            const de = k.edgeDrift * ((P[PCH_B * PC + p] ?? 0) - (P[PCH_B * PC + qn] ?? 0));
            if (de > 0) adv += de;
            else advIn -= de;
          }
          // 그래뉼레이션: 젖은 두 셀 사이에서 안료가 종이 요철의 높은 쪽에서 낮은 쪽(골)으로 흘러내린다.
          if (k.grainDrift > 0 && wetX && wetN) {
            const dh = k.grainDrift * ((hA[p] ?? 0.5) - (hA[qn] ?? 0.5));
            if (dh > 0) adv += dh;
            else advIn -= dh;
          }
        }
        const cap = q <= 4 ? faceOutMax : diagOutMax;
        // x → 이웃(q 방향)
        let oOut = diff + adv;
        if (oOut > cap) oOut = cap;
        outTotal += g0 > 0 ? oOut : 0;
        // 이웃 → x (반대 방향)
        let oIn = diff + advIn;
        if (oIn > cap) oIn = cap;
        const gn = P[(PCH_G0 + 3) * PC + qn] ?? 0;
        if (gn > 0) {
          gr += oIn * (P[PCH_G0 * PC + qn] ?? 0);
          gg += oIn * (P[(PCH_G0 + 1) * PC + qn] ?? 0);
          gb += oIn * (P[(PCH_G0 + 2) * PC + qn] ?? 0);
          gm += oIn * gn;
        }
      }
      const keepFrac = 1 - outTotal;
      gr += keepFrac * (P[PCH_G0 * PC + p] ?? 0);
      gg += keepFrac * (P[(PCH_G0 + 1) * PC + p] ?? 0);
      gb += keepFrac * (P[(PCH_G0 + 2) * PC + p] ?? 0);
      gm += keepFrac * g0;

      // (9) 침착·재부유·건조 정착
      const wdepth = ws + rhoTot;
      let dr = core[dOff + i] ?? 0;
      let dg = core[dOff + TP + i] ?? 0;
      let db = core[dOff + 2 * TP + i] ?? 0;
      let dm = core[dOff + 3 * TP + i] ?? 0;
      const hP = hA[p] ?? 0.5;
      const catchDepth = k.dryBrush > 0 ? Math.max(rhoMin, k.dryBrush * hP * dryBrushDepth) : rhoMin;
      let cure = ext[cureOff + i] ?? 0;
      if (wdepth < catchDepth) {
        // 마른(또는 종이 요철에 걸린) 곳: 부유 안료는 즉시 침착한다(새로 쌓였으면 경화를 처음부터 센다).
        if (gm > MASS_EPS && cure > k.cureLimit) cure = 0;
        dr += gr;
        dg += gg;
        db += gb;
        dm += gm;
        gr = 0;
        gg = 0;
        gb = 0;
        gm = 0;
      } else {
        const wetness = Math.min(1, wdepth / depthRef);
        // 재부유(재습윤): 침착 안료의 일부가 떠오른다
        if (dm > MASS_EPS && k.omegaK > 0) {
          const lf = Math.min(0.5, k.omegaK * wetness);
          gr += dr * lf;
          gg += dg * lf;
          gb += db * lf;
          gm += dm * lf;
          acc.lifted += dm * lf;
          dr -= dr * lf;
          dg -= dg * lf;
          db -= db * lf;
          dm -= dm * lf;
        }
        if (gm > 0) {
          const hard = ext[hardOff + 3 * TP + i] ?? 0;
          const glue = Math.min(2, gm + dm + hard);
          const thin = 1 - wetness;
          // 침착 = 중력 침강(얇을수록·골일수록 빠름) + 섬유 포집. 포집은 안료가 섬유를 스치며 이동할 때(속도 비례)
          // 걸러지는 양이라 흐름이 센 곳에서 안료가 줄어 번짐 가장자리에 옅은 후광(깃털)이 생긴다.
          const spd = Math.min(1, Math.hypot(ux, uy) / pinSpeedRef);
          let dep =
            k.rhoK * (1 + k.gran * (1 - hP)) * (1 + thinBoost * thin) +
            k.pin * k.hf * (kbarA[i] ?? 0) * (1 + k.glueGain * glue) * (pinStatic + (1 - pinStatic) * spd);
          if (dep > 0.9) dep = 0.9;
          dr += gr * dep;
          dg += gg * dep;
          db += gb * dep;
          dm += gm * dep;
          gr -= gr * dep;
          gg -= gg * dep;
          gb -= gb * dep;
          gm -= gm * dep;
        }
      }
      core[gOff + i] = gr;
      core[gOff + TP + i] = gg;
      core[gOff + 2 * TP + i] = gb;
      core[gOff + 3 * TP + i] = gm;
      core[dOff + i] = dr;
      core[dOff + TP + i] = dg;
      core[dOff + 2 * TP + i] = db;
      core[dOff + 3 * TP + i] = dm;
      core[vxOff + i] = rhoTot > 0 ? ux : 0;
      core[vyOff + i] = rhoTot > 0 ? uy : 0;

      // (10) 경화: 마른 셀은 카운터 증가, 한계를 넘으면 (1 − rewet)만 고정(D)
      if (wdepth >= rhoMin) {
        cure = 0;
      } else if (dm > MASS_EPS && cure <= k.cureLimit) {
        cure += 1;
        if (cure > k.cureLimit) {
          const fixedFrac = 1 - k.rewet;
          ext[hardOff + i] = (ext[hardOff + i] ?? 0) + fixedFrac * dr;
          ext[hardOff + TP + i] = (ext[hardOff + TP + i] ?? 0) + fixedFrac * dg;
          ext[hardOff + 2 * TP + i] = (ext[hardOff + 2 * TP + i] ?? 0) + fixedFrac * db;
          ext[hardOff + 3 * TP + i] = (ext[hardOff + 3 * TP + i] ?? 0) + fixedFrac * dm;
          core[dOff + i] = k.rewet * dr;
          core[dOff + TP + i] = k.rewet * dg;
          core[dOff + 2 * TP + i] = k.rewet * db;
          core[dOff + 3 * TP + i] = k.rewet * dm;
        }
      }
      ext[cureOff + i] = cure;
      if (ws + rhoTot + s1 >= waterEps || gm > MASS_EPS || (dm > MASS_EPS && cure <= k.cureLimit)) keep = true;
    }
  }
  return keep;
}

/**
 * 활성 타일 전체를 한 서브스텝 전진한다. 반환: 장부 영수증과 계속 활성인 타일 집합(나머지는 건조 완료).
 */
export function stepWaterMedia(input: WaterStepInput): { receipt: WaterStepReceipt; keep: Set<number> } {
  const { state, params, hMs, paper, tiles } = input;
  const k = makeWaterKernel(params, hMs);
  for (const tile of tiles) state.ensureExt(tile);
  const ext = state.ext;
  const keep = new Set<number>();
  const acc: Accum = { evaporated: 0, seeped: 0, lifted: 0 };
  if (!ext) return { receipt: acc, keep };
  const snaps = buildPaddedSnapshots(state, tiles);
  computeEdgeDelta(snaps, state.tilesX, WET_PHYSICS.rhoMin);
  for (const tile of tiles) {
    const pt = snaps.get(tile);
    const cs = state.pool.slotOf(tile);
    const es = ext.slotOf(tile);
    if (!pt || cs === undefined || es === undefined) continue;
    const tp = tilePaperFor(state, paper, params, tile);
    if (stepTile(k, pt, tp, state.pool.view(cs), ext.view(es), acc)) keep.add(tile);
  }
  return { receipt: acc, keep };
}
