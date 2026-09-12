// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import { readStudioProjectDocuments } from "../studio-project-document-store";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "./StudioProjectCreatePage";

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

describe("StudioProjectCreatePage", () => {
  it("creates a project and its initial document, then opens the canonical document route", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/new"]}>
        <StudioProjectCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const title = screen.getByRole("textbox", { name: /프로젝트 이름|Project name/u });
    fireEvent.change(title, { target: { value: "테스트 웹툰" } });
    fireEvent.click(screen.getByRole("button", { name: /웹툰 시작|Start Webtoon/u }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(
        /^\/studio\/p\/[^/]+\/d\/[^?]+\?workspace=comic$/u,
      );
    });

    const library = readStudioProjectLibrary(window.localStorage);
    expect(library.projects).toHaveLength(1);
    expect(library.projects[0]).toMatchObject({
      title: "테스트 웹툰",
      kind: "webtoon",
      status: "active",
    });
    const documents = readStudioProjectDocuments(window.localStorage, library.projects[0]!.id);
    expect(documents.documents).toHaveLength(1);
    expect(documents.documents[0]).toMatchObject({
      title: "EP01 원고",
      kind: "webtoon",
      defaultWorkspace: "comic",
    });
  });

  it("switches project type and prepares the matching template choices", () => {
    render(
      <MemoryRouter>
        <StudioProjectCreatePage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /발표 자료|Presentation/u }));
    expect(screen.getByRole("combobox", { name: /시작 템플릿|Starting template/u }).textContent)
      .toMatch(/작품 피칭|Series pitch/u);
  });
});
