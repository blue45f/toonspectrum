// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addStudioProductionBibleEntry,
  createEmptyStudioProductionBible,
  type StudioProductionBiblePersistenceResult,
} from "./studio-production-bible";
import { StudioProductionBibleWorkspace } from "./StudioProductionBibleWorkspace";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioProductionBibleWorkspace", () => {
  it("loads the isolated work scope only when opened and persists edits", async () => {
    const loadedBible = addStudioProductionBibleEntry(
      createEmptyStudioProductionBible(),
      { id: "location-library", kind: "location", name: "학교 도서관" }
    );
    const load = vi.fn(async (): Promise<StudioProductionBiblePersistenceResult> => ({
      bible: loadedBible,
      backend: "indexeddb",
      persisted: true,
      localOnly: true,
    }));
    const save = vi.fn(async (_key, bible): Promise<StudioProductionBiblePersistenceResult> => ({
      bible,
      backend: "indexeddb",
      persisted: true,
      localOnly: true,
    }));
    const repository = { load, save };
    const { rerender } = render(
      <StudioProductionBibleWorkspace
        open={false}
        onClose={vi.fn()}
        userId="artist-a"
        workId="episode-1"
        repository={repository}
      />
    );

    expect(load).not.toHaveBeenCalled();
    rerender(
      <StudioProductionBibleWorkspace
        open
        onClose={vi.fn()}
        userId="artist-a"
        workId="episode-1"
        repository={repository}
      />
    );

    expect((await screen.findAllByText("학교 도서관")).length).toBeGreaterThan(0);
    expect(load).toHaveBeenCalledWith(
      "toonspectrum-studio-production-bible:v1:artist-a:work:episode-1"
    );
    fireEvent.click(screen.getAllByRole("button", { name: "소품" })[0]!);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it("surfaces memory-only durability without claiming cloud sync", async () => {
    const repository = {
      load: vi.fn(async (): Promise<StudioProductionBiblePersistenceResult> => ({
        bible: createEmptyStudioProductionBible(),
        backend: "memory",
        persisted: false,
        localOnly: true,
        warning: "브라우저 저장소가 차단되었습니다.",
      })),
      save: vi.fn(),
    };
    render(
      <StudioProductionBibleWorkspace
        open
        onClose={vi.fn()}
        repository={repository}
      />
    );

    expect(await screen.findByText("메모리 임시 · 새로고침 전까지")).toBeTruthy();
    expect(screen.getByText("브라우저 저장소가 차단되었습니다.")).toBeTruthy();
    expect(screen.queryByText(/클라우드/u)).toBeNull();
  });
});
