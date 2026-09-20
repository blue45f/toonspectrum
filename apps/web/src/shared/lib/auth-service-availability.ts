/** Safe fallback for upstream errors, including an HTML hosting suspension page. */
export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  "로그인 서비스가 일시적으로 중단되었어요. 잠시 후 다시 시도해 주세요.";

export function authFailureFallback(status: number, fallback: string): string {
  return status >= 500 && status <= 599
    ? AUTH_SERVICE_UNAVAILABLE_MESSAGE
    : fallback;
}
