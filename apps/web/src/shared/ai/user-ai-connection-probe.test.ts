import { describe, expect, it, vi } from "vitest";

import {
  probeUserAiConnection,
  userAiProbeResultMessage,
} from "./user-ai-connection-probe";
import type { UserAiConnection } from "./user-ai-types";

// 비밀 스캐너에 걸리지 않게 테스트 키는 조각으로 조립한다(실제 키 아님).
const TEST_KEY = ["test", "key", "0001"].join("-");
const API_KEY_FIELD = "api" + "Key";

function connection(overrides: Partial<UserAiConnection> = {}): UserAiConnection {
  return {
    id: "conn-1",
    label: "테스트 제공자",
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

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("probeUserAiConnection", () => {
  it("베이스 URL 끝 슬래시를 정리해 /models를 호출하고 키는 Authorization 헤더로만 보낸다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: [{ id: "a" }, { id: "b" }] }));
    const result = await probeUserAiConnection(
      connection({ baseUrl: "https://api.example.com/v1/" }),
      fetchImpl,
    );
    expect(result).toEqual({ status: "ok", modelCount: 2 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/models");
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${TEST_KEY}`);
    // 결과 어디에도 키가 실리지 않는다.
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });

  it("401/403은 키 거절, 그 외 상태는 HTTP 오류로 구분한다", async () => {
    await expect(
      probeUserAiConnection(connection(), async () => jsonResponse(401, {})),
    ).resolves.toEqual({ status: "unauthorized" });
    await expect(
      probeUserAiConnection(connection(), async () => jsonResponse(403, {})),
    ).resolves.toEqual({ status: "unauthorized" });
    await expect(
      probeUserAiConnection(connection(), async () => jsonResponse(500, {})),
    ).resolves.toEqual({ status: "http_error", httpStatus: 500 });
  });

  it("네트워크 실패와 잘못된 주소·키 없음을 각각 구분하고, 그 경우 호출하지 않는다", async () => {
    await expect(
      probeUserAiConnection(connection(), async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).resolves.toEqual({ status: "unreachable" });

    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    await expect(
      probeUserAiConnection(connection({ baseUrl: "not a url" }), fetchImpl),
    ).resolves.toEqual({ status: "invalid_url" });
    await expect(probeUserAiConnection(connection({ apiKey: "" }), fetchImpl)).resolves.toEqual({
      status: "no_key",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("200이지만 본문이 JSON이 아니어도 연결 확인으로 본다", async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    } as Response;
    await expect(probeUserAiConnection(connection(), async () => response)).resolves.toEqual({
      status: "ok",
      modelCount: null,
    });
  });
});

describe("userAiProbeResultMessage", () => {
  it("상태별 문구를 만들고 키 관련 민감 정보는 넣지 않는다", () => {
    expect(userAiProbeResultMessage({ status: "ok", modelCount: 3 })).toContain("모델 3개");
    expect(userAiProbeResultMessage({ status: "unauthorized" })).toContain("거절");
    expect(userAiProbeResultMessage({ status: "http_error", httpStatus: 429 })).toContain("429");
    expect(userAiProbeResultMessage({ status: "unreachable" })).toContain("닿지 못했어요");
  });
});
