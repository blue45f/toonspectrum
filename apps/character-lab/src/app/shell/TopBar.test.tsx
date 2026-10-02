// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SHADING, QUALITY_PRESETS, applyQualityPreset, createDefaultRecipe } from "../../contracts";
import { mockDiagnostics } from "../../testing/mock-engine";
import { createMockEngineSession, createMockLabStore, MockLabProvider } from "../../testing/mock-store";

import { detectQualityPreset, TopBar } from "./TopBar";
import { createViewportRegistry } from "./viewport-registry";

afterEach(cleanup);

describe("app/shell/TopBar", () => {
  it("엔진 버튼은 등록된 캔버스로 명시 선택하고, 캔버스가 없으면 failure 이벤트를 낸다", () => {
    const store = createMockLabStore();
    const session = createMockEngineSession();
    const viewport = createViewportRegistry();
    render(
      <MockLabProvider store={store} engineSession={session} shell={{ viewport }}>
        <TopBar />
      </MockLabProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "ToonStudio Character Lab" })).toBeTruthy();
    expect(screen.getByText("실험 앱 · 배포 대상 아님")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("엔진 미선택");
    fireEvent.click(screen.getByRole("button", { name: "WebGPU" }));
    expect(session.selected).toEqual([]);
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["viewport-canvas-missing"]);
    const canvas = document.createElement("canvas");
    viewport.register(canvas);
    fireEvent.click(screen.getByRole("button", { name: "WebGL2" }));
    expect(session.selected).toEqual(["webgl2"]);
  });

  it("상태 배지·Undo/Redo·셰이딩·품질 프리셋이 상태를 반영하고 명령을 보낸다", () => {
    const store = createMockLabStore({ history: { canUndo: true, canRedo: false, depth: 3, revision: 3 } });
    render(
      <MockLabProvider store={store}>
        <TopBar />
      </MockLabProvider>,
    );
    const undo = screen.getByRole("button", { name: "실행 취소" });
    const redo = screen.getByRole("button", { name: "다시 실행" });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    expect((redo as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(undo);
    fireEvent.click(screen.getByRole("button", { name: "PBR 셰이딩" }));
    fireEvent.change(screen.getByRole("combobox", { name: "품질" }), { target: { value: "hero" } });
    expect(store.dispatched).toEqual([
      { type: "history/undo" },
      { type: "shading/set", profile: { mode: "toon" } },
      { type: "shading/set", profile: applyQualityPreset(createDefaultRecipe().shading, "hero") },
    ]);
    // 스토어 이벤트는 React 밖에서 오므로 act로 감싸 리렌더를 확정한다
    act(() => {
      store.applyEvent({ type: "engine/status", status: { phase: "ready", backend: "webgpu", diagnostics: mockDiagnostics("webgpu") } });
    });
    expect(screen.getByRole("status").textContent).toContain("backend webgpu");
    expect((screen.getByRole("button", { name: "WebGPU" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    act(() => {
      store.applyEvent({ type: "engine/status", status: { phase: "initializing", backend: "webgl2" } });
    });
    expect((screen.getByRole("button", { name: "WebGL2" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Ctrl+Z / Ctrl+Shift+Z는 가능할 때만 undo/redo를 보내고 입력 요소 안에서는 무시한다", () => {
    const store = createMockLabStore({ history: { canUndo: true, canRedo: true, depth: 1, revision: 1 } });
    render(
      <MockLabProvider store={store}>
        <TopBar />
        <input aria-label="입력" />
      </MockLabProvider>,
    );
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText("입력"), { key: "z", ctrlKey: true });
    expect(store.dispatched).toEqual([{ type: "history/undo" }, { type: "history/redo" }]);
    act(() => {
      store.setState({ history: { canUndo: false, canRedo: false, depth: 0, revision: 2 } });
    });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store.dispatched).toHaveLength(2);
  });

  it("detectQualityPreset는 shadows/postfx/ibl만 비교한다", () => {
    expect(detectQualityPreset(DEFAULT_SHADING)).toBe("standard");
    expect(detectQualityPreset({ ...QUALITY_PRESETS.hero, mode: "toon" })).toBe("hero");
    expect(detectQualityPreset({ ...DEFAULT_SHADING, ibl: { enabled: true, intensity: 2.5 } })).toBeNull();
  });
});
