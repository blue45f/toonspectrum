import { useSyncExternalStore } from "react";

import { validateUserAiBaseUrl as validateCloudAiBaseUrl } from "./user-ai-types";

import {
  completeUserAiTextDetailed,
  UserAiTransportError,
  type UserAiTransportErrorCode,
} from "./user-ai-transport";

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

let volatileLegacyApiKey = "";
const volatileAuxSecrets = Object.seal({
  hyper3dApiKey: "",
  creatorRuntimeToken: "",
});

/**
 * Legacy settings are retained only for explicit migration. The default no longer points at a
 * paid provider, and all live text completion is delegated to the guarded free-only store.
 */
export const DEFAULT_OPENAI_COMPATIBLE_SETTINGS: OpenAiCompatibleSettings = Object.freeze({
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "",
  imageModel: "",
  textModel: "openrouter/free",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
});

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === "undefined"
      ? null
      : globalThis.sessionStorage;
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
  })
    ? ""
    : trimmed;
}

export function validateUserAiBaseUrl(value: string, allowPath = true): string {
  const normalized = validateCloudAiBaseUrl(value);
  const url = new URL(normalized);
  if (!allowPath && url.pathname !== "/") {
    throw new Error("관리형 클라우드 런타임 주소는 경로 없는 HTTPS origin이어야 합니다.");
  }
  return normalized;
}

export function validateUserAiPath(value: string): string {
  const path = value.trim();
  if (
    !/^\/[A-Za-z0-9._/-]{1,180}$/u.test(path)
    || path.includes("//")
    || path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("API 경로는 /로 시작하는 안전한 상대 경로여야 합니다.");
  }
  return path;
}

export function loadOpenAiCompatibleSettings(): OpenAiCompatibleSettings {
  const storage = sessionStorageOrNull();
  if (!storage) {
    return { ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS, apiKey: volatileLegacyApiKey };
  }
  try {
    const parsed = JSON.parse(
      storage.getItem(STUDIO_AI_SETTINGS_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    if (!parsed) {
      return { ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS, apiKey: volatileLegacyApiKey };
    }
    const text = (key: keyof OpenAiCompatibleSettings, fallback: string) => (
      typeof parsed[key] === "string" ? String(parsed[key]).slice(0, 300) : fallback
    );
    volatileLegacyApiKey ||= cleanSecret(parsed.apiKey);
    const next = {
      baseUrl: text("baseUrl", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.baseUrl),
      apiKey: volatileLegacyApiKey,
      imageModel: text("imageModel", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageModel),
      textModel: text("textModel", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.textModel),
      imageGenerationPath: text("imageGenerationPath", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageGenerationPath),
      imageEditPath: text("imageEditPath", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageEditPath),
      chatCompletionsPath: text("chatCompletionsPath", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.chatCompletionsPath),
    };
    storage.setItem(STUDIO_AI_SETTINGS_STORAGE_KEY, JSON.stringify({ ...next, apiKey: "" }));
    return next;
  } catch {
    return { ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS, apiKey: volatileLegacyApiKey };
  }
}

export function saveOpenAiCompatibleSettings(value: OpenAiCompatibleSettings): void {
  volatileLegacyApiKey = cleanSecret(value.apiKey);
  const normalized: OpenAiCompatibleSettings = {
    ...value,
    baseUrl: validateUserAiBaseUrl(value.baseUrl),
    apiKey: volatileLegacyApiKey,
    imageGenerationPath: validateUserAiPath(value.imageGenerationPath),
    imageEditPath: validateUserAiPath(value.imageEditPath),
    chatCompletionsPath: validateUserAiPath(value.chatCompletionsPath),
  };
  sessionStorageOrNull()?.setItem(
    STUDIO_AI_SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...normalized, apiKey: "" }),
  );
}

function readAux(): UnifiedAiAuxSettings {
  const storage = sessionStorageOrNull();
  if (!storage) {
    return {
      ...DEFAULT_UNIFIED_AI_AUX_SETTINGS,
      ...volatileAuxSecrets,
    };
  }
  try {
    const value = JSON.parse(
      storage.getItem(UNIFIED_AI_AUX_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    if (!value || value.version !== 1) {
      return {
        ...DEFAULT_UNIFIED_AI_AUX_SETTINGS,
        ...volatileAuxSecrets,
      };
    }
    volatileAuxSecrets.hyper3dApiKey ||= cleanSecret(value.hyper3dApiKey);
    volatileAuxSecrets.creatorRuntimeToken ||= cleanSecret(value.creatorRuntimeToken);
    const creatorRuntimeBaseUrl = typeof value.creatorRuntimeBaseUrl === "string"
      ? value.creatorRuntimeBaseUrl.slice(0, 300)
      : "";
    const creatorRuntimeOwner = typeof value.creatorRuntimeOwner === "string"
      && /^[A-Za-z0-9_:@.-]{1,128}$/u.test(value.creatorRuntimeOwner)
      ? value.creatorRuntimeOwner
      : DEFAULT_UNIFIED_AI_AUX_SETTINGS.creatorRuntimeOwner;
    storage.setItem(UNIFIED_AI_AUX_STORAGE_KEY, JSON.stringify({
      version: 1,
      creatorRuntimeBaseUrl,
      creatorRuntimeOwner,
    }));
    return {
      version: 1,
      ...volatileAuxSecrets,
      creatorRuntimeBaseUrl,
      creatorRuntimeOwner,
    };
  } catch {
    return {
      ...DEFAULT_UNIFIED_AI_AUX_SETTINGS,
      ...volatileAuxSecrets,
    };
  }
}

interface AuxSnapshot {
  readonly revision: number;
  readonly settings: UnifiedAiAuxSettings;
}

let snapshot: AuxSnapshot = Object.freeze({
  revision: 0,
  settings: Object.freeze(readAux()),
});
const listeners = new Set<() => void>();

export const getUnifiedAiAuxSnapshot = () => snapshot;
export const getUnifiedAiAuxSettings = () => snapshot.settings;

export function subscribeUnifiedAiAux(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUnifiedAiAuxSettings(): AuxSnapshot {
  return useSyncExternalStore(
    subscribeUnifiedAiAux,
    getUnifiedAiAuxSnapshot,
    getUnifiedAiAuxSnapshot,
  );
}

function publishAux(settings: UnifiedAiAuxSettings): void {
  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    settings: Object.freeze(settings),
  });
  listeners.forEach((listener) => listener());
}

export function saveUnifiedAiAuxSettings(value: UnifiedAiAuxSettings): void {
  volatileAuxSecrets.hyper3dApiKey = cleanSecret(value.hyper3dApiKey);
  volatileAuxSecrets.creatorRuntimeToken = cleanSecret(value.creatorRuntimeToken);
  const next: UnifiedAiAuxSettings = {
    version: 1,
    ...volatileAuxSecrets,
    creatorRuntimeBaseUrl: value.creatorRuntimeBaseUrl.trim()
      ? validateUserAiBaseUrl(value.creatorRuntimeBaseUrl, false)
      : "",
    creatorRuntimeOwner: /^[A-Za-z0-9_:@.-]{1,128}$/u.test(
      value.creatorRuntimeOwner.trim(),
    )
      ? value.creatorRuntimeOwner.trim()
      : DEFAULT_UNIFIED_AI_AUX_SETTINGS.creatorRuntimeOwner,
  };
  sessionStorageOrNull()?.setItem(UNIFIED_AI_AUX_STORAGE_KEY, JSON.stringify({
    version: 1,
    creatorRuntimeBaseUrl: next.creatorRuntimeBaseUrl,
    creatorRuntimeOwner: next.creatorRuntimeOwner,
  }));
  publishAux(next);
}

export function lockUnifiedAiAuxSecrets(): void {
  volatileLegacyApiKey = "";
  volatileAuxSecrets.hyper3dApiKey = "";
  volatileAuxSecrets.creatorRuntimeToken = "";
  const current = snapshot.settings;
  sessionStorageOrNull()?.setItem(STUDIO_AI_SETTINGS_STORAGE_KEY, JSON.stringify({
    ...loadOpenAiCompatibleSettings(),
    apiKey: "",
  }));
  publishAux({
    ...current,
    hyper3dApiKey: "",
    creatorRuntimeToken: "",
  });
}

export function clearUnifiedAiSecrets(): void {
  volatileLegacyApiKey = "";
  volatileAuxSecrets.hyper3dApiKey = "";
  volatileAuxSecrets.creatorRuntimeToken = "";
  sessionStorageOrNull()?.removeItem(STUDIO_AI_SETTINGS_STORAGE_KEY);
  sessionStorageOrNull()?.removeItem(UNIFIED_AI_AUX_STORAGE_KEY);
  publishAux({ ...DEFAULT_UNIFIED_AI_AUX_SETTINGS });
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("pagehide", lockUnifiedAiAuxSecrets);
  globalThis.addEventListener("toonspectrum:session-ended", lockUnifiedAiAuxSecrets);
}

export type UserTextResult =
  | { ok: true; content: string; model: string; provider: string }
  | {
      ok: false;
      error: string;
      code: UserAiTransportErrorCode | "request-failed";
    };

/** All legacy callers now use the same free-only runtime guard as the unified settings page. */
export async function completeWithUserTextKey(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<UserTextResult> {
  try {
    const result = await completeUserAiTextDetailed(system, user, signal);
    return {
      ok: true,
      content: result.content.trim().slice(0, 100_000),
      model: result.connection.textModel.slice(0, 200),
      provider: new URL(result.connection.baseUrl).hostname.slice(0, 120),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? error.message
        : "무료 AI 제공자에 연결하지 못했습니다.",
      code: error instanceof UserAiTransportError ? error.code : "request-failed",
    };
  }
}

export async function testCreatorRuntime(
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string }> {
  const settings = getUnifiedAiAuxSettings();
  if (!settings.creatorRuntimeBaseUrl || !settings.creatorRuntimeToken) {
    return { ok: false, message: "관리형 클라우드 추론 런타임 주소와 토큰을 입력하세요." };
  }
  try {
    const response = await fetch(
      `${validateUserAiBaseUrl(settings.creatorRuntimeBaseUrl, false)}/capabilities`,
      {
        headers: {
          Authorization: `Bearer ${settings.creatorRuntimeToken}`,
          "X-Creator-Owner": settings.creatorRuntimeOwner,
        },
        signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      },
    );
    await response.body?.cancel();
    return response.ok
      ? {
        ok: true,
        message: "관리형 클라우드 추론 런타임이 응답했습니다. 모델별 실제 생성은 별도 검증이 필요합니다.",
      }
      : {
        ok: false,
        message: `관리형 클라우드 런타임 응답 실패 (HTTP ${response.status})`,
      };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error
        ? error.message
        : "관리형 클라우드 런타임에 연결하지 못했습니다.",
    };
  }
}
