let runtimeApiBase = "";

/**
 * 교차 출처 셸(앱인토스 등)이 공유 API 클라이언트에 배포 API 오리진을 주입한다.
 * Vite 환경변수가 번들에 없더라도 인증 요청이 WebView 호스트의 상대 /api 로 새지 않게 한다.
 */
export function setRuntimeApiBase(value: string): void {
  runtimeApiBase = value.trim().replace(/\/+$/, "");
}

export function getRuntimeApiBase(): string {
  return runtimeApiBase;
}
