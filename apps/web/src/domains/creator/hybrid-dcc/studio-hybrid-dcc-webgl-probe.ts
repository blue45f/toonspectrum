/**
 * 정밀 3D 모델링 뷰포트가 쓰는 WebGL2 지원 확인.
 *
 * Three r184는 WebGL2가 필요해 WebGL1만 있는 브라우저도 "지원 안 함"으로 본다. 확인용 컨텍스트는
 * 바로 반납해 브라우저의 동시 컨텍스트 한도를 쓰지 않는다. jsdom 같은 시험 환경은 실제 그래픽이
 * 없으므로 항상 미지원이다. 렌더링 품질이나 성능을 보증하지 않는다.
 */
export function detectStudioHybridDccWebglCapability(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (/jsdom/iu.test(window.navigator.userAgent)) return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
