// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SHADING, QUALITY_PRESETS, createDefaultRecipe } from "../../../contracts";
import { createFeatureReport, featureActive, featureOff, featureUnavailable } from "../../../render/scene-features";
import { createMockEngine, mockDiagnostics } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";

import { RenderPanel } from "./RenderPanel";

import type { EngineStatus, LabCommand, ShadingProfile } from "../../../contracts";
import type { SceneFeatureReport } from "../../../render/scene-features";
import type { MockEngine } from "../../../testing/mock-engine";

const READY: EngineStatus = { phase: "ready", backend: "webgpu", diagnostics: mockDiagnostics("webgpu") };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface PanelOptions {
  readonly shading?: Partial<ShadingProfile>;
  readonly status?: EngineStatus;
  readonly engine?: (MockEngine & { sceneFeatures?: () => SceneFeatureReport }) | null;
  readonly pollIntervalMs?: number;
}

function renderPanel(options: PanelOptions = {}) {
  const dispatched: LabCommand[] = [];
  const recipe = createDefaultRecipe();
  const status = options.status ?? READY;
  const session = createMockEngineSession(status);
  session.setEngine(options.engine === undefined ? createMockEngine() : options.engine);
  const view = render(
    <MockLabProvider
      initialState={{ recipe: { ...recipe, shading: { ...recipe.shading, ...options.shading } }, engine: status }}
      dispatchSpy={(command) => dispatched.push(command)}
      engineSession={session}
    >
      <RenderPanel pollIntervalMs={options.pollIntervalMs ?? 0} />
    </MockLabProvider>,
  );
  return { ...view, dispatched };
}

function withReport(report: SceneFeatureReport): MockEngine & { sceneFeatures: () => SceneFeatureReport } {
  return Object.assign(createMockEngine(), { sceneFeatures: () => report });
}

function lastProfile(dispatched: readonly LabCommand[]): Partial<ShadingProfile> {
  const command = dispatched.at(-1);
  if (command?.type !== "shading/set") throw new Error("shading/set이 아닙니다");
  return command.profile;
}

describe("프로파일 표시", () => {
  it("현재 셰이딩 값을 컨트롤에 보인다", () => {
    renderPanel({ shading: { mode: "toon", toneMapping: "aces", shadows: { enabled: true, cascades: 3, pcf: false, contactHardening: true }, ibl: { enabled: true, intensity: 1.5 } } });
    expect(screen.getByRole("button", { name: "툰" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "PBR" }).getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByLabelText("톤맵") as HTMLSelectElement).value).toBe("aces");
    expect((screen.getByLabelText("캐스케이드") as HTMLSelectElement).value).toBe("3");
    expect((screen.getByLabelText("부드러운 필터(PCF)") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("접촉 경화(PCSS)") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("세기") as HTMLInputElement).value).toBe("1.5");
  });

  it("TAA·SSAO에는 베타 라벨이 붙고 나머지 후처리에는 붙지 않는다", () => {
    renderPanel();
    expect(screen.getByLabelText("TAA (베타)")).toBeTruthy();
    expect(screen.getByLabelText("SSAO (베타)")).toBeTruthy();
    for (const label of ["FXAA", "블룸", "샤프닝"]) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.queryByLabelText("FXAA (베타)")).toBeNull();
  });

  it("엔진이 준비되면 backend·어댑터·버전을, 아니면 안내를 보인다", () => {
    renderPanel();
    expect(screen.getByText(/활성 엔진 webgpu · mock/u)).toBeTruthy();
    cleanup();
    renderPanel({ status: { phase: "idle" }, engine: null });
    expect(screen.getByText(/엔진이 준비되지 않았습니다/u)).toBeTruthy();
  });

  it("툰 옵션은 PBR 모드에서 비활성이고 툰 모드에서 활성이다", () => {
    renderPanel();
    expect(screen.getByRole("group", { name: /툰 옵션/u }).hasAttribute("disabled")).toBe(true);
    cleanup();
    renderPanel({ shading: { mode: "toon" } });
    expect(screen.getByRole("group", { name: /툰 옵션/u }).hasAttribute("disabled")).toBe(false);
  });
});

describe("shading/set 명령", () => {
  it("모드 버튼이 mode만 보낸다", () => {
    const view = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "툰" }));
    expect(view.dispatched).toEqual([{ type: "shading/set", profile: { mode: "toon" } }]);
  });

  it("품질 프리셋은 그림자·후처리·IBL을 프리셋 값으로 바꾸고 mode·톤맵은 유지한다", () => {
    const view = renderPanel({ shading: { mode: "toon", toneMapping: "aces" } });
    fireEvent.click(screen.getByRole("button", { name: "히어로" }));
    const profile = lastProfile(view.dispatched);
    expect(view.dispatched).toHaveLength(1);
    expect(profile).toMatchObject({ mode: "toon", toneMapping: "aces", shadows: QUALITY_PRESETS.hero.shadows, postfx: QUALITY_PRESETS.hero.postfx, ibl: QUALITY_PRESETS.hero.ibl });
  });

  it("톤맵·캐스케이드·PCF·PCSS·그림자 사용이 각각 1회 dispatch된다", () => {
    const view = renderPanel();
    fireEvent.change(screen.getByLabelText("톤맵"), { target: { value: "none" } });
    expect(lastProfile(view.dispatched)).toEqual({ toneMapping: "none" });
    fireEvent.change(screen.getByLabelText("캐스케이드"), { target: { value: "4" } });
    expect(lastProfile(view.dispatched)).toEqual({ shadows: { ...DEFAULT_SHADING.shadows, cascades: 4 } });
    fireEvent.click(screen.getByLabelText("부드러운 필터(PCF)"));
    expect(lastProfile(view.dispatched)).toEqual({ shadows: { ...DEFAULT_SHADING.shadows, pcf: false } });
    fireEvent.click(screen.getByLabelText("접촉 경화(PCSS)"));
    expect(lastProfile(view.dispatched)).toEqual({ shadows: { ...DEFAULT_SHADING.shadows, contactHardening: true } });
    fireEvent.click(within(screen.getByRole("group", { name: "그림자" })).getByLabelText("사용"));
    expect(lastProfile(view.dispatched)).toEqual({ shadows: { ...DEFAULT_SHADING.shadows, enabled: false } });
    expect(view.dispatched).toHaveLength(5);
  });

  it("그림자를 끈 프로파일에서는 캐스케이드·PCF·PCSS가 비활성이다", () => {
    renderPanel({ shading: { shadows: { enabled: false, cascades: 2, pcf: true, contactHardening: false } } });
    expect((screen.getByLabelText("캐스케이드") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("부드러운 필터(PCF)") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("접촉 경화(PCSS)") as HTMLInputElement).disabled).toBe(true);
  });

  it("후처리 토글(FXAA·블룸·샤프닝·TAA·SSAO)이 해당 키만 바꾼다", () => {
    const view = renderPanel();
    for (const [label, key] of [
      ["FXAA", "fxaa"],
      ["블룸", "bloom"],
      ["샤프닝", "sharpen"],
      ["TAA (베타)", "taa"],
      ["SSAO (베타)", "ssao"],
    ] as const) {
      fireEvent.click(screen.getByLabelText(label));
      const expected = { ...DEFAULT_SHADING.postfx, [key]: !DEFAULT_SHADING.postfx[key] };
      expect(lastProfile(view.dispatched)).toEqual({ postfx: expected });
    }
    expect(view.dispatched).toHaveLength(5);
  });

  it("IBL 세기 슬라이더는 드래그 중에는 dispatch하지 않고 놓을 때 1회 보낸다", () => {
    const view = renderPanel();
    const slider = screen.getByLabelText("세기") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "2.5" } });
    fireEvent.change(slider, { target: { value: "3" } });
    expect(view.dispatched).toEqual([]);
    expect(screen.getByText("3.00")).toBeTruthy();
    fireEvent.pointerUp(slider);
    expect(view.dispatched).toEqual([{ type: "shading/set", profile: { ibl: { enabled: true, intensity: 3 } } }]);
  });

  it("IBL 세기가 그대로면 놓아도 dispatch하지 않고 키보드(keyup)로도 확정된다", () => {
    const view = renderPanel();
    const slider = screen.getByLabelText("세기") as HTMLInputElement;
    fireEvent.pointerUp(slider);
    expect(view.dispatched).toEqual([]);
    fireEvent.change(slider, { target: { value: "0.5" } });
    fireEvent.keyUp(slider, { key: "ArrowLeft" });
    expect(view.dispatched).toHaveLength(1);
    expect(lastProfile(view.dispatched)).toEqual({ ibl: { enabled: true, intensity: 0.5 } });
  });

  it("IBL을 끄면 세기 슬라이더가 비활성이다", () => {
    const view = renderPanel();
    fireEvent.click(within(screen.getByRole("group", { name: "이미지 기반 조명(IBL)" })).getByLabelText("사용"));
    expect(lastProfile(view.dispatched)).toEqual({ ibl: { enabled: false, intensity: 1 } });
    cleanup();
    renderPanel({ shading: { ibl: { enabled: false, intensity: 1 } } });
    expect((screen.getByLabelText("세기") as HTMLInputElement).disabled).toBe(true);
  });

  it("툰 옵션(음영 단계·얼굴 SDF·외곽선·림)이 toon 객체 전체를 보낸다", () => {
    const view = renderPanel({ shading: { mode: "toon" } });
    fireEvent.change(screen.getByLabelText("음영 단계"), { target: { value: "4" } });
    expect(lastProfile(view.dispatched)).toEqual({ toon: { ...DEFAULT_SHADING.toon, rampSteps: 4 } });
    fireEvent.click(screen.getByLabelText("얼굴 SDF 그림자"));
    expect(lastProfile(view.dispatched)).toEqual({ toon: { ...DEFAULT_SHADING.toon, faceSdfShadow: false } });
    fireEvent.change(screen.getByLabelText("외곽선"), { target: { value: "edge" } });
    expect(lastProfile(view.dispatched)).toEqual({ toon: { ...DEFAULT_SHADING.toon, outline: "edge" } });
    fireEvent.click(screen.getByLabelText("림 라이트"));
    expect(lastProfile(view.dispatched)).toEqual({ toon: { ...DEFAULT_SHADING.toon, rim: false } });
    expect(view.dispatched).toHaveLength(4);
  });

  it("범위 밖·알 수 없는 select 값은 무시한다", () => {
    const view = renderPanel();
    fireEvent.change(screen.getByLabelText("톤맵"), { target: { value: "bogus" } });
    expect(view.dispatched).toEqual([]);
  });
});

describe("엔진 기능 상태·HUD", () => {
  const REPORT: SceneFeatureReport = createFeatureReport({
    cascadedShadows: featureActive("2048² CSM"),
    subsurfaceScattering: featureUnavailable("PrePassRenderer를 만들 수 없어 피부 SSS를 끕니다."),
    imageBasedLighting: featureActive("64² 절차 스카이"),
    taa: featureUnavailable("TAA는 texelFetch를 지원하는 WebGL2/WebGPU가 필요합니다."),
    ssao: featureOff(),
    gpuTimer: featureUnavailable("timestamp query 미지원"),
  });

  it("엔진이 보고한 기능 가용성을 한글 상태·사유와 함께 표로 보인다", () => {
    renderPanel({ engine: withReport(REPORT) });
    const table = screen.getByRole("table", { name: "엔진 기능 상태" });
    const row = (id: string): HTMLElement => {
      const element = table.querySelector(`tr[data-feature="${id}"]`);
      if (!(element instanceof HTMLElement)) throw new Error(`행 없음: ${id}`);
      return element;
    };
    expect(row("cascadedShadows").textContent).toContain("활성");
    expect(row("cascadedShadows").textContent).toContain("2048² CSM");
    expect(row("subsurfaceScattering").textContent).toContain("사용 불가");
    expect(row("subsurfaceScattering").textContent).toContain("PrePassRenderer");
    expect(row("ssao").getAttribute("data-status")).toBe("off");
    expect(table.querySelectorAll("tr")).toHaveLength(9);
  });

  it("후처리를 켰는데 엔진이 못 켜면 그 사유를 옆에 보인다(무음 생략 금지)", () => {
    renderPanel({ shading: { postfx: { ...DEFAULT_SHADING.postfx, taa: true } }, engine: withReport(REPORT) });
    expect(screen.getByText(/TAA: TAA는 texelFetch/u)).toBeTruthy();
    // 꺼 둔 SSAO·켜진 IBL(활성)은 사유 문구를 만들지 않는다
    expect(screen.queryByText(/SSAO:/u)).toBeNull();
  });

  it("엔진이 없으면 안내를, 보고 포트가 없는 엔진이면 그 사실을 적는다", () => {
    renderPanel({ status: { phase: "idle" }, engine: null });
    expect(screen.getByText(/엔진이 준비되면 기능 가용성이/u)).toBeTruthy();
    cleanup();
    renderPanel();
    expect(screen.getByText(/기능 가용성 보고를 제공하지 않습니다/u)).toBeTruthy();
  });

  it("HUD 수치 표를 보이고 주기마다 갱신한다(GPU 시간 없음 = 미지원)", () => {
    vi.useFakeTimers();
    let frameMs = 4;
    const engine = Object.assign(createMockEngine(), { readHud: () => ({ ...createMockEngine().readHud(), frameMs, frameMsP95: 7, drawCalls: 12 }) });
    renderPanel({ engine, pollIntervalMs: 100 });
    const table = screen.getByRole("table", { name: "HUD 수치" });
    const value = (key: string): string => table.querySelector(`tr[data-key="${key}"] td`)?.textContent ?? "";
    expect(value("frame")).toBe("4.0 ms");
    expect(value("gpu")).toBe("미지원");
    expect(value("draw")).toBe("12");
    frameMs = 11;
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(value("frame")).toBe("11.0 ms");
  });

  it("엔진 상태 읽기가 실패하면 사유를 보인다", () => {
    const engine = Object.assign(createMockEngine(), {
      readHud: () => {
        throw new Error("엔진이 이미 해제됐습니다");
      },
    });
    renderPanel({ engine });
    expect(screen.getByText("엔진이 이미 해제됐습니다")).toBeTruthy();
  });
});
