import { STUDIO_PROJECT_NAVIGATION } from "./studio-product-ia";

export const STUDIO_ROUTE_IDS = [
  "home",
  "new",
  "import",
  "templates",
  "assets",
  "asset-brushes",
  "asset-brush-new",
  "asset-brush-edit",
  "asset-character-new",
  "asset-audio",
  "asset-3d",
  "project-root",
  "project-overview",
  "project-story",
  "project-production",
  "project-assets",
  "project-review",
  "project-export",
  "project-settings",
  "project-document",
  "draft-document",
  "manual",
  "manual-article",
] as const;

export type StudioRouteId = (typeof STUDIO_ROUTE_IDS)[number];
export type StudioRouteShell = "studio" | "project" | "editor" | "asset" | "reference";
export type StudioRouteResource = "none" | "project" | "document" | "draft" | "asset" | "article";
export type StudioRuntimeIdentity = "projectId" | "documentId" | "draftId" | "assetId";

export interface StudioRouteRegistration {
  readonly id: StudioRouteId;
  readonly pattern: string;
  readonly shell: StudioRouteShell;
  readonly resource: StudioRouteResource;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly aliases: readonly string[];
  readonly preserveRuntimeBy: StudioRuntimeIdentity | null;
}

function route(
  id: StudioRouteId,
  pattern: string,
  shell: StudioRouteShell,
  resource: StudioRouteResource,
  titleKo: string,
  titleEn: string,
  aliases: readonly string[] = [],
  preserveRuntimeBy: StudioRuntimeIdentity | null = null,
): StudioRouteRegistration {
  return Object.freeze({
    id,
    pattern,
    shell,
    resource,
    titleKo,
    titleEn,
    aliases: Object.freeze([...aliases]),
    preserveRuntimeBy,
  });
}

export const STUDIO_ROUTE_REGISTRY: readonly StudioRouteRegistration[] = Object.freeze([
  route("home", "/studio", "studio", "none", "내 작업", "My work", ["/creator-hub"]),
  route("new", "/studio/new", "studio", "none", "새로 만들기", "Create new", ["/make"]),
  route("import", "/studio/import", "studio", "none", "가져오기", "Import"),
  route("templates", "/studio/templates", "studio", "none", "템플릿", "Templates"),
  route("assets", "/studio/assets", "asset", "none", "에셋", "Assets", ["/market/library"]),
  route("asset-brushes", "/studio/assets/brushes", "asset", "asset", "브러시 선택", "Choose brushes", ["/studio/brushes"]),
  route("asset-brush-new", "/studio/assets/brushes/new", "asset", "asset", "새 브러시 만들기", "Create brush", ["/brush-lab", "/studio/brush-lab"], "assetId"),
  route("asset-brush-edit", "/studio/assets/brushes/:brushId/edit", "asset", "asset", "브러시 설정", "Brush settings", [], "assetId"),
  route("asset-character-new", "/studio/assets/characters/new", "asset", "asset", "새 캐릭터 만들기", "Create character", ["/shaper"], "assetId"),
  route("asset-audio", "/studio/assets/audio", "asset", "asset", "오디오 에셋", "Audio assets", ["/music"], "assetId"),
  route("asset-3d", "/studio/assets/3d", "asset", "asset", "3D 에셋", "3D assets", [], "assetId"),
  route("project-root", "/studio/p/:projectId", "project", "project", "프로젝트", "Project", [], "projectId"),
  route("project-overview", "/studio/p/:projectId/overview", "project", "project", "개요", "Overview", [], "projectId"),
  route("project-story", "/studio/p/:projectId/story", "project", "project", "스토리", "Story", ["/story-lab", "/studio/storyworld"], "projectId"),
  route("project-production", "/studio/p/:projectId/production", "project", "project", "제작", "Production", [], "projectId"),
  route("project-assets", "/studio/p/:projectId/assets", "project", "project", "에셋", "Assets", [], "projectId"),
  route("project-review", "/studio/p/:projectId/review", "project", "project", "검토", "Review", [], "projectId"),
  route("project-export", "/studio/p/:projectId/export", "project", "project", "내보내기", "Export", ["/publishing"], "projectId"),
  route("project-settings", "/studio/p/:projectId/settings", "project", "project", "프로젝트 설정", "Project settings", [], "projectId"),
  route("project-document", "/studio/p/:projectId/d/:documentId", "editor", "document", "문서 편집", "Edit document", [], "documentId"),
  route("draft-document", "/studio/draft/:draftId", "editor", "draft", "임시 작업", "Draft", [], "draftId"),
  route("manual", "/studio/manual", "reference", "none", "공식 가이드", "Official guide"),
  route("manual-article", "/studio/manual/:articleId", "reference", "article", "가이드", "Guide"),
]);

const ROUTE_BY_ID = new Map(STUDIO_ROUTE_REGISTRY.map((registration) => [registration.id, registration]));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function patternExpression(pattern: string): RegExp {
  const source = pattern
    .split("/")
    .map((part) => part.startsWith(":") ? "[^/]+" : escapeRegExp(part))
    .join("/");
  return new RegExp(`^${source}/?$`, "u");
}

function normalizedPathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed.startsWith("/")) throw new Error("Studio route paths must begin with a slash.");
  const withoutQuery = trimmed.split(/[?#]/u, 1)[0] ?? "/";
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/u, "") : withoutQuery;
}

export function studioRoutePath(id: StudioRouteId): string {
  const registration = ROUTE_BY_ID.get(id);
  if (!registration) throw new Error(`Unknown Studio route id: ${id}`);
  return registration.pattern;
}

export function studioProjectSectionPath(
  projectId: string,
  section: (typeof STUDIO_PROJECT_NAVIGATION)[number]["id"] | "settings",
): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid Studio project id is required.");
  }
  return `/studio/p/${encodeURIComponent(normalized)}/${section}`;
}

export function resolveStudioRouteRegistration(pathname: string): StudioRouteRegistration | null {
  const normalized = normalizedPathname(pathname);
  return STUDIO_ROUTE_REGISTRY.find((registration) => (
    patternExpression(registration.pattern).test(normalized)
    || registration.aliases.some((alias) => patternExpression(alias).test(normalized))
  )) ?? null;
}

export function canonicalStudioRoutePath(pathname: string): string | null {
  const normalized = normalizedPathname(pathname);
  const registration = resolveStudioRouteRegistration(normalized);
  if (!registration) return null;
  if (patternExpression(registration.pattern).test(normalized)) return normalized;
  if (registration.pattern.includes(":")) return registration.pattern;
  return registration.pattern;
}

export function auditStudioRouteRegistry(): readonly string[] {
  const issues: string[] = [];
  const ids = STUDIO_ROUTE_REGISTRY.map((registration) => registration.id);
  const patterns = STUDIO_ROUTE_REGISTRY.map((registration) => registration.pattern);
  if (new Set(ids).size !== ids.length) issues.push("duplicate-route-id");
  if (new Set(patterns).size !== patterns.length) issues.push("duplicate-route-pattern");

  const allPaths = new Map<string, string>();
  for (const registration of STUDIO_ROUTE_REGISTRY) {
    if (!registration.pattern.startsWith("/studio")) {
      issues.push(`canonical-outside-studio:${registration.id}`);
    }
    if (!registration.titleKo.trim() || !registration.titleEn.trim()) {
      issues.push(`missing-route-title:${registration.id}`);
    }
    if (/placeholder|coming soon|준비 중/iu.test(`${registration.titleKo} ${registration.titleEn}`)) {
      issues.push(`placeholder-route-copy:${registration.id}`);
    }
    for (const path of [registration.pattern, ...registration.aliases]) {
      const owner = allPaths.get(path);
      if (owner && owner !== registration.id) issues.push(`duplicate-route-owner:${path}`);
      allPaths.set(path, registration.id);
    }
  }

  const projectSections = new Set(
    STUDIO_ROUTE_REGISTRY
      .filter((registration) => registration.id.startsWith("project-") && !["project-root", "project-document"].includes(registration.id))
      .map((registration) => registration.id.replace("project-", "")),
  );
  for (const item of STUDIO_PROJECT_NAVIGATION) {
    if (!projectSections.has(item.id)) issues.push(`project-section-route-missing:${item.id}`);
  }
  return Object.freeze([...new Set(issues)]);
}
