// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReferencePage } from "./ReferencePage";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

function mountPendingSearchDraft() {
  render(<MemoryRouter initialEntries={["/references"]}><ReferencePage /></MemoryRouter>);
  const input = screen.getByRole("searchbox") as HTMLInputElement;
  const field = screen.getByRole("combobox") as HTMLSelectElement;
  fireEvent.change(input, { target: { value: "아직 확정되지 않은 검색" } });
  fireEvent.change(field, { target: { value: "publisher" } });
  return { input, field };
}

function restoreBrowserLocation(search: string) {
  act(() => {
    // The router's committed location stays unchanged while Back cancels a pending transition.
    // The already mounted form must read the popped browser URL rather than stale router props.
    window.history.replaceState(null, "", `/references${search}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

describe("reference search draft during browser history cancellation", () => {
  it("restores the previous query and field without remounting the pending form", () => {
    const { input, field } = mountPendingSearchDraft();
    restoreBrowserLocation("?field=writer&q=%EC%9D%B4%EC%A0%84%20%EA%B2%80%EC%83%89");
    expect(screen.getByRole("searchbox")).toBe(input);
    expect(input.value).toBe("이전 검색");
    expect(field.value).toBe("writer");
  });

  it.each(["", "?field=unknown", "?field="])("restores a blank title search for %s", (search) => {
    const { input, field } = mountPendingSearchDraft();
    restoreBrowserLocation(search);
    expect(input.value).toBe("");
    expect(field.value).toBe("title");
  });

  it("removes its popstate listener on unmount", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    mountPendingSearchDraft();
    const listener = add.mock.calls.find(([event]) => String(event) === "popstate")?.[1];
    expect(listener).toBeTypeOf("function");
    cleanup();
    expect(remove).toHaveBeenCalledWith("popstate", listener);
  });
});
