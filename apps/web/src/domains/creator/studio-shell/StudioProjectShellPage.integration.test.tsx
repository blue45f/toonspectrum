// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampusObjectPublisherContext, type CampusObjectPublisher } from "@/shared/components/spatial-campus/campus-object-context";
import { StudioProjectShellPage } from "./StudioProjectShellPage";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderReview(entry: string, publish: CampusObjectPublisher | null = null) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CampusObjectPublisherContext.Provider value={publish}>
        <LocationProbe />
        <Routes>
          <Route
            path="/studio/p/:projectId/review"
            element={<StudioProjectShellPage section="review" />}
          />
        </Routes>
      </CampusObjectPublisherContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectShellPage integration", () => {
  it("renders a selected project view and links to its real version owner", () => {
    const view = renderReview("/studio/p/project-1/review?view=versions");
    expect(view.container.querySelector("[data-studio-project-view=versions]")).toBeTruthy();

    const target = screen.getByRole("link", { name: /버전 비교|Version comparison/u });
    expect(target.getAttribute("href")).toBe("/studio/work/project-1/versions");
  });

  it("canonicalizes missing view state instead of leaving an inert query", async () => {
    renderReview("/studio/p/project-1/review?view=missing&focus=comment-1");
    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe(
        "/studio/p/project-1/review?focus=comment-1&view=inbox",
      );
    });
    expect(document.querySelector("[data-studio-project-view=inbox]")).toBeTruthy();
  });

  it("publishes only current private project and review references to the atelier boundary", async () => {
    const publish = vi.fn<CampusObjectPublisher>(() => () => undefined);
    renderReview("/studio/p/project-1/review?view=inbox", publish);
    await waitFor(() => expect(publish).toHaveBeenCalled());
    expect(publish.mock.calls[0]?.[1]).toEqual([
      {
        id: "project-1",
        title: "project-1",
        href: "/studio/p/project-1/overview",
        kind: "project",
        exposure: "private",
      },
      {
        id: "project-1.review",
        title: "project-1 · Review",
        href: "/studio/p/project-1/review",
        kind: "review",
        exposure: "private",
      },
    ]);
  });
});
