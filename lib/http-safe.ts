export async function safeParseJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    const raw = await response.text();
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function resolveApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const errorField = (payload as { error?: unknown }).error;
  if (typeof errorField === "string" && errorField.trim().length > 0) {
    return errorField;
  }

  const messageField = (payload as { message?: unknown }).message;
  if (typeof messageField === "string" && messageField.trim().length > 0) {
    return messageField;
  }

  const messageArray = (payload as { message?: unknown }).message;
  if (Array.isArray(messageArray)) {
    const first = messageArray
      .map((item) => (typeof item === "string" ? item : ""))
      .find((item) => item.trim().length > 0);
    if (first) return first;
  }

  const candidate = errorField;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate;
  }

  return fallback;
}

export function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}
