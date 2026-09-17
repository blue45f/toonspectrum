export type AiRecoveryCode =
  | "login_required"
  | "not_configured"
  | "invalid_input"
  | "network_error"
  | "http_error"
  | "free_exhausted"
  | "parse_error";

export function inferAiRecoveryCode(
  message: string,
  explicit?: AiRecoveryCode | null,
): AiRecoveryCode {
  if (explicit) return explicit;
  if (/로그인.*무료 AI|무료 AI.*로그인|FREE_AI_LOGIN_REQUIRED/u.test(message)) {
    return "login_required";
  }
  if (/한도.*소진|무료.*소진|무료 경로.*(찼|없)|사용량.*모두/u.test(message)) {
    return "free_exhausted";
  }
  if (/API 키.*(등록|연결)|AI 연결.*필요|설정에서.*연결/u.test(message)) {
    return "not_configured";
  }
  if (/네트워크|연결할 수 없|오프라인|CORS|DNS|취소/u.test(message)) {
    return "network_error";
  }
  if (/응답.*(형식|해석|읽지 못)|JSON/u.test(message)) return "parse_error";
  if (/입력|프롬프트.*입력|올바르지/u.test(message)) return "invalid_input";
  return "http_error";
}
