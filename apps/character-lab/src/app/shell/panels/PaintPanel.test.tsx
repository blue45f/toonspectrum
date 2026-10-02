// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { INITIAL_HISTORY } from "../../../contracts";
import { createPaintSession } from "../../../paint/paint-session";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";

import { PaintPanel } from "./PaintPanel";

import type { LabCommand } from "../../../contracts";

afterEach(cleanup);

describe("PaintPanel", () => {
  it("슬라이더·색·부위 선택이 페인트 세션에 반영된다", () => {
    const session = createPaintSession({ layerSize: 64 });
    render(
      <MockLabProvider>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("크기(px)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("불투명도"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("경도"), { target: { value: "0.25" } });
    fireEvent.change(screen.getByLabelText("색"), { target: { value: "#00ff00" } });
    fireEvent.change(screen.getByLabelText("레이어(부위)"), { target: { value: "hair" } });
    fireEvent.click(screen.getByLabelText("UV 경계 감싸기"));
    const state = session.getState();
    expect(state.brush).toMatchObject({ radiusPx: 40, opacity: 0.5, hardness: 0.25, color: "#00ff00" });
    expect(state.activePart).toBe("hair");
    expect(state.wrap).toBe(false);
    expect(screen.getByText(/헤어 레이어 \(아직 없음\)/u)).toBeTruthy();
    // <output>도 암묵적 role="status"라 getByRole("status")는 다중 매치가 되므로 텍스트로 찾는다.
    expect(screen.getByText(/엔진이 준비되지 않아/u)).toBeTruthy();
  });

  it("되돌리기는 history/undo를 1회 dispatch하고 canUndo가 false면 비활성이다", () => {
    const dispatched: LabCommand[] = [];
    const { unmount } = render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={createPaintSession()} />
      </MockLabProvider>,
    );
    const undo = screen.getByRole("button", { name: "되돌리기" });
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    unmount();

    render(
      <MockLabProvider initialState={{ history: { ...INITIAL_HISTORY, canUndo: true, depth: 1 } }} dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={createPaintSession()} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(dispatched).toEqual([{ type: "history/undo" }]);
  });

  it("레이어 비우기는 undo 토큰을 paint/stroke로 dispatch한다", () => {
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    session.endStroke();
    render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    expect(screen.getByText(/피부 레이어 64×64 · 개정 1/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.type).toBe("paint/stroke");
    expect(dispatched[0]?.type === "paint/stroke" && dispatched[0].undoToken.tiles.length).toBe(1);
    expect(session.layer("skin").rgba.every((b) => b === 0)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(dispatched).toHaveLength(1);
  });

  it("레이어 비우기는 비워진 레이어를 엔진 페인트 텍스처에도 올린다(뷰포트·PNG 내보내기에 이전 칠이 남지 않는다)", () => {
    const engine = createMockEngine();
    const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
    engineSession.setEngine(engine);
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    session.endStroke();
    // 스트로크 경로(ViewportPane 드라이버)가 올린 칠을 흉내 낸다
    engine.updatePaintTexture(session.layer("skin"));
    expect(engine.paintUploads).toHaveLength(1);
    expect(engine.paintUploads[0]?.rgba.some((byte) => byte !== 0)).toBe(true);
    render(
      <MockLabProvider engineSession={engineSession} dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(dispatched.map((command) => command.type)).toEqual(["paint/stroke"]);
    // 비운 뒤 엔진에 올라간 레이어는 투명이다(업로드가 없으면 엔진 텍스처는 이전 칠을 그대로 보인다)
    expect(engine.paintUploads).toHaveLength(2);
    const uploaded = engine.paintUploads[1];
    expect(uploaded?.part).toBe("skin");
    expect(uploaded?.rgba.every((byte) => byte === 0)).toBe(true);
    // 이미 빈 레이어를 다시 비우면 토큰도 업로드도 없다
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(engine.paintUploads).toHaveLength(2);
  });

  it("엔진이 없어도 레이어 비우기는 세션·history만 갱신하고 던지지 않는다", () => {
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    session.endStroke();
    render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(dispatched.map((command) => command.type)).toEqual(["paint/stroke"]);
    expect(session.layer("skin").rgba.every((byte) => byte === 0)).toBe(true);
  });
});
