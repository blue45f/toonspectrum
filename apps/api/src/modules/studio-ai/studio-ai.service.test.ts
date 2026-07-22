import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioAiService } from "./studio-ai.service";

import type { StudioAiAdmissionGate } from "./studio-ai-admission";
import type { StudioAiUsageStore } from "./studio-ai-usage";

const originalEnv = { ...process.env };

const compositionInput = {
  task: "composition" as const,
  promptVersion: 1 as const,
  system: "구도를 제안하세요.",
  user: "교실 장면",
};

const IDEMPOTENCY_KEY = "studio-ai-operation-0000000000000001";
const RECEIPT_KEY_HASH = new Uint8Array(32).fill(0x11);
const RECEIPT_REQUEST_HASH = new Uint8Array(32).fill(0x22);

function complete(
  service: StudioAiService,
  userId: string,
  input = compositionInput,
  signal?: AbortSignal
) {
  return service.complete(userId, input, IDEMPOTENCY_KEY, signal);
}

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
  admissionResult?: Awaited<ReturnType<StudioAiAdmissionGate["acquire"]>>;
  admissionError?: Error;
  renewResult?: Awaited<ReturnType<StudioAiAdmissionGate["renew"]>>;
  renewError?: Error;
  releaseResult?: boolean;
  releaseError?: Error;
  markSentResult?: boolean;
  markSentError?: Error;
  markSucceededResult?: boolean;
  markSucceededError?: Error;
  markAmbiguousResult?: boolean;
  markAmbiguousError?: Error;
  abandonBeforeSendResult?: boolean;
  abandonSafeRejectionResult?: boolean;
}) {
  const reserve = input?.reserveError
    ? vi.fn().mockRejectedValue(input.reserveError)
    : vi.fn().mockResolvedValue(input?.reserveResult ?? { allowed: true, usageDay: "2026-07-10" });
  const finalize = input?.finalizeError
    ? vi.fn().mockRejectedValue(input.finalizeError)
    : vi.fn().mockResolvedValue(undefined);
  const store = { reserve, finalize } as unknown as StudioAiUsageStore;
  const acquire = input?.admissionError
    ? vi.fn().mockRejectedValue(input.admissionError)
    : vi.fn().mockResolvedValue(input?.admissionResult ?? {
        status: "acquired",
        lease: {
          token: "test-admission-lease-token-0000000000001",
          fence: "7",
          expiresAt: new Date("2026-07-10T00:01:00.000Z"),
        },
        receipt: {
          userKeyHash: RECEIPT_KEY_HASH,
          requestHash: RECEIPT_REQUEST_HASH,
          fence: "7",
        },
      });
  const renew = input?.renewError
    ? vi.fn().mockRejectedValue(input.renewError)
    : vi.fn().mockResolvedValue(input?.renewResult === undefined
      ? {
          token: "test-admission-lease-token-0000000000001",
          fence: "7",
          expiresAt: new Date("2026-07-10T00:02:00.000Z"),
        }
      : input.renewResult);
  const release = input?.releaseError
    ? vi.fn().mockRejectedValue(input.releaseError)
    : vi.fn().mockResolvedValue(input?.releaseResult ?? true);
  const markSent = input?.markSentError
    ? vi.fn().mockRejectedValue(input.markSentError)
    : vi.fn().mockResolvedValue(input?.markSentResult ?? true);
  const markSucceeded = input?.markSucceededError
    ? vi.fn().mockRejectedValue(input.markSucceededError)
    : vi.fn().mockResolvedValue(input?.markSucceededResult ?? true);
  const markAmbiguous = input?.markAmbiguousError
    ? vi.fn().mockRejectedValue(input.markAmbiguousError)
    : vi.fn().mockResolvedValue(input?.markAmbiguousResult ?? true);
  const abandonBeforeSend = vi.fn().mockResolvedValue(input?.abandonBeforeSendResult ?? true);
  const abandonSafeRejection = vi.fn().mockResolvedValue(
    input?.abandonSafeRejectionResult ?? true
  );
  const admissionGate = {
    acquire,
    renew,
    release,
    markSent,
    markSucceeded,
    markAmbiguous,
    abandonBeforeSend,
    abandonSafeRejection,
  } as unknown as StudioAiAdmissionGate;
  return {
    service: new StudioAiService(store, admissionGate),
    reserve,
    finalize,
    acquire,
    renew,
    release,
    markSent,
    markSucceeded,
    markAmbiguous,
    abandonBeforeSend,
    abandonSafeRejection,
  };
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

  it.each([undefined, "short-key", " studio-ai-operation-0000000000000001"])(
    "유효하지 않은 Idempotency-Key %s는 DB·쿼터·공급자 전에 거절한다",
    async (idempotencyKey) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { service, acquire, reserve } = createService();

      const error = await captureHttpException(
        service.complete("studio-user-invalid-idempotency", compositionInput, idempotencyKey)
      );

      expect(error.getStatus()).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(acquire).not.toHaveBeenCalled();
      expect(reserve).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["key_reused_with_different_request", 409],
    ["request_admitted", 425],
    ["request_sent", 425],
    ["request_ambiguous", 409],
    ["request_succeeded", 409],
  ] as const)("멱등성 충돌 %s는 유료 공급자에 재전송하지 않는다", async (reason, status) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, reserve, release } = createService({
      admissionResult: { status: "idempotency_conflict", reason },
    });

    const error = await captureHttpException(
      complete(service, `studio-user-conflict-${reason}`)
    );

    expect(error.getStatus()).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it.each([
    ["false result", { markSentResult: false }],
    ["storage error", { markSentError: new Error("private postgres detail") }],
  ] as const)("전송 직전 receipt 저장 %s이면 provider fetch를 fail-closed한다", async (_label, options) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, markSent, abandonBeforeSend } = createService(options);

    const error = await captureHttpException(
      complete(service, "studio-user-mark-sent-failure")
    );

    expect(error.getStatus()).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(markSent).toHaveBeenCalledOnce();
    expect(abandonBeforeSend).toHaveBeenCalledWith({
      userId: "studio-user-mark-sent-failure",
      userKeyHash: RECEIPT_KEY_HASH,
      requestHash: RECEIPT_REQUEST_HASH,
      fence: "7",
    });
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
    const {
      service,
      reserve,
      finalize,
      acquire,
      renew,
      release,
      markSent,
      markSucceeded,
      markAmbiguous,
    } = createService();
    const result = await complete(
      service,
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
    expect(acquire).toHaveBeenCalledWith({
      userId: "studio-user-success",
      identity: {
        userKeyHash: expect.any(Uint8Array),
        requestHash: expect.any(Uint8Array),
      },
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 60_000,
    });
    expect(renew).toHaveBeenCalledWith({
      userId: "studio-user-success",
      token: "test-admission-lease-token-0000000000001",
      fence: "7",
      leaseMs: 60_000,
    });
    expect(release).toHaveBeenCalledWith({
      userId: "studio-user-success",
      token: "test-admission-lease-token-0000000000001",
      fence: "7",
    });
    expect(markSent).toHaveBeenCalledOnce();
    expect(markSucceeded).toHaveBeenCalledWith({
      userId: "studio-user-success",
      userKeyHash: RECEIPT_KEY_HASH,
      requestHash: RECEIPT_REQUEST_HASH,
      fence: "7",
    });
    expect(markAmbiguous).not.toHaveBeenCalled();
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

  it("공급자 성공 뒤 receipt 마감 장애는 sent 재생 차단을 보존하고 유료 결과를 숨기지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "완료" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = createService({
      markSucceededError: new Error("private receipt storage detail"),
    });

    await expect(
      complete(service, "studio-user-receipt-finalization-failure")
    ).resolves.toMatchObject({ content: "완료" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "[studio-ai] receipt finalization failed",
      { outcome: "succeeded", attemptCount: 1 }
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private receipt storage detail");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "studio-user-receipt-finalization-failure"
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
      complete(service, "studio-user-already-aborted", compositionInput, clientController.signal)
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

    const request = complete(
      service,
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
      complete(service, "studio-user-timeout")
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
    const { service, finalize, markAmbiguous, abandonSafeRejection } = createService();

    const error = await captureHttpException(
      complete(service, "studio-user-provider-429")
    );

    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toBe(
      "AI 제공자의 동시 호출 또는 요청 속도 한도에 도달했어요. 잠시 후 다시 시도해 주세요."
    );
    expect(JSON.stringify(error.getResponse())).not.toContain("provider-internal-quota-detail");
    expect(JSON.stringify(error.getResponse())).not.toContain("test-server-key");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "provider_rate_limited" }));
    expect(abandonSafeRejection).toHaveBeenCalledOnce();
    expect(markAmbiguous).not.toHaveBeenCalled();
  });

  it("제공자 5xx 본문을 노출하지 않고 503으로 정규화한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("provider-secret-debug-payload", { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize, markAmbiguous } = createService();

    const error = await captureHttpException(
      complete(service, "studio-user-provider-500")
    );

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      statusCode: 503,
      message: "AI 제공자가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(error.getResponse())).not.toContain("provider-secret-debug-payload");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "provider_error" }));
    expect(markAmbiguous).toHaveBeenCalledOnce();
  });

  it("키가 없으면 외부 요청 전에 비활성 오류를 반환한다", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, reserve } = createService();

    await expect(
      complete(service, "studio-user-no-key")
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

    await expect(complete(service, "studio-user-missing-usage")).resolves.toMatchObject({
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

    const error = await captureHttpException(complete(service, "studio-user-filtered"));

    expect(error.getStatus()).toBe(422);
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({ status: "content_filtered", usage: { promptTokens: 7, completionTokens: 0, totalTokens: 7 } })
    );
  });

  it("네트워크 실패를 안전한 오류와 network_error 상태로 기록한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket included secret details")));
    const { service, finalize, markAmbiguous } = createService();

    const error = await captureHttpException(complete(service, "studio-user-network"));

    expect(error.getStatus()).toBe(502);
    expect(JSON.stringify(error.getResponse())).not.toContain("socket included secret details");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "network_error" }));
    expect(markAmbiguous).toHaveBeenCalledWith({
      userId: "studio-user-network",
      userKeyHash: RECEIPT_KEY_HASH,
      requestHash: RECEIPT_REQUEST_HASH,
      fence: "7",
    });
  });

  it("분산 요청 gate DB 실패는 쿼터 예약과 공급자 호출 전에 fail-closed 503을 반환한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, reserve, release } = createService({
      admissionError: new Error("postgres admission connection detail"),
    });

    const error = await captureHttpException(
      complete(service, "studio-user-admission-db-failure")
    );

    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error.getResponse())).not.toContain("postgres admission connection detail");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it.each([
    ["rate_limited", "AI 요청이 너무 많아요"],
    ["busy", "이미 처리 중인 서버 AI 요청이 있어요"],
  ] as const)("분산 %s 거절 시 유료 공급자를 호출하지 않는다", async (status, message) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, reserve, release } = createService({ admissionResult: { status } });

    const error = await captureHttpException(
      complete(service, `studio-user-admission-${status}`)
    );

    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it.each([
    ["stale fence", { renewResult: null }],
    ["renew storage failure", { renewError: new Error("postgres renew connection detail") }],
  ] as const)("%s renewal failure settles the reservation at zero before any paid call", async (_case, options) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, reserve, renew, finalize, release } = createService(options);

    const error = await captureHttpException(
      complete(service, "studio-user-renew-failure")
    );

    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error.getResponse())).not.toContain("postgres renew connection detail");
    expect(reserve).toHaveBeenCalledOnce();
    expect(renew).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      userId: "studio-user-renew-failure",
      status: "network_error",
      usage: { totalTokens: 0 },
    }));
    expect(release).toHaveBeenCalledOnce();
  });

  it("DB 예약 실패는 공급자 호출 전에 fail-closed 503을 반환한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize, release } = createService({
      reserveError: new Error("postgres connection string detail"),
    });

    const error = await captureHttpException(complete(service, "studio-user-reserve-db-failure"));

    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error.getResponse())).not.toContain("postgres connection string detail");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("원자 일일 쿼터 거절 시 공급자를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService({ reserveResult: { allowed: false } });

    const error = await captureHttpException(complete(service, "studio-user-quota-denied"));

    expect(error.getStatus()).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("유료 성공 후 원장 마감 실패는 보수 예약을 유지하고 결과를 보존해 중복 과금을 막는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "완료" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, finalize, release } = createService({
      finalizeError: new Error("ledger write detail"),
    });

    await expect(
      complete(service, "studio-user-finalize-db-failure")
    ).resolves.toMatchObject({ content: "완료" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "[studio-ai] usage finalization failed after paid success",
      expect.objectContaining({ provider: "deepseek", attemptCount: 1 })
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("ledger write detail");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("studio-user-finalize-db-failure");
  });

  it("공급자 실패와 원장 마감 실패가 겹치면 결과 없이 fail-closed 503을 유지한다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("provider network detail"));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService({
      finalizeError: new Error("ledger write detail"),
    });

    const error = await captureHttpException(
      complete(service, "studio-user-provider-and-ledger-failure")
    );

    expect(error.getStatus()).toBe(503);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledOnce();
    expect(JSON.stringify(error.getResponse())).not.toContain("provider network detail");
    expect(JSON.stringify(error.getResponse())).not.toContain("ledger write detail");
  });

  it("정상 응답 후 exact lease가 이미 stale이어도 재시도 중복 과금을 막기 위해 결과를 보존한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "완료" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService({ releaseResult: false });

    await expect(
      complete(service, "studio-user-stale-release")
    ).resolves.toMatchObject({ content: "완료" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("lease 해제 DB 장애는 만료 회복에 맡기고 이미 생성된 성공 결과를 숨기지 않는다", async () => {
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
    const { service } = createService({
      releaseError: new Error("postgres release connection detail"),
    });

    await expect(
      complete(service, "studio-user-release-db-failure")
    ).resolves.toMatchObject({ content: "완료" });
  });

  it("lease 해제 DB 장애가 원래 공급자 오류를 덮어 불필요한 재시도를 유발하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider network detail")));
    const { service } = createService({
      releaseError: new Error("postgres release connection detail"),
    });

    const error = await captureHttpException(
      complete(service, "studio-user-release-preserves-provider-error")
    );

    expect(error.getStatus()).toBe(502);
    expect(JSON.stringify(error.getResponse())).not.toContain("postgres release connection detail");
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
    const { service, finalize, markSent, markSucceeded } = createService();

    await expect(complete(service, "studio-user-zai-fallback")).resolves.toMatchObject({
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
    expect(markSent).toHaveBeenCalledTimes(2);
    expect(markSucceeded).toHaveBeenCalledOnce();
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

    const result = await complete(
      service,
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

    const result = await complete(
      service,
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
      complete(service, `studio-user-zai-rate-${String(_label)}`)
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
      complete(service, `studio-user-no-fallback-${status}`)
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
      complete(service, "studio-user-network-no-fallback")
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
      complete(service, "studio-user-system-resource-no-fallback")
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
      complete(service, "studio-user-all-balance-exhausted")
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
      complete(service, "studio-user-unconfigured-explicit", { ...compositionInput, provider: "zai" })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });
});
