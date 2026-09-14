import { useSyncExternalStore } from "react";

export const STUDIO_AI_SETTINGS_STORAGE_KEY = "toonspectrum-studio-ai-settings";
const UNIFIED_AI_AUX_STORAGE_KEY = "toonspectrum-unified-ai-aux-v1";

export interface OpenAiCompatibleSettings {
  baseUrl: string;
  apiKey: string;
  imageModel: string;
  textModel: string;
  imageGenerationPath: string;
  imageEditPath: string;
  chatCompletionsPath: string;
}

export interface UnifiedAiAuxSettings {
  version: 1;
  hyper3dApiKey: string;
  creatorRuntimeBaseUrl: string;
  creatorRuntimeToken: string;
  creatorRuntimeOwner: string;
}

export const DEFAULT_UNIFIED_AI_AUX_SETTINGS: UnifiedAiAuxSettings = Object.freeze({
  version: 1,
  hyper3dApiKey: "",
  creatorRuntimeBaseUrl: "",
  creatorRuntimeToken: "",
  creatorRuntimeOwner: "toonstudio-browser",
});

export const DEFAULT_OPENAI_COMPATIBLE_SETTINGS: OpenAiCompatibleSettings = Object.freeze({
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  imageModel: "gpt-image-1",
  textModel: "gpt-4o-mini",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
});

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function cleanSecret(value: unknown, maximum = 4096): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, maximum);
  return Array.from(trimmed).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  }) ? "" : trimmed;
}

export function validateUserAiBaseUrl(value: string, allowPath = true): string {
  const url = new URL(value.trim());
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username || url.password || url.search || url.hash
    || (!allowPath && url.pathname !== "/")) {
    throw new Error("AI 주소는 인증정보·쿼리 없는 HTTPS 주소여야 합니다. localhost만 HTTP를 허용합니다.");
  }
  if (typeof globalThis.location !== "undefined" && url.origin === globalThis.location.origin) {
    throw new Error("사이트 자체 주소를 AI 제공자 주소로 사용할 수 없습니다.");
  }
  return url.href.replace(/\/+$/u, "");
}

export function validateUserAiPath(value: string): string {
  const path = value.trim();
  if (!/^\/[A-Za-z0-9._/-]{1,180}$/u.test(path)
    || path.includes("//")
    || path.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("API 경로는 /로 시작하는 안전한 상대 경로여야 합니다.");
  }
  return path;
}

export function loadOpenAiCompatibleSettings(): OpenAiCompatibleSettings {
  const storage = sessionStorageOrNull();
  if (!storage) return { ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS };
  try {
    const parsed = JSON.parse(storage.getItem(STUDIO_AI_SETTINGS_STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    if (!parsed) return { ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS };
    const text = (key: keyof OpenAiCompatibleSettings, fallback: string) =>
      typeof parsed[key] === "string" ? String(parsed[key]).slice(0, key === "apiKey" ? 4096 : 300) : fallback;
    return {
      baseUrl: text("baseUrl", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.baseUrl),
      apiKey: cleanSecret(parsed.apiKey),
      imageModel: text("imageModel", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageModel),
      textModel: text("textModel", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.textModel),
      imageGenerationPath: text("imageGenerationPath", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageGenerationPath),
      imageEditPath: text("imageEditPath", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageEditPath),
      chatCompletionsPath: text("chatCompletionsPath", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.chatCompletionsPath),
    };
  } catch {
    return { ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS };
  }
}

export function saveOpenAiCompatibleSettings(value: OpenAiCompatibleSettings): void {
  const storage = sessionStorageOrNull();
  if (!storage) return;
  const normalized = {
    ...value,
    baseUrl: validateUserAiBaseUrl(value.baseUrl),
    apiKey: cleanSecret(value.apiKey),
    imageGenerationPath: validateUserAiPath(value.imageGenerationPath),
    imageEditPath: validateUserAiPath(value.imageEditPath),
    chatCompletionsPath: validateUserAiPath(value.chatCompletionsPath),
  };
  storage.setItem(STUDIO_AI_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
}

function readAux(): UnifiedAiAuxSettings {
  const storage = sessionStorageOrNull();
  if (!storage) return { ...DEFAULT_UNIFIED_AI_AUX_SETTINGS };
  try {
    const value = JSON.parse(storage.getItem(UNIFIED_AI_AUX_STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    if (!value || value.version !== 1) return { ...DEFAULT_UNIFIED_AI_AUX_SETTINGS };
    return {
      version: 1,
      hyper3dApiKey: cleanSecret(value.hyper3dApiKey),
      creatorRuntimeBaseUrl: typeof value.creatorRuntimeBaseUrl === "string" ? value.creatorRuntimeBaseUrl.slice(0, 300) : "",
      creatorRuntimeToken: cleanSecret(value.creatorRuntimeToken),
      creatorRuntimeOwner: typeof value.creatorRuntimeOwner === "string"
        && /^[A-Za-z0-9_:@.-]{1,128}$/u.test(value.creatorRuntimeOwner)
        ? value.creatorRuntimeOwner
        : DEFAULT_UNIFIED_AI_AUX_SETTINGS.creatorRuntimeOwner,
    };
  } catch {
    return { ...DEFAULT_UNIFIED_AI_AUX_SETTINGS };
  }
}

interface AuxSnapshot {
  readonly revision: number;
  readonly settings: UnifiedAiAuxSettings;
}
let snapshot: AuxSnapshot = Object.freeze({ revision: 0, settings: Object.freeze(readAux()) });
const listeners = new Set<() => void>();
export const getUnifiedAiAuxSnapshot = () => snapshot;
export const getUnifiedAiAuxSettings = () => snapshot.settings;
export function subscribeUnifiedAiAux(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useUnifiedAiAuxSettings(): AuxSnapshot {
  return useSyncExternalStore(subscribeUnifiedAiAux, getUnifiedAiAuxSnapshot, getUnifiedAiAuxSnapshot);
}

export function saveUnifiedAiAuxSettings(value: UnifiedAiAuxSettings): void {
  const next: UnifiedAiAuxSettings = {
    version: 1,
    hyper3dApiKey: cleanSecret(value.hyper3dApiKey),
    creatorRuntimeBaseUrl: value.creatorRuntimeBaseUrl.trim()
      ? validateUserAiBaseUrl(value.creatorRuntimeBaseUrl, false)
      : "",
    creatorRuntimeToken: cleanSecret(value.creatorRuntimeToken),
    creatorRuntimeOwner: /^[A-Za-z0-9_:@.-]{1,128}$/u.test(value.creatorRuntimeOwner.trim())
      ? value.creatorRuntimeOwner.trim()
      : DEFAULT_UNIFIED_AI_AUX_SETTINGS.creatorRuntimeOwner,
  };
  sessionStorageOrNull()?.setItem(UNIFIED_AI_AUX_STORAGE_KEY, JSON.stringify(next));
  snapshot = Object.freeze({ revision: snapshot.revision + 1, settings: Object.freeze(next) });
  listeners.forEach((listener) => listener());
}

export function clearUnifiedAiSecrets(): void {
  sessionStorageOrNull()?.removeItem(STUDIO_AI_SETTINGS_STORAGE_KEY);
  sessionStorageOrNull()?.removeItem(UNIFIED_AI_AUX_STORAGE_KEY);
  snapshot = Object.freeze({ revision: snapshot.revision + 1, settings: Object.freeze({ ...DEFAULT_UNIFIED_AI_AUX_SETTINGS }) });
  listeners.forEach((listener) => listener());
}

export type UserTextResult =
  | { ok: true; content: string; model: string; provider: string }
  | { ok: false; error: string };

export async function completeWithUserTextKey(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<UserTextResult> {
  const settings = loadOpenAiCompatibleSettings();
  if (!settings.apiKey || !settings.textModel.trim()) {
    return { ok: false, error: "통합 AI 설정에서 텍스트 API 키와 모델을 등록하세요." };
  }
  let endpoint: string;
  try {
    endpoint = `${validateUserAiBaseUrl(settings.baseUrl)}${validateUserAiPath(settings.chatCompletionsPath)}`;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AI 주소를 확인하세요." };
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.textModel,
        messages: [{ role: "system", content: system.slice(0, 24_000) }, { role: "user", content: user.slice(0, 40_000) }],
        max_tokens: 4096,
      }),
      signal,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 2 * 1024 * 1024) {
      await response.body?.cancel();
      return { ok: false, error: "AI 응답이 2MiB 제한을 초과했습니다." };
    }
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `사용자 AI 요청 실패 (HTTP ${response.status}). 자동 재시도하지 않았습니다.` };
    if (text.length > 2 * 1024 * 1024) return { ok: false, error: "AI 응답이 2MiB 제한을 초과했습니다." };
    const parsed = JSON.parse(text) as { choices?: Array<{ message?: { content?: unknown } }>; model?: unknown };
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return { ok: false, error: "AI 텍스트 결과를 확인하지 못했습니다." };
    const provider = new URL(settings.baseUrl).hostname;
    return {
      ok: true,
      content: content.replaceAll(settings.apiKey, "[secret removed]").trim().slice(0, 100_000),
      model: typeof parsed.model === "string" ? parsed.model.slice(0, 200) : settings.textModel.slice(0, 200),
      provider: provider.slice(0, 120),
    };
  } catch (error) {
    if (signal?.aborted) return { ok: false, error: "AI 요청을 취소했습니다. 이미 접수된 요청은 사용자 계정에 과금될 수 있습니다." };
    return { ok: false, error: error instanceof Error ? error.message : "사용자 AI 제공자에 연결하지 못했습니다." };
  }
}

export async function testCreatorRuntime(signal?: AbortSignal): Promise<{ ok: boolean; message: string }> {
  const settings = getUnifiedAiAuxSettings();
  if (!settings.creatorRuntimeBaseUrl || !settings.creatorRuntimeToken) {
    return { ok: false, message: "개인 추론 서버 주소와 토큰을 입력하세요." };
  }
  try {
    const response = await fetch(`${validateUserAiBaseUrl(settings.creatorRuntimeBaseUrl, false)}/capabilities`, {
      headers: { Authorization: `Bearer ${settings.creatorRuntimeToken}`, "X-Creator-Owner": settings.creatorRuntimeOwner },
      signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    await response.body?.cancel();
    return response.ok
      ? { ok: true, message: "개인 추론 서버가 응답했습니다. 모델별 실제 생성은 별도 검증이 필요합니다." }
      : { ok: false, message: `개인 추론 서버 응답 실패 (HTTP ${response.status})` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "개인 추론 서버에 연결하지 못했습니다." };
  }
}
