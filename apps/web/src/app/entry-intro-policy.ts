import { resolveStudioRoute } from "@/domains/creator/studio-router/studio-route-manifest";

/**
 * 진입 인트로를 띄울 라우트인지 판정한다. (구 app-shell-splash의 대체)
 *
 * 전용 작업공간·몰입형 표면은 자체 셸과 진입 연출(가상스튜디오 로비·구역 스플래시,
 * /home 코믹 인트로 등)을 소유한다. 앱 인트로를 그 위에 다시 올리면 진입 연출이
 * 겹쳐 어설퍼지므로, 일반 사이트 라우트에서만 브랜드 인트로를 재생한다.
 */
const IMMERSIVE_ENTRY_PATHS: ReadonlySet<string> = new Set([
  "/team",
  "/home",
  "/hub",
  "/studio/space",
  "/onboarding/character",
]);

export function shouldShowEntryIntro(pathname: string, search = ""): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  if (IMMERSIVE_ENTRY_PATHS.has(normalized)) return false;
  if (normalized.startsWith("/team/")) return false;
  if (/^\/studio\/p\/[^/]+\/space$/u.test(normalized)) return false;
  if (pathname === "/studio" || pathname === "/studio/" || pathname.startsWith("/studio/")) {
    return resolveStudioRoute({ pathname, search }).kind === "publish";
  }
  return true;
}
