/**
 * 뉴스레터 페이지 테스트 — 게스트 로그인 유도, 구독 토글, 발송 흐름.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MyNewslettersPage } from "./MyNewslettersPage";
import { NewsletterComposePage } from "./NewsletterComposePage";
import { NewsletterSubscribeButton } from "./NewsletterSubscribeButton";
import { useNewsletterStore } from "./newsletter-store";

const authState = vi.hoisted(() => ({ actorId: null as string | null }));

vi.mock("@/domains/auth/public/session/use-auth-actor-id", () => ({
  useAuthActorId: () => authState.actorId,
}));

const AUTHOR = "김밤하늘";
const READER = "reader-1";

beforeEach(() => {
  window.localStorage.clear();
  useNewsletterStore.getState().resetForTests();
  authState.actorId = null;
});

afterEach(() => {
  cleanup();
});

describe("NewsletterSubscribeButton", () => {
  it("게스트가 누르면 구독이 생기지 않는다", () => {
    render(<NewsletterSubscribeButton authorName={AUTHOR} />);
    fireEvent.click(screen.getByRole("button", { name: /작가 뉴스레터 구독/ }));
    expect(useNewsletterStore.getState().subscriptions).toHaveLength(0);
  });

  it("로그인 독자는 구독과 해지를 토글할 수 있다", () => {
    authState.actorId = READER;
    render(<NewsletterSubscribeButton authorName={AUTHOR} />);
    fireEvent.click(screen.getByRole("button", { name: /작가 뉴스레터 구독/ }));
    expect(useNewsletterStore.getState().subscriptions).toHaveLength(1);
    expect(screen.getByRole("button", { name: /뉴스레터 구독 중/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /뉴스레터 구독 중/ }));
    expect(useNewsletterStore.getState().subscriptions).toHaveLength(0);
  });
});

describe("MyNewslettersPage", () => {
  it("게스트에게는 로그인 유도를 보여준다", () => {
    render(
      <MemoryRouter>
        <MyNewslettersPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("로그인하면 구독을 관리할 수 있어요")).toBeTruthy();
  });

  it("구독 목록에서 바로 해지할 수 있다", () => {
    authState.actorId = READER;
    useNewsletterStore.getState().subscribe(AUTHOR, READER);
    render(
      <MemoryRouter>
        <MyNewslettersPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(AUTHOR)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "구독 해지" }));
    expect(useNewsletterStore.getState().subscriptions).toHaveLength(0);
    expect(screen.getByText("아직 구독 중인 작가가 없어요")).toBeTruthy();
  });
});

describe("NewsletterComposePage", () => {
  it("게스트에게는 로그인 유도를 보여준다", () => {
    render(
      <MemoryRouter>
        <NewsletterComposePage />
      </MemoryRouter>,
    );
    expect(screen.getByText("로그인하면 뉴스레터를 보낼 수 있어요")).toBeTruthy();
  });

  it("필명을 저장하고 글을 쓰면 미리보기와 발송 이력이 생긴다", async () => {
    authState.actorId = "author-1";
    // 같은 작가 이름으로 구독한 독자가 있어야 발송 가드를 통과한다.
    useNewsletterStore.getState().subscribe(AUTHOR, READER);

    render(
      <MemoryRouter>
        <NewsletterComposePage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("예: 김밤하늘"), { target: { value: AUTHOR } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(useNewsletterStore.getState().penName).toBe(AUTHOR);

    fireEvent.change(screen.getByPlaceholderText("예: 「하늘 고래」 24화 소식"), {
      target: { value: "24화 소식" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("구독자에게 전할 소식을 적어 주세요. 빈 줄로 단락을 나눌 수 있어요."),
      { target: { value: "새 화가 나왔어요.\n\n많이 봐 주세요." } },
    );
    // 미리보기에 제목과 단락이 반영된다.
    expect(screen.getByText("24화 소식")).toBeTruthy();
    expect(screen.getByText("새 화가 나왔어요.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "발송하기" }));
    await waitFor(() => {
      expect(useNewsletterStore.getState().sendHistory).toHaveLength(1);
    });
    const state = useNewsletterStore.getState();
    expect(state.issues[0].status).toBe("sent");
    expect(state.sendHistory[0]).toMatchObject({ issueTitle: "24화 소식", recipientCount: 1 });
    expect(screen.getByText(/발송을 기록했어요/)).toBeTruthy();
  });

  it("발송 어댑터가 예외로 실패하면 무반응 대신 오류 공지를 보여준다", async () => {
    authState.actorId = "author-1";
    useNewsletterStore.getState().subscribe(AUTHOR, READER);
    useNewsletterStore.setState({
      sendIssue: async () => {
        throw new Error("adapter unavailable");
      },
    });

    render(
      <MemoryRouter>
        <NewsletterComposePage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("예: 김밤하늘"), { target: { value: AUTHOR } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.change(screen.getByPlaceholderText("예: 「하늘 고래」 24화 소식"), {
      target: { value: "24화 소식" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("구독자에게 전할 소식을 적어 주세요. 빈 줄로 단락을 나눌 수 있어요."),
      { target: { value: "새 화가 나왔어요." } },
    );

    fireEvent.click(screen.getByRole("button", { name: "발송하기" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/발송 중 문제가 생겼어요/)).toBeTruthy();
    expect(useNewsletterStore.getState().sendHistory).toHaveLength(0);
  });
});
