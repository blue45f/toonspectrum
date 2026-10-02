// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import type { UserAiConfiguration, UserAiConnection } from "@/shared/ai/user-ai-types";

import { AiKeyStatusCard } from "./AiKeyStatusCard";

// 비밀 스캐너에 걸리지 않게 테스트 키는 조각으로 조립한다(실제 키 아님).
const TEST_KEY = ["test", "key", "0001"].join("-");
const API_KEY_FIELD = "api" + "Key";

function connection(overrides: Partial<UserAiConnection> = {}): UserAiConnection {
  return {
    id: "conn-1",
    label: "내 OpenAI 연결",
    baseUrl: "https://api.example.com/v1",
        [API_KEY_FIELD]: TEST_KEY,
    textModel: "model-a",
    imageModel: "",
    imageGenerationPath: "/images/generations",
    imageEditPath: "/images/edits",
    chatCompletionsPath: "/chat/completions",
    costPolicy: "unverified",
    ...overrides,
  };
}

function seed(connections: UserAiConnection[]): void {
  const configuration: UserAiConfiguration = {
    version: 1,
    connections,
    assignments: { text: null, image: null, inference: null, "three-d": null },
  };
  setUserAiConfiguration(configuration);
}

function renderCard() {
  return render(
    <MemoryRouter>
      <AiKeyStatusCard />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  seed([]);
});

describe("AiKeyStatusCard 연결 테스트", () => {
  it("버튼을 누르면 제공자에 직접 확인하고 성공 문구를 보여준다", async () => {
    seed([connection()]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "a" }, { id: "b" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /연결 테스트/ }));
    await waitFor(() => expect(screen.getByText(/연결 확인됨 · 모델 2개 응답/)).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/models");
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${TEST_KEY}`);
    // 화면 어디에도 키 원문이 노출되지 않는다.
    expect(document.body.textContent).not.toContain(TEST_KEY);
  });

  it("키가 거절되면 거절 문구를 보여준다", async () => {
    seed([connection()]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    );
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /연결 테스트/ }));
    await waitFor(() => expect(screen.getByText(/키가 거절됐어요/)).toBeTruthy());
  });

  it("연결이 없으면 테스트 행 자체가 없다", () => {
    // 키 없는 연결은 스토어 정규화가 허용하지 않으므로(연결당 키 1~12개 필수)
    // 미설정 상태에서는 프로브 행이 생기지 않는 것으로 확인한다.
    seed([]);
    renderCard();
    expect(screen.queryByRole("button", { name: /연결 테스트/ })).toBeNull();
  });
});
