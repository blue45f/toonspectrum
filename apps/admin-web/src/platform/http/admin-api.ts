import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonspectrum/contracts/security/csrf";

interface AdminRequestOptions {
  readonly body?: unknown;
}

export async function requestAdminJson<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(path, {
    method: hasBody ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: hasBody
      ? {
          "Content-Type": "application/json",
          [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
        }
      : {},
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload
      && typeof payload === "object"
      && "message" in payload
      && typeof payload.message === "string"
      ? payload.message
      : "설정을 처리하지 못했습니다. 관리자 로그인과 연결을 확인해주세요.";
    throw new Error(message);
  }
  return payload as T;
}
