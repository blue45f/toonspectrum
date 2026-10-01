import { useSyncExternalStore } from "react";

import type { AbComparison, RunResult } from "./bench-types";
import type { CapturedStroke } from "../../bench/fixtures/fixture-schema";
import type { FixtureId } from "../../bench/fixtures/stroke-fixtures";
import type { BrushCertificationReport } from "../../bench/report/report-schema";
import type { BrushDepositionSpec, BrushTipSpec } from "../../engine/presets/program-schema";
import type { SamplingFilter } from "../../engine/texture/sampling";
import type { DabBatchReceipt, LaneCapabilityReport, LaneId, StrokeReceipt } from "../../lanes/lane";
import type { GalleryRenderResult } from "../../platform/worker-client";

/**
 * 랩 UI 상태 저장소. 외부 런타임 의존성은 React의 `useSyncExternalStore`뿐이다.
 * 셀렉터는 저장된 참조나 원시값을 돌려줘야 한다(매번 새 객체를 만들면 재렌더가 반복된다).
 */

export type LabTab = "gallery" | "compare" | "report";

/** 파라미터 패널이 프리셋 위에 얹는 오버라이드. 값이 없는 키는 프리셋 값을 쓴다. */
export type LabOverrides = Partial<
  BrushTipSpec &
    BrushDepositionSpec & {
      /** 안정화 강도 0..1 → 1€ 필터 minCutoff/β 매핑. */
      stabilizer: number;
      filter: SamplingFilter;
      /** 종이 그레인 on/off. */
      grain: boolean;
      /** 습식 모듈(베타) on/off. */
      wetBeta: boolean;
      /** Kubelka-Munk 혼색(베타) on/off. */
      kmBeta: boolean;
      /** 산포(위치 지터) px. */
      scatterPx: number;
    }
>;

export interface LabError {
  laneId: LaneId | null;
  code: string;
  message: string;
  /** 발생 순번(표시·키용). */
  seq: number;
}

export type ResultSource = "fixture" | "live";

export interface LabResults {
  a: RunResult | null;
  b: RunResult | null;
  comparison: AbComparison | null;
  reportA: BrushCertificationReport | null;
  reportB: BrushCertificationReport | null;
  source: ResultSource | null;
}

export type FixtureSource = "builtin" | "captured";

/** 갤러리 카드 1장의 상태. Worker 실패는 오류 카드로 드러낸다(무음 대체 없음). */
export interface GalleryEntry {
  status: "pending" | "done" | "error";
  result: GalleryRenderResult | null;
  error: string | null;
}

export interface GalleryState {
  status: "idle" | "running" | "done";
  /** 갤러리가 모든 프리셋에 공통으로 쓰는 fixture와 썸네일 크기. */
  fixtureId: FixtureId;
  size: number;
  entries: Record<string, GalleryEntry>;
}

/** 실시간 입력 세션 통계(마지막 획 기준). */
export interface LiveStats {
  strokes: number;
  lastReceipt: StrokeReceipt | null;
  frames: DabBatchReceipt[];
}

export interface LabState {
  tab: LabTab;
  laneA: LaneId;
  laneB: LaneId;
  fixtureId: FixtureId;
  /** 내장 fixture 대신 캡처한 획을 리플레이할지. */
  fixtureSource: FixtureSource;
  /** 실시간 포인터 입력 모드. */
  liveCapture: boolean;
  /** A/B 실행 시 같은 입력을 한 번 더 실행해 결정성(픽셀 해시 동일)을 판정한다. */
  determinismRerun: boolean;
  /** 마지막 실시간 캡처(정본 표본만, 예측 제외) — JSON 저장/불러오기 형식 그대로 보관한다. */
  captured: CapturedStroke | null;
  presetId: string;
  overrides: LabOverrides;
  seed: number;
  /** 정사각 캔버스 한 변(px). */
  canvasSize: number;
  capability: Record<LaneId, LaneCapabilityReport | null>;
  results: LabResults;
  reports: BrushCertificationReport[];
  errors: LabError[];
  /** A/B 실행 중 여부(중복 실행 방지). */
  running: boolean;
  gallery: GalleryState;
  live: LiveStats;
}

export const LANE_IDS: readonly LaneId[] = [
  "canvas2d",
  "platform-baseline",
  "cpu-reference",
  "webgpu-compute",
  "webgpu-instanced",
  "webgl2-instanced",
  "wasm-cpu",
  "wasm-gpu-hybrid",
];

export const EMPTY_RESULTS: LabResults = {
  a: null,
  b: null,
  comparison: null,
  reportA: null,
  reportB: null,
  source: null,
};

/** 갤러리 기본 조건(스펙 §17: zigzag 256²). */
export const GALLERY_FIXTURE_ID: FixtureId = "zigzag";
export const GALLERY_THUMBNAIL_SIZE = 256;

export function emptyGallery(): GalleryState {
  return { status: "idle", fixtureId: GALLERY_FIXTURE_ID, size: GALLERY_THUMBNAIL_SIZE, entries: {} };
}

export function emptyLiveStats(): LiveStats {
  return { strokes: 0, lastReceipt: null, frames: [] };
}

export function emptyCapability(): Record<LaneId, LaneCapabilityReport | null> {
  const out = {} as Record<LaneId, LaneCapabilityReport | null>;
  for (const id of LANE_IDS) out[id] = null;
  return out;
}

export function initialLabState(): LabState {
  return {
    tab: "compare",
    laneA: "cpu-reference",
    laneB: "webgpu-compute",
    fixtureId: "zigzag",
    fixtureSource: "builtin",
    liveCapture: false,
    determinismRerun: true,
    captured: null,
    presetId: "pencil-hb",
    overrides: {},
    seed: 1,
    canvasSize: 256,
    capability: emptyCapability(),
    results: EMPTY_RESULTS,
    reports: [],
    errors: [],
    running: false,
    gallery: emptyGallery(),
    live: emptyLiveStats(),
  };
}

export type LabPatch = Partial<LabState> | ((prev: LabState) => Partial<LabState>);

export interface LabStore {
  get(): LabState;
  set(patch: LabPatch): void;
  subscribe(cb: () => void): () => void;
  /** 초기 상태로 되돌린다(테스트·세션 초기화). */
  reset(initial?: Partial<LabState>): void;
}

export function createLabStore(initial: Partial<LabState> = {}): LabStore {
  let state: LabState = { ...initialLabState(), ...initial };
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const l of listeners) l();
  };
  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const key of Object.keys(next) as (keyof LabState)[]) {
        if (!Object.is(next[key], state[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...next };
      emit();
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    reset: (init = {}) => {
      state = { ...initialLabState(), ...init };
      emit();
    },
  };
}

/** 앱 전역 저장소. 테스트는 `createLabStore()`로 독립 인스턴스를 만든다. */
export const labStore: LabStore = createLabStore();

export function useLabState<T>(selector: (s: LabState) => T, store: LabStore = labStore): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

/** 상태 전이 함수 묶음. 모든 전이는 여기서만 정의해 뷰가 저장소 구조에 의존하지 않게 한다. */
export interface LabActions {
  setTab(tab: LabTab): void;
  setLane(slot: "a" | "b", id: LaneId): void;
  setFixture(id: FixtureId): void;
  setFixtureSource(source: FixtureSource): void;
  setLiveCapture(on: boolean): void;
  setDeterminismRerun(on: boolean): void;
  /** 캡처 획을 저장하고 fixture 출처를 `captured`로 바꾼다. null이면 내장 fixture로 되돌린다. */
  setCaptured(captured: CapturedStroke | null): void;
  /** 프리셋을 바꾸면 오버라이드는 비운다. */
  setPreset(id: string): void;
  setOverride(patch: LabOverrides): void;
  resetOverrides(): void;
  setSeed(seed: number): void;
  setCanvasSize(size: number): void;
  setCapability(id: LaneId, report: LaneCapabilityReport | null): void;
  setResults(results: LabResults): void;
  clearResults(): void;
  addReport(report: BrushCertificationReport): void;
  clearReports(): void;
  pushError(error: Omit<LabError, "seq">): void;
  clearErrors(): void;
  setRunning(running: boolean): void;
  setGalleryStatus(status: GalleryState["status"]): void;
  setGalleryEntry(presetId: string, entry: GalleryEntry): void;
  resetGallery(): void;
  setLiveStats(patch: Partial<LiveStats>): void;
}

export function createLabActions(store: LabStore): LabActions {
  let errorSeq = 0;
  return {
    setTab: (tab) => store.set({ tab }),
    setLane: (slot, id) => store.set(slot === "a" ? { laneA: id } : { laneB: id }),
    setFixture: (fixtureId) => store.set({ fixtureId, fixtureSource: "builtin" }),
    setFixtureSource: (fixtureSource) => store.set({ fixtureSource }),
    setLiveCapture: (liveCapture) => store.set({ liveCapture }),
    setDeterminismRerun: (determinismRerun) => store.set({ determinismRerun }),
    setCaptured: (captured) =>
      store.set(captured ? { captured, fixtureSource: "captured" } : { captured: null, fixtureSource: "builtin" }),
    setPreset: (presetId) => store.set({ presetId, overrides: {} }),
    setOverride: (patch) => store.set((prev) => ({ overrides: { ...prev.overrides, ...patch } })),
    resetOverrides: () => store.set({ overrides: {} }),
    setSeed: (seed) => store.set({ seed }),
    setCanvasSize: (canvasSize) => store.set({ canvasSize }),
    setCapability: (id, report) =>
      store.set((prev) => ({ capability: { ...prev.capability, [id]: report } })),
    setResults: (results) => store.set({ results }),
    clearResults: () => store.set({ results: EMPTY_RESULTS }),
    addReport: (report) => store.set((prev) => ({ reports: [...prev.reports, report] })),
    clearReports: () => store.set({ reports: [] }),
    pushError: (error) => {
      errorSeq += 1;
      const entry: LabError = { ...error, seq: errorSeq };
      store.set((prev) => ({ errors: [...prev.errors, entry] }));
    },
    clearErrors: () => store.set({ errors: [] }),
    setRunning: (running) => store.set({ running }),
    setGalleryStatus: (status) => store.set((prev) => ({ gallery: { ...prev.gallery, status } })),
    setGalleryEntry: (presetId, entry) =>
      store.set((prev) => ({
        gallery: { ...prev.gallery, entries: { ...prev.gallery.entries, [presetId]: entry } },
      })),
    resetGallery: () => store.set({ gallery: emptyGallery() }),
    setLiveStats: (patch) => store.set((prev) => ({ live: { ...prev.live, ...patch } })),
  };
}

export const labActions: LabActions = createLabActions(labStore);
