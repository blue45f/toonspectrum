/**
 * 셸 크롬 정책 — 전역 헤더·푸터를 숨기는 "몰입 예외"의 단일 기준.
 *
 * 표준 문서: `~/workspace/goals/toonstudio-site-modernization/hidden_files/shell-nav-2026-10-02/nav-standard.md`
 *
 * 규칙 (표준 S-1):
 * - 전역 헤더·푸터는 아래 몰입 예외에서만 숨긴다. 예외는 이 파일의 명시 목록이 전부다.
 * - 몰입 예외는 "가상스튜디오"와 "에디터 집중 모드"뿐이다. 에디터 워크스페이스는
 *   App.tsx의 `isImmersiveMobileRoute` 게이트가, 관리자 자체 셸은 `isAdminPath` 게이트가 맡고,
 *   이 모듈은 AppShell이 소유하는 가상 경험·작업 프레임·보호 캠퍼스 판정을 맡는다.
 * - 새 예외를 추가할 때는 이 목록만 고치고 표준 문서 표를 함께 갱신한다.
 */

/** 팀 영역 — `/team`과 그 하위 전체가 자체 셸을 소유한다. */
export function isImmersiveTeamPath(normalizedPath: string): boolean {
  return normalizedPath === "/team" || normalizedPath.startsWith("/team/");
}

/**
 * 가상 홈 묶음 — 전역 크롬 없이 자체 셸(작업 내비·HUD·로비)이 화면을 소유하는 경로.
 * 정확 일치만 인정한다. 하위 경로를 몰입으로 착각해 헤더가 사라지는 사고를 막기 위해서다.
 */
export const IMMERSIVE_VIRTUAL_HOME_PATHS: readonly string[] = [
  "/home",
  "/hub",
  "/studio",
  "/studio/space",
  "/onboarding/character",
];

/** 프로젝트 가상공간 — `/studio/p/:projectId/space`. */
export const VIRTUAL_PROJECT_SPACE_PATTERN = /^\/studio\/p\/[^/]+\/space\/?$/u;

export interface ShellChromeDecision {
  readonly immersiveTeamExperience: boolean;
  readonly immersiveVirtualHome: boolean;
  readonly immersiveVirtualProject: boolean;
  readonly immersiveVirtualExperience: boolean;
}

export interface ShellChromeInput {
  /** 원본 경로 — 프로젝트 가상공간 정규식은 정규화 전 경로에 적용한다(기존 동작과 동일). */
  readonly pathname: string;
  /** 끝 슬래시를 제거한 경로 (`/` 단독이면 `/`). */
  readonly normalizedPath: string;
  /** `workspaceTaskRoute(pathname, search) != null` — 작업 프레임이 자체 상단바를 소유한다. */
  readonly hasTaskRoute: boolean;
  /** 캠퍼스 바인딩이 보호 표면인지 — 커맨드 팔레트·전역 오버레이까지 차단한다. */
  readonly protectedCampus: boolean;
}

/** AppShell의 몰입 판정을 한곳에서 계산한다. 순수 함수 — 입력이 같으면 판정도 같다. */
export function resolveShellChrome(input: ShellChromeInput): ShellChromeDecision {
  const immersiveTeamExperience = isImmersiveTeamPath(input.normalizedPath);
  const immersiveVirtualHome =
    immersiveTeamExperience || IMMERSIVE_VIRTUAL_HOME_PATHS.includes(input.normalizedPath);
  const immersiveVirtualProject = VIRTUAL_PROJECT_SPACE_PATTERN.test(input.pathname);
  const immersiveVirtualExperience =
    immersiveVirtualHome
    || immersiveVirtualProject
    || input.hasTaskRoute
    || input.protectedCampus;
  return {
    immersiveTeamExperience,
    immersiveVirtualHome,
    immersiveVirtualProject,
    immersiveVirtualExperience,
  };
}
