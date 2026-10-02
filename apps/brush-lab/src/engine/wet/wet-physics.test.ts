import { describe, expect, it } from "vitest";

import { fnv1a64 } from "../core/hash";
import { TILE_PIXELS } from "../raster/tile-binning";
import {
  captureSeries,
  depositDisc,
  newScene,
  runBackrunScene,
  runEdgeScene,
  runFilmDiffusionScene,
  runUntilDry,
  SCENE_FRAME_MS,
  SCENE_SIZE,
  stepFrames,
  uniformFiberPaper,
} from "../testing/wet-scenes";
import { DEFAULT_PAPER_SPEC, generatePaper } from "../texture/paper-grain";

import { WET_MEDIA, wetMediumPreset } from "./params";
import { wetTotals } from "./state";
import { snapshotConcentration, stepWet } from "./wet-reference";

import type { WetParams } from "./params";
import type { WetConcentrationSnapshot } from "./wet-reference";
import type { WetScene } from "../testing/wet-scenes";

/**
 * 수채·수묵·구아슈 물리(LBM 흐름층 + 3층 물 교환 + 안료 수송·침착·재습윤) 불변식 테스트. 모두 Node 결정적이다.
 * 설계 §4 수치 임계(에지 다크닝·그래뉼레이션·확산 기울기·백런)는 bench `wet-time-metrics.test.ts`가 지표 함수로 판정한다.
 */

const WATER_MEDIA = WET_MEDIA.filter((m) => m !== "oil");

/** 장면 전체 상태(코어 + 확장 풀)의 해시. 타일 번호 순서로 합친다. */
function stateHash(scene: WetScene): string {
  const parts: string[] = [];
  const ext = scene.state.ext;
  for (const [tile, slot] of scene.state.pool.entries()) {
    const core = scene.state.pool.view(slot);
    parts.push(`${tile}:${fnv1a64(new Uint8Array(core.buffer, core.byteOffset, core.byteLength))}`);
    const es = ext?.slotOf(tile);
    if (ext && es !== undefined) {
      const e = ext.view(es);
      parts.push(fnv1a64(new Uint8Array(e.buffer, e.byteOffset, e.byteLength)));
    }
  }
  return fnv1a64(new TextEncoder().encode(parts.join("|")));
}

/** 필드의 공분산(질량 가중). */
function covariance(field: Float32Array, w: number): { mass: number; sxx: number; syy: number; sxy: number } {
  let m0 = 0;
  let mx = 0;
  let my = 0;
  const h = field.length / w;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = field[y * w + x] ?? 0;
      m0 += v;
      mx += v * (x + 0.5);
      my += v * (y + 0.5);
    }
  }
  mx /= m0;
  my /= m0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = field[y * w + x] ?? 0;
      sxx += v * (x + 0.5 - mx) ** 2;
      syy += v * (y + 0.5 - my) ** 2;
      sxy += v * (x + 0.5 - mx) * (y + 0.5 - my);
    }
  }
  return { mass: m0, sxx: sxx / m0, syy: syy / m0, sxy: sxy / m0 };
}

/** 두 프레임의 초과 공분산 주축 비 1 − √(λmin/λmax). */
function excessAnisotropy(a: WetConcentrationSnapshot, b: WetConcentrationSnapshot): number {
  const c0 = covariance(a.pigment, a.width);
  const c1 = covariance(b.pigment, b.width);
  const dx = c1.sxx - c0.sxx;
  const dy = c1.syy - c0.syy;
  const dxy = c1.sxy - c0.sxy;
  const disc = Math.sqrt(((dx - dy) / 2) ** 2 + dxy * dxy);
  const lMax = (dx + dy) / 2 + disc;
  const lMin = (dx + dy) / 2 - disc;
  return 1 - Math.sqrt(Math.max(0, lMin) / lMax);
}

describe("결정성", () => {
  it("같은 입력의 두 번 실행은 상태 전체 해시가 같고, 타일 순회 순서(오름차순/내림차순)와 무관하다", () => {
    const spec = { ...DEFAULT_PAPER_SPEC, roughness: 0.6 };
    for (const medium of WATER_MEDIA) {
      const params = wetMediumPreset(medium);
      const run = (order: "ascending" | "descending"): string => {
        const scene = newScene(SCENE_SIZE, generatePaper(spec), spec);
        depositDisc(scene, { rx: 20, ry: 20, wet: 1.2 });
        depositDisc(scene, { x: 40, y: 80, rx: 9, ry: 5, angle: 0.4, wet: 0.8, pigmentMass: 0.5 });
        for (let i = 0; i < 70; i += 1) stepWet(scene.state, params, SCENE_FRAME_MS, scene.paper, { paperSpec: spec, tileOrder: order });
        return stateHash(scene);
      };
      const a = run("ascending");
      expect(run("ascending"), `${medium} 재실행`).toBe(a);
      expect(run("descending"), `${medium} 순회 순서`).toBe(a);
    }
  }, 60_000);
});

describe("대칭", () => {
  it("좌우·상하 대칭 입력(등방 종이)은 물·안료·침착 안료가 비트 수준으로 거울 대칭을 유지한다", () => {
    for (const medium of WATER_MEDIA) {
      const params = wetMediumPreset(medium);
      const scene = newScene();
      depositDisc(scene, { rx: 14, ry: 14, wet: 1.5 });
      stepFrames(scene, params, 45);
      const s = snapshotConcentration(scene.state);
      const w = s.width;
      for (const [name, f] of [
        ["water", s.water],
        ["pigment", s.pigment],
        ["deposited", s.deposited],
      ] as const) {
        let worst = 0;
        let max = 0;
        for (let y = 0; y < w; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const v = f[y * w + x] ?? 0;
            max = Math.max(max, v);
            worst = Math.max(worst, Math.abs(v - (f[y * w + (w - 1 - x)] ?? 0)), Math.abs(v - (f[(w - 1 - y) * w + x] ?? 0)));
          }
        }
        expect(max, `${medium} ${name}`).toBeGreaterThan(0);
        expect(worst, `${medium} ${name}`).toBeLessThanOrEqual(1e-6 * max);
      }
    }
  }, 30_000);
});

describe("질량 보존(물·안료, 증발 분리)", () => {
  it("스텝마다 Σ물(전) = Σ물(후) + 증발, 안료(부유 + 침착 + 경화) 총량 불변 — 3매체·종이 모서리 포함", () => {
    for (const medium of WATER_MEDIA) {
      const params = wetMediumPreset(medium);
      const scene = newScene();
      depositDisc(scene, { x: 6, y: 6, rx: 10, ry: 10, wet: 1.5, pigmentMass: 0.4 });
      depositDisc(scene, { x: 64, y: 64, rx: 12, ry: 12, wet: 1.2, pigmentMass: 0.3 });
      const pigment0 = wetTotals(scene.state).pigment;
      let worstWater = 0;
      let worstPigment = 0;
      for (let i = 0; i < 220; i += 1) {
        const before = wetTotals(scene.state).water;
        const r = stepWet(scene.state, params, SCENE_FRAME_MS, null);
        if (before > 1) worstWater = Math.max(worstWater, Math.abs(before - (r.waterTotal + r.evaporated)) / before);
        worstPigment = Math.max(worstPigment, Math.abs(r.pigmentTotal + r.fixedTotal - pigment0) / pigment0);
        expect(r.evaporated).toBeGreaterThanOrEqual(0);
        expect(r.absorbed).toBeGreaterThanOrEqual(0);
        if (r.activeTiles === 0) break;
      }
      expect(worstWater, `${medium} 물`).toBeLessThan(1e-5);
      expect(worstPigment, `${medium} 안료`).toBeLessThan(1e-5);
    }
  }, 60_000);

  it("증발·건조를 끄면 물이 정확히 보존되고 증발 장부는 0에 수렴한다(증발과 흡수·이동의 분리)", () => {
    const params: WetParams = { ...wetMediumPreset("watercolor"), evaporation: 0, dryingMs: 60000 };
    const scene = newScene();
    depositDisc(scene, { rx: 12, ry: 12, wet: 1.5 });
    const water0 = wetTotals(scene.state).water;
    let evaporated = 0;
    let absorbed = 0;
    for (let i = 0; i < 100; i += 1) {
      const r = stepWet(scene.state, params, SCENE_FRAME_MS, null);
      evaporated += r.evaporated;
      absorbed += r.absorbed;
    }
    const t = wetTotals(scene.state);
    // 건조 꼬리(dryTail = hMs/dryingMs)가 조금 남아 있으므로 100프레임에 약 2.8 % 이내의 증발만 허용한다.
    expect(evaporated).toBeLessThan(0.04 * water0);
    expect(t.water + evaporated).toBeCloseTo(water0, 2);
    // 표면 물이 모세관·흐름층으로 옮겨 갔다(내부 이동).
    expect(absorbed).toBeGreaterThan(0.1 * water0);
    expect(t.surface).toBeLessThan(water0);
    expect(t.capillary + t.flow).toBeGreaterThan(0.1 * water0);
  });
});

describe("단조성·음수 없음", () => {
  it("흡수·증발을 끈 물 분산(공간 2차 모멘트)은 단조 증가하고 모든 채널이 유한하며 물·안료는 음수가 아니다", () => {
    for (const medium of WATER_MEDIA) {
      const params: WetParams = { ...wetMediumPreset(medium), evaporation: 0, capillary: 0, dryingMs: 60000 };
      const scene = newScene();
      depositDisc(scene, { rx: 12, ry: 12, wet: 2 });
      let prev = -1;
      for (let i = 0; i < 40; i += 1) {
        stepWet(scene.state, params, SCENE_FRAME_MS, null);
        const s = snapshotConcentration(scene.state);
        const c = covariance(s.water, s.width);
        const variance = c.sxx + c.syy;
        expect(variance, `${medium} 프레임 ${i}`).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = variance;
        let bad = 0;
        for (const f of [s.water, s.pigment, s.suspended, s.deposited, s.rewettable]) {
          for (let k = 0; k < f.length; k += 1) {
            const v = f[k] ?? 0;
            if (!Number.isFinite(v) || v < 0) bad += 1;
          }
        }
        expect(bad, `${medium} 프레임 ${i}: 비유한·음수 셀 수`).toBe(0);
      }
    }
  }, 40_000);

  it("재습윤 비율(rewet)이 클수록 백런 경계가 짙어지고 rewet = 0이면 맑은 물로 적셔도 침착 안료가 움직이지 않는다", () => {
    const ratios = [0, 0.5, 1].map((rewet) => {
      const r = runBackrunScene(wetMediumPreset("watercolor", { rewet }));
      const inner = (snap: WetConcentrationSnapshot): number => ringOver(snap, r.centerX, r.centerY, 9);
      return { rewet, ring: inner(r.rewetted), moved: movedMass(r.dried, r.rewetted) };
    });
    expect(ratios[0]?.moved).toBeLessThan(1e-6);
    expect(ratios[1]?.ring).toBeGreaterThan(ratios[0]?.ring ?? 0);
    expect(ratios[2]?.ring).toBeGreaterThan(ratios[1]?.ring ?? 0);
    expect(ratios[2]?.moved).toBeGreaterThan(ratios[1]?.moved ?? 0);
  }, 30_000);
});

/** 반경 r0 ± 2 링의 평균 / 반경 < r0/2 안쪽 평균(새 젖음 전선 링 대비). */
function ringOver(snap: WetConcentrationSnapshot, cx: number, cy: number, r0: number): number {
  let ring = 0;
  let rn = 0;
  let inner = 0;
  let inn = 0;
  for (let y = 0; y < snap.height; y += 1) {
    for (let x = 0; x < snap.width; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const v = snap.deposited[y * snap.width + x] ?? 0;
      if (d >= r0 && d <= r0 + 3) {
        ring += v;
        rn += 1;
      } else if (d < r0 / 2) {
        inner += v;
        inn += 1;
      }
    }
  }
  return ring / rn / (inner / inn);
}

/** 두 스냅샷 침착 필드의 총 변위 질량(Σ|Δ|). */
function movedMass(a: WetConcentrationSnapshot, b: WetConcentrationSnapshot): number {
  let s = 0;
  for (let i = 0; i < a.deposited.length; i += 1) s += Math.abs((a.deposited[i] ?? 0) - (b.deposited[i] ?? 0));
  return s;
}

describe("건조 수렴과 활성 타일 슬립", () => {
  it("충분히 돌리면 모든 타일이 비활성이 되고 물·부유 안료가 0이며 이후 스텝은 상태를 바꾸지 않는다", () => {
    for (const medium of WATER_MEDIA) {
      const params = wetMediumPreset(medium);
      const scene = newScene();
      depositDisc(scene, { rx: 12, ry: 12, wet: 1.2 });
      const frames = runUntilDry(scene, params, 900);
      expect(frames, `${medium} 건조까지 프레임`).toBeLessThan(900);
      expect(scene.state.active.size).toBe(0);
      const t = wetTotals(scene.state);
      expect(t.water).toBe(0);
      expect(t.pigment).toBe(0);
      expect(t.fixed).toBeGreaterThan(0);
      const h = stateHash(scene);
      for (let i = 0; i < 5; i += 1) {
        const r = stepWet(scene.state, params, SCENE_FRAME_MS, null);
        expect(r.activeTiles).toBe(0);
        expect(r.evaporated).toBe(0);
      }
      expect(stateHash(scene)).toBe(h);
    }
  }, 40_000);

  it("활성 집합 밖의 할당 타일은 변하지 않고, dryingMs·evaporation은 건조 시간에 단조다", () => {
    const scene = newScene();
    depositDisc(scene, { rx: 12, ry: 12, wet: 1 });
    const far = 8 * 8 - 1; // 128×128 캔버스(8×8 타일)의 맨 끝 타일(원판에서 먼 타일)
    const t = scene.state.touch(far);
    t.water[0] = 0.5;
    t.pigment[3 * TILE_PIXELS] = 0.25;
    expect(scene.state.active.has(far)).toBe(false);
    runUntilDry(scene, wetMediumPreset("watercolor"), 900);
    expect(scene.state.view(far)?.water[0]).toBe(0.5);
    expect(scene.state.view(far)?.pigment[3 * TILE_PIXELS]).toBe(0.25);

    const frames = (override: Partial<WetParams>): number => {
      const s = newScene();
      depositDisc(s, { rx: 10, ry: 10, wet: 1 });
      return runUntilDry(s, wetMediumPreset("watercolor", override), 1500);
    };
    expect(frames({ evaporation: 0.0014 })).toBeLessThan(frames({ evaporation: 0.0007 }));
    expect(frames({ dryingMs: 1200 })).toBeLessThan(frames({ dryingMs: 6000 }));
  }, 40_000);

  it("경화: 마른 뒤 재습윤 가능한 안료(d)와 고정 안료(D)의 비가 1 − rewet / rewet이다", () => {
    for (const [medium, expectedHard] of [
      ["watercolor", 0.5],
      ["gouache", 0.95],
      ["sumi", 1],
    ] as const) {
      const params = wetMediumPreset(medium);
      const scene = newScene();
      depositDisc(scene, { rx: 12, ry: 12, wet: 1.2 });
      runUntilDry(scene, params, 900);
      const t = wetTotals(scene.state);
      expect(t.hardFixed / t.fixed, medium).toBeCloseTo(expectedHard, 2);
      expect(t.rewettable / t.fixed, medium).toBeCloseTo(1 - expectedHard, 2);
    }
  }, 30_000);
});

describe("확산 반경과 섬유 이방성(물막 장면)", () => {
  const FRAMES = [0, 20, 40, 80, 160];

  it("순수 확산에서 초과 분산은 시간에 선형이다(초과 반경 ∝ t^0.5, 이웃 시간 비 오차 < 2 %)", () => {
    const snaps = runFilmDiffusionScene(wetMediumPreset("watercolor"), FRAMES);
    const v = snaps.map((s) => {
      const c = covariance(s.pigment, s.width);
      return c.sxx + c.syy;
    });
    const d1 = (v[2] ?? 0) - (v[0] ?? 0);
    const d2 = (v[4] ?? 0) - (v[0] ?? 0);
    // t = 40 → 160(4배): 초과 분산도 4배.
    expect(d2 / d1).toBeCloseTo(4, 1);
    // 안료 총량은 변하지 않는다(질량 보존).
    expect(covariance(snaps[4]?.pigment ?? new Float32Array(), snaps[4]?.width ?? 1).mass).toBeCloseTo(
      covariance(snaps[0]?.pigment ?? new Float32Array(), snaps[0]?.width ?? 1).mass,
      3,
    );
  });

  it("섬유 방향으로 더 멀리 퍼지고(θ = 0 → x축, θ = π/2 → y축), 이방비는 aniso에 단조 증가하며 등방 종이에서는 0이다", () => {
    const aniso = (angle: number, fiberAnisotropy: number): number => {
      const p = wetMediumPreset("sumi", { fiberAnisotropy, fiberRoughness: 0 });
      const snaps = runFilmDiffusionScene(p, [0, 160], { fiberAngleRad: angle });
      const last = snaps[1];
      const first = snaps[0];
      if (!last || !first) throw new Error("스냅샷 없음");
      return excessAnisotropy(first, last);
    };
    expect(aniso(0, 0)).toBeLessThan(0.02);
    expect(aniso(0, 0.3)).toBeLessThan(aniso(0, 0.5));
    expect(aniso(0, 0.5)).toBeLessThan(aniso(0, 0.7));
    expect(aniso(0, 0.7)).toBeCloseTo(0.7, 1);

    const along = (angle: number): { sx: number; sy: number } => {
      const p = wetMediumPreset("sumi", { fiberRoughness: 0 });
      const snaps = runFilmDiffusionScene(p, [0, 160], { fiberAngleRad: angle });
      const s = snaps[1];
      if (!s) throw new Error("스냅샷 없음");
      const c = covariance(s.pigment, s.width);
      return { sx: Math.sqrt(c.sxx), sy: Math.sqrt(c.syy) };
    };
    const horizontal = along(0);
    const vertical = along(Math.PI / 2);
    expect(horizontal.sx).toBeGreaterThan(1.5 * horizontal.sy);
    expect(vertical.sy).toBeGreaterThan(1.5 * vertical.sx);
    // 대각 섬유는 격자 이산화 때문에 축 정렬보다 이방성이 줄지만 방향성은 남는다.
    const diag = (() => {
      const p = wetMediumPreset("sumi", { fiberRoughness: 0 });
      const snaps = runFilmDiffusionScene(p, [0, 160], { fiberAngleRad: Math.PI / 4 });
      const s0 = snaps[0];
      const s1 = snaps[1];
      if (!s0 || !s1) throw new Error("스냅샷 없음");
      return excessAnisotropy(s0, s1);
    })();
    expect(diag).toBeGreaterThan(0.4);
    expect(diag).toBeLessThan(0.7);
  }, 60_000);

  it("물방울(수묵, 균일 섬유)의 젖음 영역이 섬유 방향으로 더 길게 번진다(흐름층 LBM + 모세관 이방성)", () => {
    const params = wetMediumPreset("sumi", { fiberRoughness: 0.3 });
    const scene = newScene(SCENE_SIZE, uniformFiberPaper(0));
    depositDisc(scene, { rx: 4, ry: 4, wet: 1.2, pigmentMass: 0.4 });
    const series = captureSeries(scene, params, [0, 30]);
    const wet0 = series[0];
    const wet1 = series[1];
    if (!wet0 || !wet1) throw new Error("스냅샷 없음");
    const c0 = covariance(wet0.water, wet0.width);
    const c1 = covariance(wet1.water, wet1.width);
    const gainX = c1.sxx - c0.sxx;
    const gainY = c1.syy - c0.syy;
    expect(gainX).toBeGreaterThan(1.3 * gainY);
  }, 30_000);
});

describe("가장자리 다크닝(원판 워시)", () => {
  it("edgeDarkening이 0이면 가장자리가 짙어지지 않고, 클수록 바깥 링 / 내부 비가 단조 증가(포화)한다", () => {
    const ratio = (edgeDarkening: number): number => {
      const s = runEdgeScene(wetMediumPreset("watercolor", { edgeDarkening }));
      return ringInnerLocal(s.deposited, s.width);
    };
    const r = [0, 0.5, 1].map(ratio);
    expect(r[0]).toBeLessThan(1.1);
    expect(r[1]).toBeGreaterThan((r[0] ?? 0) + 0.15);
    expect(r[2]).toBeGreaterThanOrEqual((r[1] ?? 0) - 0.02);
  }, 30_000);
});

/** 침착 중심(캔버스 중앙) 둘레: 반경 10.5–12.5 링 평균 / 반경 < 6 평균. 원판 반경 12 장면용 간이 지표. */
function ringInnerLocal(field: Float32Array, w: number): number {
  let ring = 0;
  let rn = 0;
  let inner = 0;
  let inn = 0;
  const c = w / 2;
  for (let y = 0; y < w; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const v = field[y * w + x] ?? 0;
      if (d >= 10.5 && d <= 12.5) {
        ring += v;
        rn += 1;
      } else if (d < 6) {
        inner += v;
        inn += 1;
      }
    }
  }
  return ring / rn / (inner / inn);
}
