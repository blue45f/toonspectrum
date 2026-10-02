import { DabBatch } from "../core/dab-layout";
import { binDabs, TILE_SIZE } from "../raster/tile-binning";
import { generatePaper } from "../texture/paper-grain";
import { createWetState } from "../wet/state";
import { depositWet, snapshotConcentration, stepWet } from "../wet/wet-reference";

import type { DabInstance } from "../core/types";
import type { PaperField, PaperSpec } from "../texture/paper-grain";
import type { WetParams } from "../wet/params";
import type { WetState } from "../wet/state";
import type { WetConcentrationSnapshot, WetStepReceipt } from "../wet/wet-reference";

/**
 * 습식 물리 검증용 표준 장면(엔진 단위 테스트·벤치 시간축 지표 공용). 모두 결정적이며 DOM·시간 전역을 쓰지 않는다.
 *  - 에지 다크닝 장면: 원판 1개를 투입하고 마를 때까지 돌린다.
 *  - 물막 확산 장면: 캔버스 전체가 얇은 물막이고 안료 방울 하나가 퍼진다(침착·증발·흡수 끔) — 확산 반경–시간·섬유 이방비.
 *  - 백런 장면: 마른 워시 위에 맑은 물방울을 떨어뜨려 안료를 다시 띄우고 새 젖음 전선에 모은다.
 *  - 그래뉼레이션 장면: 실제 종이 위의 큰 균일 워시.
 * 프레임 길이는 `SCENE_FRAME_MS`(= 렌더러 `WET_FRAME_MS`와 같은 1000/60 ms)다.
 */

export const SCENE_SIZE = 128;
export const SCENE_FRAME_MS = 1000 / 60;
const CENTER = SCENE_SIZE / 2;

/** 장면 1개: 습식 상태 + 종이(없으면 균일한 등방 종이) + 종이 샘플링 스펙(없으면 렌더러 기본). */
export interface WetScene {
  state: WetState;
  paper: PaperField | null;
  paperSpec?: PaperSpec;
  size: number;
}

function stepOpts(scene: WetScene): { paperSpec?: PaperSpec } {
  return scene.paperSpec ? { paperSpec: scene.paperSpec } : {};
}

/** 장면용 기본 dab(중앙 원판 반경 12, 물 1, 안료 질량 0.3, 하드니스 1). */
export function sceneDab(partial: Partial<DabInstance> = {}): DabInstance {
  return {
    x: CENTER,
    y: CENTER,
    rx: 12,
    ry: 12,
    angle: 0,
    hardness: 1,
    flow: 1,
    shapeExp: 2,
    r: 0.2,
    g: 0.1,
    b: 0.6,
    a: 1,
    tipKind: "round",
    seed: 1,
    grain: 0,
    wet: 1,
    pigmentMass: 0.3,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "wet-flow",
    ...partial,
  };
}

/** 새 장면. 타일 풀은 캔버스 전체를 덮는다. */
export function newScene(size = SCENE_SIZE, paper: PaperField | null = null, paperSpec?: PaperSpec): WetScene {
  const tiles = Math.ceil(size / TILE_SIZE);
  const scene: WetScene = { state: createWetState(size, size, tiles * tiles), paper, size };
  if (paperSpec) scene.paperSpec = paperSpec;
  return scene;
}

/** 섬유 방향이 어디서나 같은 합성 종이(요철·흡수율 일정 0.5). `angleRad` = 섬유 방향(0 = +x). */
export function uniformFiberPaper(angleRad = 0, size = 64): PaperField {
  const n = size * size;
  return {
    size,
    direction: new Float32Array(n).fill(angleRad),
    bump: new Float32Array(n).fill(0.5),
    absorb: new Float32Array(n).fill(0.5),
  };
}

/** 원판(커버리지 가중) 1개를 투입한다. */
export function depositDisc(scene: WetScene, partial: Partial<DabInstance> = {}): void {
  const tiles = Math.ceil(scene.size / TILE_SIZE);
  const batch = new DabBatch(1);
  batch.push(sceneDab(partial));
  depositWet(scene.state, batch, binDabs(batch, tiles, tiles));
}

/** 캔버스 전체에 균일한 표면 물막(ws = water)을 깔고 모든 타일을 활성으로 둔다. */
export function fillWaterFilm(scene: WetScene, water: number): void {
  const tiles = Math.ceil(scene.size / TILE_SIZE);
  for (let t = 0; t < tiles * tiles; t += 1) {
    const view = scene.state.touch(t);
    scene.state.touchExt(t);
    view.water.fill(Math.fround(water));
    scene.state.active.add(t);
  }
}

/** `frames` 프레임을 전진한다. 마지막 영수증을 돌려준다. */
export function stepFrames(scene: WetScene, params: WetParams, frames: number): WetStepReceipt | null {
  let receipt: WetStepReceipt | null = null;
  for (let i = 0; i < frames; i += 1) receipt = stepWet(scene.state, params, SCENE_FRAME_MS, scene.paper, stepOpts(scene));
  return receipt;
}

/** 활성 타일이 없어질 때까지(상한 maxFrames) 전진한다. 쓴 프레임 수를 돌려준다. */
export function runUntilDry(scene: WetScene, params: WetParams, maxFrames = 600): number {
  let frames = 0;
  while (frames < maxFrames) {
    const r = stepWet(scene.state, params, SCENE_FRAME_MS, scene.paper, stepOpts(scene));
    frames += 1;
    if (r.activeTiles === 0) break;
  }
  return frames;
}

/** 프레임 번호 목록(오름차순, 0 포함 가능)마다 농도 스냅샷을 찍는다. 장면은 마지막 번호까지 전진한다. */
export function captureSeries(scene: WetScene, params: WetParams, frameList: readonly number[]): WetConcentrationSnapshot[] {
  const out: WetConcentrationSnapshot[] = [];
  let at = 0;
  for (const target of frameList) {
    if (target > at) {
      stepFrames(scene, params, target - at);
      at = target;
    }
    out.push(snapshotConcentration(scene.state));
  }
  return out;
}

// ---- 표준 장면 ----

export interface EdgeSceneOptions {
  radius?: number;
  water?: number;
  pigmentMass?: number;
  paper?: PaperField | null;
  maxFrames?: number;
}

/** 에지 다크닝 장면: 원판 워시를 마를 때까지 돌린 최종 스냅샷(`deposited`가 침착 안료). */
export function runEdgeScene(params: WetParams, opts: EdgeSceneOptions = {}): WetConcentrationSnapshot {
  const scene = newScene(SCENE_SIZE, opts.paper ?? null);
  const r = opts.radius ?? 12;
  depositDisc(scene, { rx: r, ry: r, wet: opts.water ?? 1.2, pigmentMass: opts.pigmentMass ?? 0.3 });
  runUntilDry(scene, params, opts.maxFrames ?? 900);
  return snapshotConcentration(scene.state);
}

/** 물막 확산 장면 캔버스 크기(px). 전체가 활성이라 작게 둔다. */
export const FILM_SCENE_SIZE = 64;

export interface FilmSceneOptions {
  /** 물막 두께(표면층, 표면 상한 이하). */
  film?: number;
  /** 안료 방울 반경(px). */
  dropRadius?: number;
  /** 섬유 방향(rad). 지정하면 균일 섬유 종이를 쓴다. */
  fiberAngleRad?: number;
}

/**
 * 물막 확산 장면에 맞게 침착·증발·흡수를 끈 파라미터. 안료는 물막 안에서 확산과 섬유 전도율만으로 퍼진다.
 * (경화·재부유·가장자리 흐름도 꺼서 순수 확산 연산자를 잰다.)
 */
export function filmDiffusionParams(base: WetParams): WetParams {
  return {
    ...base,
    evaporation: 0,
    dryingMs: 60000,
    capillary: 0,
    depositRate: 0,
    liftRate: 0,
    pinning: 0,
    dryBrush: 0,
    granulation: 0,
    edgeDarkening: 0,
    gravity: [0, 0],
  };
}

/** 물막 확산 장면: `frameList`마다 안료 농도 스냅샷(첫 번째는 초기 방울). */
export function runFilmDiffusionScene(
  params: WetParams,
  frameList: readonly number[],
  opts: FilmSceneOptions = {},
): WetConcentrationSnapshot[] {
  const paper = opts.fiberAngleRad === undefined ? null : uniformFiberPaper(opts.fiberAngleRad);
  const scene = newScene(FILM_SCENE_SIZE, paper);
  fillWaterFilm(scene, opts.film ?? 0.3);
  const r = opts.dropRadius ?? 2;
  depositDisc(scene, { x: FILM_SCENE_SIZE / 2, y: FILM_SCENE_SIZE / 2, rx: r, ry: r, wet: 0, pigmentMass: 1 });
  return captureSeries(scene, filmDiffusionParams(params), frameList);
}

export interface BackrunSceneOptions {
  washRadius?: number;
  washWater?: number;
  washMass?: number;
  dropRadius?: number;
  dropWater?: number;
  paper?: PaperField | null;
}

export interface BackrunSceneResult {
  /** 첫 워시가 마른 직후. */
  dried: WetConcentrationSnapshot;
  /** 맑은 물방울이 번지고 다시 마른 뒤. */
  rewetted: WetConcentrationSnapshot;
  centerX: number;
  centerY: number;
}

/** 백런(재습윤) 장면: 마른 워시 위에 안료 없는 물방울을 떨어뜨려 마를 때까지 돌린다. */
export function runBackrunScene(params: WetParams, opts: BackrunSceneOptions = {}): BackrunSceneResult {
  const scene = newScene(SCENE_SIZE, opts.paper ?? null);
  const wr = opts.washRadius ?? 22;
  depositDisc(scene, { rx: wr, ry: wr, wet: opts.washWater ?? 1.2, pigmentMass: opts.washMass ?? 0.3 });
  runUntilDry(scene, params, 900);
  const dried = snapshotConcentration(scene.state);
  const dr = opts.dropRadius ?? 9;
  depositDisc(scene, { rx: dr, ry: dr, wet: opts.dropWater ?? 1.5, pigmentMass: 0 });
  runUntilDry(scene, params, 900);
  return { dried, rewetted: snapshotConcentration(scene.state), centerX: CENTER, centerY: CENTER };
}

/** 그래뉼레이션 장면: 실제 종이 위의 큰 균일 워시(원판 반경 40, 128² 캔버스)를 마를 때까지 돌린다. */
export function runGranulationScene(params: WetParams, paperSpec: PaperSpec, mass = 0.3): WetConcentrationSnapshot {
  const scene = newScene(SCENE_SIZE, generatePaper(paperSpec), paperSpec);
  depositDisc(scene, { rx: 40, ry: 40, wet: 1.2, pigmentMass: mass });
  runUntilDry(scene, params, 900);
  return snapshotConcentration(scene.state);
}
