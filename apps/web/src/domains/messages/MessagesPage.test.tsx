// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagesPage } from "./MessagesPage";

import type {
  MessagingMessage,
  MessagingThreadDetail,
  MessagingThreadSummary,
} from "@/platform/messaging-client";

const mocks = vi.hoisted(() => ({
  session: {
    current: {
      data: null as unknown,
      ready: true,
      status: "unauthenticated",
      update: async () => null,
    },
  },
  requestAuthModalOpen: vi.fn(),
  listThreads: vi.fn(),
  getThread: vi.fn(),
  sendMessage: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => mocks.session.current,
}));

vi.mock("@/domains/auth/public/session/auth-modal-intent", () => ({
  requestAuthModalOpen: mocks.requestAuthModalOpen,
}));

vi.mock("@/platform/messaging-client", () => ({
  messagingClient: {
    listThreads: mocks.listThreads,
    getThread: mocks.getThread,
    sendMessage: mocks.sendMessage,
    markRead: mocks.markRead,
    acceptRequest: vi.fn(async () => DETAIL),
    declineRequest: vi.fn(async () => ({ ok: true, threadId: "t1" })),
    archiveThread: vi.fn(async () => ({ threadId: "t1", archivedAt: null })),
    muteThread: vi.fn(async () => ({ threadId: "t1", mutedUntil: null })),
    blockUser: vi.fn(async () => ({ blocked: true, userId: "u2" })),
    reportMessage: vi.fn(async () => ({ id: "r1", status: "open" })),
    getPreferences: vi.fn(async () => ({
      receiveFrom: "everyone",
      emailNotification: true,
      readReceipt: true,
      updatedAt: null,
    })),
    updatePreferences: vi.fn(async () => ({
      receiveFrom: "everyone",
      emailNotification: true,
      readReceipt: true,
      updatedAt: null,
    })),
    listBlocks: vi.fn(async () => ({ items: [] })),
    unblockUser: vi.fn(async () => ({ blocked: false, userId: "u2" })),
  },
}));

vi.mock("@/platform/api", () => ({
  getApiErrorMessage: async (_cause: unknown, fallback: string) => fallback,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

const THREAD: MessagingThreadSummary = {
  id: "t1",
  state: "active",
  category: "feedback",
  context: { type: "work", id: "w1", label: "달빛 소녀", href: null },
  otherUser: { id: "u2", name: "김작가", image: null, avatar: null },
  createdByMe: false,
  incomingRequest: false,
  canReply: true,
  blocked: false,
  archivedAt: null,
  mutedUntil: null,
  unreadCount: 2,
  lastMessage: {
    id: "m1",
    senderId: "u2",
    type: "text",
    body: "안녕하세요!",
    createdAt: "2026-10-02T00:00:00.000Z",
    deletedAt: null,
  },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  lastMessageAt: "2026-10-02T00:00:00.000Z",
};

const INCOMING: MessagingMessage = {
  id: "m1",
  threadId: "t1",
  senderId: "u2",
  type: "text",
  body: "안녕하세요!",
  metadata: {},
  createdAt: "2026-10-02T00:00:00.000Z",
  deletedAt: null,
  mine: false,
  readByOther: false,
};

const DETAIL: MessagingThreadDetail = {
  thread: THREAD,
  messages: [INCOMING],
  nextBefore: null,
};

function setSession(status: "authenticated" | "unauthenticated", ready = true) {
  mocks.session.current = {
    data: status === "authenticated" ? { user: { id: "me", name: "나" } } : null,
    ready,
    status,
    update: async () => null,
  };
}

function renderPage(path = "/messages") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:threadId" element={<MessagesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setSession("unauthenticated");
  mocks.listThreads.mockResolvedValue({ items: [] });
  mocks.getThread.mockResolvedValue(DETAIL);
  mocks.markRead.mockResolvedValue({
    threadId: "t1",
    messageId: "m1",
    readAt: "2026-10-02T00:00:00.000Z",
  });
});

afterEach(cleanup);

describe("메시지함 페이지", () => {
  it("세션 확인 중에는 로딩 상태를 보여준다", () => {
    setSession("unauthenticated", false);
    renderPage();
    expect(screen.getByText("로그인 상태를 확인하고 있어요.")).toBeTruthy();
  });

  it("게스트에게는 로그인 안내와 로그인 행동 버튼을 보여준다", () => {
    setSession("unauthenticated");
    renderPage();
    expect(screen.getByText("로그인 후 메시지를 확인할 수 있어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그인하기" }));
    expect(mocks.requestAuthModalOpen).toHaveBeenCalledWith(
      expect.objectContaining({ source: "messages", mode: "login" }),
    );
  });

  it("대화가 없으면 빈 상태와 다음 행동을 안내한다", async () => {
    setSession("authenticated");
    renderPage();
    expect(await screen.findByText("아직 대화가 없습니다.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /새 대화 시작하기/ })).toBeTruthy();
  });

  it("대화 목록에 상대 이름·미리보기·안읽음 수를 보여준다", async () => {
    setSession("authenticated");
    mocks.listThreads.mockResolvedValue({ items: [THREAD] });
    renderPage();
    expect(await screen.findByText("김작가")).toBeTruthy();
    expect(screen.getByText("안녕하세요!")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("목록을 불러오지 못하면 오류를 알린다", async () => {
    setSession("authenticated");
    mocks.listThreads.mockRejectedValue(new Error("network down"));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("메시지 목록을 불러오지 못했어요.");
  });

  it("대화를 열면 메시지를 보여주고 새 메시지를 보낼 수 있다", async () => {
    setSession("authenticated");
    mocks.listThreads.mockResolvedValue({ items: [THREAD] });
    mocks.sendMessage.mockResolvedValue({
      id: "m2",
      threadId: "t1",
      senderId: "me",
      type: "text",
      body: "답장 고마워요.",
      metadata: {},
      createdAt: "2026-10-02T01:00:00.000Z",
      deletedAt: null,
      mine: true,
      readByOther: false,
    } satisfies MessagingMessage);
    renderPage("/messages/t1");
    // 사이드바 미리보기와 말풍선 두 곳에 같은 본문이 보인다
    expect((await screen.findAllByText("안녕하세요!")).length).toBe(2);
    const input = screen.getByPlaceholderText("메시지를 입력하세요.");
    fireEvent.change(input, { target: { value: "답장 고마워요." } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText("답장 고마워요.")).toBeTruthy();
    expect(mocks.sendMessage).toHaveBeenCalledWith("t1", { text: "답장 고마워요." });
    expect((input as HTMLTextAreaElement).value).toBe("");
  });
});
