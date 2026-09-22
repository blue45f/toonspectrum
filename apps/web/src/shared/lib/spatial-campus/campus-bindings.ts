import type { CampusBinding, CampusDistrictId, CampusSurface } from "./campus-model";

// Keys reference the existing route authority, never a second URL registry.
const DISTRICT_ROUTES: Readonly<Record<CampusDistrictId, string>> = {
  plaza: "workspace-hub resources-opportunities marketing-events marketing-event-beta-open",
  atelier: "catalog-home workspace-home creator-studio-home resources-make resources-hub resources-publishing creator-studio-new creator-studio-import creator-studio-recovery creator-studio-trash creator-studio-assets creator-studio-assets-brushes creator-studio-assets-brush-new creator-studio-assets-brush-edit creator-studio-assets-character-new creator-studio-assets-audio creator-studio-assets-3d creator-studio-templates creator-studio-project-document creator-studio-draft-document creator-studio-project-root creator-studio-project-overview creator-studio-project-story creator-studio-project-production creator-studio-project-assets creator-studio-project-review creator-studio-project-export creator-studio-project-settings creator-studio-project-space creator-music creator-character-shaper creator-brush-lab creator-studio-brush-lab creator-studio-work-brush-lab creator-studio-remix-brush-lab creator-studio resources-story",
  production: "workspace-team collaboration-board collaboration-positions collaboration-career-gallery collaboration-workspace collaboration-new collaboration-moderation collaboration-edit collaboration-post production-workspaces production-workspace-join production-workspace-detail production-workspace-usage production-home production-external-review production-pinned-review production-projects production-project-root production-project-overview production-project-planning production-project-episodes production-project-production production-project-schedule production-project-control production-project-risks production-project-handoff production-project-review production-project-procurement production-project-rights production-project-settings production-episode-room ecosystem-collaboration account-messages-new account-messages-thread account-messages",
  market: "market-home market-browse market-fit market-publish market-manage market-library market-wishlist market-compare market-checkout market-resource",
  library: "catalog-discover catalog-ranking catalog-search catalog-recommend catalog-explore catalog-calendar catalog-library catalog-compare catalog-random catalog-insights catalog-tags catalog-authors catalog-news catalog-title catalog-author catalog-references community-reviews research-catalog research-catalog-notebook research-home research-assets research-open-creation research-content-packs research-books research-polyhaven resources-references resources-works resources-sources ecosystem-library creator-spatial-reader",
  gallery: "community-home community-events community-promote-home community-promote-new community-promote-moderation community-promote-edit community-promote-post community-cafes community-cafe-manage community-cafe community-post community-scope community-pencafe creator-showcase creator-showcase-reviews creator-showcase-review creator-showcase-challenges creator-showcase-promo creator-showcase-series creator-showcase-work creator-gallery creator-challenges creator-promo creator-series creator-work resources-showcase ecosystem-fandom account-creators account-profile",
  academy: "creator-ai-settings creator-ai-inference creator-ai-runtime creator-character-convert creator-ecosystem creator-growth-ip creator-environment-guide creator-ecosystem-viewer creator-studio-support creator-studio-generative creator-studio-toolchain creator-studio-engines creator-studio-jobs creator-studio-immersive creator-learning creator-studio-manual creator-studio-manual-article resources-recipes ecosystem-home ecosystem-education-legacy ecosystem-education catalog-guide legal-about-workflow legal-about-technology legal-about-technology-story legal-about-technology-playbook legal-about-technology-guides legal-about-technology-references legal-about-technology-field-notes legal-about-technology-deck legal-about-technology-videos legal-about-technology-licenses",
  observatory: "experience-fortune experience-play resources-now",
  service: "account-ai-settings account-membership-usage account-my-space account-me account-settings account-auth-action admin legal-about legal-about-principles legal-help legal-accessibility legal-data-sources legal-crawler-policy legal-design legal-sitemap legal-terms legal-privacy legal-copyright legal-contact legal-business legal-support-us legal-creator-support legal-support legal-feedback marketing-studio-introduction marketing-product-tour marketing-membership marketing-brand-film not-found",
};
export const CAMPUS_ROUTE_DISTRICTS = new Map<string, CampusDistrictId>(
  Object.entries(DISTRICT_ROUTES).flatMap(([district, ids]) => ids.split(" ").map((id) => [id, district as CampusDistrictId])),
);
const NATIVE = new Set(["catalog-home", "workspace-home", "workspace-team", "workspace-hub", "creator-studio-home", "creator-studio-project-space"]);
const FOCUSED = new Set(["creator-studio-project-document", "creator-studio-draft-document", "creator-studio", "creator-studio-work-brush-lab", "creator-studio-remix-brush-lab"]);
const PROTECTED = new Set(["admin", "account-auth-action", "production-external-review", "production-pinned-review", "production-workspace-join", "market-checkout", "not-found"]);
const SENSITIVE_KEYS = /^(?:token|accessToken|refreshToken|shareToken|reviewToken|presentationToken|invite|invitation|code|state|credential|secret)$/iu;
export function campusProtectedSearch(search: string): boolean {
  return [...new URLSearchParams(search).keys()].some((key) => SENSITIVE_KEYS.test(key));
}
export function campusBinding(routeId: string, pathname: string, search = ""): CampusBinding | null {
  const districtId = CAMPUS_ROUTE_DISTRICTS.get(routeId);
  if (!districtId) return null;
  const protectedRoute = PROTECTED.has(routeId) || campusProtectedSearch(search)
    || /\/(?:moderation|review\/[^/]+\/[^/]+)(?:\/|$)/u.test(pathname);
  const surface: CampusSurface = protectedRoute ? "protected"
    : FOCUSED.has(routeId) ? "focus" : NATIVE.has(routeId) ? "native" : "room";
  const privateRoute = districtId === "observatory" || districtId === "service"
    || pathname.startsWith("/messages") || pathname.startsWith("/production")
    || pathname.startsWith("/studio") || pathname.startsWith("/collaborate/workspace");
  return { routeId, districtId, surface, private: privateRoute };
}

/** Protected paths have no personal shelf, return target, participants or world runtime. */
export function campusOwnsFrame(binding: CampusBinding | null): boolean {
  return binding?.surface === "room";
}
