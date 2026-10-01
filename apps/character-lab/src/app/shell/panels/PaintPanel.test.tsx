// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { INITIAL_HISTORY } from "../../../contracts";
import { createPaintSession } from "../../../paint/paint-session";
import { MockLabProvider } from "../../../testing/mock-store";

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
});
