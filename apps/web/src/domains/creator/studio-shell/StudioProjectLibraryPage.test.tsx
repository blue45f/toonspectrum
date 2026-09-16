// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import {
  createStudioProject,
  readStudioProjectLibrary,
  trashStudioProject,
} from "../studio-project-library-store";
import { studioProjectDocumentStorageKey } from "../studio-project-document-store";
import {
  ensureStudioSaveProfile,
  readStudioSaveProfiles,
} from "../save-first/studio-save-profile";
import { StudioProjectLibraryPage } from "./StudioProjectLibraryPage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectLibraryPage", () => {
  it("separates temporary autosaves and opens destination choice on the first explicit save", async () => {
    createStudioProject(window.localStorage, {
      id: "series-alpha",
      title: "작품 A",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });
    ensureStudioSaveProfile(window.localStorage, "series-alpha", {
      provider: "browser",
      now: "2026-09-12T00:00:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /^임시 작업|^Temporary work/u })).toBeTruthy();
    expect(screen.getByText("작품 A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^정식 저장$|^Save$/u }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/어디에 정식 저장할까요|Where should this be formally saved/u)).toBeTruthy();
    expect(within(dialog).getByText(/파일·동기화 폴더|File or synced folder/u)).toBeTruthy();
    expect(within(dialog).getByText(/개인 드라이브|Personal drive/u)).toBeTruthy();
  });

  it("creates a usable temporary duplicate", async () => {
    createStudioProject(window.localStorage, {
      id: "series-alpha",
      title: "작품 A",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /작품 A 복제|Duplicate 작품 A/u }));
    await waitFor(() => {
      expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(2);
    });
    expect(await screen.findByText("작품 A 복사본")).toBeTruthy();
  });

  it("restores every project from Trash in one action", async () => {
    for (const [id, title] of [["series-alpha", "복원할 작품 A"], ["series-beta", "복원할 작품 B"]] as const) {
      createStudioProject(window.localStorage, {
        id,
        title,
        kind: "illustration",
        createdAt: "2026-09-12T00:00:00.000Z",
      });
      trashStudioProject(window.localStorage, id, { at: "2026-09-12T00:01:00.000Z" });
    }

    render(
      <MemoryRouter initialEntries={["/studio?view=trash"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^전체 복구$|^Restore all$/u }));
    await waitFor(() => {
      expect(readStudioProjectLibrary(window.localStorage).projects.every((project) => project.status === "active"))
        .toBe(true);
    });
  });

  it("selects multiple Trash projects and permanently deletes their related metadata after confirmation", async () => {
    for (const [id, title] of [["series-alpha", "삭제할 작품 A"], ["series-beta", "삭제할 작품 B"]] as const) {
      createStudioProject(window.localStorage, {
        id,
        title,
        kind: "webtoon",
        createdAt: "2026-09-12T00:00:00.000Z",
      });
      trashStudioProject(window.localStorage, id, { at: "2026-09-12T00:01:00.000Z" });
      ensureStudioSaveProfile(window.localStorage, id, { provider: "browser" });
      window.localStorage.setItem(studioProjectDocumentStorageKey(id), JSON.stringify({ schemaVersion: 1 }));
    }

    render(
      <MemoryRouter initialEntries={["/studio/view=trash"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /전체 선택 \(2\)|Select all \(2\)/u }));
    fireEvent.click(screen.getByRole("button", { name: /선택 완전 삭제|Delete selected/u }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^완전 삭제$|^Delete permanently$/u }));

    await waitFor(() => {
      expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
    });
    expect(Object.keys(readStudioSaveProfiles(window.localStorage).profiles)).toHaveLength(0);
    expect(window.localStorage.getItem(studioProjectDocumentStorageKey("series-alpha"))).toBeNull();
    expect(window.localStorage.getItem(studioProjectDocumentStorageKey("series-beta"))).toBeNull();
  });
});
