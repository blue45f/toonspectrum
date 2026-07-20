import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioAiService } from "./studio-ai.service";

import type { StudioAiUsageStore } from "./studio-ai-usage";

const originalEnv = { ...process.env };

const compositionInput = {
  task: "composition" as const,
  promptVersion: 1 as const,
  system: "구도를 제안하세요.",
  user: "교실 장면",
};

async function captureHttpException(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) return error;
    throw error;
  }
  throw new Error("Expected the request to reject with HttpException.");
}

function rejectWhenAborted(signal: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const rejectAbort = () => reject(new DOMException("The operation was aborted", "AbortError"));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener("abort", rejectAbort, { once: true });
  });
}

function createService(input?: {
  reserveResult?: Awaited<ReturnType<StudioAiUsageStore["reserve"]>>;
  reserveError?: Error;
  finalizeError?: Error;
}) {
  const reserve = input?.reserveError
    ? vi.fn().mockRejectedValue(input.reserveError)
    : vi.fn().mockResolvedValue(input?.reserveResult ?? { allowed: true, usageDay: "2026-07-10" });
  const finalize = input?.finalizeError
    ? vi.fn().mockRejectedValue(input.finalizeError)
    : vi.fn().mockResolvedValue(undefined);
  const store = { reserve, finalize } as unknown as StudioAiUsageStore;
  return { service: new StudioAiService(store), reserve, finalize };
}

describe("StudioAiService", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-server-key";
    process.env.DEEPSEEK_USER_ID_SALT = "test-user-id-salt-that-is-long-enough";
    delete process.env.ZAI_API_KEY;
    delete process.env.ZAI_MODEL;
    delete process.env.ZAI_TIMEOUT_MS;
    delete process.env.STUDIO_AI_PROVIDER_ORDER;
    delete process.env.STUDIO_AI_TIMEOUT_MS;
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_TIMEOUT_MS;
    delete process.env.STUDIO_AI_DAILY_REQUEST_LIMIT;
    delete process.env.STUDIO_AI_DAILY_TOKEN_LIMIT;
    delete process.env.STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT;
    delete process.env.STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("상태 응답에 키를 노출하지 않는다", () => {
    const status = createService().service.status();
    expect(status).toMatchObject({ configured: true, provider: "deepseek", model: "deepseek-v4-flash" });
    expect(status.quota).toEqual({
      enforced: true,
      timezone: "UTC",
      failureMode: "closed",
      dailyRequestLimit: 200,
      dailyTokenLimit: 1_000_000,
      globalDailyRequestLimit: 500,
      globalDailyTokenLimit: 2_000_000,
    });
    expect(status.selection).toMatchObject({
      fallback: true,
      fallbackPolicy: "billing_quota_exhausted",
      explicitPreferenceFallback: true,
    });
    expect(JSON.stringify(status)).not.toContain("test-server-key");
  });

  it("서버 고정 모델과 키로 제한된 창작 요청을 전달한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "deepseek-v4-flash",
          choices: [{ finish_reason: "stop", message: { content: '{"scenes":[]}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const clientController = new AbortController();
    const removeListenerSpy = vi.spyOn(clientController.signal, "removeEventListener");
    const { service, reserve, finalize } = createService();
    const result = await service.complete(
      "studio-user-success",
      {
        task: "scenario",
        promptVersion: 1,
        system: "반드시 JSON 객체로 응답하세요.",
        user: "우산을 잃어버린 주인공",
      },
      clientController.signal
    );

    expect(result).toMatchObject({ content: '{"scenes":[]}', provider: "deepseek", usage: { totalTokens: 20 } });
    expect(result).not.toHaveProperty("failover");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-server-key");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      stream: false,
      max_tokens: 2_400,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
    });
    expect(body.user_id).not.toBe("studio-user-success");
    expect(JSON.stringify(body)).not.toContain("test-server-key");
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(clientController.signal.aborted).toBe(false);
    expect(reserve).toHaveBeenCalledWith({
      userId: "studio-user-success",
      reservedTokens: expect.any(Number),
      limits: {
        dailyRequests: 200,
        dailyTokens: 1_000_000,
        globalDailyRequests: 500,
        globalDailyTokens: 2_000_000,
      },
    });
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "studio-user-success",
        usageDay: "2026-07-10",
        task: "scenario",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        attemptCount: 1,
        status: "success",
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      })
    );
  });

  it("이미 종료된 클라이언트 요청은 외부 호출 전에 499로 중단하고 자원을 정리한다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const clientController = new AbortController();
    clientController.abort();
    const removeListenerSpy = vi.spyOn(clientController.signal, "removeEventListener");
    const { service, finalize } = createService();

    const error = await captureHttpException(
      service.complete("studio-user-already-aborted", compositionInput, clientController.signal)
    );

    expect(error.getStatus()).toBe(499);
    expect(error.getResponse()).toBe("AI 요청 연결이 종료됐어요.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "client_aborted", usage: {} }));
  });

  it("클라이언트가 외부 호출 중 연결을 끊으면 업스트림을 취소하고 499로 구분한다", async () => {
    let upstreamSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      upstreamSignal = init.signal as AbortSignal;
      return rejectWhenAborted(upstreamSignal);
    });
    vi.stubGlobal("fetch", fetchMock);
    const clientController = new AbortController();
    const removeListenerSpy = vi.spyOn(clientController.signal, "removeEventListener");
    const { service, finalize } = createService();

    const request = service.complete(
      "studio-user-disconnect",
      compositionInput,
      clientController.signal
    );
    const errorPromise = captureHttpException(request);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    clientController.abort();
    const error = await errorPromise;

    expect(error.getStatus()).toBe(499);
    expect(error.getResponse()).toBe("AI 요청 연결이 종료됐어요.");
    expect(upstreamSignal?.aborted).toBe(true);
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "client_aborted" }));
  });

  it("전체 업스트림 응답 시간이 초과되면 본문 읽기도 취소하고 504로 구분한다", async () => {
    vi.useFakeTimers();
    process.env.DEEPSEEK_TIMEOUT_MS = "5000";
    let upstreamSignal: AbortSignal | undefined;
    let markBodyStarted: (() => void) | undefined;
    const bodyStarted = new Promise<void>((resolve) => {
      markBodyStarted = resolve;
    });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      upstreamSignal = init.signal as AbortSignal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => {
          markBodyStarted?.();
          return rejectWhenAborted(upstreamSignal as AbortSignal);
        },
      } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const errorPromise = captureHttpException(
      service.complete("studio-user-timeout", compositionInput)
    );
    await bodyStarted;
    await vi.advanceTimersByTimeAsync(5_000);
    const error = await errorPromise;

    expect(error.getStatus()).toBe(504);
    expect(error.getResponse()).toMatchObject({
      statusCode: 504,
      message: "AI 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.",
    });
    expect(upstreamSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "timeout" }));
  });

  it("제공자 429를 로컬 취소/타임아웃과 다른 안전한 응답으로 유지한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("provider-internal-quota-detail", { status: 429 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const error = await captureHttpException(
      service.complete("studio-user-provider-429", compositionInput)
    );

    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toBe(
      "AI 제공자의 동시 호출 또는 요청 속도 한도에 도달했어요. 잠시 후 다시 시도해 주세요."
    );
    expect(JSON.stringify(error.getResponse())).not.toContain("provider-internal-quota-detail");
    expect(JSON.stringify(error.getResponse())).not.toContain("test-server-key");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "provider_rate_limited" }));
  });

  it("제공자 5xx 본문을 노출하지 않고 503으로 정규화한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("provider-secret-debug-payload", { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const error = await captureHttpException(
      service.complete("studio-user-provider-500", compositionInput)
    );

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      statusCode: 503,
      message: "AI 제공자가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(error.getResponse())).not.toContain("provider-secret-debug-payload");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "provider_error" }));
  });

  it("키가 없으면 외부 요청 전에 비활성 오류를 반환한다", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, reserve } = createService();

    await expect(
      service.complete("studio-user-no-key", compositionInput)
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("사용량이 누락된 정상 응답은 원장 토큰을 추측하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "provider-reported-model",
            choices: [{ finish_reason: "stop", message: { content: "완료" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { service, finalize } = createService();

    await expect(service.complete("studio-user-missing-usage", compositionInput)).resolves.toMatchObject({
      content: "완료",
      model: "provider-reported-model",
    });

    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-v4-flash",
        status: "success",
        usage: { promptTokens: undefined, completionTokens: undefined, totalTokens: undefined },
      })
    );
  });

  it("콘텐츠 필터 응답을 별도 상태로 기록한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "content_filter", message: { content: "" } }],
            usage: { prompt_tokens: 7, completion_tokens: 0, total_tokens: 7 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { service, finalize } = createService();

    const error = await captureHttpException(service.complete("studio-user-filtered", compositionInput));

    expect(error.getStatus()).toBe(422);
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({ status: "content_filtered", usage: { promptTokens: 7, completionTokens: 0, totalTokens: 7 } })
    );
  });

  it("네트워크 실패를 안전한 오류와 network_error 상태로 기록한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket included secret details")));
    const { service, finalize } = createService();

    const error = await captureHttpException(service.complete("studio-user-network", compositionInput));

    expect(error.getStatus()).toBe(502);
    expect(JSON.stringify(error.getResponse())).not.toContain("socket included secret details");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "network_error" }));
  });

  it("DB 예약 실패는 공급자 호출 전에 fail-closed 503을 반환한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService({ reserveError: new Error("postgres connection string detail") });

    const error = await captureHttpException(service.complete("studio-user-reserve-db-failure", compositionInput));

    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error.getResponse())).not.toContain("postgres connection string detail");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("원자 일일 쿼터 거절 시 공급자를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService({ reserveResult: { allowed: false } });

    const error = await captureHttpException(service.complete("studio-user-quota-denied", compositionInput));

    expect(error.getStatus()).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("응답 후 원장 커밋 실패도 결과를 반환하지 않고 fail-closed 503으로 바꾼다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: "완료" } }],
            usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { service } = createService({ finalizeError: new Error("ledger write detail") });

    const error = await captureHttpException(service.complete("studio-user-finalize-db-failure", compositionInput));

    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error.getResponse())).not.toContain("ledger write detail");
  });

  it("auto 선택은 Z.ai 한도 응답 뒤 DeepSeek로 안전하게 전환하고 실제 제공자를 기록한다", async () => {
    process.env.ZAI_API_KEY = "zai-test-key";
    process.env.ZAI_MODEL = "glm-5.1";
    process.env.STUDIO_AI_PROVIDER_ORDER = "zai,deepseek";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":{"code":"1113"}}', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "deepseek-request-2",
            model: "deepseek-v4-flash",
            choices: [{ finish_reason: "stop", message: { content: "fallback 완료" } }],
            usage: { prompt_tokens: 6, completion_tokens: 3, total_tokens: 9 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    await expect(service.complete("studio-user-zai-fallback", compositionInput)).resolves.toMatchObject({
      content: "fallback 완료",
      provider: "deepseek",
      requestId: "deepseek-request-2",
      failover: {
        attemptedProvider: "zai",
        attemptedModel: "glm-5.1",
        actualProvider: "deepseek",
        actualModel: "deepseek-v4-flash",
        reason: "billing_quota_exhausted",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.deepseek.com/chat/completions");
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<string, unknown>;
    expect(firstBody).toMatchObject({ model: "glm-5.1", thinking: { type: "disabled" } });
    expect(firstBody).not.toHaveProperty("user_id");
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "deepseek",
        model: "deepseek-v4-flash",
        attemptCount: 2,
        status: "success",
      })
    );
  });

  it("명시적으로 선택한 Z.ai도 잔액 소진이 명확하면 설정된 DeepSeek로 전환한다", async () => {
    process.env.ZAI_API_KEY = "zai-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":{"code":"1113","message":"private provider detail"}}', { status: 429 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "deepseek-live-model",
            choices: [{ finish_reason: "stop", message: { content: "명시 선택 fallback 완료" } }],
            usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const result = await service.complete(
      "studio-user-zai-explicit",
      { ...compositionInput, provider: "zai" }
    );

    expect(result).toMatchObject({
      content: "명시 선택 fallback 완료",
      provider: "deepseek",
      model: "deepseek-live-model",
      failover: {
        attemptedProvider: "zai",
        attemptedModel: "glm-5.1",
        actualProvider: "deepseek",
        actualModel: "deepseek-live-model",
        reason: "billing_quota_exhausted",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private provider detail");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.deepseek.com/chat/completions");
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "deepseek",
        model: "deepseek-v4-flash",
        attemptCount: 2,
        status: "success",
      })
    );
  });

  it("명시적으로 선택한 DeepSeek 402 뒤 설정된 Z.ai로 전환한다", async () => {
    process.env.ZAI_API_KEY = "zai-test-key";
    process.env.ZAI_MODEL = "glm-live-model";
    process.env.STUDIO_AI_PROVIDER_ORDER = "zai,deepseek";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":{"message":"insufficient balance private detail"}}', { status: 402 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "zai-request-after-deepseek",
            model: "glm-provider-response-model",
            choices: [{ finish_reason: "stop", message: { content: "Z.ai 전환 완료" } }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const result = await service.complete(
      "studio-user-deepseek-explicit-fallback",
      { ...compositionInput, provider: "deepseek" }
    );

    expect(result).toMatchObject({
      content: "Z.ai 전환 완료",
      provider: "zai",
      model: "glm-provider-response-model",
      requestId: "zai-request-after-deepseek",
      failover: {
        attemptedProvider: "deepseek",
        attemptedModel: "deepseek-v4-flash",
        actualProvider: "zai",
        actualModel: "glm-provider-response-model",
        reason: "billing_quota_exhausted",
      },
    });
    expect(JSON.stringify(result)).not.toContain("insufficient balance private detail");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.deepseek.com/chat/completions",
      "https://api.z.ai/api/paas/v4/chat/completions",
    ]);
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      provider: "zai",
      model: "glm-live-model",
      attemptCount: 2,
      status: "success",
    }));
  });

  it.each([
    ["코드 없는 일반 429", '{"error":{"message":"too many requests"}}'],
    ["동시성 rate-limit 1302", '{"error":{"code":"1302"}}'],
    ["호출 빈도 rate-limit 1303", '{"error":{"code":"1303"}}'],
    ["일반 rate-limit 1305", '{"error":{"code":"1305"}}'],
    ["고트래픽 1312", '{"error":{"code":"1312"}}'],
  ])("Z.ai %s는 잔액 소진이 아니므로 다른 제공자에 중복 전송하지 않는다", async (_label, body) => {
    process.env.ZAI_API_KEY = "zai-test-key";
    process.env.STUDIO_AI_PROVIDER_ORDER = "zai,deepseek";
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const error = await captureHttpException(
      service.complete(`studio-user-zai-rate-${String(_label)}`, compositionInput)
    );

    expect(error.getStatus()).toBe(429);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      provider: "zai",
      attemptCount: 1,
      status: "provider_rate_limited",
    }));
  });

  it.each([
    [401, "authentication-private-detail", 503],
    [403, "permission-private-detail", 503],
    [500, "provider-secret-500", 503],
    [503, "provider-secret-503", 503],
  ])("첫 제공자 HTTP %s는 결제 거절이 아니므로 fallback하지 않는다", async (status, privateBody, expectedStatus) => {
    process.env.ZAI_API_KEY = "zai-test-key";
    process.env.STUDIO_AI_PROVIDER_ORDER = "zai,deepseek";
    const fetchMock = vi.fn().mockResolvedValue(new Response(privateBody, { status }));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const error = await captureHttpException(
      service.complete(`studio-user-no-fallback-${status}`, compositionInput)
    );

    expect(error.getStatus()).toBe(expectedStatus);
    expect(JSON.stringify(error.getResponse())).not.toContain(privateBody);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      provider: "zai",
      attemptCount: 1,
      status: "provider_error",
    }));
  });

  it("네트워크 실패는 두 제공자가 설정되어도 다른 제공자에 재전송하지 않는다", async () => {
    process.env.ZAI_API_KEY = "zai-test-key";
    process.env.STUDIO_AI_PROVIDER_ORDER = "zai,deepseek";
    const fetchMock = vi.fn().mockRejectedValue(new Error("ambiguous socket failure"));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const error = await captureHttpException(
      service.complete("studio-user-network-no-fallback", compositionInput)
    );

    expect(error.getStatus()).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      provider: "zai",
      attemptCount: 1,
      status: "network_error",
    }));
  });

  it("200 응답 뒤 시스템 리소스 부족 종료는 이미 처리에 들어갔을 수 있어 fallback하지 않는다", async () => {
    process.env.ZAI_API_KEY = "zai-test-key";
    process.env.STUDIO_AI_PROVIDER_ORDER = "zai,deepseek";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "insufficient_system_resource", message: { content: "" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const error = await captureHttpException(
      service.complete("studio-user-system-resource-no-fallback", compositionInput)
    );

    expect(error.getStatus()).toBe(503);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      provider: "zai",
      attemptCount: 1,
      status: "provider_error",
    }));
  });

  it("두 제공자 모두 잔액이 소진되면 두 번째의 안전한 오류로 끝내고 원문은 노출하지 않는다", async () => {
    process.env.ZAI_API_KEY = "zai-test-key";
    process.env.STUDIO_AI_PROVIDER_ORDER = "zai,deepseek";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":{"code":"1310","message":"zai-private"}}', { status: 429 })
      )
      .mockResolvedValueOnce(
        new Response('{"error":{"message":"deepseek-private"}}', { status: 402 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const error = await captureHttpException(
      service.complete("studio-user-all-balance-exhausted", compositionInput)
    );

    expect(error.getStatus()).toBe(429);
    expect(JSON.stringify(error.getResponse())).not.toContain("zai-private");
    expect(JSON.stringify(error.getResponse())).not.toContain("deepseek-private");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      attemptCount: 2,
      status: "provider_rate_limited",
    }));
  });

  it("명시 선택 제공자가 설정되지 않았으면 다른 키가 있어도 외부 호출 전에 거절한다", async () => {
    delete process.env.ZAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, reserve } = createService();

    await expect(
      service.complete("studio-user-unconfigured-explicit", { ...compositionInput, provider: "zai" })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });
});
