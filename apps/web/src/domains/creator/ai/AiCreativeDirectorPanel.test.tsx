// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiCreativeDirectorPanel } from "./AiCreativeDirectorPanel";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  complete: vi.fn(),
  signedIn: false,
}));

vi.mock("../studio-server-ai-client", () => ({
  getStudioServerAiStatus: mocks.status,
  completeStudioServerText: mocks.complete,
  studioServerAiProviderLabel: (provider: string) => `label:${provider}`,
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: mocks.signedIn ? { user: { id: "artist-1" } } : null }),
}));

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/studio/ai-lab"]}>
      <AiCreativeDirectorPanel />
    </MemoryRouter>,
  );
}

const configuredStatus = {
  configured: true,
  provider: "gemini",
  model: "gemini-flash",
  providers: [],
  selection: { default: "auto", order: [], fallback: false },
  capabilities: [],
  requiresAuth: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signedIn = false;
});

afterEach(cleanup);

describe("AiCreativeDirectorPanel", () => {
  it("starts with the suggestion list and blocks requests with real alternatives when AI is offline", async () => {
    mocks.status.mockRejectedValue(new Error("offline"));
    renderPanel();

    expect(screen.getByRole("heading", { name: "무엇을 함께 만들까요?" })).toBeTruthy();
    const suggestions = screen.getByRole("list", { name: "제안 목록" });
    expect(within(suggestions).getAllByRole("button")).toHaveLength(5);
    expect(within(suggestions).getByRole("button", { name: /스토리 확장하기/u }).getAttribute("aria-pressed")).toBe("true");

    expect(await screen.findByText("지금은 AI 연결이 준비되지 않아 요청을 보낼 수 없어요.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/요청 내용/u), { target: { value: "비 오는 날의 첫 만남" } });
    expect(screen.getByRole("button", { name: "루나에게 요청" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("link", { name: /스토리 랩에서 직접 정리/u }).getAttribute("href")).toBe("/story-lab");

    fireEvent.click(within(suggestions).getByRole("button", { name: /장면 구도 추천/u }));
    expect(screen.getByRole("link", { name: /포즈 스튜디오에서 구도 잡기/u }).getAttribute("href")).toBe("/studio/poser");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("sends the selected suggestion to the free AI route and shows the provider of the real answer", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.complete.mockResolvedValue({ ok: true, data: { content: "1화: 우산 아래의 만남", provider: "gemini", model: "gemini-flash" } });
    renderPanel();

    expect(await screen.findByText("자동 무료 AI 연결됨")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "예시 넣기" }));
    fireEvent.click(screen.getByRole("button", { name: "루나에게 요청" }));

    expect(await screen.findByText("1화: 우산 아래의 만남")).toBeTruthy();
    expect(mocks.complete).toHaveBeenCalledOnce();
    const [request] = mocks.complete.mock.calls[0] as [{ task: string; system: string; user: string; operationId: string }];
    expect(request.task).toBe("scenario");
    expect(request.system).toContain("Answer in Korean.");
    expect(request.user).toContain("Request: Expand a story");
    expect(request.operationId).toMatch(/^director-[0-9a-f-]{36}$/u);
    expect(screen.getByText(/label:gemini · gemini-flash/u)).toBeTruthy();
  });

  it("shows the failure honestly without inventing a result", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.complete.mockResolvedValue({ ok: false, code: "free_exhausted", error: "무료 한도가 모두 소진됐어요." });
    renderPanel();

    await screen.findByText("자동 무료 AI 연결됨");
    fireEvent.change(screen.getByLabelText(/요청 내용/u), { target: { value: "서아린, 17세" } });
    fireEvent.click(screen.getByRole("button", { name: "루나에게 요청" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("무료 한도가 모두 소진됐어요.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /루나의 제안/u })).toBeNull());
  });

  it("asks guests to sign in when the free pool requires an account", async () => {
    mocks.status.mockResolvedValue({ ...configuredStatus, requiresAuth: true });
    renderPanel();

    expect(await screen.findByText("로그인하면 자동 무료 AI로 바로 요청할 수 있어요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인" }).getAttribute("href")).toBe("/auth/login");
  });
});
