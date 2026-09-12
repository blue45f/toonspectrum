// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import {
  createStudioProject,
  readStudioProjectLibrary,
  trashStudioProject,
} from "../studio-project-library-store";
import { StudioProjectLibraryPage } from "./StudioProjectLibraryPage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectLibraryPage", () => {
  it("shows persisted projects and creates a usable duplicate", async () => {
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

    expect(await screen.findByText("작품 A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /프로젝트 복제|Duplicate project/u }));

    await waitFor(() => {
      expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(2);
    });
    expect(await screen.findByText("작품 A 복사본")).toBeTruthy();
  });

  it("restores a project from Trash", async () => {
    createStudioProject(window.localStorage, {
      id: "series-alpha",
      title: "복원할 작품",
      kind: "illustration",
      createdAt: "2026-09-12T00:00:00.000Z",
    });
    trashStudioProject(window.localStorage, "series-alpha", {
      at: "2026-09-12T00:01:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={["/studio?view=trash"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("복원할 작품")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^복원$|^Restore$/u }));

    await waitFor(() => {
      expect(readStudioProjectLibrary(window.localStorage).projects[0]?.status).toBe("active");
    });
  });
});
