import { resolveStudioRoute } from "@/domains/creator/studio-router/studio-route-manifest";

/**
 * 전용 작업공간은 자체 셸과 로딩 상태를 소유한다. 앱 인트로를 그 위에 다시 올리면
 * 첫 입력을 막고 불필요한 그래픽 리소스를 요청하므로 Studio 편집기와 관리자 콘솔에서는 생략한다.
 */
export function shouldRenderAppSplash(pathname: string, search = ""): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  if (pathname === "/studio" || pathname === "/studio/" || pathname.startsWith("/studio/")) {
    return resolveStudioRoute({ pathname, search }).kind === "publish";
  }
  return true;
}
