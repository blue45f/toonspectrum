/**
 * 캐릭터 토크 팬 페이지 테스트 — 키 없음 안내, 캐릭터 전환, 전송 흐름.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterChatPage } from "./CharacterChatPage";
import { useCharacterChatStore } from "./character-chat-store";
import type {
  CharacterChatEngineInput,
  CharacterChatEngineResult,
} from "./character-chat-engine";

const engineState = vi.hoisted(() => ({
  ready: false,
  generateReply:
    vi.fn<(input: CharacterChatEngineInput) => Promise<CharacterChatEngineResult>>(
      async () => ({ ok: true, text: "" }),
    ),
}));

vi.mock("./use-character-chat-engine", () => ({
  useCharacterChatEngine: () => ({
    ready: engineState.ready,
    engine: { id: "test-engine", generateReply: engineState.generateReply },
  }),
}));

function renderPage(route = "/character-chat") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CharacterChatPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useCharacterChatStore.getState().resetForTests();
  engineState.ready = false;
  engineState.generateReply.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("CharacterChatPage", () => {
  it("키가 없으면 등록 안내와 캐릭터 인사말을 보여준다", () => {
    renderPage();
    expect(screen.getByText("지금은 파일럿 기간이에요")).toBeTruthy();
    expect(screen.getByRole("link", { name: /AI 키 등록하러 가기/ }).getAttribute("href")).toBe(
      "/settings/ai",
    );
    // 첫 캐릭터(레이나)의 인사말이 스레드에 보인다.
    expect(screen.getByText(/내 이름은 레이나/)).toBeTruthy();
    // 입력은 잠겨 있다.
    expect((screen.getByLabelText("캐릭터에게 보낼 메시지") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("캐릭터를 바꾸면 그 캐릭터의 인사말로 스레드가 바뀐다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /하루/ }));
    expect(screen.getByText(/단팥빵 나왔는데/)).toBeTruthy();
  });

  it("키가 있으면 메시지를 보내고 캐릭터 답변이 붙는다", async () => {
    engineState.ready = true;
    engineState.generateReply.mockResolvedValue({ ok: true, text: "…볼일이 뭔데." });
    renderPage();
    const input = screen.getByLabelText("캐릭터에게 보낼 메시지");
    fireEvent.change(input, { target: { value: "안녕, 레이나" } });
    fireEvent.click(screen.getByRole("button", { name: /보내기/ }));
    await waitFor(() => {
      expect(screen.getByText("…볼일이 뭔데.")).toBeTruthy();
    });
    expect(screen.getByText("안녕, 레이나")).toBeTruthy();
    const profile = useCharacterChatStore
      .getState()
      .profiles.find((item) => item.characterName === "레이나");
    expect(profile).toBeTruthy();
    const summary = useCharacterChatStore.getState().activitySummary(profile!.id);
    expect(summary.fanMessageCount).toBe(1);
    expect(summary.characterMessageCount).toBe(1);
  });

  it("금지 주제를 입력하면 엔진 없이 안내만 뜬다", async () => {
    engineState.ready = true;
    engineState.generateReply.mockResolvedValue({ ok: true, text: "답변" });
    renderPage();
    const input = screen.getByLabelText("캐릭터에게 보낼 메시지");
    fireEvent.change(input, { target: { value: "왕의 죽음에 대해 알려줘" } });
    fireEvent.click(screen.getByRole("button", { name: /보내기/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("금지 주제");
    });
    expect(engineState.generateReply).not.toHaveBeenCalled();
  });

  it("작품 파라미터에 맞는 캐릭터가 없으면 상태를 알린다", () => {
    renderPage("/character-chat?work=no-such-work");
    expect(screen.getByText(/아직 캐릭터 챗을 열지 않았어요/)).toBeTruthy();
  });
});
