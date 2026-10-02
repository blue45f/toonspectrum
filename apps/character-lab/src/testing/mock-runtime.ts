/**
 * 셸 테스트용 런타임 조립. 영역 모듈 대신 모의(스토어·엔진 팩토리·물리·휴머노이드 fixture)를 꽂아
 * createLabRuntime을 그대로 돌린다. CharacterLabApp·lab-runtime 테스트가 쓴다.
 */
import { createLabRuntime } from "../app/shell/lab-runtime";

import { createMockEngine, createMockEngineFactory, createMockPhysicsProviderFactory } from "./mock-engine";
import { createMockLabStore } from "./mock-store";
import { applyPlanFixture, minimalHumanoidModelFixture, vocabularyCatalogEntries } from "./recipe-fixtures";

import type { LabRuntime, LabRuntimeDeps } from "../app/shell/lab-runtime";
import type { ApplyPlanner, BackendDecision, EngineBackend, PresetEntry } from "../contracts";
import type { MockEngine, MockEngineFactory } from "./mock-engine";
import type { MockLabStore } from "./mock-store";

export const PERFORMANCE_SLOTS: ReadonlySet<string> = new Set(["expression", "pose", "hand-pose"]);

/** 어휘 전체 카탈로그를 외형/연기로 나눈다(catalog-registry 입력 모양). */
export function splitCatalogSources(entries: readonly PresetEntry[] = vocabularyCatalogEntries()) {
  return {
    appearance: entries.filter((entry) => !PERFORMANCE_SLOTS.has(entry.slot)),
    performance: entries.filter((entry) => PERFORMANCE_SLOTS.has(entry.slot)),
  };
}

/** 플랜 fixture 플래너: 레시피 revision·색만 반영한다. */
export const mockPlanner: ApplyPlanner = (recipe) => applyPlanFixture({ colors: recipe.colors });

export interface MockRuntimeOptions {
  readonly engine?: MockEngine;
  readonly decideBackend?: (backend: EngineBackend) => Promise<BackendDecision>;
  readonly overrides?: Partial<LabRuntimeDeps>;
}

export interface MockRuntime {
  readonly runtime: LabRuntime;
  readonly store: MockLabStore;
  readonly engine: MockEngine;
  readonly factory: MockEngineFactory;
}

export function createMockRuntime(options: MockRuntimeOptions = {}): MockRuntime {
  const engine = options.engine ?? createMockEngine();
  const factory = createMockEngineFactory({ engine });
  let store: MockLabStore | null = null;
  const runtime = createLabRuntime({
    createStore: ({ initial }) => {
      store = createMockLabStore(initial);
      return store;
    },
    planner: mockPlanner,
    catalogSources: splitCatalogSources(),
    loadFactory: async () => factory,
    decideBackend: options.decideBackend ?? (async (backend) => ({ ok: true, backend })),
    physicsProviders: createMockPhysicsProviderFactory(),
    buildProceduralSource: () => minimalHumanoidModelFixture(),
    panels: {},
    now: () => 1,
    ...options.overrides,
  });
  if (!store) throw new Error("createStore가 호출되지 않았습니다.");
  return { runtime, store, engine, factory };
}
