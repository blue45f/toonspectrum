/**
 * LabStore 구현. 의존성 0(React 없음), `LabStore` 포트(getState/dispatch/subscribe/applyEvent)를 만족한다.
 *
 * - 명령 1개 = history 1단계(`param/set`은 `coalesceKey`로 병합). 레시피가 바뀌지 않는 명령은 단계를 만들지 않는다.
 * - reducer가 거부한 명령은 상태를 바꾸지 않고 `failures`에 LabFailure(code·한글 사유)로 쌓인다(무음 금지).
 * - 이벤트는 testing/mock-store.tsx의 `applyLabEvent` 참조 구현과 같은 의미로 반영한다.
 * - `getPlan()`은 현재 레시피·능력에 대한 플랜을 revision과 함께 메모한다. `planForPreset()`은 썸네일용.
 */
import { ALL_UNAVAILABLE_CAPABILITIES, createDefaultRecipe, createInitialLabState, failVisible } from "../contracts";
import { stableStringify } from "../shared/stable-json";

import { planApply, planWithPreset } from "./apply-plan";
import { createHistory } from "./history";
import { RecipeCommandError, describeCommandKo, isRecipeCommand, reduceRecipe } from "./recipe-reducer";

import type {
  ApplyPlan,
  ApplyPlanner,
  CharacterRecipe,
  HistoryInfo,
  LabCommand,
  LabEvent,
  LabState,
  LabStore,
  PaintUndoToken,
  PresetCatalog,
  PresetId,
  RecipeCommand,
  SlotCapabilityMap,
} from "../contracts";
import type { History, HistoryOptions, PaintHistoryEntry, RecipeHistoryEntry } from "./history";

/**
 * 페인트 undo/redo 적용 콜백(paint 도메인이 주입). 토큰을 레이어에 적용하고, 반대 방향에 쓸 토큰을 돌려줄 수 있다.
 * 돌려주지 않으면 같은 토큰을 교환(swap) 의미로 다시 쓴다.
 */
export type PaintUndoHandler = (token: PaintUndoToken, direction: "undo" | "redo") => PaintUndoToken | undefined | void;

export interface LabStoreOptions {
  readonly catalog: PresetCatalog;
  /** 기본 planApply */
  readonly planner?: ApplyPlanner;
  /** 기본 createInitialLabState(createDefaultRecipe(), ALL_UNAVAILABLE_CAPABILITIES) 위에 얕게 덮어쓴다 */
  readonly initial?: Partial<LabState>;
  readonly history?: HistoryOptions;
  /** 시각 주입(테스트) */
  readonly now?: () => number;
  readonly onPaintUndo?: PaintUndoHandler;
}

export interface LabStoreHandle extends LabStore {
  readonly catalog: PresetCatalog;
  /** 현재 레시피·능력의 플랜(revision 포함, 참조가 같으면 메모 반환) */
  getPlan(): ApplyPlan;
  /** 프리셋을 임시 적용한 플랜(썸네일 스케줄러 `planForPreset`에 연결) */
  planForPreset(presetId: PresetId): ApplyPlan;
  getHistory(): History;
}

/** 이벤트를 LabState에 반영한다(testing/mock-store.tsx의 참조 구현과 동일 의미). */
export function applyLabEvent(state: LabState, event: LabEvent): LabState {
  switch (event.type) {
    case "engine/status":
      return { ...state, engine: event.status };
    case "physics/status":
      return { ...state, physics: event.status };
    case "vision/status":
      return { ...state, vision: event.status };
    case "failure":
      return { ...state, failures: [...state.failures, event.failure] };
    case "failure/dismiss":
      return { ...state, failures: state.failures.filter((f) => !(f.code === event.failure.code && f.at === event.failure.at)) };
    case "thumbnail/update":
      return { ...state, thumbnails: { ...state.thumbnails, [event.presetId]: event.entry } };
    case "capture/done":
      return state;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** paint 레이어는 reducer가 바꾸지 않으므로 비교에서 제외한다(base64가 커서 비용이 크다). */
function recipeEqualsIgnoringPaint(a: CharacterRecipe, b: CharacterRecipe): boolean {
  if (a === b) return true;
  return stableStringify({ ...a, paint: undefined }) === stableStringify({ ...b, paint: undefined });
}

interface PaintTokens {
  undoToken: PaintUndoToken;
  redoToken: PaintUndoToken;
}

export function createLabStore(options: LabStoreOptions): LabStoreHandle {
  const { catalog } = options;
  const planner = options.planner ?? planApply;
  const now = options.now ?? (() => Date.now());
  const history = createHistory(options.history ?? {});
  const paintTokens = new WeakMap<PaintHistoryEntry, PaintTokens>();
  const listeners = new Set<() => void>();

  let state: LabState = { ...createInitialLabState(createDefaultRecipe(), ALL_UNAVAILABLE_CAPABILITIES), ...options.initial };
  let planCache: { recipe: CharacterRecipe; capabilities: SlotCapabilityMap; revision: number; plan: ApplyPlan } | null = null;

  const historyInfo = (revision: number): HistoryInfo => ({
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
    depth: history.depth(),
    revision,
  });

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const setState = (next: LabState): void => {
    if (next === state) return;
    state = next;
    notify();
  };

  const reportFailure = (code: string, reasonKo: string, detail?: unknown): void => {
    setState(applyLabEvent(state, { type: "failure", failure: failVisible(code, reasonKo, detail, now()) }));
  };

  const dispatchRecipeCommand = (command: RecipeCommand): void => {
    let next: CharacterRecipe;
    try {
      next = reduceRecipe(state.recipe, command, catalog);
    } catch (error) {
      if (error instanceof RecipeCommandError) reportFailure(error.code, error.message);
      else reportFailure("command-failed", `명령 ${command.type} 처리 중 오류가 났습니다.`, error);
      return;
    }
    const capabilitiesChanged = command.type === "source/set" && command.capabilities !== state.capabilities;
    if (!capabilitiesChanged && recipeEqualsIgnoringPaint(next, state.recipe)) return;

    const entry: RecipeHistoryEntry = {
      kind: "recipe",
      before: state.recipe,
      after: next,
      labelKo: describeCommandKo(command, catalog),
      at: now(),
      ...(command.type === "param/set" && command.coalesceKey !== undefined ? { coalesceKey: command.coalesceKey } : {}),
      ...(command.type === "source/set" ? { capabilities: { before: state.capabilities, after: command.capabilities } } : {}),
    };
    history.push(entry);
    setState({
      ...state,
      recipe: next,
      capabilities: command.type === "source/set" ? command.capabilities : state.capabilities,
      history: historyInfo(state.history.revision + 1),
    });
  };

  const applyPaintEntry = (entry: PaintHistoryEntry, direction: "undo" | "redo"): void => {
    const tokens = paintTokens.get(entry) ?? { undoToken: entry.token, redoToken: entry.token };
    const token = direction === "undo" ? tokens.undoToken : tokens.redoToken;
    const inverse = options.onPaintUndo?.(token, direction) ?? undefined;
    if (direction === "undo") paintTokens.set(entry, { undoToken: tokens.undoToken, redoToken: inverse ?? tokens.redoToken });
    else paintTokens.set(entry, { undoToken: inverse ?? tokens.undoToken, redoToken: tokens.redoToken });
  };

  const dispatchUndo = (): void => {
    const entry = history.undo();
    if (!entry) return;
    if (entry.kind === "recipe") {
      setState({
        ...state,
        recipe: entry.before,
        capabilities: entry.capabilities?.before ?? state.capabilities,
        history: historyInfo(state.history.revision + 1),
      });
      return;
    }
    applyPaintEntry(entry, "undo");
    setState({ ...state, history: historyInfo(state.history.revision) });
  };

  const dispatchRedo = (): void => {
    const entry = history.redo();
    if (!entry) return;
    if (entry.kind === "recipe") {
      setState({
        ...state,
        recipe: entry.after,
        capabilities: entry.capabilities?.after ?? state.capabilities,
        history: historyInfo(state.history.revision + 1),
      });
      return;
    }
    applyPaintEntry(entry, "redo");
    setState({ ...state, history: historyInfo(state.history.revision) });
  };

  const dispatch = (command: LabCommand): void => {
    if (command.type === "history/undo") {
      dispatchUndo();
      return;
    }
    if (command.type === "history/redo") {
      dispatchRedo();
      return;
    }
    if (command.type === "paint/stroke") {
      history.push({ kind: "paint", token: command.undoToken, labelKo: "페인트 스트로크", at: now() });
      setState({ ...state, history: historyInfo(state.history.revision) });
      return;
    }
    if (isRecipeCommand(command)) dispatchRecipeCommand(command);
  };

  return {
    catalog,
    getState: () => state,
    dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    applyEvent(event) {
      setState(applyLabEvent(state, event));
    },
    getPlan() {
      const { recipe, capabilities } = state;
      const { revision } = state.history;
      if (planCache && planCache.recipe === recipe && planCache.capabilities === capabilities && planCache.revision === revision) return planCache.plan;
      const plan: ApplyPlan = { ...planner(recipe, capabilities, catalog), revision };
      planCache = { recipe, capabilities, revision, plan };
      return plan;
    },
    planForPreset(presetId) {
      return { ...planWithPreset(state.recipe, presetId, state.capabilities, catalog, planner), revision: state.history.revision };
    },
    getHistory: () => history,
  };
}
