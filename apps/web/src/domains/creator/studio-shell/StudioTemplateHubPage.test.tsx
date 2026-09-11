// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import { readStudioProjectDocuments } from "../studio-project-document-store";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioTemplateHubPage } from "./StudioTemplateHubPage";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioTemplateHubPage", () => {
  it("filters templates by category and text without leaving the Studio shell", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/templates"]}>
        <StudioTemplateHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^발표 자료$|^Presentation$/u }));
    expect(await screen.findByText(/웹툰 작품 피칭|Webtoon series pitch/u)).toBeTruthy();
    expect(screen.queryByText(/세로 웹툰 표준|Vertical webtoon standard/u)).toBeNull();

    const search = screen.getByRole("textbox", { name: /템플릿 검색|Search templates/u });
    fireEvent.change(search, { target: { value: "production" } });
    expect(await screen.findByText(/제작 리뷰|Production review/u)).toBeTruthy();
  });

  it("creates the selected template as a project and opens its canonical document route", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/templates?template=presentation-series-pitch"]}>
        <StudioTemplateHubPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const title = screen.getByRole("textbox", { name: /프로젝트 이름|Project name/u });
    fireEvent.change(title, { target: { value: "신작 웹툰 피칭" } });
    fireEvent.click(screen.getByRole("button", { name: /이 템플릿으로 시작|Start with this template/u }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(
        /^\/studio\/p\/[^/]+\/d\/[^?]+\?workspace=slides$/u,
      );
    });

    const library = readStudioProjectLibrary(window.localStorage);
    expect(library.projects).toHaveLength(1);
    expect(library.projects[0]).toMatchObject({
      title: "신작 웹툰 피칭",
      kind: "slides",
      templateId: "presentation-series-pitch",
    });
    const documents = readStudioProjectDocuments(window.localStorage, library.projects[0]!.id);
    expect(documents.documents[0]).toMatchObject({
      kind: "slides",
      defaultWorkspace: "slides",
      pageCount: 12,
      width: 1920,
      height: 1080,
    });
  });

  it("links to marketplace templates without duplicating marketplace ownership", () => {
    render(
      <MemoryRouter>
        <StudioTemplateHubPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /마켓 템플릿|Marketplace templates/u }).getAttribute("href"))
      .toBe("/studio/assets?view=market");
  });
});
