export type SiteRouteProduct = "studio" | "spectrum" | "docs";
export type SiteRoutePurpose = "create" | "discover" | "learn" | "connect" | "manage" | "trust";
export type SiteRouteMaturity = "stable" | "beta" | "experimental";
export type SiteRouteAccess = "public" | "sign-in" | "project";
export type SiteRouteDevice = "responsive" | "desktop-first";
export type SiteRouteProjectContext = "none" | "optional" | "required";
export type SiteRouteAuthorityKind = "static" | "family";

export interface SiteRouteText {
  readonly ko: string;
  readonly en: string;
}

export interface SiteRouteAuthorityDefinition {
  readonly id: string;
  readonly kind: SiteRouteAuthorityKind;
  readonly pattern: string;
  readonly canonicalPath: string;
  readonly titleKey: string;
  readonly label: SiteRouteText;
  readonly description: SiteRouteText;
  readonly product: SiteRouteProduct;
  readonly purpose: SiteRoutePurpose;
  readonly maturity: SiteRouteMaturity;
  readonly access: SiteRouteAccess;
  readonly device: SiteRouteDevice;
  readonly projectContext: SiteRouteProjectContext;
  readonly directory: boolean;
}

interface RouteDefinitionOptions {
  readonly id: string;
  readonly path: string;
  readonly titleKey: string;
  readonly label: SiteRouteText;
  readonly description: SiteRouteText;
  readonly purpose: SiteRoutePurpose;
  readonly access?: SiteRouteAccess;
  readonly projectContext?: SiteRouteProjectContext;
  readonly directory?: boolean;
  readonly kind?: SiteRouteAuthorityKind;
  readonly maturity?: SiteRouteMaturity;
  readonly device?: SiteRouteDevice;
}

const route = ({
  id,
  path,
  titleKey,
  label,
  description,
  purpose,
  access = "public",
  projectContext = "none",
  directory = false,
  kind = "static",
  maturity = "stable",
  device = "responsive",
}: RouteDefinitionOptions): SiteRouteAuthorityDefinition => ({
  id,
  kind,
  pattern: path,
  canonicalPath: path,
  titleKey,
  label,
  description,
  product: "studio",
  purpose,
  maturity,
  access,
  device,
  projectContext,
  directory,
});

/** Historical URLs stay routable, but user-facing consumers emit canonical destinations. */
export const SITE_ROUTE_ALIASES = {
  "/brush-lab": "/studio/assets/brushes/new",
  "/challenges": "/showcase/challenges",
  "/create": "/showcase",
  "/create/challenges": "/showcase/challenges",
  "/create/promo": "/showcase/promo",
  "/creator-hub": "/studio",
  "/creator-hub/references": "/research/assets",
  "/make": "/studio/new",
  "/music": "/studio/assets/audio",
  "/publishing": "/studio/publish",
  "/shaper": "/studio/assets/characters/new",
  "/studio/brush-lab": "/studio/assets/brushes/new",
} as const satisfies Readonly<Record<string, string>>;

export function canonicalSitePath(input: string): string {
  const pathname = input.split(/[?#]/u, 1)[0] || "/";
  const normalized = pathname !== "/" ? pathname.replace(/\/+$/u, "") || "/" : "/";
  return SITE_ROUTE_ALIASES[normalized as keyof typeof SITE_ROUTE_ALIASES] ?? normalized;
}

export const SITE_ROUTE_AUTHORITIES = Object.freeze([
  route({
    id: "studio-introduction",
    path: "/about/studio",
    titleKey: "route.about",
    label: { ko: "서비스 소개", en: "Studio introduction" },
    description: { ko: "제작 흐름과 기능을 살펴보는 공개 소개", en: "Explore the production workflow and tools" },
    purpose: "learn",
    directory: true,
  }),
  route({
    id: "workspace-home", path: "/home", titleKey: "route.studio",
    label: { ko: "스튜디오", en: "Studio" },
    description: { ko: "내 작업실에서 작품을 이어서 만들기", en: "Resume your work in your studio" },
    purpose: "create", projectContext: "optional", directory: true,
  }),
  route({
    id: "workspace-team", path: "/team", titleKey: "route.collaborate",
    label: { ko: "팀", en: "Team" },
    description: { ko: "멤버·권한과 모집·의뢰를 구분해 관리", en: "Manage members, permissions and recruitment" },
    purpose: "connect", projectContext: "optional", directory: true,
  }),
  route({
    id: "workspace-hub", path: "/hub", titleKey: "route.discover",
    label: { ko: "둘러보기", en: "Explore" },
    description: { ko: "공개 작품·소재·사람·배움 둘러보기", en: "Discover public work, materials, people and learning" },
    purpose: "discover", directory: true,
  }),
  route({
    id: "production",
    path: "/production",
    titleKey: "route.production",
    label: { ko: "제작 관리", en: "Production" },
    description: {
      ko: "기획·회차·일정·검수·계약을 한 흐름으로 관리",
      en: "Manage planning, episodes, schedules, review and agreements in one flow",
    },
    purpose: "manage",
    projectContext: "optional",
    directory: true,
  }),
  route({
    id: "production-projects",
    path: "/production/projects",
    titleKey: "route.production",
    label: { ko: "제작 프로젝트", en: "Production projects" },
    description: {
      ko: "제작 프로젝트를 찾아 운영 화면으로 이동",
      en: "Find a production project and open its operations workspace",
    },
    purpose: "manage",
    projectContext: "optional",
  }),
  route({
    id: "production-project",
    path: "/production/projects/:projectId/*",
    titleKey: "route.production",
    label: { ko: "제작 프로젝트", en: "Production project" },
    description: {
      ko: "역할·일정·검수·권리 기준으로 프로젝트 운영",
      en: "Operate a project through roles, schedules, review and rights",
    },
    purpose: "manage",
    access: "project",
    projectContext: "required",
    kind: "family",
  }),
  route({
    id: "studio-home",
    path: "/studio",
    titleKey: "route.studio",
    label: { ko: "작품", en: "Works" },
    description: {
      ko: "최근 작품·공유 작업·복구 항목을 한곳에서",
      en: "Recent projects, shared work and recovery in one place",
    },
    purpose: "manage",
    projectContext: "optional",
    directory: true,
  }),
  route({
    id: "studio-new",
    path: "/studio/new",
    titleKey: "route.studioNew",
    label: { ko: "새 작품", en: "New work" },
    description: {
      ko: "웹툰·컷툰·일러스트를 알맞은 작업공간에서 시작",
      en: "Start a webtoon, short comic or illustration in the right workspace",
    },
    purpose: "create",
    directory: true,
  }),
  route({
    id: "studio-import",
    path: "/studio/import",
    titleKey: "route.studioImport",
    label: { ko: "가져오기", en: "Import" },
    description: {
      ko: "작업 파일과 ToonStudio 프로젝트 패키지 가져오기",
      en: "Import working files and ToonStudio project packages",
    },
    purpose: "create",
  }),
  route({
    id: "studio-templates",
    path: "/studio/templates",
    titleKey: "route.studioTemplates",
    label: { ko: "템플릿", en: "Templates" },
    description: {
      ko: "작품 유형과 제작 흐름에 맞는 시작 형식 선택",
      en: "Choose a starting format for the work and production flow",
    },
    purpose: "create",
  }),
  route({
    id: "studio-assets",
    path: "/studio/assets",
    titleKey: "route.studioAssets",
    label: { ko: "작품 재료", en: "Assets" },
    description: {
      ko: "캐릭터·배경·브러시·오디오와 사용 권리를 함께 정리",
      en: "Organize characters, backgrounds, brushes, audio and usage rights",
    },
    purpose: "manage",
    projectContext: "optional",
    directory: true,
  }),
  route({
    id: "studio-character-new",
    path: "/studio/assets/characters/new",
    titleKey: "route.shaper",
    label: { ko: "캐릭터 만들기", en: "Create a character" },
    description: {
      ko: "캐릭터·표정·포즈와 3D 참고 제작",
      en: "Build characters, expressions, poses and 3D references",
    },
    purpose: "create",
    projectContext: "optional",
    directory: true,
  }),
  route({
    id: "studio-publish",
    path: "/studio/publish",
    titleKey: "route.studioPublish",
    label: { ko: "검수·내보내기", en: "Review & export" },
    description: {
      ko: "모바일 읽기 흐름과 플랫폼 규격을 확인하고 파일로 내보내기",
      en: "Check mobile reading flow and platform requirements before export",
    },
    purpose: "create",
    access: "project",
    projectContext: "required",
    directory: true,
  }),
  route({
    id: "studio-project",
    path: "/studio/p/:projectId/*",
    titleKey: "route.studioProject",
    label: { ko: "Studio 프로젝트", en: "Studio project" },
    description: {
      ko: "프로젝트 파일·원고·검토·내보내기를 한 문맥에서 관리",
      en: "Manage project files, documents, review and export in one context",
    },
    purpose: "manage",
    access: "project",
    projectContext: "required",
    kind: "family",
  }),
  route({
    id: "studio-draft",
    path: "/studio/draft/:draftId",
    titleKey: "route.studioDraft",
    label: { ko: "임시 작업", en: "Draft" },
    description: {
      ko: "아직 정식 프로젝트로 저장하지 않은 로컬 작업",
      en: "A local work that has not been saved as a formal project yet",
    },
    purpose: "create",
    projectContext: "optional",
    kind: "family",
  }),
  route({
    id: "studio-work",
    path: "/studio/work/:workId/*",
    titleKey: "route.studio",
    label: { ko: "Studio 작업", en: "Studio work" },
    description: {
      ko: "저장된 원고와 제작 도구 열기",
      en: "Open a saved work and its production tools",
    },
    purpose: "create",
    access: "project",
    projectContext: "required",
    kind: "family",
  }),
] as const satisfies readonly SiteRouteAuthorityDefinition[]);

const AUTHORITY_BY_ID = new Map(SITE_ROUTE_AUTHORITIES.map((definition) => [definition.id, definition]));
const FAMILY_AUTHORITIES = SITE_ROUTE_AUTHORITIES
  .filter((definition) => definition.kind === "family")
  .sort((a, b) => b.pattern.length - a.pattern.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function routePatternExpression(pattern: string): RegExp {
  const segments = pattern.split("/").filter(Boolean);
  const source = segments.map((segment) => {
    if (segment === "*") return "(?:/.*)?";
    if (segment.startsWith(":")) return "/[^/]+";
    return `/${escapeRegExp(segment)}`;
  }).join("");
  return new RegExp(`^${source}/?$`, "u");
}

const FAMILY_MATCHERS = FAMILY_AUTHORITIES.map((definition) => ({
  definition,
  expression: routePatternExpression(definition.pattern),
}));

export function siteRouteAuthorityById(id: string): SiteRouteAuthorityDefinition | null {
  return AUTHORITY_BY_ID.get(id) ?? null;
}

export function resolveSiteRouteAuthority(input: string): SiteRouteAuthorityDefinition | null {
  const canonicalPath = canonicalSitePath(input);
  const exact = SITE_ROUTE_AUTHORITIES.find((definition) => (
    definition.kind === "static" && definition.pattern === canonicalPath
  ));
  if (exact) return exact;
  return FAMILY_MATCHERS.find(({ expression }) => expression.test(canonicalPath))?.definition ?? null;
}

export const SITE_PRIMARY_ROUTE_IDS = [
  "workspace-home",
  "workspace-team",
  "workspace-hub",
  "production",
  "studio-home",
  "studio-new",
  "studio-assets",
  "studio-publish",
] as const;

export type SitePrimaryRouteId = (typeof SITE_PRIMARY_ROUTE_IDS)[number];

export function primarySiteRouteAuthority(id: SitePrimaryRouteId): SiteRouteAuthorityDefinition {
  const definition = siteRouteAuthorityById(id);
  if (!definition) throw new Error(`Missing primary site route authority: ${id}`);
  return definition;
}
