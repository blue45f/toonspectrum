// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceHomeRoute } from "./WorkspaceHomeRoute";
import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";

afterEach(cleanup);

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

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
          <Route path="/" element={<LocationProbe />} />
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

const guestSession: SessionContextValue = {
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

  it("redirects logged-out visitors to the public front door", () => {
    renderWithSession(guestSession, "/home");
    const location = screen.getByTestId("location");
    expect(location.textContent).toContain("/");
    expect(location.textContent).toContain("next=");
    expect(screen.queryByText("Workspace dashboard")).toBeNull();
  });

  it("shows a loading state while the session is not ready", () => {
    renderWithSession(loadingSession, "/home");
    expect(screen.getByLabelText("ToonStudio")).toBeTruthy();
    expect(screen.queryByText("Workspace dashboard")).toBeNull();
  });

  it("preserves the original destination in the redirect", () => {
    renderWithSession(guestSession, "/home?project=abc");
    const location = screen.getByTestId("location");
    expect(decodeURIComponent(location.textContent ?? "")).toContain("/home");
  });
});
