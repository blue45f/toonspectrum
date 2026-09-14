import { getUserAiSnapshot, registerUserAiRequest, requireUserAiConnection } from "./user-ai-store";
import { validateUserAiBaseUrl, validateUserAiPath, type UserAiCapability } from "./user-ai-types";

export interface UserAiRequestOptions { signal?: AbortSignal; connectionId?: string; revision?: number; method?: string; maxBytes?: number; headers?: HeadersInit }
const MAX_JSON_BYTES = 80 * 1024 * 1024;
async function readBounded(response: Response, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body || Number(response.headers.get("content-length") ?? 0) > maximum) {
    await response.body?.cancel(); throw new Error("AI 응답 용량이 허용 범위를 넘었습니다.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > maximum) throw new Error("AI 응답 용량이 허용 범위를 넘었습니다.");
      chunks.push(item.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
/** Direct user-to-provider transport: no cookies, redirects, retries or operator fallback. */
export async function userAiFetch(capability: UserAiCapability, path: string, body?: unknown, options: UserAiRequestOptions = {}): Promise<Response> {
  const connection = requireUserAiConnection(capability);
  const currentRevision = getUserAiSnapshot().revision;
  if ((options.connectionId && connection.id !== options.connectionId)
    || (options.revision !== undefined && options.revision !== currentRevision)) {
    throw new Error("AI 연결이 변경되어 이전 작업을 전송하지 않았습니다.");
  }
  const revision = currentRevision;
  const url = `${validateUserAiBaseUrl(connection.baseUrl)}${validateUserAiPath(path)}`;
  const controller = new AbortController();
  const unregister = registerUserAiRequest(controller);
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000), ...(options.signal ? [options.signal] : [])]);
  const headers = new Headers(options.headers);
  headers.delete("Cookie"); headers.delete("X-User-Id");
  headers.set("Authorization", `Bearer ${connection.apiKey}`);
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !form) headers.set("Content-Type", "application/json");
  if (form) headers.delete("Content-Type");
  try {
    signal.throwIfAborted();
    const response = await fetch(url, { method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers, body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal,
      credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`AI 요청 실패 (HTTP ${response.status}). 자동 재시도하지 않았습니다.`); }
    const bytes = response.status === 204 ? null : await readBounded(response, Math.min(options.maxBytes ?? MAX_JSON_BYTES, MAX_JSON_BYTES));
    signal.throwIfAborted();
    if (revision !== getUserAiSnapshot().revision) throw new Error("AI 연결이 변경되어 결과를 적용하지 않았습니다.");
    return new Response(bytes, { status: response.status, headers: response.headers });
  } catch (error) {
    if (signal.aborted) throw new Error("AI 요청이 취소되거나 제한 시간을 초과했습니다. 이미 수락된 요청은 과금될 수 있습니다.", { cause: error });
    if (error instanceof TypeError) throw new Error("제공자 연결 또는 CORS를 확인하세요. 개인 게이트웨이를 사용할 수 있으며 운영측 프록시로 전환하지 않습니다.", { cause: error });
    throw error;
  } finally { unregister(); }
}
export async function userAiJson<T = unknown>(capability: UserAiCapability, path: string, body?: unknown, options: UserAiRequestOptions = {}): Promise<T> {
  const response = await userAiFetch(capability, path, body, options);
  try { return await response.json() as T; }
  catch { throw new Error("AI 제공자의 응답이 올바른 JSON 형식이 아닙니다."); }
}
export async function completeUserAiText(system: string, user: string, signal?: AbortSignal): Promise<string> {
  const connection = requireUserAiConnection("text");
  if (!connection.textModel.trim()) throw new Error("통합 AI 설정에서 텍스트 모델 ID를 입력하세요.");
  if (!user.trim() || user.length + system.length > 64_000) throw new Error("프롬프트는 비어 있지 않은 64,000자 이하여야 합니다.");
  const result = await userAiJson<{ choices?: Array<{ message?: { content?: unknown } }> }>("text", connection.chatCompletionsPath,
    { model: connection.textModel, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 4096 }, { signal, maxBytes: 2 * 1024 * 1024 });
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim() || content.length > 100_000) throw new Error("AI 텍스트 결과를 확인하지 못했습니다.");
  return content.replaceAll(connection.apiKey, "[비밀정보 제거]");
}
export async function userAiLegacyJson(capability: "text" | "image", body: unknown, signal?: AbortSignal): Promise<unknown> {
  const connection = requireUserAiConnection(capability);
  const model = capability === "text" ? connection.textModel : connection.imageModel;
  if (!model) throw new Error("통합 AI 설정에서 사용할 모델을 입력하세요.");
  const values: Record<string, unknown> = body && typeof body === "object" ? { ...body, model } as Record<string, unknown> : { model };
  if (capability === "image" && model.startsWith("gpt-image")) delete values.response_format;
  return userAiJson(capability, capability === "text" ? connection.chatCompletionsPath : connection.imageGenerationPath, values, { signal });
}
export async function userAiLegacyForm(form: FormData, signal?: AbortSignal): Promise<unknown> {
  const connection = requireUserAiConnection("image");
  if (!connection.imageModel) throw new Error("통합 AI 설정에서 이미지 모델을 입력하세요.");
  form.set("model", connection.imageModel);
  if (connection.imageModel.startsWith("gpt-image")) form.delete("response_format");
  return userAiJson("image", connection.imageEditPath, form, { signal });
}
