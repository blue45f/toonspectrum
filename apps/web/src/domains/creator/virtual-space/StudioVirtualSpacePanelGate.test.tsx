// @vitest-environment jsdom
import { lazy, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpacePanelGate } from "./StudioVirtualSpacePanelGate";
import { studioVirtualWorkspacePanelForScope } from "./studio-virtual-space-panel-scope";

afterEach(cleanup);

describe("가상 공간 패널 지연 로드", () => {
  it("초안 패널은 최초 개방 전에는 마운트하지 않고 탭 전환 중에는 입력을 보존한다", () => {
    const mounted = vi.fn();
    function Draft() {
      const [value, setValue] = useState(() => { mounted(); return ""; });
      return <input aria-label="저장 전 이름" value={value} onChange={(event) => setValue(event.currentTarget.value)} />;
    }
    const view = render(<StudioVirtualSpacePanelGate active={false} preserveAfterOpen><Draft /></StudioVirtualSpacePanelGate>);
    expect(mounted).not.toHaveBeenCalled();
    view.rerender(<StudioVirtualSpacePanelGate active preserveAfterOpen><Draft /></StudioVirtualSpacePanelGate>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "새 닉네임 초안" } });
    view.rerender(<StudioVirtualSpacePanelGate active={false} preserveAfterOpen><Draft /></StudioVirtualSpacePanelGate>);
    expect(screen.queryByRole("textbox")).toBeNull();
    view.rerender(<StudioVirtualSpacePanelGate active preserveAfterOpen><Draft /></StudioVirtualSpacePanelGate>);
    expect(screen.getByDisplayValue("새 닉네임 초안")).toBeTruthy();
    expect(mounted).toHaveBeenCalledTimes(1);
  });
  it("닫힌 패널은 모듈을 가져오지 않고 열었을 때만 로딩 상태와 내용을 표시한다", async () => {
    let resolve: ((value: { default: () => React.JSX.Element }) => void) | undefined;
    const load = vi.fn(() => new Promise<{ default: () => React.JSX.Element }>((done) => { resolve = done; }));
    const Panel = lazy(load);
    const view = render(<StudioVirtualSpacePanelGate active={false}><Panel /></StudioVirtualSpacePanelGate>);
    expect(load).not.toHaveBeenCalled();
    view.rerender(<StudioVirtualSpacePanelGate active><Panel /></StudioVirtualSpacePanelGate>);
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("패널 불러오는 중…");
    resolve?.({ default: () => <button type="button">공간 설정 준비됨</button> });
    expect(await screen.findByRole("button", { name: "공간 설정 준비됨" })).toBeTruthy();
    view.rerender(<StudioVirtualSpacePanelGate active={false}><Panel /></StudioVirtualSpacePanelGate>);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("개인 공간의 프로젝트 패널 진입을 차단하고 프로젝트 모드의 도구는 유지한다", () => {
    for (const panel of ["team", "work", "sessions", "board", "annotation", "rtc", "today"] as const) {
      expect(studioVirtualWorkspacePanelForScope(panel, true)).toBeNull();
      expect(studioVirtualWorkspacePanelForScope(panel, false)).toBe(panel);
    }
    for (const panel of ["space", "people", "search", "town", null] as const) {
      expect(studioVirtualWorkspacePanelForScope(panel, true)).toBe(panel);
    }
  });
});
