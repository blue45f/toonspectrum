export type AuthEmailActionResult = {
  readonly ok: boolean;
  readonly message: string;
};
export const AUTH_EMAIL_ACTION_UNAVAILABLE =
  "가입·이메일 인증 서비스를 일시적으로 이용할 수 없어요. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.";
export const AUTH_EMAIL_ACTION_UNCONFIRMED =
  "서버 응답을 확인하지 못해 메일 발송 여부를 알 수 없어요. 입력 내용을 유지했으니 잠시 후 다시 확인해 주세요.";

function safeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= 300 && !/[<>]/u.test(text) && !Array.from(text).some((character) => character.charCodeAt(0) < 32) ? text : null;
}

/** 호스팅 오류·손상된 200 응답을 가입 또는 메일 발송 성공으로 표시하지 않는다. */
export function resolveAuthEmailActionResult(
  status: number,
  payload: unknown,
  action: "signup" | "email",
): AuthEmailActionResult {
  if (status >= 500) return { ok: false, message: AUTH_EMAIL_ACTION_UNAVAILABLE };
  if (status === 429) return { ok: false, message: "요청이 많아 잠시 제한되었어요. 입력 내용은 유지됩니다. 잠시 기다린 뒤 다시 시도해 주세요." };
  const body = typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown> : null;
  if (status < 200 || status >= 300) return {
    ok: false,
    message: safeMessage(body?.error) ?? (action === "signup" ? "가입 정보를 확인한 뒤 다시 시도해 주세요." : "안내 메일을 보내지 못했어요."),
  };
  if (body?.ok !== true || (action === "signup" && body.verificationRequired !== true)) {
    return { ok: false, message: AUTH_EMAIL_ACTION_UNCONFIRMED };
  }
  return {
    ok: true,
    message: safeMessage(body.message) ?? (action === "signup"
      ? "가입 확인 메일을 보냈어요. 이메일 인증 후 로그인해 주세요."
      : "처리 가능한 계정이 있다면 안내 메일을 보냈어요."),
  };
}
