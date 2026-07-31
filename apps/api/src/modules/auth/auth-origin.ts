import { allowedCorsOrigins } from "../../config/cors";

/**
 * 브라우저에서 온 로그인 요청은 API CORS와 같은 exact-origin allowlist를 적용한다.
 * Origin이 없는 서버 간 요청은 유효한 Google ID 토큰 검증을 전제로 허용한다.
 */
export function isAllowedAuthRequestOrigin(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (origin === undefined) return true;
  if (env.NODE_ENV === "production") {
    try {
      if (new URL(origin).protocol !== "https:") return false;
    } catch {
      return false;
    }
  }
  return allowedCorsOrigins(env).includes(origin);
}
