// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTaskFrame } from "./WorkspaceTaskFrame";
import { workspaceTaskRoute } from "./workspace-task-route";

vi.mock("@/shared/components/open-search-button", () => ({ OpenSearchButton: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button> }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: null, ready: true }) }));
afterEach(cleanup);
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
    expect(screen.getAllByRole("navigation", { name: "주 메뉴" })).toHaveLength(1);
    result.rerender(view(false));
    expect(screen.queryByRole("navigation", { name: "주 메뉴" })).toBeNull();
    expect(screen.getByRole("textbox")).toHaveProperty("value", "unsaved stroke");
    expect(mount).toHaveBeenCalledTimes(1);
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
