// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioAutosavePayload } from "../studio-autosave";
import type { StudioProjectLibraryStorage } from "../studio-project-library-reader";
import {
  createStudioProject,
  readStudioProjectLibrary,
} from "../studio-project-library-store";
import {
  studioProjectThumbnailLocator,
  syncStudioProjectThumbnailAfterSave,
} from "../studio-project-thumbnail";
import { StudioWorkspaceRecentWorks } from "../workspace/StudioWorkspaceRecentWorks";
import { useResolvedStudioProjectThumbnailUrl } from "./useStudioProjectThumbnailUrl";

function memoryStorage(): StudioProjectLibraryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("URL", Object.assign(Object.create(URL) as typeof URL, {
    createObjectURL: vi.fn(() => "blob:project-thumbnail"),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(cleanup);

describe("useResolvedStudioProjectThumbnailUrl", () => {
  it("일반 URL은 그대로, null은 null로 통과시킨다", () => {
    const remote = renderHook(() => useResolvedStudioProjectThumbnailUrl("https://example.test/cover.png"));
    expect(remote.result.current).toBe("https://example.test/cover.png");
    const empty = renderHook(() => useResolvedStudioProjectThumbnailUrl(null));
    expect(empty.result.current).toBeNull();
  });

  it("로케이터는 IDB Blob을 Object URL로 해석한다", async () => {
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    const payload = {
      version: 3,
      savedAt: "2026-10-03T00:00:00.000Z",
      pagesList: [{
        id: "page-1",
        canvasH: 1080,
        elements: [{ id: "el-1", type: "text", text: "첫 컷", x: 40, y: 80, width: 320 }],
      }],
    } as StudioAutosavePayload;
    await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload,
      rasterize: async () => new Blob(["webp-bytes"], { type: "image/webp" }),
    });

    const { result } = renderHook(() => (
      useResolvedStudioProjectThumbnailUrl(studioProjectThumbnailLocator(entry.id))
    ));
    await waitFor(() => expect(result.current).toBe("blob:project-thumbnail"));
  });

  it("IDB에 기록이 없으면 null이라 폴백 커버가 유지된다", async () => {
    const { result } = renderHook(() => (
      useResolvedStudioProjectThumbnailUrl(studioProjectThumbnailLocator("missing-project"))
    ));
    // 비동기 해석이 끝나도 값은 null이어야 한다.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toBeNull();
  });
});

describe("저장 → 내 홈 최근 작품 종단", () => {
  it("에디터 저장을 흉내 내면 최근 작품 카드에 실제 썸네일 이미지가 뜬다", async () => {
    const storage = memoryStorage();
    const created = createStudioProject(storage, { title: "달빛 카페 연대기", kind: "webtoon" });
    const payload = {
      version: 3,
      savedAt: "2026-10-03T00:00:00.000Z",
      pagesList: [{
        id: "page-1",
        canvasH: 1080,
        elements: [{ id: "el-1", type: "text", text: "첫 컷", x: 40, y: 80, width: 320 }],
      }],
    } as StudioAutosavePayload;

    const sync = await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: created.id,
      payload,
      rasterize: async () => new Blob(["webp-bytes"], { type: "image/webp" }),
    });
    expect(sync).toEqual({ status: "updated" });

    const entry = readStudioProjectLibrary(storage).projects.find((project) => project.id === created.id);
    expect(entry?.thumbnailUrl).toBe(studioProjectThumbnailLocator(created.id));

    const { container } = render(
      <MemoryRouter>
        <StudioWorkspaceRecentWorks projects={entry ? [entry] : []} locale="ko" onSelect={vi.fn()} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const img = container.querySelector(".workspace-work-cover img");
      expect(img?.getAttribute("src")).toBe("blob:project-thumbnail");
    });
    // 실제 이미지가 떴으므로 타이포그래픽 폴백은 없어야 한다.
    expect(container.querySelector(".workspace-work-cover-art")).toBeNull();
  });
});
