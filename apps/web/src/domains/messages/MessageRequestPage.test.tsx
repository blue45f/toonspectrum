// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageRequestPage } from "./MessageRequestPage";

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
  createRequest: vi.fn(),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => mocks.session.current,
}));

vi.mock("@/domains/auth/public/session/auth-modal-intent", () => ({
  requestAuthModalOpen: mocks.requestAuthModalOpen,
}));

vi.mock("@/platform/messaging-client", () => ({
  messagingClient: {
    createRequest: mocks.createRequest,
  },
}));

vi.mock("@/platform/api", () => ({
  getApiErrorMessage: async (_cause: unknown, fallback: string) => fallback,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

function setSession(status: "authenticated" | "unauthenticated") {
  mocks.session.current = {
    data: status === "authenticated" ? { user: { id: "me", name: "나" } } : null,
    ready: true,
    status,
    update: async () => null,
  };
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/messages/new"
          element={(
            <>
              <MessageRequestPage />
              <LocationProbe />
            </>
          )}
        />
        <Route path="/messages/:threadId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setSession("unauthenticated");
  mocks.createRequest.mockResolvedValue({ thread: { id: "t9" } });
});

afterEach(cleanup);

describe("새 메시지 요청 페이지", () => {
  it("게스트에게는 로그인 안내를 보여준다", () => {
    setSession("unauthenticated");
    renderPage("/messages/new?to=u2&name=김작가");
    expect(screen.getByText("로그인 후 메시지를 보낼 수 있어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그인하기" }));
    expect(mocks.requestAuthModalOpen).toHaveBeenCalledWith(
      expect.objectContaining({ source: "message-request", mode: "login" }),
    );
  });

  it("받는 회원이 없으면 프로필에서 다시 시작하도록 안내한다", () => {
    setSession("authenticated");
    renderPage("/messages/new");
    expect(screen.getByText("받는 회원을 확인할 수 없어요.")).toBeTruthy();
  });

  it("요청을 보내면 만든 대화로 이동한다", async () => {
    setSession("authenticated");
    renderPage("/messages/new?to=u2&name=김작가");
    expect(screen.getByRole("heading", { name: /김작가 님에게 메시지 요청/ })).toBeTruthy();
    const submit = screen.getByRole("button", { name: /요청 보내기/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(
      screen.getByPlaceholderText(/간단한 소개와 연락 목적을 적어 주세요/),
      { target: { value: "작품 잘 보고 있어요." } },
    );
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    expect(mocks.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "u2", text: "작품 잘 보고 있어요." }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/messages/t9");
    });
  });
});
