// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceHomeRoute } from "./WorkspaceHomeRoute";
import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";
import {
  endGuestSession,
  getGuestIdentity,
  startGuestSession,
} from "@/domains/auth/public/session/guest-session";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  endGuestSession();
});

function renderWithSession(session: SessionContextValue, entry: string) {
  render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/home"
            element={
              <WorkspaceHomeRoute>
                <h1>Workspace dashboard</h1>
              </WorkspaceHomeRoute>
            }
          />
          <Route path="/" element={<p>Front door</p>} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

const loadingSession: SessionContextValue = {
  data: null,
  ready: false,
  status: "unauthenticated",
  update: async () => null,
};

const visitorSession: SessionContextValue = {
  data: null,
  ready: true,
  status: "unauthenticated",
  update: async () => null,
};

const userSession = {
  data: {
    user: { id: "user-1", name: "테스트", email: "test@example.com" },
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  },
  ready: true,
  status: "authenticated",
  update: async () => null,
} as SessionContextValue;

describe("WorkspaceHomeRoute", () => {
  it("renders the workspace for authenticated creators", () => {
    renderWithSession(userSession, "/home");
    expect(screen.getByRole("heading", { name: "Workspace dashboard" })).toBeTruthy();
  });

  it("shows a friendly gate instead of a silent redirect for visitors", () => {
    renderWithSession(visitorSession, "/home");
    expect(screen.queryByText("Workspace dashboard")).toBeNull();
    expect(screen.queryByText("Front door")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "창작 공간에 오신 것을 환영해요" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인하기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /게스트로 시작하기/ })).toBeTruthy();
  });

  it("lets guests straight into the workspace with a banner", () => {
    startGuestSession();
    expect(getGuestIdentity()).not.toBeNull();
    renderWithSession(visitorSession, "/home");
    expect(screen.getByRole("heading", { name: "Workspace dashboard" })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("guest entry button starts a guest session and enters the workspace", () => {
    renderWithSession(visitorSession, "/home");
    fireEvent.click(screen.getByRole("button", { name: /게스트로 시작하기/ }));
    expect(getGuestIdentity()).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Workspace dashboard" })).toBeTruthy();
  });

  it("guest banner can be dismissed", () => {
    startGuestSession();
    renderWithSession(visitorSession, "/home");
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a loading state while the session is not ready", () => {
    renderWithSession(loadingSession, "/home");
    expect(screen.getByLabelText("ToonStudio")).toBeTruthy();
    expect(screen.queryByText("Workspace dashboard")).toBeNull();
  });
});
