/**
 * 앱 상태(LabState)·스토어 포트·플래너 타입.
 * 구현은 state/(state-presets 작업자)이고, 셸(app/shell)과 패널은 이 포트만 본다.
 */
import { ALL_UNAVAILABLE_CAPABILITIES } from "./slots";

import type { ApplyPlan } from "./apply-plan";
import type { ThumbnailEntry } from "./capture";
import type { PresetCatalog } from "./catalog";
import type { EngineStatus } from "./engine";
import type { LabFailure } from "./errors";
import type { LabCommand, LabEvent } from "./events";
import type { PhysicsStatus } from "./physics";
import type { CharacterRecipe } from "./recipe";
import type { PresetId, SlotCapabilityMap } from "./slots";
import type { VisionStatus } from "./vision";

export type { ThumbnailEntry } from "./capture";

export interface HistoryInfo {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** undo 스택 깊이 */
  readonly depth: number;
  /** 레시피 변경마다 단조 증가 */
  readonly revision: number;
}

export interface LabState {
  readonly recipe: CharacterRecipe;
  readonly capabilities: SlotCapabilityMap;
  readonly history: HistoryInfo;
  readonly engine: EngineStatus;
  readonly physics: PhysicsStatus | null;
  readonly vision: VisionStatus;
  readonly thumbnails: Readonly<Record<PresetId, ThumbnailEntry>>;
  readonly failures: readonly LabFailure[];
}

export type ApplyPlanner = (recipe: CharacterRecipe, capabilities: SlotCapabilityMap, catalog: PresetCatalog) => ApplyPlan;

/** state/lab-store.ts `createLabStore`가 돌려주는 포트 */
export interface LabStore {
  getState(): LabState;
  dispatch(command: LabCommand): void;
  subscribe(listener: () => void): () => void;
  applyEvent(event: LabEvent): void;
}

export const INITIAL_HISTORY: HistoryInfo = Object.freeze({ canUndo: false, canRedo: false, depth: 0, revision: 0 });

/** 초기 상태. 소스가 아직 없으면 능력은 전부 unavailable(사유 포함). */
export function createInitialLabState(recipe: CharacterRecipe, capabilities: SlotCapabilityMap = ALL_UNAVAILABLE_CAPABILITIES): LabState {
  return {
    recipe,
    capabilities,
    history: INITIAL_HISTORY,
    engine: { phase: "idle" },
    physics: null,
    vision: { phase: "idle" },
    thumbnails: {},
    failures: [],
  };
}
