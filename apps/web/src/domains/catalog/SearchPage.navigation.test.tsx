// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchPage } from "./SearchPage";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "en" }),
  useT: () => (key: string) => key,
}));
vi.mock("@/shared/components/search-explorer", async () => {
  const { useState } = await import("react");
  return {
    SearchExplorer: function StatefulExplorer({ initialQuery }: { initialQuery: string }) {
      const [query, setQuery] = useState(initialQuery);
      return <input aria-label="Explorer query" value={query} onChange={(event) => setQuery(event.target.value)} />;
    },
  };
});

function NavigationHarness() {
  const navigate = useNavigate();
  return <>
    <button type="button" onClick={() => { void navigate("/search?q=second"); }}>Next query</button>
    <button type="button" onClick={() => { void navigate("/search?q=first&utm_source=link"); }}>Tracking only</button>
    <button type="button" onClick={() => { void navigate(-1); }}>Back</button>
    <SearchPage />
  </>;
}
afterEach(cleanup);

describe("search page URL identity", () => {
  it("replaces the prior query on same-page navigation and restores it on Back", () => {
    render(<MemoryRouter initialEntries={["/search?q=first"]}><NavigationHarness /></MemoryRouter>);
    expect((screen.getByRole("textbox", { name: "Explorer query" }) as HTMLInputElement).value).toBe("first");
    fireEvent.click(screen.getByRole("button", { name: "Next query" }));
    expect((screen.getByRole("textbox", { name: "Explorer query" }) as HTMLInputElement).value).toBe("second");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByRole("textbox", { name: "Explorer query" }) as HTMLInputElement).value).toBe("first");
  });
  it("does not erase an in-progress query when only tracking parameters change", () => {
    render(<MemoryRouter initialEntries={["/search?q=first"]}><NavigationHarness /></MemoryRouter>);
    const input = screen.getByRole("textbox", { name: "Explorer query" });
    fireEvent.change(input, { target: { value: "in progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Tracking only" }));
    expect((screen.getByRole("textbox", { name: "Explorer query" }) as HTMLInputElement).value).toBe("in progress");
  });
});
