import { describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, ALL_UNAVAILABLE_CAPABILITIES, createDefaultRecipe, createPresetCatalog, failVisible } from "../../contracts";
import { FIXTURE_GLB_SHA256, characterPackageManifestFixture } from "../../testing/manifest-fixtures";
import { createMockEngine } from "../../testing/mock-engine";
import { createMockEngineSession, createMockLabStore } from "../../testing/mock-store";
import { applyPlanFixture, minimalHumanoidModelFixture } from "../../testing/recipe-fixtures";

import { createApplyLoop, sourceKeyOf } from "./apply-loop";

import type { ApplyPlanner, AuthoredPackagePlan, CharacterRecipe, CharacterSource } from "../../contracts";

function packagePlanFixture(): AuthoredPackagePlan {
  return {
    manifest: characterPackageManifestFixture(),
    baseUrl: "/assets/characters/mina/",
    glbUrl: "/assets/characters/mina/mina.glb",
    glbSha256: FIXTURE_GLB_SHA256,
    glbBytes: 10,
    shapeKeyMap: {},
    boneMap: {},
    meshRoles: {},
    hairLodPolicy: { preferredLod: 0 },
    capabilities: ALL_AVAILABLE_CAPABILITIES,
    licenseNote: "CC0",
  };
}

const planner: ApplyPlanner = (recipe) => applyPlanFixture({ revision: 0, colors: recipe.colors });

function setup(buildSource?: (recipe: CharacterRecipe) => CharacterSource) {
  const store = createMockLabStore();
  const session = createMockEngineSession();
  const engine = createMockEngine();
  const loop = createApplyLoop({
    store,
    catalog: createPresetCatalog([]),
    planner,
    engineSession: session,
    buildSource: buildSource ?? (() => ({ kind: "procedural", model: minimalHumanoidModelFixture() })),
    now: () => 1,
  });
  return { store, session, engine, loop };
}

describe("app/shell/apply-loop", () => {
  it("엔진 ready 시 소스 로드 → 셰이딩 → 물리 → 플랜 적용을 1회씩 한다", async () => {
    const { store, session, engine, loop } = setup();
    const stop = loop.start();
    await loop.flush();
    expect(engine.calls).toHaveLength(0);
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(engine.calls.map((call) => call.method)).toEqual(["loadSource", "setShading", "setPhysicsProvider", "applyPlan"]);
    expect(store.getState().physics).toMatchObject({ id: "builtin-pbd", status: "active" });
    expect(loop.lastReceipt()?.revision).toBe(0);
    // 같은 revision의 상태 변화(이벤트)는 다시 적용하지 않는다
    store.setState({ failures: [] });
    await loop.flush();
    expect(engine.calls.filter((call) => call.method === "applyPlan")).toHaveLength(1);
    // revision이 바뀌면 플랜만 다시 적용한다
    store.setState({ history: { ...store.getState().history, revision: 1 } });
    await loop.flush();
    expect(engine.calls.map((call) => call.method)).toEqual(["loadSource", "setShading", "setPhysicsProvider", "applyPlan", "applyPlan"]);
    // 적용한 플랜의 revision은 history revision이다(플래너는 0을 돌려준다)
    expect(loop.lastPlan()?.revision).toBe(1);
    expect(loop.lastReceipt()?.revision).toBe(1);
    stop();
  });

  it("셰이딩·물리 provider가 바뀌면 해당 단계만 다시 호출한다", async () => {
    const { store, session, engine, loop } = setup();
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    const recipe = store.getState().recipe;
    store.setState({
      recipe: { ...recipe, shading: { ...recipe.shading, mode: "toon" }, physics: { provider: "rapier" } },
      history: { ...store.getState().history, revision: 2 },
    });
    await loop.flush();
    expect(engine.shading?.mode).toBe("toon");
    expect(engine.physicsProvider).toBe("rapier");
    expect(engine.calls.filter((call) => call.method === "loadSource")).toHaveLength(1);
  });

  it("소스 생성 실패는 failure 이벤트로 노출하고 플랜을 적용하지 않는다", async () => {
    const { store, session, engine, loop } = setup(() => {
      throw failVisible("package-plan-missing", "제작 패키지가 아직 로드되지 않았습니다.", undefined, 1);
    });
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["package-plan-missing"]);
    expect(engine.calls).toHaveLength(0);
    expect(loop.lastPlan()).toBeNull();
  });

  it("markSourceLoaded 뒤에는 같은 소스를 다시 올리지 않고 플랜만 적용한다", async () => {
    const { store, session, engine, loop } = setup();
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(engine.calls.filter((call) => call.method === "loadSource")).toHaveLength(1);
    loop.markSourceLoaded(engine, { kind: "procedural", model: minimalHumanoidModelFixture() });
    await loop.flush();
    expect(engine.calls.filter((call) => call.method === "loadSource")).toHaveLength(1);
    expect(engine.calls.filter((call) => call.method === "applyPlan")).toHaveLength(2);
    expect(store.getState().capabilities).toBe(ALL_AVAILABLE_CAPABILITIES);
  });

  it("device lost 뒤 다시 ready가 되면 소스를 다시 올린다(레시피로 복원)", async () => {
    const { session, engine, loop } = setup();
    const seen: number[] = [];
    loop.subscribe((snapshot) => seen.push(snapshot.sequence));
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    session.setEngine(null);
    session.setStatus({ phase: "lost", backend: "webgpu", failure: failVisible("device-lost", "손실", undefined, 1) });
    expect(loop.lastPlan()).toBeNull();
    const again = createMockEngine();
    session.setEngine(again);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: again.diagnostics });
    await loop.flush();
    expect(again.calls.map((call) => call.method)).toEqual(["loadSource", "setShading", "setPhysicsProvider", "applyPlan"]);
    expect(seen.length).toBeGreaterThanOrEqual(3);
  });

  it("onSourceLoaded 훅은 소스 로드 직후 엔진·소스로 1회 호출되고, 훅 예외는 failure로 노출하되 플랜 적용은 계속한다", async () => {
    const store = createMockLabStore();
    const session = createMockEngineSession();
    const engine = createMockEngine();
    const seen: Array<{ engine: unknown; kind: string }> = [];
    let throwNext = false;
    const loop = createApplyLoop({
      store,
      catalog: createPresetCatalog([]),
      planner,
      engineSession: session,
      buildSource: () => ({ kind: "procedural", model: minimalHumanoidModelFixture() }),
      onSourceLoaded(loadedEngine, source) {
        seen.push({ engine: loadedEngine, kind: source.kind });
        if (throwNext) throw new Error("재업로드 실패");
      },
      now: () => 1,
    });
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(seen).toEqual([{ engine, kind: "procedural" }]);
    // 같은 소스에서 revision만 바뀌면 훅은 다시 부르지 않는다
    store.setState({ history: { ...store.getState().history, revision: 1 } });
    await loop.flush();
    expect(seen).toHaveLength(1);
    // 새 엔진(device lost 복원)에서 훅이 throw해도 플랜은 적용되고 사유가 남는다
    throwNext = true;
    const again = createMockEngine();
    session.setEngine(null);
    session.setStatus({ phase: "lost", backend: "webgpu", failure: failVisible("device-lost", "손실", undefined, 1) });
    session.setEngine(again);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: again.diagnostics });
    await loop.flush();
    expect(seen).toHaveLength(2);
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["source-loaded-hook-failed"]);
    expect(again.calls.map((call) => call.method)).toContain("applyPlan");
  });

  it("같은 엔진에서 실패한 소스는 레시피의 다른 필드가 바뀌어도 다시 만들지 않고 failure 1건만 남긴다(재진입 루프 방지)", async () => {
    let builds = 0;
    const { store, session, engine, loop } = setup(() => {
      builds += 1;
      throw failVisible("package-plan-missing", "제작 패키지가 아직 로드되지 않았습니다.", undefined, 1);
    });
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(builds).toBe(1);
    const recipe = store.getState().recipe;
    store.setState({ recipe: { ...recipe, shading: { ...recipe.shading, mode: "toon" } }, history: { ...store.getState().history, revision: 1 } });
    await loop.flush();
    expect(builds).toBe(1);
    expect(store.getState().failures).toHaveLength(1);
    // 소스 자체가 바뀌면 다시 시도한다
    const next = store.getState().recipe;
    store.setState({
      recipe: { ...next, source: { kind: "package", characterId: "other", sha256: "0".repeat(64) } },
      history: { ...store.getState().history, revision: 2 },
    });
    await loop.flush();
    expect(builds).toBe(2);
    expect(store.getState().failures).toHaveLength(2);
  });

  it("소스 로드가 실패한 뒤 레시피가 이전 소스로 돌아가면 이전 소스를 다시 올린다(실패한 엔진 상태는 알 수 없다)", async () => {
    const store = createMockLabStore();
    const session = createMockEngineSession();
    const engine = createMockEngine();
    let failNext = false;
    const loop = createApplyLoop({
      store,
      catalog: createPresetCatalog([]),
      planner,
      engineSession: session,
      buildSource: () => {
        if (failNext) throw failVisible("source-build-failed", "빌드 실패", undefined, 1);
        return { kind: "procedural", model: minimalHumanoidModelFixture() };
      },
      proceduralGeometryKey: (recipe) => recipe.slots.hair ?? "-",
      now: () => 1,
    });
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(engine.loadedSources).toHaveLength(1);
    const original = store.getState().recipe;
    failNext = true;
    store.setState({ recipe: { ...original, slots: { ...original.slots, hair: "hair/hime-cut" } }, history: { ...store.getState().history, revision: 1 } });
    await loop.flush();
    expect(loop.settled()).toBe(false);
    // 레시피가 이전 헤어로 돌아가면(실패한 키가 아니므로) 소스를 다시 올린다
    failNext = false;
    store.setState({ recipe: original, history: { ...store.getState().history, revision: 2 } });
    await loop.flush();
    expect(engine.loadedSources).toHaveLength(2);
    expect(loop.settled()).toBe(true);
  });

  it("failure·thumbnail 같은 적용과 무관한 스토어 알림에는 플랜을 다시 적용하지 않는다", async () => {
    const { store, session, engine, loop } = setup();
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    const before = engine.calls.length;
    store.applyEvent({ type: "failure", failure: failVisible("unrelated", "무관한 실패", undefined, 1) });
    store.applyEvent({ type: "engine/status", status: { phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics } });
    await loop.flush();
    expect(engine.calls).toHaveLength(before);
  });

  it("셰이딩 적용 실패는 failure 1건만 남기고 같은 값으로 다시 시도하지 않는다", async () => {
    const { store, session, engine, loop } = setup();
    let attempts = 0;
    Object.assign(engine, {
      setShading() {
        attempts += 1;
        throw new Error("셰이더 컴파일 실패");
      },
    });
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(attempts).toBe(1);
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["shading-apply-failed"]);
    store.setState({ history: { ...store.getState().history, revision: 1 } });
    await loop.flush();
    expect(attempts).toBe(1);
    expect(engine.calls.filter((call) => call.method === "applyPlan")).toHaveLength(2);
  });

  it("레시피가 아직 따라잡지 않은 markSourceLoaded는 즉시 되돌리지 않고, 레시피가 그 소스로 바뀌면 다시 올리지 않는다", async () => {
    const { store, session, engine, loop } = setup();
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    const plan = packagePlanFixture();
    loop.markSourceLoaded(engine, { kind: "package", plan });
    await loop.flush();
    // 레시피는 아직 절차 소스 — 패널이 올린 패키지를 지우고 절차 소스를 다시 만들지 않는다
    expect(engine.calls.filter((call) => call.method === "loadSource")).toHaveLength(1);
    expect(loop.settled()).toBe(false);
    // 패널의 source/set이 레시피를 따라잡으면 소스는 그대로 두고 플랜만 적용한다
    const recipe = store.getState().recipe;
    store.setState({
      recipe: { ...recipe, source: { kind: "package", characterId: plan.manifest.characterId, sha256: plan.glbSha256 } },
      history: { ...store.getState().history, revision: 1 },
    });
    await loop.flush();
    expect(engine.calls.filter((call) => call.method === "loadSource")).toHaveLength(1);
    expect(engine.calls.filter((call) => call.method === "applyPlan")).toHaveLength(2);
    expect(loop.settled()).toBe(true);
  });

  it("레시피가 끝내 따라잡지 않으면 다음 입력 변경에서 레시피(단일 진실) 소스로 되돌린다", async () => {
    const { store, session, engine, loop } = setup();
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    loop.markSourceLoaded(engine, { kind: "package", plan: packagePlanFixture() });
    await loop.flush();
    store.setState({ history: { ...store.getState().history, revision: 1 } });
    await loop.flush();
    expect(engine.loadedSources.map((source) => source.kind)).toEqual(["procedural", "procedural"]);
    expect(loop.settled()).toBe(true);
  });

  it("절차 소스는 지오메트리 키가 바뀔 때만 다시 만든다(헤어·의상 슬롯 = 재생성, 셰이딩·그 밖의 변경 = 플랜만)", async () => {
    const store = createMockLabStore();
    const session = createMockEngineSession();
    const engine = createMockEngine();
    let builds = 0;
    const loop = createApplyLoop({
      store,
      catalog: createPresetCatalog([]),
      planner,
      engineSession: session,
      buildSource: () => {
        builds += 1;
        return { kind: "procedural", model: minimalHumanoidModelFixture() };
      },
      proceduralGeometryKey: (recipe) => `${recipe.slots.hair ?? "-"};${recipe.slots.top ?? "-"}`,
      now: () => 1,
    });
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(builds).toBe(1);
    // 지오메트리와 무관한 변경(셰이딩 모드)은 플랜만 다시 적용한다
    let recipe = store.getState().recipe;
    store.setState({ recipe: { ...recipe, shading: { ...recipe.shading, mode: "toon" } }, history: { ...store.getState().history, revision: 1 } });
    await loop.flush();
    expect(builds).toBe(1);
    // 헤어 슬롯이 바뀌면 소스를 다시 만들어 올리고 셰이딩·물리·플랜도 다시 적용한다
    recipe = store.getState().recipe;
    store.setState({ recipe: { ...recipe, slots: { ...recipe.slots, hair: "hair/hime-cut" } }, history: { ...store.getState().history, revision: 2 } });
    await loop.flush();
    expect(builds).toBe(2);
    expect(engine.calls.filter((call) => call.method === "loadSource")).toHaveLength(2);
    expect(engine.calls.filter((call) => call.method === "setPhysicsProvider")).toHaveLength(2);
    // markSourceLoaded(절차)는 현재 레시피의 지오메트리 키로 본다 — 다시 만들지 않는다
    loop.markSourceLoaded(engine, { kind: "procedural", model: minimalHumanoidModelFixture() });
    await loop.flush();
    expect(builds).toBe(2);
  });

  it("엔진이 보고한 능력 맵이 스토어와 다르면 source/capabilities 이벤트로 맞추고 그 맵으로 플랜을 만든다", async () => {
    const seen: unknown[] = [];
    const store = createMockLabStore();
    const session = createMockEngineSession();
    const engine = createMockEngine({ capabilities: ALL_UNAVAILABLE_CAPABILITIES });
    const loop = createApplyLoop({
      store,
      catalog: createPresetCatalog([]),
      planner: (recipe, capabilities) => {
        seen.push(capabilities);
        return applyPlanFixture({ revision: 0, colors: recipe.colors });
      },
      engineSession: session,
      buildSource: () => ({ kind: "procedural", model: minimalHumanoidModelFixture() }),
      now: () => 1,
    });
    loop.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    await loop.flush();
    expect(store.events.filter((event) => event.type === "source/capabilities")).toEqual([{ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES }]);
    expect(store.getState().capabilities).toBe(ALL_UNAVAILABLE_CAPABILITIES);
    expect(seen).toEqual([ALL_UNAVAILABLE_CAPABILITIES]);
    // history는 단계를 만들지 않는다
    expect(store.getState().history.canUndo).toBe(false);
    // 같은 내용이면(참조만 달라도) 이벤트를 다시 보내지 않는다
    store.setState({ history: { ...store.getState().history, revision: 1 } });
    await loop.flush();
    expect(store.events.filter((event) => event.type === "source/capabilities")).toHaveLength(1);
  });

  it("sourceKeyOf는 레시피 source와 같은 키를 만든다", () => {
    const recipe = createDefaultRecipe();
    expect(sourceKeyOf({ kind: "procedural", model: minimalHumanoidModelFixture() })).toBe(JSON.stringify(recipe.source));
    expect(sourceKeyOf({ kind: "procedural", model: minimalHumanoidModelFixture() }, "hair/soft-bob")).toBe('{"geometry":"hair/soft-bob","kind":"procedural"}');
  });
});
