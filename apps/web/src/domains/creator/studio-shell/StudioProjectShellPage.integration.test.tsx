// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioProjectShellPage } from "./StudioProjectShellPage";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderReview(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route
          path="/studio/p/:projectId/review"
          element={<StudioProjectShellPage section="review" />}
        />
      </Routes>
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

    const target = screen.getByRole("link", { name: /버전·비교 화면 열기|Open versions and comparison/u });
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
});
