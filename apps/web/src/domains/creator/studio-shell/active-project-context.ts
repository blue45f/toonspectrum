const ACTIVE_PROJECT_CONTEXT_KEY = "toonstudio:active-project-context:v1";

function decodedSegment(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded && decoded.length <= 160 ? decoded : null;
  } catch {
    return null;
  }
}

export function activeProjectIdFromLocation(pathname: string, search = ""): string | null {
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  const patterns = [
    /^\/studio\/p\/([^/]+)(?:\/|$)/u,
    /^\/studio\/(?:work|remix)\/([^/]+)(?:\/|$)/u,
    /^\/production\/projects\/([^/]+)(?:\/|$)/u,
  ] as const;
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const value = decodedSegment(match?.[1]);
    if (value) return value;
  }
  const params = new URLSearchParams(search);
  for (const key of ["project", "projectId"] as const) {
    const values = params.getAll(key);
    if (values.length !== 1) continue;
    const value = decodedSegment(values[0] ?? undefined);
    if (value) return value;
  }
  return null;
}

export function readActiveProjectContext(storage: Pick<Storage, "getItem"> | null): string | null {
  if (!storage) return null;
  try {
    return decodedSegment(storage.getItem(ACTIVE_PROJECT_CONTEXT_KEY) ?? undefined);
  } catch {
    return null;
  }
}

export function writeActiveProjectContext(
  storage: Pick<Storage, "setItem" | "removeItem"> | null,
  projectId: string | null,
): void {
  if (!storage) return;
  try {
    if (!projectId) {
      storage.removeItem(ACTIVE_PROJECT_CONTEXT_KEY);
      return;
    }
    const normalized = decodedSegment(projectId);
    if (normalized) storage.setItem(ACTIVE_PROJECT_CONTEXT_KEY, normalized);
  } catch {
    // Private and embedded contexts may deny session storage.
  }
}

export function contextualProjectHref(
  pathname: string,
  projectId: string,
): { readonly href: string; readonly labelKo: string; readonly labelEn: string } {
  const encoded = encodeURIComponent(projectId);
  if (pathname === "/market" || pathname.startsWith("/market/")) {
    return { href: `/studio/assets?project=${encoded}&view=market`, labelKo: "이 작품에 소재 추가", labelEn: "Add assets to this work" };
  }
  if (pathname === "/research" || pathname.startsWith("/research/")) {
    return { href: `/research?project=${encoded}`, labelKo: "이 작품의 리서치로 저장", labelEn: "Save research to this work" };
  }
  if (pathname === "/learn" || pathname.startsWith("/learn/")) {
    return { href: `/learn?project=${encoded}`, labelKo: "이 작품에서 실습", labelEn: "Practice in this work" };
  }
  if (pathname === "/collaborate" || pathname.startsWith("/collaborate/")) {
    return { href: `/collaborate/new?project=${encoded}`, labelKo: "이 작품에 팀원 연결", labelEn: "Connect a collaborator" };
  }
  if (pathname === "/community" || pathname.startsWith("/community/")) {
    return { href: `/community/promote/new?project=${encoded}`, labelKo: "이 작품으로 이야기 시작", labelEn: "Start a conversation" };
  }
  if (pathname === "/showcase" || pathname.startsWith("/showcase/")) {
    return { href: `/showcase?project=${encoded}`, labelKo: "이 작품의 참고로 보기", labelEn: "View for this work" };
  }
  return { href: `/studio/p/${encoded}/overview`, labelKo: "프로젝트 열기", labelEn: "Open project" };
}

export function supportsActiveProjectBridge(pathname: string): boolean {
  return ["/market", "/research", "/learn", "/collaborate", "/community", "/showcase"]
    .some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
