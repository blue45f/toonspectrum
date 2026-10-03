// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { normalizeCreatorRoleWorkspacePreference } from "@/shared/lib/creator-role-workspace-contract";
import { resetCreatorRoleWorkspaceStore } from "@/shared/lib/creator-role-workspace-store";

import { StudioProjectLibraryPage } from "./StudioProjectLibraryPage";

const GLOBAL_WORKSPACE_STORAGE_KEY = "toonspectrum:creator-role-workspace:v1:global";

const DEFAULT_HREFS = [
  "/studio/new?kind=webtoon&template=webtoon-vertical",
  "/story-lab",
  "/studio/assets/characters/new",
  "/studio/bg3d",
  "/studio/new?kind=illustration&template=illustration-blank",
  "/production",
  "/studio/space",
];

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/studio"]}>
      <StudioProjectLibraryPage />
    </MemoryRouter>,
  );
}

function quickStartHrefs(): (string | null)[] {
  const region = screen.getByRole("region", { name: /툰스튜디오 크리에이터 로비|ToonStudio creator lobby/u });
  const nav = within(region).getByRole("navigation", { name: /빠른 시작|Quick start/u });
  return within(nav).getAllByRole("link").map((link) => link.getAttribute("href"));
}

function seedGlobalWorkspace(activeRole: string) {
  const document = normalizeCreatorRoleWorkspacePreference({ activeRole });
  window.localStorage.setItem(GLOBAL_WORKSPACE_STORAGE_KEY, JSON.stringify({
    projectKey: "global",
    revision: 2,
    document,
    updatedAt: "2026-10-03T00:00:00.000Z",
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  resetCreatorRoleWorkspaceStore();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetCreatorRoleWorkspaceStore();
});

describe("StudioCreatorLobby role preset (R-1)", () => {
  it("keeps the neutral quick-start order and shows no badge without a workspace document", () => {
    renderHome();
    expect(quickStartHrefs()).toEqual(DEFAULT_HREFS);
    const region = screen.getByRole("region", { name: /툰스튜디오 크리에이터 로비|ToonStudio creator lobby/u });
    const nav = within(region).getByRole("navigation", { name: /빠른 시작|Quick start/u });
    expect(within(nav).queryByText(/추천| pick/u)).toBeNull();
    expect(region.querySelector(".studio-lobby-quick__badge")).toBeNull();
    expect(region.querySelector("[data-role-featured]")).toBeNull();
  });

  it("reorders and badges quick start for the active role from the global workspace document", async () => {
    seedGlobalWorkspace("story");
    renderHome();

    await waitFor(() => {
      expect(quickStartHrefs()[0]).toBe("/story-lab");
    });
    // 글작가: 스토리 → 제작 관리가 앞으로 오고, 카드 집합은 그대로 7개다.
    expect(quickStartHrefs()).toEqual([
      "/story-lab",
      "/production",
      "/studio/new?kind=webtoon&template=webtoon-vertical",
      "/studio/assets/characters/new",
      "/studio/bg3d",
      "/studio/new?kind=illustration&template=illustration-blank",
      "/studio/space",
    ]);
    const region = screen.getByRole("region", { name: /툰스튜디오 크리에이터 로비|ToonStudio creator lobby/u });
    expect(within(region).getByText(/글작가 추천|Writer pick/u)).toBeTruthy();
    const featured = region.querySelector("[data-role-featured='true']");
    expect(featured?.getAttribute("href")).toBe("/story-lab");
  });
});
