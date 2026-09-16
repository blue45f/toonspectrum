import { assertFreeAiConnection } from "./free-ai-policy";
import {
  FreeAiRuntimeBudgetError,
  guardFreeAiRuntimeRequest,
  MANAGED_FREE_MAX_RESPONSE_BYTES,
  recordFreeAiRuntimeResponse,
} from "./free-ai-runtime-budget";
import {
  getUserAiSnapshot,
  registerUserAiRequest,
  requireUserAiConnection,
  userAiAutomaticExternalConnectionsForCapability,
} from "./user-ai-store";
import {
  validateUserAiBaseUrl,
  validateUserAiPath,
  type UserAiCapability,
  type UserAiResolvedConnection,
} from "./user-ai-types";

export interface UserAiRequestOptions {
  signal?: AbortSignal;
  connectionId?: string;
  revision?: number;
  method?: string;
  maxBytes?: number;
  headers?: HeadersInit;
  /** Internal explicit candidate used by the automatic free connection chain. */
  connection?: UserAiResolvedConnection;
}

export type UserAiTransportErrorCode =
  | "not-configured"
  | "quota-exhausted"
  | "all-free-exhausted"
  | "authentication"
  | "http-error";

export class UserAiTransportError extends Error {
  constructor(
    readonly code: UserAiTransportErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UserAiTransportError";
  }
}

export function isUserAiQuotaExhaustion(error: unknown): boolean {
  return error instanceof FreeAiRuntimeBudgetError
    || (error instanceof UserAiTransportError
      && (error.code === "quota-exhausted" || error.code === "all-free-exhausted"));
}

const MAX_JSON_BYTES = 80 * 1024 * 1024;

async function readBounded(
  response: Response,
  maximum: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body || Number(response.headers.get("content-length") ?? 0) > maximum) {
    await response.body?.cancel();
    throw new Error("AI 응답 용량이 허용 범위를 넘었습니다.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > maximum) {
        throw new Error("AI 응답 용량이 허용 범위를 넘었습니다.");
      }
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Direct zero-cost user-to-provider transport: no cookies, redirects, retries or operator fallback. */
export async function userAiFetch(
  capability: UserAiCapability,
  path: string,
  body?: unknown,
  options: UserAiRequestOptions = {},
): Promise<Response> {
  const connection = options.connection ?? requireUserAiConnection(capability);
  assertFreeAiConnection(connection, capability);
  const currentRevision = getUserAiSnapshot().revision;
  if (
    (options.connectionId && connection.id !== options.connectionId)
    || (options.revision !== undefined && options.revision !== currentRevision)
  ) {
    throw new Error("AI 연결이 변경되어 이전 작업을 전송하지 않았습니다.");
  }
  if (options.signal?.aborted) {
    throw new Error("AI 요청이 전송되기 전에 취소되었습니다.");
  }

  const revision = currentRevision;
  const validatedPath = validateUserAiPath(path);
  const method = options.method ?? (body === undefined ? "GET" : "POST");
  const guardedRequest = await guardFreeAiRuntimeRequest(
    connection,
    capability,
    validatedPath,
    method,
    body,
  );
  if (revision !== getUserAiSnapshot().revision) {
    throw new Error("AI 연결이 변경되어 이전 작업을 전송하지 않았습니다.");
  }

  const url = `${validateUserAiBaseUrl(connection.baseUrl)}${validatedPath}`;
  const controller = new AbortController();
  const unregister = registerUserAiRequest(controller);
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(180_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const headers = new Headers(options.headers);
  headers.delete("Cookie");
  headers.delete("X-User-Id");
  if (connection.apiKey) {
    headers.set("Authorization", `Bearer ${connection.apiKey}`);
  } else {
    headers.delete("Authorization");
  }
  const requestBody = guardedRequest.body;
  const form = typeof FormData !== "undefined" && requestBody instanceof FormData;
  if (requestBody !== undefined && !form) headers.set("Content-Type", "application/json");
  if (form) headers.delete("Content-Type");
  try {
    signal.throwIfAborted();
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody === undefined
        ? undefined
        : form
          ? requestBody
          : JSON.stringify(requestBody),
      signal,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    await recordFreeAiRuntimeResponse(
      connection,
      response.status,
      response.headers,
    );
    const requestedMaximum = Math.min(
      options.maxBytes ?? MAX_JSON_BYTES,
      MAX_JSON_BYTES,
    );
    const responseMaximum = guardedRequest.guarded
      ? Math.min(requestedMaximum, MANAGED_FREE_MAX_RESPONSE_BYTES)
      : requestedMaximum;
    const bytes = response.status === 204
      ? null
      : await readBounded(response, responseMaximum);
    signal.throwIfAborted();
    if (!response.ok) {
      if (response.status === 402 || response.status === 429) {
        throw new UserAiTransportError(
          "quota-exhausted",
          `이 무료 AI 연결의 사용량이 소진되었습니다 (HTTP ${response.status}).`,
          response.status,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new UserAiTransportError(
          "authentication",
          `개인 무료 API 키 인증에 실패했습니다 (HTTP ${response.status}).`,
          response.status,
        );
      }
      throw new UserAiTransportError(
        "http-error",
        `무료 AI 요청 실패 (HTTP ${response.status}). 자동 재시도하거나 유료 모델로 전환하지 않았습니다.`,
        response.status,
      );
    }
    if (revision !== getUserAiSnapshot().revision) {
      throw new Error("AI 연결이 변경되어 결과를 적용하지 않았습니다.");
    }
    return new Response(bytes, { status: response.status, headers: response.headers });
  } catch (error) {
    if (signal.aborted) {
      throw new Error("AI 요청이 취소되거나 제한 시간을 초과했습니다. 앱은 같은 요청을 자동 재전송하지 않습니다.", { cause: error });
    }
    if (error instanceof UserAiTransportError || error instanceof FreeAiRuntimeBudgetError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new Error("클라우드 제공자 연결·CORS·네트워크 상태를 확인하세요. 다른 경로로 중복 전송하지 않았습니다.", { cause: error });
    }
    throw error;
  } finally {
    unregister();
  }
}

export async function userAiJson<T = unknown>(
  capability: UserAiCapability,
  path: string,
  body?: unknown,
  options: UserAiRequestOptions = {},
): Promise<T> {
  const response = await userAiFetch(capability, path, body, options);
  try {
    return await response.json() as T;
  } catch {
    throw new Error("AI 제공자의 응답이 올바른 JSON 형식이 아닙니다.");
  }
}

export interface CompletedUserAiText {
  content: string;
  connection: UserAiResolvedConnection;
  attemptedConnectionIds: string[];
  attemptedRouteIds: string[];
}

export async function completeUserAiTextDetailed(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<CompletedUserAiText> {
  if (!user.trim() || user.length + system.length > 64_000) {
    throw new Error("프롬프트는 비어 있지 않은 64,000자 이하여야 합니다.");
  }
  const candidates = userAiAutomaticExternalConnectionsForCapability("text");
  if (candidates.length === 0) {
    throw new UserAiTransportError(
      "not-configured",
      "통합 AI 설정에 사용할 수 있는 클라우드 AI 경로가 없습니다. 무료 공급자 키를 추가하거나 명시적으로 BYOK를 구성하세요.",
    );
  }

  const attemptedConnectionIds: string[] = [];
  const attemptedRouteIds: string[] = [];
  let lastSafeFailoverError: unknown;
  let sawQuotaExhaustion = false;
  for (const connection of candidates) {
    attemptedConnectionIds.push(connection.id);
    attemptedRouteIds.push(connection.routeId);
    try {
      const result = await userAiJson<{
        choices?: Array<{ message?: { content?: unknown } }>;
      }>(
        "text",
        connection.chatCompletionsPath,
        {
          model: connection.textModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 4096,
        },
        {
          signal,
          maxBytes: 2 * 1024 * 1024,
          connection,
          connectionId: connection.id,
        },
      );
      const content = result.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim() || content.length > 100_000) {
        throw new Error("AI 텍스트 결과를 확인하지 못했습니다.");
      }
      return {
        content: connection.apiKey
          ? content.replaceAll(connection.apiKey, "[비밀정보 제거]")
          : content,
        connection,
        attemptedConnectionIds,
        attemptedRouteIds,
      };
    } catch (error) {
      const quotaExhaustion = isUserAiQuotaExhaustion(error);
      const safeAuthenticationFailover = error instanceof UserAiTransportError
        && error.code === "authentication";
      if (!quotaExhaustion && !safeAuthenticationFailover) throw error;
      sawQuotaExhaustion ||= quotaExhaustion;
      lastSafeFailoverError = error;
    }
  }

  if (!sawQuotaExhaustion && lastSafeFailoverError instanceof UserAiTransportError) {
    throw lastSafeFailoverError;
  }
  throw new UserAiTransportError(
    "all-free-exhausted",
    "등록된 클라우드 AI 경로가 모두 무료 한도·요청 제한·인증 오류 상태입니다. 로컬 실행으로 전환하지 않습니다.",
    lastSafeFailoverError instanceof UserAiTransportError ? lastSafeFailoverError.status : undefined,
  );
}

export async function completeUserAiText(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  return (await completeUserAiTextDetailed(system, user, signal)).content;
}

function isSafeUserAiRouteFailover(error: unknown): boolean {
  return isUserAiQuotaExhaustion(error)
    || (error instanceof UserAiTransportError && error.code === "authentication");
}

function cloneFormData(source: FormData): FormData {
  const clone = new FormData();
  source.forEach((value, key) => clone.append(key, value));
  return clone;
}

export async function userAiLegacyJson(
  capability: "text" | "image",
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const candidates = userAiAutomaticExternalConnectionsForCapability(capability);
  if (!candidates.length) {
    throw new UserAiTransportError(
      "not-configured",
      `통합 AI 설정에 사용할 ${capability === "text" ? "텍스트" : "이미지"} 클라우드 경로가 없습니다.`,
    );
  }
  let lastSafeFailure: unknown;
  let sawQuotaExhaustion = false;
  for (const connection of candidates) {
    const model = capability === "text" ? connection.textModel : connection.imageModel;
    if (!model) continue;
    const values: Record<string, unknown> = body && typeof body === "object"
      ? { ...body, model } as Record<string, unknown>
      : { model };
    if (capability === "image" && model.startsWith("gpt-image")) {
      delete values.response_format;
    }
    try {
      return await userAiJson(
        capability,
        capability === "text"
          ? connection.chatCompletionsPath
          : connection.imageGenerationPath,
        values,
        { signal, connection, connectionId: connection.id },
      );
    } catch (error) {
      if (!isSafeUserAiRouteFailover(error)) throw error;
      sawQuotaExhaustion ||= isUserAiQuotaExhaustion(error);
      lastSafeFailure = error;
    }
  }
  if (!sawQuotaExhaustion && lastSafeFailure instanceof UserAiTransportError) {
    throw lastSafeFailure;
  }
  throw new UserAiTransportError(
    "all-free-exhausted",
    "등록된 클라우드 AI 경로가 모두 한도 소진 또는 인증 오류 상태입니다.",
    lastSafeFailure instanceof UserAiTransportError ? lastSafeFailure.status : undefined,
  );
}

export async function userAiLegacyForm(
  form: FormData,
  signal?: AbortSignal,
): Promise<unknown> {
  const candidates = userAiAutomaticExternalConnectionsForCapability("image");
  if (!candidates.length) {
    throw new UserAiTransportError(
      "not-configured",
      "통합 AI 설정에 사용할 이미지 클라우드 경로가 없습니다.",
    );
  }
  let lastSafeFailure: unknown;
  let sawQuotaExhaustion = false;
  for (const connection of candidates) {
    if (!connection.imageModel) continue;
    const requestForm = cloneFormData(form);
    requestForm.set("model", connection.imageModel);
    if (connection.imageModel.startsWith("gpt-image")) {
      requestForm.delete("response_format");
    }
    try {
      return await userAiJson(
        "image",
        connection.imageEditPath,
        requestForm,
        { signal, connection, connectionId: connection.id },
      );
    } catch (error) {
      if (!isSafeUserAiRouteFailover(error)) throw error;
      sawQuotaExhaustion ||= isUserAiQuotaExhaustion(error);
      lastSafeFailure = error;
    }
  }
  if (!sawQuotaExhaustion && lastSafeFailure instanceof UserAiTransportError) {
    throw lastSafeFailure;
  }
  throw new UserAiTransportError(
    "all-free-exhausted",
    "등록된 이미지 클라우드 경로가 모두 한도 소진 또는 인증 오류 상태입니다.",
    lastSafeFailure instanceof UserAiTransportError ? lastSafeFailure.status : undefined,
  );
}
