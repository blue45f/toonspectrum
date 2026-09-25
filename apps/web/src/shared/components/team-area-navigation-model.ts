export type TeamAreaSection = "overview" | "people" | "recruiting";

export interface TeamAreaDestination {
  readonly id: TeamAreaSection;
  readonly href: string;
  readonly label: string;
  readonly description: string;
}

export const TEAM_AREA_DESTINATIONS: readonly TeamAreaDestination[] = [
  {
    id: "overview",
    href: "/team",
    label: "협업 홈",
    description: "내 팀의 다음 작업과 검토를 한곳에서 확인",
  },
  {
    id: "people",
    href: "/team/people",
    label: "사람·권한",
    description: "팀 소속, 프로젝트 접근과 초대 관리",
  },
  {
    id: "recruiting",
    href: "/team/recruiting",
    label: "인재·지원",
    description: "이력서, 지원, 제안, 면접과 합류 관리",
  },
] as const;

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/u, "");
  return normalized || "/";
}

export function teamAreaSectionForPath(pathname: string): TeamAreaSection {
  const normalized = normalizePathname(pathname);
  if (
    normalized === "/team/recruiting"
    || normalized.startsWith("/team/recruiting/")
    || normalized === "/collaborate/workspace"
  ) return "recruiting";
  if (
    normalized === "/team/people"
    || normalized.startsWith("/team/people/")
    || normalized === "/production/workspaces"
    || normalized.startsWith("/production/workspaces/")
  ) return "people";
  return "overview";
}
