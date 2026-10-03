/**
 * 캐릭터 챗 관리 페이지 테스트 — 빈 상태 공용 컴포넌트와 ?new=1 딥링크.
 */

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterChatManagePage } from "./CharacterChatManagePage";
import { useCharacterChatStore } from "./character-chat-store";

vi.mock("./use-character-chat-engine", () => ({
  useCharacterChatEngine: () => ({
    ready: false,
    engine: { id: "test-engine", generateReply: vi.fn(async () => ({ ok: true, text: "" })) },
  }),
}));

function renderPage(route = "/character-chat/manage") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CharacterChatManagePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useCharacterChatStore.getState().resetForTests();
});

afterEach(() => {
  cleanup();
});

describe("CharacterChatManagePage", () => {
  it("내 캐릭터가 없으면 일러스트 빈 상태와 만들기 딥링크를 보여준다", () => {
    renderPage();
    expect(screen.getByText("아직 만든 캐릭터 챗이 없어요")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "새 캐릭터 챗 만들기" });
    expect(cta.getAttribute("href")).toBe("/character-chat/manage?new=1");
    // 편집기는 아직 열려 있지 않다.
    expect(screen.queryByRole("form", { name: "캐릭터 챗 설정 폼" })).toBeNull();
  });

  it("?new=1로 들어오면 편집기가 바로 열린다", () => {
    renderPage("/character-chat/manage?new=1");
    expect(screen.getByRole("form", { name: "캐릭터 챗 설정 폼" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "새 캐릭터 챗 만들기" })).toBeTruthy();
  });
});
