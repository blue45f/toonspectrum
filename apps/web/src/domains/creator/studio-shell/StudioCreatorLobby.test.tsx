// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import {
  createStudioProject,
  markStudioProjectOpened,
  readStudioProjectLibrary,
  trashStudioProject,
} from "../studio-project-library-store";
import { AI_DIRECTOR_ANCHOR, AI_HUB_PATH } from "../ai/ai-studio-hub";
import { StudioProjectLibraryPage } from "./StudioProjectLibraryPage";
import {
  studioLobbyDirectorHref,
  studioLobbyDirectorSuggestions,
  studioLobbyIdeaHref,
  studioLobbyRecentProjects,
} from "./studio-creator-lobby-model";
import { STUDIO_PROJECT_TITLE_MAX_LENGTH } from "./studio-project-title";

const ORIGIN = "https://toonstudio.test";

function parseHref(href: string): URL {
  return new URL(href, ORIGIN);
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/studio"]}>
      <StudioProjectLibraryPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function lobby(): HTMLElement {
  return screen.getByRole("region", { name: /툰스튜디오 크리에이터 로비|ToonStudio creator lobby/u });
}

function seedProject(id: string, title: string, openedAt: string) {
  createStudioProject(window.localStorage, {
    id,
    title,
    kind: "webtoon",
    createdAt: "2026-09-01T00:00:00.000Z",
  });
  markStudioProjectOpened(window.localStorage, id, null, { at: openedAt });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("studio lobby model", () => {
  it("turns a one-line idea into a normalized draft title and the idea start point", () => {
    expect(studioLobbyIdeaHref("   ")).toBe("/studio/new");
    const url = parseHref(studioLobbyIdeaHref("  비 오는 날의   첫사랑  "));
    expect(url.pathname).toBe("/studio/new");
    expect(url.searchParams.get("title")).toBe("비 오는 날의 첫사랑");
    expect(url.searchParams.get("start")).toBe("idea");
    const long = "가".repeat(STUDIO_PROJECT_TITLE_MAX_LENGTH + 30);
    expect(parseHref(studioLobbyIdeaHref(long)).searchParams.get("title")).toHaveLength(
      STUDIO_PROJECT_TITLE_MAX_LENGTH,
    );
  });

  it("points AI director entries at the real director surface with its own suggestion names", () => {
    expect(studioLobbyDirectorHref()).toBe(`${AI_HUB_PATH}#${AI_DIRECTOR_ANCHOR}`);
    expect(studioLobbyDirectorHref("scene-composition")).toBe(
      `${AI_HUB_PATH}?suggestion=scene-composition#${AI_DIRECTOR_ANCHOR}`,
    );
    const suggestions = studioLobbyDirectorSuggestions();
    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "story-expand",
      "character-analysis",
      "scene-composition",
    ]);
    expect(suggestions.map((suggestion) => suggestion.title.ko)).toEqual([
      "스토리 확장하기",
      "캐릭터 설정 분석",
      "장면 구도 추천",
    ]);
  });

  it("picks only active work, most recently opened first, without mutating the input", () => {
    seedProject("a", "작품 A", "2026-09-10T00:00:00.000Z");
    seedProject("b", "작품 B", "2026-09-30T00:00:00.000Z");
    seedProject("c", "작품 C", "2026-09-20T00:00:00.000Z");
    trashStudioProject(window.localStorage, "b", { at: "2026-09-30T01:00:00.000Z" });
    const projects = readStudioProjectLibrary(window.localStorage).projects;
    const snapshot = projects.map((project) => project.id);

    expect(studioLobbyRecentProjects(projects).map((project) => project.id)).toEqual(["c", "a"]);
    expect(projects.map((project) => project.id)).toEqual(snapshot);
    expect(studioLobbyRecentProjects(projects, 1)).toHaveLength(1);
  });
});

describe("StudioCreatorLobby", () => {
  it("shows labelled example starters and a template shortcut when there is no work yet", () => {
    renderHome();
    const region = lobby();

    expect(within(region).getByRole("heading", { name: /추천 시작 템플릿|Recommended starters/u })).toBeTruthy();
    expect(within(region).getAllByText(/^예시$|^Example$/u)).toHaveLength(3);
    expect(within(region).getByRole("link", { name: /템플릿 모두 보기|Browse all templates/u }).getAttribute("href"))
      .toBe("/studio/templates");
    expect(within(region).getByRole("link", { name: /새 프로젝트|New project/u }).getAttribute("href"))
      .toBe("/studio/new");
    expect(within(region).getAllByRole("link").filter((link) => link.closest("nav"))).toHaveLength(7);
    // 빠른 시작에서 회차·공정을 운영하는 제작 관리로도 바로 들어갈 수 있다.
    expect(within(region).getByRole("link", { name: /제작 관리 열기|Open production/u }).getAttribute("href"))
      .toBe("/production");
    // 빠른 시작 마지막 카드는 문서가 아니라 아바타로 들어가는 가상 스튜디오로 직행한다.
    expect(within(region).getByRole("link", { name: /가상 스튜디오 열기|Open the virtual studio/u }).getAttribute("href"))
      .toBe("/studio/space");
    // 첫 방문은 넓은 히어로를 유지하고, 작업 현황 칩은 작품이 생긴 뒤에만 보인다.
    expect(region.getAttribute("data-density")).toBe("full");
    expect(within(region).queryByRole("list", { name: /작업 현황|Workspace status/u })).toBeNull();
  });

  it("sends every AI director entry to the director surface instead of the search palette", () => {
    renderHome();
    const region = lobby();
    const directorHref = `${AI_HUB_PATH}#${AI_DIRECTOR_ANCHOR}`;

    expect(within(region).getByRole("link", { name: /AI 디렉터에게 말하기|Ask the AI director/u }).getAttribute("href"))
      .toBe(directorHref);
    expect(within(region).getByRole("link", { name: /AI 디렉터 열기|Open AI director/u }).getAttribute("href"))
      .toBe(directorHref);
    const prompts = within(within(region).getByRole("list", { name: /AI 디렉터 제안 바로 열기|Open an AI director suggestion/u }))
      .getAllByRole("link");
    expect(prompts.map((link) => link.getAttribute("href"))).toEqual([
      `${AI_HUB_PATH}?suggestion=story-expand#${AI_DIRECTOR_ANCHOR}`,
      `${AI_HUB_PATH}?suggestion=character-analysis#${AI_DIRECTOR_ANCHOR}`,
      `${AI_HUB_PATH}?suggestion=scene-composition#${AI_DIRECTOR_ANCHOR}`,
    ]);
    expect(prompts.map((link) => link.textContent)).toEqual([
      expect.stringMatching(/스토리 확장하기|Expand a story/u),
      expect.stringMatching(/캐릭터 설정 분석|Analyze a character/u),
      expect.stringMatching(/장면 구도 추천|Suggest a composition/u),
    ]);
    // 전역 검색 단축키를 AI 디렉터처럼 안내하지 않는다.
    expect(region.querySelector("[aria-keyshortcuts]")).toBeNull();
    expect(region.querySelector("kbd")).toBeNull();
  });

  it("renders local work on the first paint as recent projects, newest first and capped at five", () => {
    for (let index = 0; index < 7; index += 1) {
      seedProject(`series-${index}`, `연재 ${index}`, `2026-09-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`);
    }

    renderHome();
    const region = lobby();
    const continueLinks = within(region).getAllByRole("link", { name: /이어서 작업$|^Continue /u });

    expect(within(region).getByRole("heading", { name: /최근 프로젝트|Recent projects/u })).toBeTruthy();
    expect(continueLinks).toHaveLength(5);
    expect(continueLinks[0]?.getAttribute("aria-label")).toMatch(/연재 6/u);
    expect(continueLinks[4]?.getAttribute("aria-label")).toMatch(/연재 2/u);
    // 표지는 링크 이름 안의 장식이라 보조기기에 별도 이미지로 노출하지 않는다.
    expect(within(region).queryByRole("img")).toBeNull();
    // 재방문 첫 화면: 히어로를 줄이고 작업 현황은 최근 프로젝트 머리글에 둔다.
    expect(region.getAttribute("data-density")).toBe("compact");
    const recent = within(region).getByRole("region", { name: /최근 프로젝트|Recent projects/u });
    const metrics = within(recent).getByRole("list", { name: /작업 현황|Workspace status/u });
    expect(within(metrics).getAllByRole("listitem")).toHaveLength(3);
    expect(metrics.textContent).toMatch(/7/u);
  });

  it("starts a new work with the typed idea as the draft title", async () => {
    renderHome();

    fireEvent.change(screen.getByRole("textbox", { name: /한 줄 아이디어로 시작|Start from a one-line idea/u }), {
      target: { value: "비 오는 날의 첫사랑" },
    });
    fireEvent.click(screen.getByRole("button", { name: /이 아이디어로 새 작품 만들기|Create a new work from this idea/u }));

    await waitFor(() => {
      const url = parseHref(screen.getByLabelText("location").textContent ?? "");
      expect(url.pathname).toBe("/studio/new");
      expect(url.searchParams.get("title")).toBe("비 오는 날의 첫사랑");
      expect(url.searchParams.get("start")).toBe("idea");
    });
  });

  it("explains on screen where the typed idea goes", () => {
    renderHome();
    const input = screen.getByRole("textbox", { name: /한 줄 아이디어로 시작|Start from a one-line idea/u });
    const hint = document.getElementById(input.getAttribute("aria-describedby") ?? "");

    expect(hint?.textContent).toMatch(/제목 초안|draft title/u);
    expect(hint?.className).not.toContain("sr-only");
  });
});
