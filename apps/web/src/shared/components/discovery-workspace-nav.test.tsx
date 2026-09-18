// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { DiscoveryWorkspaceNav } from "./discovery-workspace-nav";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
}));

describe("DiscoveryWorkspaceNav", () => {
  it("marks the current mode and carries only relevant discovery state", () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/search?q=hero&genres=%ED%8C%90%ED%83%80%EC%A7%80&taste=%EC%95%A1%EC%85%98&seed=work-1&view=list",
        ]}
      >
        <Routes>
          <Route
            path="/search"
            element={<DiscoveryWorkspaceNav current="search" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const search = screen.getByRole("link", { name: /바로 찾기/ });
    const explore = screen.getByRole("link", { name: /조건으로 둘러보기/ });
    const recommend = screen.getByRole("link", { name: /취향 추천/ });

    expect(search.getAttribute("aria-current")).toBe("page");
    expect(explore.getAttribute("href")).toContain("genres=");
    expect(explore.getAttribute("href")).not.toContain("q=hero");
    expect(recommend.getAttribute("href")).toContain("taste=");
    expect(recommend.getAttribute("href")).toContain("seed=work-1");
    expect(recommend.getAttribute("href")).not.toContain("view=list");
  });
});
