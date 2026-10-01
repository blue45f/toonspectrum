import {
  resolveStudioRouteRegistration,
  type StudioRouteId,
} from "@/domains/creator/studio-route-registry";
import {
  resolveStudioRoute,
  type StudioRouteResolution,
} from "@/domains/creator/studio-router/studio-route-manifest";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";

export const SITE_DESIGN_DOMAINS = [
  "home", "projects", "characters", "backgrounds", "assets", "story", "ai",
  "publish", "community", "catalog", "learn", "account", "production", "system", "editor",
] as const;

export type SiteDesignDomain = (typeof SITE_DESIGN_DOMAINS)[number];
export type SiteDesignArtwork =
  | "hero" | "canvas-noir" | "luna" | "character-pink" | "character-blue"
  | "background-city" | "project-romance" | "project-crimson";

export interface RouteStageDesign {
  readonly domain: SiteDesignDomain;
  readonly artwork: SiteDesignArtwork;
  readonly tone: "violet" | "cyan" | "rose" | "neutral";
  /** 아트는 공통 헤더와 소개 표면에만 허용하며 작업 결과 위에는 배치하지 않는다. */
  readonly artPlacement: "chrome" | "none";
  readonly matchedBy: "studio-registry" | "studio-runtime" | "site-family" | "fallback";
}

const DOMAIN_DESIGN: Readonly<Record<SiteDesignDomain, Pick<RouteStageDesign, "artwork" | "tone">>> = {
  home: { artwork: "hero", tone: "violet" },
  projects: { artwork: "canvas-noir", tone: "violet" },
  characters: { artwork: "character-pink", tone: "rose" },
  backgrounds: { artwork: "background-city", tone: "cyan" },
  assets: { artwork: "character-blue", tone: "cyan" },
  story: { artwork: "canvas-noir", tone: "violet" },
  ai: { artwork: "luna", tone: "violet" },
  publish: { artwork: "project-romance", tone: "rose" },
  community: { artwork: "project-romance", tone: "violet" },
  catalog: { artwork: "project-crimson", tone: "rose" },
  learn: { artwork: "background-city", tone: "cyan" },
  account: { artwork: "character-blue", tone: "cyan" },
  production: { artwork: "canvas-noir", tone: "cyan" },
  system: { artwork: "hero", tone: "neutral" },
  editor: { artwork: "canvas-noir", tone: "neutral" },
};

/** URL 선언은 기존 Studio 등록부가 소유하고 이 표는 시각 분류만 투영한다. */
const STUDIO_DOMAINS = {
  home: "projects", "personal-space": "community", support: "learn",
  new: "projects", import: "projects", templates: "projects", assets: "assets",
  generate: "ai", "ai-settings": "ai", "ai-lab": "ai", "ai-runtime": "ai",
  "character-convert": "characters", ecosystem: "learn", "growth-ip": "publish",
  "environment-guide": "learn", "ecosystem-viewer": "learn", toolchain: "production",
  engines: "production", jobs: "production", immersive: "backgrounds",
  "motion-webtoon": "story", poser: "characters",
  recovery: "projects", trash: "projects", "asset-brushes": "assets",
  "asset-brush-new": "assets", "asset-brush-edit": "assets", "asset-character-new": "characters",
  "asset-audio": "assets", "asset-3d": "backgrounds", "project-root": "projects",
  "project-overview": "projects", "project-story": "story", "project-production": "production",
  "project-assets": "assets", "project-review": "production", "project-export": "publish",
  "project-settings": "projects", "project-space": "community", "project-document": "editor",
  "draft-document": "editor", manual: "learn", "manual-article": "learn",
} as const satisfies Readonly<Record<StudioRouteId, SiteDesignDomain>>;

const NO_ART_STUDIO_ROUTES = new Set<StudioRouteId>([
  "personal-space", "project-space", "asset-brushes", "asset-brush-new", "asset-brush-edit",
  "project-document", "draft-document", "ecosystem-viewer", "poser",
]);

const FAMILY_DOMAINS: readonly [SiteDesignDomain, readonly string[]][] = [
  ["home", ["/home"]],
  ["ai", ["/settings/ai"]],
  ["characters", ["/onboarding/character"]],
  ["backgrounds", ["/read/spatial", "/research/3d-assets", "/research/material-assets", "/research/space-assets", "/research/weather-light"]],
  ["publish", ["/publish", "/showcase", "/create", "/market/publish", "/community/promote", "/studio/growth", "/studio/analytics"]],
  ["production", ["/production", "/automation", "/team/people"]],
  ["community", ["/team", "/community", "/collaborate", "/messages", "/reviews", "/pencafe", "/creators", "/u", "/opportunities", "/events", "/ecosystem/collaboration", "/ecosystem/fandom"]],
  ["story", ["/story-lab"]],
  ["assets", ["/market", "/research/assets", "/research/packs", "/research/vam", "/research/rijksmuseum", "/research/fonts", "/research/creatures", "/research/music-metadata", "/research/archive", "/research/open-data"]],
  ["learn", ["/learn", "/guide", "/references", "/research", "/developers", "/help", "/about/workflow", "/about/technology", "/about/studio", "/product-tour", "/brand-film", "/ecosystem/education", "/ecosystem"]],
  ["account", ["/settings", "/my", "/me", "/auth", "/notifications", "/membership", "/pricing", "/onboarding/taste"]],
  ["catalog", ["/hub", "/discover", "/ranking", "/search", "/recommend", "/explore", "/calendar", "/library", "/compare", "/random", "/insights", "/tags", "/authors", "/news", "/title", "/author", "/lists", "/now", "/fortune", "/play"]],
  ["system", ["/admin", "/about", "/status", "/accessibility", "/design", "/sitemap", "/terms", "/privacy", "/copyright", "/contact", "/business", "/support-us", "/support-creators", "/support", "/feedback", "/install", "/offline"]],
];

function belongsTo(pathname: string, family: string): boolean {
  return pathname === family || pathname.startsWith(`${family}/`);
}

function design(
  domain: SiteDesignDomain,
  matchedBy: RouteStageDesign["matchedBy"],
  artPlacement: RouteStageDesign["artPlacement"] = "chrome",
): RouteStageDesign {
  return { domain, ...DOMAIN_DESIGN[domain], artPlacement, matchedBy };
}

function runtimeDesign(resolution: StudioRouteResolution | null): RouteStageDesign | null {
  if (!resolution || resolution.kind === "invalid") return null;
  switch (resolution.kind) {
    case "editor": {
      const surface = resolution.workspaceRoute.surface;
      const domain = surface === "character" || surface === "poser" ? "characters"
        : surface === "bg3d" || surface === "dcc" ? "backgrounds"
          : surface === "brushes" ? "assets" : "editor";
      return design(domain, "studio-runtime", "none");
    }
    case "composition": return design("editor", "studio-runtime", "none");
    case "storyworld": return design("story", "studio-runtime", "none");
    case "lift3d": return design("backgrounds", "studio-runtime", "none");
    case "publish": return design("publish", "studio-runtime", "none");
    case "production": return design("production", "studio-runtime", "none");
    case "companion": return design("production", "studio-runtime", "none");
    case "placeholder": return design("assets", "studio-runtime");
  }
}

/**
 * 기존 경로 권위의 결과에 시각 속성만 붙인다. URL, 문서 식별자, 탐색 키를 변경하지 않는다.
 * 명시 등록 → 런타임 → 하위 경로군 → 기본값 순서로 모든 주소에 디자인 계약을 제공한다.
 */
export function resolveRouteStageDesign(
  input: string,
  studioResolution?: StudioRouteResolution | null,
): RouteStageDesign {
  const pathname = canonicalSitePath(input);
  if (pathname === "/") return design("home", "site-family");
  const isStudio = belongsTo(pathname, "/studio");
  const registration = pathname.startsWith("/") ? resolveStudioRouteRegistration(pathname) : null;
  if (registration && registration.shell !== "editor") {
    return design(STUDIO_DOMAINS[registration.id], "studio-registry", NO_ART_STUDIO_ROUTES.has(registration.id) ? "none" : "chrome");
  }
  if (isStudio) {
    const search = input.includes("?") ? `?${input.split("?").slice(1).join("?").split("#", 1)[0]}` : "";
    const resolution = studioResolution === undefined ? resolveStudioRoute({ pathname, search }) : studioResolution;
    const resolved = runtimeDesign(resolution);
    if (resolved) return resolved;
    if (registration) return design(STUDIO_DOMAINS[registration.id], "studio-registry", "none");
    if (/^\/studio\/(?:work|remix)\/[^/]+\/brush-lab(?:\/|$)/u.test(pathname)) {
      return design("assets", "site-family", "none");
    }
    // 경로군의 깊은 하위 페이지도 부모의 시각 문맥을 유지한다. 문서 경로는 아트를 차단한다.
    const projectSection = pathname.match(/^\/studio\/p\/[^/]+(?:\/([^/]+))?(?:\/|$)/u)?.[1];
    if (projectSection === "d") return design("editor", "site-family", "none");
    const sectionDomains: Readonly<Record<string, SiteDesignDomain>> = {
      story: "story", production: "production", assets: "assets", review: "production",
      export: "publish", settings: "projects", overview: "projects", space: "community",
    };
    if (belongsTo(pathname, "/studio/p")) {
      return design(sectionDomains[projectSection ?? ""] ?? "projects", "site-family", projectSection === "space" ? "none" : "chrome");
    }
    if (belongsTo(pathname, "/studio/assets/characters")) return design("characters", "site-family");
    if (belongsTo(pathname, "/studio/assets/3d")) return design("backgrounds", "site-family");
    if (belongsTo(pathname, "/studio/assets")) return design("assets", "site-family");
    if (belongsTo(pathname, "/studio/manual")) return design("learn", "site-family");
    const segments = pathname.split("/");
    for (let length = segments.length - 1; length > 2; length -= 1) {
      const parent = resolveStudioRouteRegistration(segments.slice(0, length).join("/"));
      if (parent) {
        return design(STUDIO_DOMAINS[parent.id], "studio-registry", NO_ART_STUDIO_ROUTES.has(parent.id) ? "none" : "chrome");
      }
    }
  }
  for (const [domain, families] of FAMILY_DOMAINS) {
    if (families.some((family) => belongsTo(pathname, family))) {
      return design(domain, "site-family", belongsTo(pathname, "/read/spatial") || belongsTo(pathname, "/admin") ? "none" : "chrome");
    }
  }
  return design("system", "fallback", "none");
}
