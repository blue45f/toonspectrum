// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchPage } from "./SearchPage";

vi.mock("@/shared/components/search-explorer", async () => {
  const { useState } = await import("react");
  return {
    SearchExplorer: function Explorer({ initialQuery, initialFree }: { initialQuery: string; initialFree: boolean }) {
      const [query, setQuery] = useState(initialQuery);
      return <><input aria-label="explorer query" value={query} onChange={(event) => setQuery(event.target.value)} /><output aria-label="free filter">{String(initialFree)}</output></>;
    },
  };
});
vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "en" }),
  useT: () => (key: string) => key,
}));

afterEach(cleanup);

function Navigation({ destination }: { destination: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(destination)}>Navigate</button>;
}

function mount(destination: string) {
  render(<MemoryRouter initialEntries={["/search?q=first"]}><SearchPage /><Navigation destination={destination} /></MemoryRouter>);
}

describe("search URL transitions", () => {
  it("replaces the explorer state when a new query arrives on the same route", () => {
    mount("/search?q=second&free=1");
    fireEvent.change(screen.getByLabelText("explorer query"), { target: { value: "locally typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
    expect((screen.getByLabelText("explorer query") as HTMLInputElement).value).toBe("second");
    expect(screen.getByLabelText("free filter").textContent).toBe("true");
  });

  it("does not discard local edits for an unrelated tracking parameter", () => {
    mount("/search?q=first&utm_source=test");
    fireEvent.change(screen.getByLabelText("explorer query"), { target: { value: "locally typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
    expect((screen.getByLabelText("explorer query") as HTMLInputElement).value).toBe("locally typed");
  });

  it("keeps a native fragment link and a focusable filter destination", () => {
    mount("/search?q=first");
    const link = screen.getByRole("link", { name: "search.filterButton" });
    expect(link.getAttribute("href")).toBe("#toonspectrum-search-explorer-top");
    expect(document.getElementById("toonspectrum-search-explorer-top")?.getAttribute("tabindex")).toBe("-1");
  });
});
