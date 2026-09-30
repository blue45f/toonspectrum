// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollaborationEditorPage } from "./CollaborationEditorPage";
import { collaborationTemplate, saveCollaborationDraft } from "./collaboration-draft";

import { useApp } from "@/shared/lib/store";

vi.mock("@/platform/collaboration-client", () => ({
  collaborationClient: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/collaborate/new" element={<CollaborationEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function titleInput(): HTMLInputElement {
  const input = screen.getByRole("textbox", { name: /공고 제목/u });
  if (!(input instanceof HTMLInputElement)) throw new Error("공고 제목 입력칸이 없습니다.");
  return input;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  useApp.setState({ userId: null, sessionToken: null });
  localStorage.clear();
});

describe("공고 작성 시작", () => {
  it("로그인 전에는 주소로 고른 작성 예시를 미리 보여 주고 다른 예시로 바꿀 수 있다", () => {
    useApp.setState({ userId: null, sessionToken: null });
    renderEditor("/collaborate/new?template=background");

    expect(screen.getByRole("heading", { name: "작성 예시 미리 보기" })).toBeTruthy();
    expect(screen.getByText(collaborationTemplate("background").title)).toBeTruthy();
    expect(screen.getByRole("button", { name: "배경 작업 의뢰" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "팀원 모집" }));
    expect(screen.getByText(collaborationTemplate("team").title)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("로그인하면 저장된 초안이 없을 때 주소로 고른 예시로 양식을 채운다", () => {
    useApp.setState({ userId: "user-1", sessionToken: "session-token" });
    renderEditor("/collaborate/new?template=team");

    expect(titleInput().value).toBe(collaborationTemplate("team").title);
    expect(screen.queryByText(/쓰던 초안이 있어 초안을 먼저 열었어요/u)).toBeNull();
  });

  it("쓰던 초안이 있으면 예시로 덮지 않고, 초안을 먼저 연 이유를 알린다", () => {
    useApp.setState({ userId: "user-1", sessionToken: "session-token" });
    saveCollaborationDraft(localStorage, "user-1", { ...collaborationTemplate("ink"), title: "내가 쓰던 공고" });
    renderEditor("/collaborate/new?template=background");

    expect(titleInput().value).toBe("내가 쓰던 공고");
    expect(screen.getByText(/쓰던 초안이 있어 초안을 먼저 열었어요/u)).toBeTruthy();
  });
});
