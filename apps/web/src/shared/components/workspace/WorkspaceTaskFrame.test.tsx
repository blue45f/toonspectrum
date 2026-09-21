// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTaskFrame } from "./WorkspaceTaskFrame";
import { workspaceTaskRoute } from "./workspace-task-route";

vi.mock("@/shared/components/open-search-button", () => ({ OpenSearchButton: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button> }));
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
