// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "./auth-session";
import { persistSession, useSession } from "./auth-session-store";

const apiRaw = vi.hoisted(() => vi.fn());

vi.mock("@/src/infrastructure/api", () => ({
  api: { raw: apiRaw },
  apiPath: (path: string) => `/api${path}`,
}));

function authenticatedResponse(): Response {
  return new Response(
    JSON.stringify({
      authenticated: true,
      user: {
        id: "provider-user",
        name: "서버 사용자",
        email: null,
        image: null,
        role: "user",
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function SessionProbe() {
  const { data, status } = useSession();
  return <output>{`${status}:${data?.user.id ?? "none"}`}</output>;
}

describe("SessionProvider server reconciliation", () => {
  beforeEach(() => {
    apiRaw.mockReset();
    apiRaw.mockImplementation(async () => authenticatedResponse());
    persistSession(null);
  });

  afterEach(() => {
    cleanup();
    persistSession(null);
  });

  it("앱 시작과 다시 focus될 때 HttpOnly 쿠키 세션을 동기화한다", async () => {
    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    );

    await waitFor(() => expect(apiRaw).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("authenticated:provider-user")).toBeTruthy();

    globalThis.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(apiRaw).toHaveBeenCalledTimes(2));
  });
});
