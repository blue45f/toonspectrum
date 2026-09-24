// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import { readStudioWebtoonOnboardingProfile } from "@/shared/lib/webtoon-production-onboarding";
import { readStudioProjectDocuments } from "../studio-project-document-store";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { readStudioSaveProfiles } from "../save-first/studio-save-profile";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "./StudioProjectCreatePage";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderCreate(initialEntry = "/studio/new") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <StudioProjectCreatePage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function formatButton(container: HTMLElement, format: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-studio-create-format="${format}"]`);
  if (!button) throw new Error(`Missing project format button: ${format}`);
  return button;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectCreatePage", () => {
  it("shows five final outcomes, their silhouettes and an always-visible prepared-project preview", () => {
    const { container } = renderCreate();

    expect(container.querySelectorAll("[data-studio-create-format]")).toHaveLength(5);
    expect(formatButton(container, "vertical-webtoon").getAttribute("aria-pressed")).toBe("true");
    expect(formatButton(container, "cuttoon").textContent).toMatch(/컷툰|Card comic/u);
    expect(formatButton(container, "page-comic").textContent).toMatch(/페이지 만화|Page comic/u);
    expect(formatButton(container, "motion-toon").textContent).toMatch(/모션툰|Motion toon/u);
    expect(formatButton(container, "illustration").textContent).toMatch(/일러스트|Illustration/u);
    expect(container.querySelector('[data-studio-format-preview="vertical-webtoon"]')).not.toBeNull();
    expect(container.querySelector('[data-studio-mode-preview="webtoon"]')).not.toBeNull();
    expect(container.querySelector("[data-studio-auxiliary-workspaces]")?.hasAttribute("open")).toBe(false);
    expect(screen.queryByRole("combobox", { name: /만들 작업 선택|Choose work type/u })).toBeNull();
  });

  it("creates a vertical webtoon definition and routes an idea start to project planning", async () => {
    renderCreate();

    fireEvent.change(screen.getByRole("textbox", { name: /프로젝트 이름|Project name/u }), {
      target: { value: "테스트 웹툰" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: /세로 연재 웹툰 시작|Start Vertical serial webtoon/u,
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(
        /^\/studio\/p\/[^/]+\/story$/u,
      );
    });

    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    expect(project).toMatchObject({
      title: "테스트 웹툰",
      kind: "webtoon",
      status: "active",
      templateId: "webtoon-vertical",
      definition: {
        format: "vertical-webtoon",
        purpose: "serial",
        startPoint: "idea",
        collaboration: "solo",
        primaryWorkspace: "webtoon",
      },
    });
    expect(project.definition?.enabledWorkspaces).toEqual(expect.arrayContaining([
      "storyboard",
      "webtoon",
      "image",
      "three-d",
      "design",
      "animation",
      "review",
    ]));

    const document = readStudioProjectDocuments(window.localStorage, project.id).documents[0]!;
    expect(document).toMatchObject({
      title: "EP01 원고",
      kind: "webtoon",
      defaultWorkspace: "comic",
      width: 1080,
      height: 8000,
      pageCount: 1,
    });
  });

  it("creates a card-comic project with an ordered multi-card initial document", async () => {
    const { container } = renderCreate();

    fireEvent.click(formatButton(container, "cuttoon"));
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-studio-start-point="storyboard"]')!);
    const template = screen.getByRole("combobox", { name: /시작 템플릿|Starting template/u }) as HTMLSelectElement;
    expect(Array.from(template.options, (option) => option.value)).toEqual([
      "cuttoon-square-4",
      "cuttoon-portrait-8",
      "cuttoon-story-10",
    ]);
    fireEvent.change(template, { target: { value: "cuttoon-portrait-8" } });
    fireEvent.change(screen.getByRole("textbox", { name: /프로젝트 이름|Project name/u }), {
      target: { value: "여덟 장 이야기" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: /컷툰·SNS 만화 시작|Start Card comic & social series/u,
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(/format=cuttoon$/u);
    });

    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    expect(project).toMatchObject({
      kind: "webtoon",
      templateId: "cuttoon-portrait-8",
      definition: {
        format: "cuttoon",
        primaryWorkspace: "webtoon",
      },
    });
    const document = readStudioProjectDocuments(window.localStorage, project.id).documents[0]!;
    expect(document).toMatchObject({
      title: "첫 게시물 카드",
      width: 1080,
      height: 1350,
      pageCount: 8,
    });
  });

  it("creates a page comic with publication dimensions and an initial page sequence", async () => {
    const { container } = renderCreate();

    fireEvent.click(formatButton(container, "page-comic"));
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-studio-start-point="storyboard"]')!);
    fireEvent.change(screen.getByRole("combobox", { name: /시작 템플릿|Starting template/u }), {
      target: { value: "page-comic-b5-24" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: /페이지 만화 시작|Start Page comic/u,
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(/format=page-comic$/u);
    });

    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    const document = readStudioProjectDocuments(window.localStorage, project.id).documents[0]!;
    expect(project).toMatchObject({
      kind: "webtoon",
      templateId: "page-comic-b5-24",
      definition: { format: "page-comic" },
    });
    expect(document).toMatchObject({
      title: "챕터 1 원고",
      width: 1760,
      height: 2508,
      pageCount: 24,
    });
  });

  it("creates a motion-toon timeline instead of a drawing document", async () => {
    const { container } = renderCreate();

    fireEvent.click(formatButton(container, "motion-toon"));
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-studio-start-point="storyboard"]')!);
    expect(container.querySelector('[data-studio-format-preview="motion-toon"]')).not.toBeNull();
    expect(container.querySelector('[data-studio-mode-preview="animation"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", {
      name: /모션툰·세로 영상 시작|Start Motion toon & vertical video/u,
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(
        /^\/studio\/p\/[^/]+\/d\/[^?]+\?workspace=animation&uiMode=basic&startTool=select&format=motion-toon$/u,
      );
    });

    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    const document = readStudioProjectDocuments(window.localStorage, project.id).documents[0]!;
    expect(project).toMatchObject({
      kind: "animation",
      templateId: "motion-toon-vertical",
      definition: { format: "motion-toon", primaryWorkspace: "animation" },
    });
    expect(document).toMatchObject({
      title: "에피소드 1 타임라인",
      kind: "animation",
      defaultWorkspace: "animation",
      width: 1080,
      height: 1920,
    });
  });

  it("creates the project definition first and routes to import when files are the starting material", async () => {
    const { container } = renderCreate();

    const files = container.querySelector<HTMLButtonElement>('[data-studio-start-point="files"]');
    expect(files).not.toBeNull();
    fireEvent.click(files!);
    fireEvent.click(screen.getByRole("button", {
      name: /프로젝트 만들고 파일 가져오기|Create project and import files/u,
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(
        /^\/studio\/import\?projectId=[^&]+&format=vertical-webtoon$/u,
      );
    });
    expect(readStudioProjectLibrary(window.localStorage).projects[0]).toMatchObject({
      definition: { format: "vertical-webtoon", startPoint: "files" },
    });
  });

  it("keeps production onboarding and stores its result beside the project format", async () => {
    renderCreate(
      "/studio/new?kind=webtoon&onboarding=production&start=script&goal=pitch&team=small-team&cadence=weekly",
    );

    expect(screen.getByText(/회차 제작 계획까지 함께 준비|Prepare the episode production plan/u)).toBeTruthy();
    expect((screen.getByRole("combobox", {
      name: /현재 가지고 있는 자료|What you already have/u,
    }) as HTMLSelectElement).value).toBe("script");
    expect(screen.getByRole("heading", { name: /대본 잠금 트랙|Script lock track/u })).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: /프로젝트 이름|Project name/u }), {
      target: { value: "연재 준비 프로젝트" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: /프로젝트와 제작 계획 만들기|Create project and production plan/u,
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(
        /^\/studio\/p\/[^/]+\/story\?view=script$/u,
      );
    });

    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    expect(project.definition).toMatchObject({
      format: "vertical-webtoon",
      startPoint: "script",
      purpose: "portfolio",
      collaboration: "team",
    });
    expect(readStudioWebtoonOnboardingProfile(window.localStorage, project.id)).toMatchObject({
      projectId: project.id,
      startingPoint: "script",
      goal: "pitch",
      teamModel: "small-team",
      cadence: "weekly",
      completedTaskIds: [],
      completedAt: null,
    });
  });

  it("starts with browser autosave and defers destination choice until explicit Save", async () => {
    renderCreate();

    expect(screen.getByText(/작업은 이 기기에 자동 저장됩니다|Your work is autosaved on this device/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {
      name: /세로 연재 웹툰 시작|Start Vertical serial webtoon/u,
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(/^\/studio\/p\//u);
    });
    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    const profile = readStudioSaveProfiles(window.localStorage).profiles[project.id]!;
    expect(profile.lastManualSaveAt).toBeNull();
    expect(profile.bindings).toHaveLength(1);
    expect(profile.bindings[0]).toMatchObject({ provider: "browser", syncState: "local-only" });
  });

  it("honors legacy illustration deep links while selecting the new outcome model", () => {
    const { container } = renderCreate(
      "/studio/new?kind=illustration&template=illustration-portrait",
    );

    expect(formatButton(container, "illustration").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", {
      name: /시작 템플릿|Starting template/u,
    }) as HTMLSelectElement).value).toBe("illustration-portrait");
    expect(container.querySelector('[data-studio-format-preview="illustration"]')).not.toBeNull();
  });

  it("keeps specialist deep links as standalone auxiliary workspaces", async () => {
    const { container } = renderCreate(
      "/studio/new?kind=slides&template=slides-pitch",
    );

    expect(container.querySelector("[data-studio-auxiliary-workspaces]")?.hasAttribute("open")).toBe(true);
    expect(container.querySelector('[data-studio-auxiliary-kind="slides"]')?.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", {
      name: /시작 템플릿|Starting template/u,
    }) as HTMLSelectElement).value).toBe("slides-pitch");
    expect(container.querySelector('[data-studio-mode-preview="slides"]')).not.toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: /프로젝트 이름|Project name/u }), {
      target: { value: "피치덱" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: /발표 자료 시작|Start Presentation/u,
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toMatch(
        /^\/studio\/p\/[^/]+\/d\/[^?]+\?workspace=slides&uiMode=basic&startTool=select$/u,
      );
    });
    const project = readStudioProjectLibrary(window.localStorage).projects[0]!;
    const document = readStudioProjectDocuments(window.localStorage, project.id).documents[0]!;
    expect(project).toMatchObject({
      title: "피치덱",
      kind: "slides",
      templateId: "slides-pitch",
      definition: null,
    });
    expect(document).toMatchObject({
      kind: "slides",
      defaultWorkspace: "slides",
      width: 1920,
      height: 1080,
    });
  });
});
