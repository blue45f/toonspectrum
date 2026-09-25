// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTaskFrame } from "./WorkspaceTaskFrame";
import { workspaceTaskRoute } from "./workspace-task-route";

vi.mock("@/shared/components/open-search-button", () => ({ OpenSearchButton: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button> }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ data: null, ready: true }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("common task frame", () => {
  it("does not remount or lose the router child when chrome changes", () => {
    const mount = vi.fn();
    function Document() { const [value, setValue] = useState("draft"); useEffect(() => { mount(); }, []);
      return <input aria-label="local document" value={value} onChange={(event) => setValue(event.target.value)} />; }
    const view = (enabled: boolean) => <MemoryRouter><WorkspaceTaskFrame route={enabled ? workspaceTaskRoute("/studio/new") : null}><Document /></WorkspaceTaskFrame></MemoryRouter>;
    const result = render(view(false));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsaved stroke" } });
    result.rerender(view(true));
    expect(screen.getByRole("textbox")).toHaveProperty("value", "unsaved stroke");
    expect(mount).toHaveBeenCalledTimes(1);
    expect(result.container.querySelector('[data-workspace-surface="focused"]')).toBeTruthy();
    expect(result.container.querySelector(".workspace-focused-topbar")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "주 메뉴" })).toBeNull();
    result.rerender(view(false));
    expect(result.container.querySelector(".workspace-focused-topbar")).toBeNull();
    expect(screen.getByRole("textbox")).toHaveProperty("value", "unsaved stroke");
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("keeps the full workspace navigation for library-style task pages", () => {
    const result = render(
      <MemoryRouter initialEntries={["/studio/assets"]}>
        <WorkspaceTaskFrame route={workspaceTaskRoute("/studio/assets")}>
          <div>Assets</div>
        </WorkspaceTaskFrame>
      </MemoryRouter>,
    );

    expect(result.container.querySelector('[data-workspace-surface="task"]')).toBeTruthy();
    expect(screen.getAllByRole("navigation", { name: "주 메뉴" })).toHaveLength(1);
  });
});

describe("task scroll ownership", () => {
  it("resets only its task scroller on a different path and preserves query-only filtering", () => {
    function Harness() {
      const navigate = useNavigate(), location = useLocation();
      return <WorkspaceTaskFrame route={workspaceTaskRoute(location.pathname, location.search)}>
        <button type="button" onClick={() => navigate('/studio/assets?view=library')}>Filter</button>
        <button type="button" onClick={() => navigate('/studio/new')}>New task</button>
      </WorkspaceTaskFrame>;
    }
    const result = render(<MemoryRouter initialEntries={['/studio/assets']}><Harness /></MemoryRouter>);
    const pane = result.container.querySelector('.workspace-task-content') as HTMLDivElement;
    pane.scrollTop = 420; pane.scrollLeft = 25;
    fireEvent.click(screen.getByRole('button', {name: 'Filter'}));
    expect(pane.scrollTop).toBe(420);
    fireEvent.click(screen.getByRole('button', {name: 'New task'}));
    expect(pane.scrollTop).toBe(0);
    expect(pane.scrollLeft).toBe(0);
    expect(result.container.querySelector('.workspace-task-content')).toBe(pane);
  });
});

describe("task history restoration", () => {
  it("restores the nested desktop scroller on browser back without remounting the route child", () => {
    function Harness() {
      const navigate = useNavigate(), location = useLocation();
      return <WorkspaceTaskFrame route={workspaceTaskRoute(location.pathname, location.search)}>
        <output data-testid="path">{location.pathname}</output>
        <button type="button" onClick={() => navigate("/market")}>Market</button>
        <button type="button" onClick={() => navigate(-1)}>Back</button>
      </WorkspaceTaskFrame>;
    }
    const result = render(<MemoryRouter initialEntries={["/studio/assets"]}><Harness /></MemoryRouter>);
    const pane = result.container.querySelector(".workspace-task-content") as HTMLDivElement;
    Object.defineProperty(pane, "scrollHeight", { configurable: true, value: 1600 });
    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 500 });
    pane.scrollTop = 430;
    fireEvent.scroll(pane);
    fireEvent.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.getByTestId("path").textContent).toBe("/market");
    expect(pane.scrollTop).toBe(0);
    pane.scrollTop = 90;
    fireEvent.scroll(pane);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("path").textContent).toBe("/studio/assets");
    expect(pane.scrollTop).toBe(430);
  });
});

describe("task shell lifetime restoration", () => {
  it("restores the nested scroller after an unframed route unmounts the whole task shell", async () => {
    let resize: (() => void) | undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    function Harness() {
      const navigate = useNavigate(), location = useLocation();
      if (location.pathname === "/hub") {
        return <button type="button" onClick={() => navigate(-1)}>Back to task</button>;
      }
      return <WorkspaceTaskFrame route={workspaceTaskRoute(location.pathname, location.search)}>
        <button type="button" onClick={() => navigate("/hub")}>Leave task shell</button>
      </WorkspaceTaskFrame>;
    }
    const result = render(
      <MemoryRouter initialEntries={[{ pathname: "/studio/assets", key: "shell-lifetime" }]}>
        <Harness />
      </MemoryRouter>,
    );
    const pane = result.container.querySelector(".workspace-task-content") as HTMLDivElement;
    Object.defineProperty(pane, "scrollHeight", { configurable: true, value: 1800 });
    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 500 });
    pane.scrollTop = 520;
    fireEvent.scroll(pane);
    // Simulate the browser clamping a collapsing route subtree before React cleanup.
    pane.scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: "Leave task shell" }));
    expect(result.container.querySelector(".workspace-task-content")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to task" }));
    const restored = result.container.querySelector(".workspace-task-content") as HTMLDivElement;
    Object.defineProperty(restored, "scrollHeight", { configurable: true, value: 1800 });
    Object.defineProperty(restored, "clientHeight", { configurable: true, value: 500 });
    act(() => resize?.());

    await waitFor(() => expect(restored.scrollTop).toBe(520));
  });
});
