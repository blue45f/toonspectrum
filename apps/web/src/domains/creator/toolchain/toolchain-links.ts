/** 제작 도구 화면 사이를 이동할 때 현재 프로젝트 범위(projectId)를 유지한다. */
export function withProject(path: string, projectId: string | null): string {
  if (!projectId) return path;
  return `${path}?${new URLSearchParams({ projectId }).toString()}`;
}

export function projectIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("projectId")?.trim();
  return value ? value.slice(0, 160) : null;
}
