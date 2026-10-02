import { describe, expect, it } from "vitest";

import { newScene, depositDisc, SCENE_FRAME_MS } from "../testing/wet-scenes";

import {
  LBM_CS2,
  LBM_CX,
  LBM_CY,
  LBM_FORWARD_DIRS,
  LBM_LINK_CLASS,
  LBM_LINK_OWNER_IS_UPSTREAM,
  LBM_OPP,
  LBM_Q,
  LBM_W,
  lbmEquilibrium,
  lbmMoments,
} from "./lbm-d2q9";
import { WET_PHYSICS, wetMediumPreset } from "./params";
import { WET_CH, WET_EXT_CH, wetTotals } from "./state";
import { stepWet } from "./wet-reference";

describe("D2Q9 격자 상수", () => {
  it("가중치 합 1, 1차 모멘트 0, 2차 모멘트 c_s²·I(등방)", () => {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let xx = 0;
    let yy = 0;
    let xy = 0;
    for (let i = 0; i < LBM_Q; i += 1) {
      const w = LBM_W[i] ?? 0;
      const cx = LBM_CX[i] ?? 0;
      const cy = LBM_CY[i] ?? 0;
      sw += w;
      sx += w * cx;
      sy += w * cy;
      xx += w * cx * cx;
      yy += w * cy * cy;
      xy += w * cx * cy;
    }
    expect(sw).toBeCloseTo(1, 12);
    expect(sx).toBeCloseTo(0, 12);
    expect(sy).toBeCloseTo(0, 12);
    expect(xx).toBeCloseTo(LBM_CS2, 12);
    expect(yy).toBeCloseTo(LBM_CS2, 12);
    expect(xy).toBeCloseTo(0, 12);
  });

  it("반대 방향 표는 대합이고 속도가 서로 반대이며, 링크 클래스·소유 셀 규칙이 일관된다", () => {
    for (let i = 0; i < LBM_Q; i += 1) {
      const o = LBM_OPP[i] ?? 0;
      expect(LBM_OPP[o]).toBe(i);
      expect(LBM_CX[o]).toBe(0 - (LBM_CX[i] ?? 0));
      expect(LBM_CY[o]).toBe(0 - (LBM_CY[i] ?? 0));
      expect(LBM_W[o]).toBe(LBM_W[i]);
      // 같은 링크는 양 끝에서 같은 클래스다.
      expect(LBM_LINK_CLASS[o]).toBe(LBM_LINK_CLASS[i]);
    }
    // 전방 링크(E, S, SE, NE)만 서로 다른 4개 클래스를 가지며, 소유 셀 표시는 전방/후방이 반대다.
    expect(new Set(LBM_FORWARD_DIRS.map((i) => LBM_LINK_CLASS[i])).size).toBe(4);
    for (const i of LBM_FORWARD_DIRS) {
      expect(LBM_LINK_OWNER_IS_UPSTREAM[i]).toBe(true);
      expect(LBM_LINK_OWNER_IS_UPSTREAM[LBM_OPP[i] ?? 0]).toBe(false);
    }
  });
});

describe("평형 분포", () => {
  it("밀도·운동량 모멘트를 f32 정밀도로 복원한다", () => {
    const out = new Float64Array(9);
    for (const [rho, ux, uy] of [
      [1, 0, 0],
      [0.37, 0.05, -0.08],
      [2.5, -0.15, 0.1],
      [0.01, 0.2, 0],
    ] as const) {
      lbmEquilibrium(rho, ux, uy, out);
      const m = lbmMoments(out);
      expect(m.rho).toBeCloseTo(rho, 5);
      // 2차 항 보정이 있어 운동량은 ρu에 O(u³) 오차로 일치한다.
      expect(m.jx / rho).toBeCloseTo(ux, 2);
      expect(m.jy / rho).toBeCloseTo(uy, 2);
    }
  });

  it("속도 상한(uMax)까지 모든 방향의 분포가 양수다(음수 밀도 없음)", () => {
    const out = new Float64Array(9);
    const u = WET_PHYSICS.uMax;
    for (const [ux, uy] of [
      [u, 0],
      [0, -u],
      [u / Math.SQRT2, u / Math.SQRT2],
    ] as const) {
      lbmEquilibrium(1, ux, uy, out);
      for (let i = 0; i < 9; i += 1) expect(out[i], `dir ${i}`).toBeGreaterThan(0);
    }
  });
});

describe("흐름층 LBM 안정성", () => {
  it("과도한 물(표면 상한 초과분이 흐름층으로 쏟아짐)에서도 유한·비음수·|u| ≤ uMax이며 물 장부가 맞는다", () => {
    for (const medium of ["watercolor", "sumi", "gouache"] as const) {
      const params = wetMediumPreset(medium);
      const scene = newScene();
      depositDisc(scene, { rx: 10, ry: 10, wet: 8, pigmentMass: 0.5 });
      depositDisc(scene, { x: 90, y: 40, rx: 6, ry: 6, wet: 6, pigmentMass: 0.2 });
      let worst = 0;
      let nonFinite = 0;
      let maxSpeed = 0;
      let minDist = 0;
      const n = 256;
      for (let i = 0; i < 160; i += 1) {
        const before = wetTotals(scene.state).water;
        const r = stepWet(scene.state, params, SCENE_FRAME_MS, null);
        if (before > 1) worst = Math.max(worst, Math.abs(before - (r.waterTotal + r.evaporated)) / before);
        for (const [, slot] of scene.state.pool.entries()) {
          const core = scene.state.pool.view(slot);
          for (let c = 0; c < 12 * n; c += 1) if (!Number.isFinite(core[c])) nonFinite += 1;
          for (let k = 0; k < n; k += 1) {
            const vx = core[WET_CH.velocityX * n + k] ?? 0;
            const vy = core[WET_CH.velocityY * n + k] ?? 0;
            maxSpeed = Math.max(maxSpeed, Math.hypot(vx, vy));
          }
        }
        const ext = scene.state.ext;
        if (!ext) continue;
        for (const [, slot] of ext.entries()) {
          const e = ext.view(slot);
          // f0..f8과 ρ(채널 0..9)는 유한하며 음수가 아니다.
          for (let c = 0; c < (WET_EXT_CH.rho + 1) * n; c += 1) {
            const v = e[c] ?? 0;
            if (!Number.isFinite(v)) nonFinite += 1;
            minDist = Math.min(minDist, v);
          }
        }
      }
      expect(nonFinite, `${medium} 비유한 값`).toBe(0);
      expect(maxSpeed, `${medium} 최대 속도`).toBeLessThanOrEqual(WET_PHYSICS.uMax + 1e-6);
      expect(minDist, `${medium} 최소 분포`).toBeGreaterThanOrEqual(-1e-6);
      expect(worst, `${medium} 물 장부`).toBeLessThan(1e-5);
    }
  }, 60_000);
});
