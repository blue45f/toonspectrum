/**
 * 패널·셸 단위 테스트용 모의 스토어·엔진 세션·Provider.
 * 명령은 기록만 하고(reducer 없음) 이벤트는 LabState에 반영한다. 실제 reducer는 state/(W1)가 구현한다.
 */
import { type ReactNode } from "react";

import { LabStoreProvider, type LabStoreProviderProps } from "../app/shell/lab-store-context";
import { ALL_AVAILABLE_CAPABILITIES, createDefaultRecipe, createInitialLabState, createPresetCatalog } from "../contracts";

import type {
  CharacterEngine,
  CharacterSource,
  EngineBackend,
  EngineSession,
  EngineStatus,
  LabCommand,
  LabEvent,
  LabState,
  LabStore,
  PresetCatalog,
  SourceCapabilities,
} from "../contracts";

export interface MockLabStore extends LabStore {
  /** dispatch된 명령(순서대로) */
  readonly dispatched: LabCommand[];
  /** 적용된 이벤트(순서대로) */
  readonly events: LabEvent[];
  /** 테스트에서 상태를 직접 바꿀 때 */
  setState(patch: Partial<LabState>): void;
}

/** 이벤트를 LabState에 반영하는 참조 구현(W1 store도 같은 의미로 동작해야 한다). */
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
    case "source/capabilities":
      return event.capabilities === state.capabilities ? state : { ...state, capabilities: event.capabilities };
    case "capture/done":
      return state;
    default:
      return state;
  }
}

export function createMockLabStore(initial?: Partial<LabState>, dispatchSpy?: (command: LabCommand) => void): MockLabStore {
  let state: LabState = { ...createInitialLabState(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES), ...initial };
  const listeners = new Set<() => void>();
  const dispatched: LabCommand[] = [];
  const events: LabEvent[] = [];
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    dispatched,
    events,
    getState: () => state,
    dispatch(command) {
      dispatched.push(command);
      dispatchSpy?.(command);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    applyEvent(event) {
      events.push(event);
      state = applyLabEvent(state, event);
      notify();
    },
    setState(patch) {
      state = { ...state, ...patch };
      notify();
    },
  };
}

export interface MockEngineSession extends EngineSession {
  readonly selected: EngineBackend[];
  /** 테스트에서 상태를 바꾸고 구독자에게 알린다 */
  setStatus(status: EngineStatus): void;
  setEngine(engine: CharacterEngine | null): void;
}

export function createMockEngineSession(initialStatus: EngineStatus = { phase: "idle" }): MockEngineSession {
  let status = initialStatus;
  let engine: CharacterEngine | null = null;
  const listeners = new Set<(status: EngineStatus) => void>();
  const selected: EngineBackend[] = [];
  const emit = (): void => {
    for (const listener of listeners) listener(status);
  };
  return {
    selected,
    select: async (backend) => {
      selected.push(backend);
    },
    status: () => status,
    engine: () => engine,
    reloadSource: async (source: CharacterSource): Promise<SourceCapabilities | null> => {
      if (!engine) return null;
      return engine.loadSource(source);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      listeners.clear();
    },
    setStatus(next) {
      status = next;
      emit();
    },
    setEngine(next) {
      engine = next;
    },
  };
}

export interface MockLabProviderProps {
  readonly initialState?: Partial<LabState>;
  readonly dispatchSpy?: (command: LabCommand) => void;
  readonly store?: LabStore;
  readonly engineSession?: EngineSession;
  readonly catalog?: PresetCatalog;
  /** 셸 전용 선택 값(뷰포트 레지스트리·UI 상태·썸네일 스케줄러·패키지 플랜·적용 루프). 없으면 Provider 기본값. */
  readonly shell?: Pick<LabStoreProviderProps, "viewport" | "ui" | "thumbnails" | "packagePlans" | "applyLoop">;
  readonly children?: ReactNode;
}

/** 패널 테스트용 Provider. store를 주지 않으면 createMockLabStore(initialState, dispatchSpy)를 쓴다. */
export function MockLabProvider({ initialState, dispatchSpy, store, engineSession, catalog, shell, children }: MockLabProviderProps) {
  const resolvedStore = store ?? createMockLabStore(initialState, dispatchSpy);
  const resolvedSession = engineSession ?? createMockEngineSession();
  const resolvedCatalog = catalog ?? createPresetCatalog([]);
  return (
    <LabStoreProvider store={resolvedStore} catalog={resolvedCatalog} engineSession={resolvedSession} {...shell}>
      {children}
    </LabStoreProvider>
  );
}
