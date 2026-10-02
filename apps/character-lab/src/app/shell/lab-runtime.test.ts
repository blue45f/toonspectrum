import { describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, ALL_UNAVAILABLE_CAPABILITIES, APPEARANCE_SLOT_KINDS, createDefaultRecipe } from "../../contracts";
import { FIXTURE_GLB_SHA256, characterPackageManifestFixture } from "../../testing/manifest-fixtures";
import { createMockEngine } from "../../testing/mock-engine";
import { createMockRuntime, splitCatalogSources } from "../../testing/mock-runtime";
import { minimalHumanoidModelFixture, presetEntryFixture } from "../../testing/recipe-fixtures";

import type { AuthoredPackagePlan } from "../../contracts";

function canvasStub(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

function packagePlanFixture(capabilities: AuthoredPackagePlan["capabilities"]): AuthoredPackagePlan {
  const manifest = characterPackageManifestFixture();
  return {
    manifest,
    baseUrl: "/assets/characters/mina/",
    glbUrl: "/assets/characters/mina/mina.glb",
    glbSha256: FIXTURE_GLB_SHA256,
    glbBytes: 10,
    shapeKeyMap: {},
    boneMap: {},
    meshRoles: {},
    hairLodPolicy: { preferredLod: 0 },
    capabilities,
    licenseNote: "CC0",
  };
}

describe("app/shell/lab-runtime", () => {
  it("카탈로그 불변식 위반은 failure 이벤트로 노출하고 런타임은 계속 만든다", () => {
    const sources = splitCatalogSources();
    const { runtime, store } = createMockRuntime({
      overrides: { catalogSources: { ...sources, appearance: [...sources.appearance, presetEntryFixture("hair/soft-bob")] } },
    });
    expect(runtime.catalogFailures.map((failure) => failure.code)).toContain("catalog-id-duplicate");
    expect(store.getState().failures.map((failure) => failure.code)).toContain("catalog-id-duplicate");
    expect(runtime.catalog.entries.length).toBeGreaterThan(0);
  });

  it("엔진 선택 전에는 factory를 호출하지 않고, 선택 후 적용 루프와 썸네일이 돈다", async () => {
    const { runtime, store, engine, factory } = createMockRuntime();
    const stop = runtime.start();
    expect(factory.calls).toHaveLength(0);
    expect(engine.calls).toHaveLength(0);
    await runtime.engineSession.select("webgpu", canvasStub());
    expect(factory.calls).toHaveLength(1);
    expect(store.getState().engine.phase).toBe("ready");
    await runtime.applyLoop.flush();
    expect(engine.calls.map((call) => call.method).slice(0, 4)).toEqual(["loadSource", "setShading", "setPhysicsProvider", "applyPlan"]);
    await runtime.thumbnails.idle();
    const appearanceCount = APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + runtime.catalog.bySlot(slot).length, 0);
    const thumbnails = store.getState().thumbnails;
    expect(Object.values(thumbnails).filter((entry) => entry.status === "ready")).toHaveLength(appearanceCount);
    stop();
    runtime.dispose();
    expect(engine.disposed).toBe(true);
    expect(store.getState().engine.phase).toBe("idle");
  });

  it("reloadSource로 올린 패키지 플랜은 레지스트리에 등록되고 루프가 중복 로드하지 않는다", async () => {
    const { runtime, store, engine } = createMockRuntime();
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    const manifest = characterPackageManifestFixture();
    const plan: AuthoredPackagePlan = {
      manifest,
      baseUrl: "/assets/characters/mina/",
      glbUrl: "/assets/characters/mina/mina.glb",
      glbSha256: FIXTURE_GLB_SHA256,
      glbBytes: 10,
      shapeKeyMap: {},
      boneMap: {},
      meshRoles: {},
      hairLodPolicy: { preferredLod: 0 },
      capabilities: store.getState().capabilities,
      licenseNote: "CC0",
    };
    const capabilities = await runtime.engineSession.reloadSource({ kind: "package", plan });
    expect(capabilities).not.toBeNull();
    expect(runtime.packagePlans.get(manifest.characterId)).toBe(plan);
    const recipe = store.getState().recipe;
    store.setState({
      recipe: { ...recipe, source: { kind: "package", characterId: manifest.characterId, sha256: FIXTURE_GLB_SHA256 } },
      history: { ...store.getState().history, revision: 1 },
    });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(2);
    expect(engine.loadedSources[1]?.kind).toBe("package");
    expect(store.getState().failures).toEqual([]);
  });

  it("onSourceLoaded 훅은 루프의 소스 로드와 패널의 reloadSource 양쪽에서 엔진·소스로 호출된다", async () => {
    const seen: string[] = [];
    const { runtime, store, engine } = createMockRuntime({
      overrides: {
        onSourceLoaded(loadedEngine, source) {
          expect(loadedEngine).toBe(engine);
          seen.push(source.kind);
        },
      },
    });
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    expect(seen).toEqual(["procedural"]);
    await runtime.engineSession.reloadSource({ kind: "package", plan: packagePlanFixture(store.getState().capabilities) });
    expect(seen).toEqual(["procedural", "package"]);
  });

  it("로드되지 않은 패키지 소스는 failure로 노출한다", async () => {
    const { runtime, store } = createMockRuntime();
    runtime.start();
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
    const recipe = store.getState().recipe;
    store.setState({
      recipe: { ...recipe, source: { kind: "package", characterId: "ghost", sha256: FIXTURE_GLB_SHA256 } },
      history: { ...store.getState().history, revision: 1 },
    });
    await runtime.applyLoop.flush();
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["package-plan-missing"]);
  });

  it("capability 차단은 factory 미호출 + failed 상태로 노출된다", async () => {
    const { runtime, store, factory } = createMockRuntime({
      decideBackend: async (backend) => ({ ok: false, backend, code: "webgpu-unsupported", reasonKo: "이 브라우저는 WebGPU를 지원하지 않습니다." }),
    });
    await runtime.engineSession.select("webgpu", canvasStub());
    expect(factory.calls).toHaveLength(0);
    expect(store.getState().engine).toMatchObject({ phase: "failed", failure: { code: "webgpu-unsupported" } });
  });

  it("능력 맵 초기값은 소스 종류에서 정한다(절차 = 전부 지원, 제작 패키지 = 로드 전까지 미지원)", () => {
    const procedural = createMockRuntime();
    expect(procedural.store.getState().capabilities).toBe(ALL_AVAILABLE_CAPABILITIES);
    const base = createDefaultRecipe();
    const pkg = createMockRuntime({
      overrides: { initialRecipe: { ...base, source: { kind: "package", characterId: "orion", sha256: FIXTURE_GLB_SHA256 } } },
    });
    expect(pkg.store.getState().capabilities).toBe(ALL_UNAVAILABLE_CAPABILITIES);
  });

  it("buildThumbnailSource는 engine.thumbnailSources가 true이고 현재 소스가 절차 소스일 때만 프리셋 레시피로 불린다", async () => {
    const seen: Array<{ slot: string; hair: string | null }> = [];
    const engine = createMockEngine({ thumbnailSources: true });
    const { runtime } = createMockRuntime({
      engine,
      overrides: {
        buildThumbnailSource(recipe, slot) {
          seen.push({ slot, hair: recipe.slots.hair });
          return slot === "hair" ? { kind: "procedural", model: minimalHumanoidModelFixture() } : null;
        },
      },
    });
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    await runtime.thumbnails.idle();
    // 헤어 카드는 그 프리셋을 현재 레시피에 적용한 레시피로 불린다
    const hairPresets = runtime.catalog.bySlot("hair").map((entry) => entry.id);
    expect(seen.filter((entry) => entry.slot === "hair").map((entry) => entry.hair).sort()).toEqual([...hairPresets].sort());
    const requests = engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => call.args[0] as { presetId: string; source?: unknown });
    expect(requests.filter((request) => request.source !== undefined).every((request) => request.presetId.startsWith("hair/"))).toBe(true);
    expect(requests.some((request) => request.source !== undefined)).toBe(true);
    runtime.dispose();
  });
});
