// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CREATOR_STORY_DRAFT_KEY } from "@/shared/lib/creator-workspace-persistence";
import { StoryLabPage } from "./StoryLabPage";

vi.mock("./workspace", () => ({
  downloadText: vi.fn(),
  useCreatorWorkspace: () => ({
    workspace: { story: {} },
    saveStory: vi.fn(async () => true),
    clearError: vi.fn(),
    error: null,
    ready: true,
    saving: false,
    writable: true,
  }),
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("스토리 연구실 홈 아이디어 시딩", () => {
  it("?idea= 문장을 빈 가제에 채우고 임시 초안으로 보관한다", () => {
    window.sessionStorage.clear();
    render(<MemoryRouter initialEntries={["/story-lab?idea=비 오는 날의 첫사랑"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("비 오는 날의 첫사랑");
    expect(screen.getByText(/홈에서 입력한 아이디어를 작품 가제로 가져왔습니다/u)).toBeTruthy();
    expect(window.sessionStorage.getItem(CREATOR_STORY_DRAFT_KEY)).toContain("비 오는 날의 첫사랑");
  });

  it("이미 가제가 있으면 아이디어로 덮지 않는다", () => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(CREATOR_STORY_DRAFT_KEY, JSON.stringify({ version: 1, base: {}, story: { title: "기존 가제" } }));
    render(<MemoryRouter initialEntries={["/story-lab?idea=새 아이디어"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("기존 가제");
  });

  it("아이디어 파라미터가 없으면 아무것도 채우지 않는다", () => {
    window.sessionStorage.clear();
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("");
    expect(window.sessionStorage.getItem(CREATOR_STORY_DRAFT_KEY)).toBeNull();
  });
});
