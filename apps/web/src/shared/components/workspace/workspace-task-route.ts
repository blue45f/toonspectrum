/** Presentation ownership only. This policy never resolves a document ID or grants access. */
export interface WorkspaceTaskRoute {
  readonly section?: "works" | "explore" | "support" | "team";
  readonly chrome?: "workspace" | "focused";
  readonly titleKo: string;
  readonly titleEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
}
const task = (titleKo: string, titleEn: string, hintKo: string, hintEn: string): WorkspaceTaskRoute =>
  ({ titleKo, titleEn, hintKo, hintEn });
const focusedTask = (
  titleKo: string,
  titleEn: string,
  hintKo: string,
  hintEn: string,
): WorkspaceTaskRoute => ({
  ...task(titleKo, titleEn, hintKo, hintEn),
  chrome: "focused",
});
const ROUTES: Readonly<Record<string, WorkspaceTaskRoute>> = {
  "/help": { ...task("도움말", "Help", "하려는 작업이나 문제를 검색하세요.", "Search for a task or a problem."), section: "support" },
  "/settings": { ...task("환경 설정", "Settings", "작업 환경과 내 데이터 설정을 확인하세요.", "Review your workspace and data settings."), section: "support" },
  "/my": { ...task("내 계정", "My account", "계정과 내 활동을 관리합니다.", "Manage your account and activity."), section: "support" },
  "/sitemap": { ...task("전체 기능", "All features", "메뉴 이름보다 하고 싶은 일부터 찾아보세요.", "Find the task you want to accomplish."), section: "support" },
  "/discover": { ...task("작품 찾기", "Discover works", "공개 작품을 찾아보고 다음 작업의 영감을 얻으세요.", "Explore public works for inspiration."), section: "explore" },
  "/ranking": { ...task("작품 랭킹", "Rankings", "출처와 기준을 함께 확인하세요.", "Check the sources and ranking criteria."), section: "explore" },
  "/showcase": { ...task("창작 작품", "Showcase", "공개된 창작 작품과 제작 과정을 살펴보세요.", "Explore published work and creative processes."), section: "explore" },
  "/market": { ...task("소재 찾기", "Find materials", "사용 조건과 호환성을 확인하고 소재를 선택하세요.", "Review usage terms and compatibility."), section: "explore" },
  "/studio/new": focusedTask("새 프로젝트", "New project", "종류와 시작 형식을 고르고 바로 제작하세요.", "Choose a format and start creating."),
  "/studio/import": focusedTask("파일 가져오기", "Import files", "원본을 보존하고 지원 범위를 확인한 뒤 가져옵니다.", "Keep the source and review compatibility before importing."),
  "/studio/templates": focusedTask("시작 템플릿", "Templates", "만들려는 작업에 맞는 시작 형식을 선택하세요.", "Choose a starting format for your work."),
  "/studio/assets": task("소재와 사용 조건", "Materials and usage terms", "필요한 소재를 찾고 현재 작업에 연결하세요.", "Find materials and connect them to your work."),
  "/studio/projects": task("제작 작업", "Production tasks", "담당 작업과 검수 상태를 확인하세요.", "Review assignments and review status."),
  "/studio/review": task("검수와 수정", "Review and corrections", "어떤 버전을 확인하는지 살펴보고 의견을 남기세요.", "Check the target version before leaving feedback."),
  "/studio/versions": task("변경 기록", "Version history", "원고 버전과 제작 운영 체크포인트를 구분합니다.", "Artwork versions and production checkpoints are separate."),
  "/studio/present": task("발표 준비", "Presentation", "선택한 작업의 내용을 정리하고 발표하세요.", "Prepare and present the selected work."),
  "/studio/share": task("공유 관리", "Sharing", "공유할 대상과 권한·만료 조건을 확인하세요.", "Check recipients, access and expiration."),
  "/studio/jobs": task("처리 중 작업", "Processing jobs", "완료·대기·실패를 확인하고 결과를 검토하세요.", "Check pending, completed and failed jobs."),
  "/studio/ai-settings": task("AI 사용 설정", "AI settings", "제공자와 데이터 전송·사용량 조건을 확인하세요.", "Review providers, data transfer and usage."),
  "/production": task("제작 관리", "Production", "작품별 기획·회차·담당·검수를 연결합니다.", "Connect planning, episodes, assignments and review."),
  "/production/projects": task("제작 프로젝트", "Production projects", "작업할 프로젝트를 선택하세요.", "Choose a production project."),
};
const PROJECT_SECTIONS: Readonly<Record<string, WorkspaceTaskRoute>> = {
  overview: focusedTask("프로젝트 홈", "Project home", "선택한 프로젝트의 작업과 최근 상태를 확인하세요.", "Review the selected project and recent activity."),
  story: focusedTask("기획", "Planning", "대본·인물·장면을 같은 프로젝트로 연결합니다.", "Connect scripts, characters and scenes in the same project."),
  production: focusedTask("제작", "Production", "회차와 제작 단계의 담당·기한을 확인하세요.", "Review episode stages, assignments and due dates."),
  assets: { ...ROUTES["/studio/assets"]!, chrome: "focused" },
  review: { ...ROUTES["/studio/review"]!, chrome: "focused" },
  export: focusedTask("배포", "Delivery", "대상 버전과 승인·출력 조건을 확인하세요.", "Check the target version, approval and output settings."),
  settings: focusedTask("프로젝트 설정", "Project settings", "선택한 프로젝트의 설정과 저장 상태를 관리합니다.", "Manage settings and storage for the selected project."),
};

export function workspaceTaskRoute(pathname: string, search = ""): WorkspaceTaskRoute | null {
  const path = pathname.replace(/\/+$/u, "") || "/";
  // An external review intentionally has no internal work navigation or contextual metadata.
  const params = new URLSearchParams(search);
  if (params.has("token") || params.has("invite") || params.has("reviewToken")) return null;
  if (ROUTES[path]) return ROUTES[path]!;
  const project = /^\/studio\/p\/[^/]+\/(overview|story|production|assets|review|export|settings)$/u.exec(path);
  if (project) return PROJECT_SECTIONS[project[1]!] ?? null;
  // Authoring identities are not library project IDs. Only add chrome; preserve native links.
  const work = /^\/studio\/(?:work|remix)\/[^/]+\/(review|versions|present|assets)$/u.exec(path);
  if (work) return ROUTES[`/studio/${work[1]}`] ?? null;
  if (/^\/production\/projects\/[^/]+(?:\/(?:overview|planning|episodes|production|schedule|control|risks|handoff|review|procurement|rights|settings)|\/episodes\/[^/]+)?$/u.test(path)) return ROUTES["/production"]!;
  return null;
}
