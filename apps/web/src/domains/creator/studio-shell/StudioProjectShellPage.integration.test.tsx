// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampusObjectPublisherContext, type CampusObjectPublisher } from "@/shared/components/spatial-campus/campus-object-context";
import { createStudioProject } from "../studio-project-library-store";
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

    fireEvent.click(screen.getByText(/다른 작업 3개|3 more actions/u));
    const target = screen.getByRole("link", { name: /버전 비교|Version comparison/u });
    expect(target.getAttribute("href")).toBe("/studio/work/project-1/versions");
  });

  it("keeps the default hierarchy focused on five stages and one next action", () => {
    const view = renderReview("/studio/p/project-1/review?view=inbox");
    const primarySections = view.container.querySelectorAll(
      "[data-studio-project-primary-section]",
    );

    expect(primarySections).toHaveLength(5);
    expect(Array.from(primarySections, (item) => item.textContent)).toEqual([
      "홈",
      "기획",
      "제작",
      "검토",
      "배포",
    ]);
    expect(view.container.querySelectorAll("[data-studio-project-primary-action]")).toHaveLength(1);
    expect((view.container.querySelector(
      "[data-studio-project-secondary-navigation]",
    ) as HTMLDetailsElement).open).toBe(false);
    expect((view.container.querySelector(
      "[data-studio-project-view-picker]",
    ) as HTMLDetailsElement).open).toBe(false);
    expect((view.container.querySelector(
      "[data-studio-project-more-actions]",
    ) as HTMLDetailsElement).open).toBe(false);
    expect((view.container.querySelector(
      "[data-studio-project-health]",
    ) as HTMLDetailsElement).open).toBe(false);
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

  it("shows the project title in the breadcrumb between My work and the section", () => {
    createStudioProject(window.localStorage, { id: "project-1", title: "나의 웹툰", kind: "webtoon" });
    renderReview("/studio/p/project-1/review?view=inbox");

    const breadcrumb = screen.getByRole("navigation", { name: "현재 위치" });
    expect(breadcrumb.textContent).toContain("내 작업");
    const titleLink = within(breadcrumb).getByRole("link", { name: "나의 웹툰" });
    expect(titleLink.getAttribute("href")).toBe("/studio/p/project-1/overview");
    expect(within(breadcrumb).getByText("검토").getAttribute("aria-current")).toBe("page");
  });

  it("offers a two-click switch to another recent project in the same section", () => {
    createStudioProject(window.localStorage, { id: "project-1", title: "나의 웹툰", kind: "webtoon" });
    createStudioProject(window.localStorage, { id: "project-2", title: "다음 회차", kind: "webtoon" });
    renderReview("/studio/p/project-1/review?view=inbox");

    const switcher = document.querySelector('[data-studio-project-switcher="true"]');
    expect(switcher).toBeTruthy();
    fireEvent.click(within(switcher as HTMLElement).getByText("프로젝트 전환"));
    const target = within(switcher as HTMLElement).getByRole("link", { name: "다음 회차" });
    expect(target.getAttribute("href")).toBe("/studio/p/project-2/review");
  });

  it("hides the project switcher when there is no other active project", () => {
    renderReview("/studio/p/project-1/review?view=inbox");
    expect(document.querySelector('[data-studio-project-switcher="true"]')).toBeNull();
  });
});
