// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import { readStudioProjectDocuments } from "../studio-project-document-store";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { readStudioSaveProfiles } from "../save-first/studio-save-profile";
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
        /^\/studio\/p\/[^/]+\/d\/[^?]+\?workspace=comic&uiMode=basic&startTool=draw$/u,
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

  it("starts with browser autosave and defers destination choice until explicit Save", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/new"]}>
        <StudioProjectCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/3\. 저장 위치|3\. Save location/u)).toBeNull();
    expect(screen.getByText(/그리는 동안은 자동으로 임시 저장됩니다|temporarily autosaved while you draw/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /웹툰 시작|Start Webtoon/u }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(/^\/studio\/p\//u);
    });
    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    const profile = readStudioSaveProfiles(window.localStorage).profiles[project.id]!;
    expect(profile.lastManualSaveAt).toBeNull();
    expect(profile.bindings).toHaveLength(1);
    expect(profile.bindings[0]).toMatchObject({ provider: "browser", syncState: "local-only" });
  });

  it("restores platform canvas choices and creates the selected authoring size", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/new"]}>
        <StudioProjectCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const template = screen.getByRole("combobox", {
      name: /시작 템플릿|Starting template/u,
    }) as HTMLSelectElement;
    expect(Array.from(template.options, (option) => option.value)).toEqual(expect.arrayContaining([
      "webtoon-vertical",
      "webtoon-naver",
      "webtoon-kakao",
      "webtoon-canvas",
      "webtoon-four-cut",
      "webtoon-page",
    ]));
    expect(template.textContent).toMatch(/네이버|Naver/u);
    expect(template.textContent).toMatch(/카카오|Kakao/u);
    expect(template.textContent).toMatch(/WEBTOON Canvas/u);

    fireEvent.change(template, { target: { value: "webtoon-naver" } });
    fireEvent.click(screen.getByRole("button", { name: /웹툰 시작|Start Webtoon/u }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(/^\/studio\/p\//u);
    });
    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    expect(project.templateId).toBe("webtoon-naver");
    const document = readStudioProjectDocuments(window.localStorage, project.id).documents[0]!;
    expect(document).toMatchObject({ width: 690, height: 8000 });
  });

  it("honors a homepage deep link for project kind and starting template", () => {
    render(
      <MemoryRouter initialEntries={["/studio/new?kind=illustration&template=illustration-portrait"]}>
        <StudioProjectCreatePage />
      </MemoryRouter>,
    );

    const illustrationOption = screen.getAllByRole("button", { name: /일러스트|Illustration/u })
      .find((element) => element.hasAttribute("aria-pressed"));
    expect(illustrationOption?.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: /시작 템플릿|Starting template/u }) as HTMLSelectElement).value)
      .toBe("illustration-portrait");
  });

  it("switches project type and prepares the matching template choices", () => {
    render(
      <MemoryRouter>
        <StudioProjectCreatePage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /다른 작업 종류 보기|Show more project types/u }));
    fireEvent.click(screen.getByRole("button", { name: /발표 자료|Presentation/u }));
    expect(screen.getByRole("combobox", { name: /시작 템플릿|Starting template/u }).textContent)
      .toMatch(/작품 피칭|Series pitch/u);
  });
});
