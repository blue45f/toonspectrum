import { useSyncExternalStore } from "react";

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

/**
 * Legacy settings are retained only for explicit migration. The default no longer points at a
 * paid provider, and all live text completion is delegated to the guarded free-only store.
 */
export const DEFAULT_OPENAI_COMPATIBLE_SETTINGS: OpenAiCompatibleSettings = Object.freeze({
  baseUrl: "http://localhost:8082/v1",
  apiKey: "",
  imageModel: "",
  textModel: "",
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
  const url = new URL(value.trim());
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username
    || url.password
    || url.search
    || url.hash
    || (!allowPath && url.pathname !== "/")
  ) {
    throw new Error("AI 주소는 인증정보·쿼리 없는 HTTPS 주소여야 합니다. localhost만 HTTP를 허용합니다.");
  }
  if (
    typeof globalThis.location !== "undefined"
    && url.origin === globalThis.location.origin
  ) {
    throw new Error("사이트 자체 주소를 AI 제공자 주소로 사용할 수 없습니다.");
  }
  return url.href.replace(/\/+$/u, "");
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
  if (!storage) return { ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS };
  try {
    const parsed = JSON.parse(
      storage.getItem(STUDIO_AI_SETTINGS_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    if (!parsed) return { ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS };
    const text = (key: keyof OpenAiCompatibleSettings, fallback: string) => (
      typeof parsed[key] === "string"
        ? String(parsed[key]).slice(0, key === "apiKey" ? 4096 : 300)
        : fallback
    );
    return {
      baseUrl: text("baseUrl", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.baseUrl),
      apiKey: cleanSecret(parsed.apiKey),
      imageModel: text("imageModel", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageModel),
      textModel: text("textModel", DEFAULT_OPENAI_COMPATIBLE_SETTINGS.textModel),
      imageGenerationPath: text(
        "imageGenerationPath",
        DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageGenerationPath,
      ),
      imageEditPath: text(
        "imageEditPath",
        DEFAULT_OPENAI_COMPATIBLE_SETTINGS.imageEditPath,
      ),
      chatCompletionsPath: text(
        "chatCompletionsPath",
        DEFAULT_OPENAI_COMPATIBLE_SETTINGS.chatCompletionsPath,
      ),
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
    const value = JSON.parse(
      storage.getItem(UNIFIED_AI_AUX_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    if (!value || value.version !== 1) {
      return { ...DEFAULT_UNIFIED_AI_AUX_SETTINGS };
    }
    return {
      version: 1,
      hyper3dApiKey: cleanSecret(value.hyper3dApiKey),
      creatorRuntimeBaseUrl: typeof value.creatorRuntimeBaseUrl === "string"
        ? value.creatorRuntimeBaseUrl.slice(0, 300)
        : "",
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

export function saveUnifiedAiAuxSettings(value: UnifiedAiAuxSettings): void {
  const next: UnifiedAiAuxSettings = {
    version: 1,
    hyper3dApiKey: cleanSecret(value.hyper3dApiKey),
    creatorRuntimeBaseUrl: value.creatorRuntimeBaseUrl.trim()
      ? validateUserAiBaseUrl(value.creatorRuntimeBaseUrl, false)
      : "",
    creatorRuntimeToken: cleanSecret(value.creatorRuntimeToken),
    creatorRuntimeOwner: /^[A-Za-z0-9_:@.-]{1,128}$/u.test(
      value.creatorRuntimeOwner.trim(),
    )
      ? value.creatorRuntimeOwner.trim()
      : DEFAULT_UNIFIED_AI_AUX_SETTINGS.creatorRuntimeOwner,
  };
  sessionStorageOrNull()?.setItem(UNIFIED_AI_AUX_STORAGE_KEY, JSON.stringify(next));
  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    settings: Object.freeze(next),
  });
  listeners.forEach((listener) => listener());
}

export function clearUnifiedAiSecrets(): void {
  sessionStorageOrNull()?.removeItem(STUDIO_AI_SETTINGS_STORAGE_KEY);
  sessionStorageOrNull()?.removeItem(UNIFIED_AI_AUX_STORAGE_KEY);
  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    settings: Object.freeze({ ...DEFAULT_UNIFIED_AI_AUX_SETTINGS }),
  });
  listeners.forEach((listener) => listener());
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
    return { ok: false, message: "개인 추론 서버 주소와 토큰을 입력하세요." };
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
        message: "개인 추론 서버가 응답했습니다. 모델별 실제 생성은 별도 검증이 필요합니다.",
      }
      : {
        ok: false,
        message: `개인 추론 서버 응답 실패 (HTTP ${response.status})`,
      };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error
        ? error.message
        : "개인 추론 서버에 연결하지 못했습니다.",
    };
  }
}
