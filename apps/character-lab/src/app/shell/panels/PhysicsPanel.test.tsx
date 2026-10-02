// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PHYSICS_PROVIDER_LABELS_KO, SETTLE_DEFAULTS } from "../../../contracts";
import { createMockEngine, mockDiagnostics } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";

import { PhysicsPanel, describePhysicsStatus } from "./PhysicsPanel";

import type { FrameScheduler } from "./PhysicsPanel";
import type { LabCommand, PhysicsStatus } from "../../../contracts";

afterEach(cleanup);

function readySession() {
  const engine = createMockEngine();
  const session = createMockEngineSession({ phase: "ready", backend: "webgpu", diagnostics: mockDiagnostics("webgpu") });
  session.setEngine(engine);
  return { engine, session };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PhysicsPanel", () => {
  it("provider 라디오 3개를 보여주고 다른 provider 클릭은 physics/set-provider 1회를 dispatch한다", () => {
    const dispatched: LabCommand[] = [];
    render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <PhysicsPanel />
      </MockLabProvider>,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    const builtin = screen.getByRole("radio", { name: /내장 PBD/u }) as HTMLInputElement;
    expect(builtin.parentElement?.textContent).toContain(PHYSICS_PROVIDER_LABELS_KO["builtin-pbd"]);
    expect(builtin.checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Rapier/u }));
    expect(dispatched).toEqual([{ type: "physics/set-provider", provider: "rapier" }]);
    // 같은 provider 재클릭은 dispatch하지 않는다
    fireEvent.click(builtin);
    expect(dispatched).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toMatch(/상태 없음/u);
  });

  it("provider 상태(active·unavailable)를 사유와 함께 보여준다", () => {
    const active: PhysicsStatus = { id: "builtin-pbd", status: "active", deterministic: true, versionLabel: "toon-pbd 1.0" };
    const { unmount } = render(
      <MockLabProvider initialState={{ physics: active }}>
        <PhysicsPanel />
      </MockLabProvider>,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("toon-pbd 1.0");
    expect(status.textContent).toContain("결정적");
    expect(status.getAttribute("data-tone")).toBe("ok");
    unmount();
    const unavailable: PhysicsStatus = { id: "havok", status: "unavailable", reasonKo: "@babylonjs/havok 패키지가 설치되어 있지 않습니다." };
    render(
      <MockLabProvider initialState={{ physics: unavailable }}>
        <PhysicsPanel />
      </MockLabProvider>,
    );
    expect(screen.getByRole("status").textContent).toContain("@babylonjs/havok 패키지가 설치되어 있지 않습니다.");
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("error");
    expect(screen.getByText(/자동 대체 없음/u)).toBeTruthy();
    expect(describePhysicsStatus(null).tone).toBe("busy");
  });

  it("엔진이 없으면 정착·미리보기 버튼이 비활성이고 사유를 보여준다", () => {
    render(
      <MockLabProvider>
        <PhysicsPanel />
      </MockLabProvider>,
    );
    expect((screen.getByRole("button", { name: "정착 실행" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "미리보기 재생" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/엔진이 준비되면/u)).toBeTruthy();
  });

  it("정착 실행은 engine.settle(스텝)을 호출하고 영수증을 보여준다", async () => {
    const { engine, session } = readySession();
    render(
      <MockLabProvider engineSession={session} initialState={{ engine: session.status() }}>
        <PhysicsPanel />
      </MockLabProvider>,
    );
    const stepsInput = screen.getByLabelText(/정착 스텝/u) as HTMLInputElement;
    expect(Number(stepsInput.value)).toBe(SETTLE_DEFAULTS.defaultSteps);
    fireEvent.change(stepsInput, { target: { value: "900" } });
    expect(Number(stepsInput.value)).toBe(SETTLE_DEFAULTS.maxSteps);
    fireEvent.change(stepsInput, { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "정착 실행" }));
    await flush();
    expect(engine.calls.filter((call) => call.method === "settle")).toEqual([{ method: "settle", args: [60] }]);
    expect(screen.getByTestId("settle-receipt").textContent).toMatch(/정착 완료 · 60 스텝/u);
  });

  it("미리보기 재생은 프레임마다 engine.settle(1)을 호출하고 정지하면 스케줄러를 해제한다", async () => {
    const { engine, session } = readySession();
    let tick: (() => void) | null = null;
    let stopped = 0;
    const schedule: FrameScheduler = (callback) => {
      tick = callback;
      return () => {
        stopped += 1;
      };
    };
    render(
      <MockLabProvider engineSession={session} initialState={{ engine: session.status() }}>
        <PhysicsPanel schedule={schedule} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "미리보기 재생" }));
    expect(tick).not.toBeNull();
    await act(async () => {
      (tick as unknown as () => void)();
      await Promise.resolve();
    });
    await flush();
    expect(engine.calls.filter((call) => call.method === "settle")).toEqual([{ method: "settle", args: [1] }]);
    expect(screen.getByText(/재생 중 · 1 스텝/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "미리보기 정지" }));
    expect(stopped).toBe(1);
    expect(screen.getByRole("button", { name: "미리보기 재생" })).toBeTruthy();
  });
});
