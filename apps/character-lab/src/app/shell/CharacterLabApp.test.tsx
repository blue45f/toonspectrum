// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { failVisible } from "../../contracts";
import { createMockRuntime } from "../../testing/mock-runtime";

import { CharacterLabApp } from "./CharacterLabApp";

afterEach(cleanup);

describe("CharacterLabApp", () => {
  it("엔진 미선택 상태에서는 렌더·factory 호출이 없고 셸 골격만 그린다", () => {
    const { runtime, factory, engine } = createMockRuntime();
    render(<CharacterLabApp runtime={runtime} />);
    expect(screen.getByRole("heading", { level: 1, name: "ToonStudio Character Lab" })).toBeTruthy();
    expect(screen.getByText("실험 앱 · 배포 대상 아님")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("엔진 미선택");
    expect(factory.calls).toHaveLength(0);
    expect(engine.calls).toHaveLength(0);
    expect(screen.getByRole("navigation", { name: "슬롯 레일(15칸)" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "인스펙터" })).toBeTruthy();
  });

  it("실패 배너에 reasonKo를 보여주고 Undo/Redo 활성 상태를 반영한다", () => {
    const { runtime, store } = createMockRuntime();
    render(<CharacterLabApp runtime={runtime} />);
    act(() => {
      store.applyEvent({ type: "failure", failure: failVisible("source-build-failed", "캐릭터 소스를 만들거나 올리지 못했습니다.", undefined, 1) });
    });
    expect(screen.getByText(/캐릭터 소스를 만들거나 올리지 못했습니다\. \[source-build-failed\]/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "실행 취소" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      store.setState({ history: { canUndo: true, canRedo: true, depth: 2, revision: 2 } });
    });
    expect((screen.getByRole("button", { name: "실행 취소" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "다시 실행" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(store.dispatched).toEqual([{ type: "history/undo" }]);
  });

  it("WebGPU 명시 선택 → 기본 캔버스로 엔진 생성 → ready 배지·플랜 적용", async () => {
    const { runtime, store, factory, engine } = createMockRuntime();
    render(<CharacterLabApp runtime={runtime} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "WebGPU" }));
      await runtime.applyLoop.flush();
      await runtime.thumbnails.idle();
    });
    expect(factory.calls).toHaveLength(1);
    expect(factory.calls[0]?.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(store.getState().engine.phase).toBe("ready");
    expect(screen.getByRole("status").textContent).toContain("backend webgpu");
    expect(engine.calls.map((call) => call.method)).toContain("applyPlan");
    expect(Object.keys(store.getState().thumbnails).length).toBeGreaterThan(0);
  });

  it("언마운트하면 루프 구독을 멈춘다", async () => {
    const { runtime, store, engine } = createMockRuntime();
    const view = render(<CharacterLabApp runtime={runtime} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "WebGL2" }));
      await runtime.applyLoop.flush();
    });
    const applied = engine.calls.filter((call) => call.method === "applyPlan").length;
    view.unmount();
    store.setState({ history: { ...store.getState().history, revision: 9 } });
    await runtime.applyLoop.flush();
    expect(engine.calls.filter((call) => call.method === "applyPlan")).toHaveLength(applied);
    runtime.dispose();
  });
});
