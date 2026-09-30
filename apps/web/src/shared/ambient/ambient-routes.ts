/**
 * 배경 효과를 자동으로 끄는 경로 규칙(작업 집중 화면).
 *
 * 공개·랜딩 페이지(/, /discover, /explore, /community, /about, /learn, /market, /research …)에서는
 * 표시하고, 아래처럼 작업에 집중해야 하는 화면에서는 끈다.
 * 가상 스튜디오 몰입 화면(/home, /hub, /team, /studio/space 등)은 AppShell의 몰입 판정이 따로 끈다.
 */

/** 경로 접두사 규칙: 해당 경로와 그 하위 경로를 모두 끈다. */
const FOCUS_ROUTE_PREFIXES: readonly string[] = [
  // 스튜디오 전체: 편집기(/studio/p/…), 3D 도구(/studio/bg3d, /studio/poser,
  // /studio/assets/characters/…, /studio/character-convert), 에셋·브러시·오디오 도구 등.
  "/studio",
  // 스튜디오로 이동하는 예전 도구 주소.
  "/shaper",
  "/brush-lab",
  "/music",
  "/canvas",
  // 협업 제작 보드.
  "/production",
  // 관리자.
  "/admin",
  // 몰입형 읽기(공간 리더).
  "/read",
];

/** 정확히 일치하는 경로 규칙: 기술 발표 모드와 영상 페이지. */
const FOCUS_ROUTE_EXACT: ReadonlySet<string> = new Set([
  "/about/technology/deck",
  "/about/technology/videos",
  "/brand-film",
]);

function normalizeAmbientPath(pathname: string): string {
  return pathname.toLowerCase().replace(/\/+$/u, "") || "/";
}

/** 이 경로에서 배경 효과를 표시해도 되는지. */
export function isAmbientRouteAllowed(pathname: string): boolean {
  const path = normalizeAmbientPath(pathname);
  if (FOCUS_ROUTE_EXACT.has(path)) return false;
  return !FOCUS_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
