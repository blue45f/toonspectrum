// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInspectorDrawColorControls } from "./StudioInspectorUtilityPanels";
import { createStudioUiPreferencesRepository } from "./studio-ui-preferences-sqlite";
import { useStudioRecentColors } from "./useStudioRecentColors";

afterEach(cleanup);

describe("Inspector color history lifecycle", () => {
  function fixture() {
    const values = new Map([["recent-colors", '["#445566"]']]);
    const repository = createStudioUiPreferencesRepository({
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value); },
      delete: async (key) => { values.delete(key); },
    });
    const acquireRepository = async () => repository;
    const unavailable = vi.fn();
    function Editor() {
      const owner = useStudioRecentColors({ acquireRepository, onPersistenceUnavailable: unavailable });
      const [color, setColor] = useState("#123456");
      return <>
        <button onClick={() => { owner.rememberColor("#abcdef"); setColor("#abcdef"); }}>색상 선택기에서 변경</button>
        <StudioInspectorDrawColorControls {...owner}
          color={color} eyedropperActive={false}
          onColorChange={setColor}
          onEyedropperToggle={vi.fn()} />
      </>;
    }
    return { values, repository, unavailable, render: () => render(<Editor />) };
  }

  it("retains a registered painting color after closing and reopening its actual palette and owner", async () => {
    const f = fixture(); const view = f.render();
    const toggle = screen.getByRole("button", { name: "히스토리 (CSP)" });
    fireEvent.click(toggle);
    await screen.findByRole("button", { name: "#445566 색상 선택" });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(screen.getByRole("button", { name: "#123456 색상 선택" })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText("컬러 히스토리 (Color History)")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "#123456 색상 선택" })).toBeTruthy();
    await waitFor(() => expect(f.values.get("recent-colors")).toBe('["#123456","#445566"]'));
    view.unmount(); f.render();
    fireEvent.click(screen.getByRole("button", { name: "히스토리 (CSP)" }));
    await screen.findByRole("button", { name: "#123456 색상 선택" });
    expect(f.unavailable).not.toHaveBeenCalled();
  });

  it("automatically remembers an actual Inspector color input before the history palette first opens", async () => {
    const f = fixture(); f.render();
    fireEvent.change(screen.getByLabelText("사용자 정의 색상 선택"), { target: { value: "#765432" } });
    await waitFor(() => expect(f.values.get("recent-colors")).toBe('["#765432","#445566"]'));
    fireEvent.click(screen.getByRole("button", { name: "히스토리 (CSP)" }));
    expect(screen.getByRole("button", { name: "#765432 색상 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "#445566 색상 선택" })).toBeTruthy();
  });

  it("shows shared recent-color updates while open and after another palette returns", async () => {
    const f = fixture(); f.render();
    const toggle = screen.getByRole("button", { name: "히스토리 (CSP)" });
    fireEvent.click(toggle);
    await screen.findByRole("button", { name: "#445566 색상 선택" });
    fireEvent.click(screen.getByRole("button", { name: "색상 선택기에서 변경" }));
    expect(screen.getByRole("button", { name: "#abcdef 색상 선택" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "근사색 (CSP)" }));
    expect(screen.queryByText("컬러 히스토리 (Color History)")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "#abcdef 색상 선택" })).toBeTruthy();
    await waitFor(() => expect(f.values.get("recent-colors")).toBe('["#abcdef","#445566"]'));
  });

  it("persists clear across palette and owner remount, then remembers only a new selected color", async () => {
    const f = fixture(); const view = f.render();
    const toggle = screen.getByRole("button", { name: "히스토리 (CSP)" });
    fireEvent.click(toggle);
    await screen.findByRole("button", { name: "#445566 색상 선택" });
    fireEvent.click(screen.getByRole("button", { name: "히스토리 전체 지우기" }));
    expect(screen.getByText("기록된 색상이 없습니다.")).toBeTruthy();
    fireEvent.click(toggle); fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: "#445566 색상 선택" })).toBeNull();
    await waitFor(() => expect(f.values.get("recent-colors")).toBe("[]"));
    view.unmount(); f.render();
    fireEvent.click(screen.getByRole("button", { name: "히스토리 (CSP)" }));
    await act(async () => { await f.repository.loadRecentColors(); });
    expect(screen.queryByRole("button", { name: "#445566 색상 선택" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "색상 선택기에서 변경" }));
    await waitFor(() => expect(f.values.get("recent-colors")).toBe('["#abcdef"]'));
  });
});
