// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as freeAiPoolStatus from "./free-ai-pool-status";
import { getUserAiSnapshot, lockUserAi, setUserAiConfiguration } from "./user-ai-store";
import { EMPTY_AI_CONNECTION, type UserAiConnection } from "./user-ai-types";
import { UnifiedAiSettings, UnifiedAiSettingsEntryCard } from "./UnifiedAiSettings";

import { useI18n } from "@/shared/lib/i18n";

const INITIAL_LANGUAGE = useI18n.getState().lang;

function textConnection(id: string, label: string, priority: number): UserAiConnection {
  return {
    ...structuredClone(EMPTY_AI_CONNECTION),
    id,
    label,
    priority,
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: `key-${id}`,
    textModel: "openrouter/free",
    imageModel: "",
    costPolicy: "openrouter-free",
    apiKeys: [{ id: `key-${id}`, label: "기본 키", apiKey: `key-${id}`, enabled: true, priority: 10 }],
    models: [{ id: `model-${id}`, label: "무료 자동", model: "openrouter/free", capability: "text", enabled: true, priority: 10 }],
  };
}
const POOL_STATUS: freeAiPoolStatus.FreeAiPoolStatus = {
  configured: true,
  provider: "gemini",
  model: "managed-free-model",
  providers: [
    { id: "gemini", label: "Google Gemini", configured: true, model: "managed-free-model" },
    { id: "groq", label: "Groq", configured: true, model: "managed-free-model" },
  ],
  selection: { default: "auto", order: ["gemini", "groq"], fallback: true },
  requiresAuth: true,
  freePool: true,
};

describe("UnifiedAiSettings guided setup", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    vi.spyOn(freeAiPoolStatus, "getFreeAiPoolStatus").mockResolvedValue(POOL_STATUS);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
  });

  afterEach(() => {
    cleanup();
    lockUserAi(false);
    useI18n.setState({ lang: INITIAL_LANGUAGE });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the beginner flow first and keeps technical controls behind advanced settings", async () => {
    render(<UnifiedAiSettings />);

    expect(screen.getByRole("tab", { name: "시작하기" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "AI 연결하기" })).toBeTruthy();
    expect(await screen.findByText("AI를 사용할 준비가 되었어요")).toBeTruthy();
    expect(screen.queryByText("API 키 프로필")).toBeNull();
    expect(screen.queryByText("공개 HTTPS API baseURL")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "고급 설정" }));

    expect(await screen.findByText("전문가용 설정")).toBeTruthy();
    expect(await screen.findByText(
      "API 키 프로필",
      {},
      { timeout: 10_000 },
    )).toBeTruthy();
    expect(screen.getByText("클라우드 연결 편집")).toBeTruthy();
  });

  it("connects an OpenRouter key with one guided action and assigns it to text work", async () => {
    render(<UnifiedAiSettings />);

    fireEvent.click(screen.getByRole("button", { name: "AI 연결하기" }));
    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-or-test-key" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }));

    expect(await screen.findByText("OpenRouter 연결 완료")).toBeTruthy();
    expect(screen.getByText("API 키 확인까지 완료했어요.")).toBeTruthy();

    const snapshot = getUserAiSnapshot();
    expect(snapshot.configuration.connections).toHaveLength(1);
    expect(snapshot.configuration.connections[0]?.label).toBe("OpenRouter");
    expect(snapshot.configuration.assignments.text).toBe(snapshot.configuration.connections[0]?.id);
    const providerCalls = vi.mocked(globalThis.fetch).mock.calls.filter(([url]) =>
      String(url).startsWith("https://openrouter.ai/"),
    );
    expect(providerCalls).toHaveLength(1);
  });

  it("does not save a key when provider authentication fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));
    render(<UnifiedAiSettings />);

    fireEvent.click(screen.getByRole("button", { name: "AI 연결하기" }));
    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "invalid-key" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("키를 확인해 주세요");
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
  });

  it("saves a valid key even when the provider reports exhausted free quota", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "quota exhausted" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    })));
    render(<UnifiedAiSettings />);

    fireEvent.click(screen.getByRole("button", { name: "AI 연결하기" }));
    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "quota-limited-key" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }));

    expect(await screen.findByText("OpenRouter 연결 완료")).toBeTruthy();
    expect(screen.getByText("키는 저장했지만 현재 무료 사용량이 소진되어 있어요.")).toBeTruthy();
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(1);
  });

  it("stores accessible priority changes made with the up and down controls", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [textConnection("first", "첫 번째", 10), textConnection("second", "두 번째", 20)],
      assignments: { text: "first", image: null, inference: null, "three-d": null },
    });
    render(<UnifiedAiSettings />);

    fireEvent.click(screen.getByRole("tab", { name: "AI 사용 순서" }));
    fireEvent.click(screen.getByRole("radio", { name: "내가 정한 순서" }));
    fireEvent.click(screen.getByRole("button", { name: "두 번째 위로" }));

    const connections = getUserAiSnapshot().configuration.connections;
    expect(connections.find((item) => item.id === "second")?.priority).toBe(10);
    expect(connections.find((item) => item.id === "first")?.priority).toBe(20);
  });

  it("renders a secret-free compact entry card for embedded Studio surfaces", () => {
    render(<UnifiedAiSettingsEntryCard source="studio" />);

    const link = screen.getByRole("link", { name: /AI 설정 열기/ });
    expect(link.getAttribute("href")).toBe("/settings/ai?source=studio");
    expect(screen.getByText("개인 키 없이 자동 무료 AI부터 시작할 수 있어요")).toBeTruthy();
    expect(document.body.textContent).not.toContain("sk-");
  });
});
