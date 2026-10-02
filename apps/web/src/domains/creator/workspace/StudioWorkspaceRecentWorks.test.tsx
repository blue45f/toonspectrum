// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { StudioWorkspaceRecentWorks } from "./StudioWorkspaceRecentWorks";

function entry(overrides: Partial<StudioProjectLibraryEntry> = {}): StudioProjectLibraryEntry {
  return {
    id: "work-1",
    title: "달빛 카페 연대기",
    kind: "webtoon",
    status: "active",
    statusBeforeTrash: null,
    templateId: null,
    description: "",
    primaryLocale: "ko-KR",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastOpenedAt: "2026-10-02T00:00:00.000Z",
    lastOpenedDocumentId: null,
    thumbnailUrl: null,
    definition: null,
    ...overrides,
  };
}

function renderWorks(props: Parameters<typeof StudioWorkspaceRecentWorks>[0]) {
  return render(
    <MemoryRouter>
      <StudioWorkspaceRecentWorks {...props} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("StudioWorkspaceRecentWorks 썸네일·카드", () => {
  it("저장된 대표 이미지가 있으면 실제 썸네일을 렌더한다", () => {
    const { container } = renderWorks({
      projects: [entry({ thumbnailUrl: "https://example.test/cover.png" })],
      locale: "ko",
      onSelect: vi.fn(),
    });
    const img = container.querySelector(".workspace-work-cover img");
    expect(img?.getAttribute("src")).toBe("https://example.test/cover.png");
    expect(screen.getByRole("button", { name: /달빛 카페 연대기/ })).toBeTruthy();
  });

  it("대표 이미지가 없으면 타이포그래픽 커버로 폴백한다", () => {
    const { container } = renderWorks({
      projects: [entry()],
      locale: "ko",
      onSelect: vi.fn(),
    });
    expect(container.querySelector(".workspace-work-cover img")).toBeNull();
    const cover = container.querySelector(".workspace-work-cover-art");
    expect(cover).toBeTruthy();
    expect(cover?.getAttribute("aria-hidden")).toBe("true");
    expect(cover?.textContent).toContain("웹툰");
    expect(cover?.textContent).toContain("달");
  });

  it("이미지 로딩이 실패하면 타이포그래픽 커버로 폴백한다", () => {
    const { container } = renderWorks({
      projects: [entry({ thumbnailUrl: "https://example.test/broken.png" })],
      locale: "ko",
      onSelect: vi.fn(),
    });
    const img = container.querySelector(".workspace-work-cover img");
    expect(img).toBeTruthy();
    fireEvent.error(img as Element);
    expect(container.querySelector(".workspace-work-cover img")).toBeNull();
    expect(container.querySelector(".workspace-work-cover-art")).toBeTruthy();
  });

  it("종류·날짜·이어서 작업하기가 카드에서 바로 읽히고 클릭하면 선택된다", () => {
    const onSelect = vi.fn();
    renderWorks({ projects: [entry()], locale: "ko", onSelect });
    const button = screen.getByRole("button", { name: /달빛 카페 연대기/ });
    expect(button.textContent).toContain("웹툰");
    expect(button.textContent).toContain("이어서 작업하기");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("work-1");
  });

  it("선택된 작품은 현재 선택한 작품으로 표시되고 보관 상태는 칩으로 보인다", () => {
    renderWorks({
      projects: [entry(), entry({ id: "work-2", title: "보관된 원고", status: "archived" })],
      selectedId: "work-1",
      locale: "ko",
      onSelect: vi.fn(),
    });
    const selected = screen.getByRole("button", { name: /달빛 카페 연대기/ });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.textContent).toContain("현재 선택한 작품");
    const archived = screen.getByRole("button", { name: /보관된 원고/ });
    expect(archived.textContent).toContain("보관됨");
  });

  it("로딩 중에는 카드와 같은 문법의 스켈레톤을 보여 준다", () => {
    const { container } = renderWorks({ projects: [], locale: "ko", onSelect: vi.fn(), loading: true });
    expect(container.querySelectorAll(".workspace-work-skeleton")).toHaveLength(4);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("heading", { name: "최근 작품" })).toBeTruthy();
  });

  it("작품이 없으면 만들기와 가져오기 시작 동선을 함께 안내한다", () => {
    renderWorks({ projects: [], locale: "ko", onSelect: vi.fn() });
    expect(screen.getByRole("link", { name: /새 작품 만들기/ }).getAttribute("href")).toBe("/studio/new");
    expect(screen.getByRole("link", { name: /파일 가져오기/ }).getAttribute("href")).toBe("/studio/import");
  });
});
