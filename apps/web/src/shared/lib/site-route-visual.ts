import {
  canonicalSitePath,
  resolveSiteRouteMetadata,
  type SiteRoutePurpose,
} from "./site-route-metadata";

export const SITE_ROUTE_VISUAL_KINDS = [
  "workflow",
  "discover",
  "create",
  "planning",
  "spatial",
  "assets",
  "production",
  "review",
  "publish",
  "learn",
  "connect",
  "manage",
  "trust",
  "play",
] as const;

export type SiteRouteVisualKind = (typeof SITE_ROUTE_VISUAL_KINDS)[number];
export type SiteRouteVisualMotion =
  | "ribbon"
  | "constellation"
  | "storyboard"
  | "camera"
  | "stack"
  | "timeline"
  | "scan"
  | "signal"
  | "ledger"
  | "focus";
export type SiteRouteVisualDensity = "compact" | "prominent";

export interface SiteRouteVisualText {
  readonly ko: string;
  readonly en: string;
}

export interface SiteRouteVisualVideo {
  readonly src: string;
  readonly portraitSrc: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface SiteRouteVisualProfile {
  readonly kind: SiteRouteVisualKind;
  readonly eyebrow: SiteRouteVisualText;
  readonly motion: SiteRouteVisualMotion;
  readonly density: SiteRouteVisualDensity;
  readonly image: string;
  readonly imagePosition: string;
  readonly video?: SiteRouteVisualVideo;
  readonly layers: readonly [SiteRouteVisualText, SiteRouteVisualText, SiteRouteVisualText];
}

const t = (ko: string, en: string): SiteRouteVisualText => ({ ko, en });
const FILM = (startSeconds: number, endSeconds = Math.min(24, startSeconds + 6)): SiteRouteVisualVideo => ({
  src: "/brand/toonstudio-intro.mp4",
  portraitSrc: "/brand/toonstudio-intro-portrait.mp4",
  startSeconds,
  endSeconds,
});

const PROFILES: Record<SiteRouteVisualKind, SiteRouteVisualProfile> = {
  workflow: {
    kind: "workflow",
    eyebrow: t("전체 제작 흐름", "END-TO-END WORKFLOW"),
    motion: "ribbon",
    density: "compact",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/drama/gpt25-bg-drama-boardroom-vertical-depth/background.png",
    imagePosition: "50% 46%",
    layers: [t("기획", "PLAN"), t("제작", "CREATE"), t("연재", "PUBLISH")],
  },
  discover: {
    kind: "discover",
    eyebrow: t("작품·정보 탐색", "DISCOVER & RESEARCH"),
    motion: "constellation",
    density: "compact",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/romance/gpt25-bg-romance-cherry-path-vertical-depth/background.png",
    imagePosition: "50% 48%",
    layers: [t("찾기", "FIND"), t("비교", "COMPARE"), t("선택", "SELECT")],
  },
  create: {
    kind: "create",
    eyebrow: t("창작 작업실", "CREATIVE WORKSPACE"),
    motion: "storyboard",
    density: "prominent",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/wuxia/gpt25-bg-wuxia-palace-courtyard-vertical-depth/background.png",
    imagePosition: "50% 48%",
    video: FILM(6, 12),
    layers: [t("아이디어", "IDEA"), t("원고", "ART"), t("완성", "FINISH")],
  },
  planning: {
    kind: "planning",
    eyebrow: t("스토리·회차 설계", "STORY & EPISODE DESIGN"),
    motion: "storyboard",
    density: "prominent",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/daily/gpt25-bg-daily-convenience-store-vertical-depth/background.png",
    imagePosition: "50% 50%",
    video: FILM(12, 18),
    layers: [t("세계관", "WORLD"), t("회차", "EPISODE"), t("대본", "SCRIPT")],
  },
  spatial: {
    kind: "spatial",
    eyebrow: t("3D 장면·카메라", "3D SCENE & CAMERA"),
    motion: "camera",
    density: "prominent",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-space-station-vertical-depth/background.png",
    imagePosition: "50% 54%",
    video: FILM(12, 18),
    layers: [t("공간", "SPACE"), t("카메라", "CAMERA"), t("렌더", "RENDER")],
  },
  assets: {
    kind: "assets",
    eyebrow: t("소재·권리 라이브러리", "ASSET & RIGHTS LIBRARY"),
    motion: "stack",
    density: "compact",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-cyber-alley-vertical-depth/background.png",
    imagePosition: "50% 50%",
    layers: [t("탐색", "BROWSE"), t("권리", "RIGHTS"), t("적용", "APPLY")],
  },
  production: {
    kind: "production",
    eyebrow: t("연재 제작 운영", "PRODUCTION OPERATIONS"),
    motion: "timeline",
    density: "prominent",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/action/gpt25-bg-action-highway-chase-vertical-depth/background.png",
    imagePosition: "50% 50%",
    video: FILM(12, 18),
    layers: [t("담당", "ASSIGN"), t("마감", "SCHEDULE"), t("진행", "TRACK")],
  },
  review: {
    kind: "review",
    eyebrow: t("검토·피드백", "REVIEW & FEEDBACK"),
    motion: "scan",
    density: "compact",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/drama/gpt25-bg-drama-hospital-corridor-vertical-depth/background.png",
    imagePosition: "50% 48%",
    video: FILM(12, 18),
    layers: [t("검토", "REVIEW"), t("수정", "REVISE"), t("승인", "APPROVE")],
  },
  publish: {
    kind: "publish",
    eyebrow: t("게시·프로모션", "PUBLISH & PROMOTE"),
    motion: "scan",
    density: "prominent",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/romance/gpt25-bg-romance-ferris-wheel-vertical-depth/background.png",
    imagePosition: "50% 50%",
    video: FILM(18, 24),
    layers: [t("검사", "CHECK"), t("출력", "EXPORT"), t("공개", "RELEASE")],
  },
  learn: {
    kind: "learn",
    eyebrow: t("가이드·학습", "GUIDES & LEARNING"),
    motion: "ledger",
    density: "compact",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/action/gpt25-bg-action-jungle-temple-vertical-depth/background.png",
    imagePosition: "50% 50%",
    layers: [t("이해", "LEARN"), t("실습", "PRACTICE"), t("적용", "APPLY")],
  },
  connect: {
    kind: "connect",
    eyebrow: t("협업·커뮤니티", "COLLABORATE & CONNECT"),
    motion: "signal",
    density: "compact",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/wuxia/gpt25-bg-wuxia-traditional-market-vertical-depth/background.png",
    imagePosition: "50% 48%",
    layers: [t("모집", "MATCH"), t("대화", "DISCUSS"), t("협업", "BUILD")],
  },
  manage: {
    kind: "manage",
    eyebrow: t("작품·계정 관리", "WORK & ACCOUNT CONTROL"),
    motion: "ledger",
    density: "compact",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-research-lab-vertical-depth/background.png",
    imagePosition: "50% 50%",
    layers: [t("정리", "ORGANIZE"), t("상태", "STATUS"), t("복구", "RECOVER")],
  },
  trust: {
    kind: "trust",
    eyebrow: t("정책·지원·접근성", "POLICY, SUPPORT & ACCESS"),
    motion: "focus",
    density: "compact",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/daily/gpt25-bg-daily-bedroom-night-vertical-depth/background.png",
    imagePosition: "50% 50%",
    layers: [t("범위", "SCOPE"), t("기준", "STANDARD"), t("지원", "SUPPORT")],
  },
  play: {
    kind: "play",
    eyebrow: t("인터랙티브 체험", "INTERACTIVE EXPERIENCE"),
    motion: "constellation",
    density: "prominent",
    image: "/assets/studio/generated-backgrounds/gpt25-v1/fantasy/gpt25-bg-fantasy-dragon-cliff-vertical-depth/background.png",
    imagePosition: "50% 48%",
    video: FILM(0, 6),
    layers: [t("선택", "CHOOSE"), t("체험", "PLAY"), t("공유", "SHARE")],
  },
};

const exact = (pathname: string, routes: readonly string[]) => routes.includes(pathname);
const family = (pathname: string, routes: readonly string[]) => routes.some(
  (route) => pathname === route || pathname.startsWith(`${route}/`),
);

function fallbackKind(purpose: SiteRoutePurpose): SiteRouteVisualKind {
  switch (purpose) {
    case "create": return "create";
    case "learn": return "learn";
    case "connect": return "connect";
    case "manage": return "manage";
    case "trust": return "trust";
    default: return "discover";
  }
}

export function resolveSiteRouteVisualKind(input: string): SiteRouteVisualKind {
  const pathname = canonicalSitePath(input);
  const projectSection = pathname.match(/^\/studio\/p\/[^/]+\/(overview|story|production|assets|review|export|settings)$/u)?.[1];
  if (pathname === "/") return "workflow";
  if (projectSection === "story") return "planning";
  if (projectSection === "production" || projectSection === "overview") return "production";
  if (projectSection === "assets") return "assets";
  if (projectSection === "review") return "review";
  if (projectSection === "export") return "publish";
  if (projectSection === "settings") return "manage";
  if (family(pathname, ["/fortune", "/play"])) return "play";
  if (family(pathname, ["/production"])) return pathname.includes("/review") ? "review" : "production";
  if (family(pathname, ["/story-lab"]) || pathname.includes("/planning")) return "planning";
  if (
    family(pathname, ["/read/spatial", "/studio/3d", "/studio/bg3d", "/studio/immersive", "/studio/lift3d", "/studio/poser"])
    || pathname.includes("/scene")
  ) return "spatial";
  if (family(pathname, ["/studio/assets", "/market", "/research/assets", "/research/packs", "/research/3d-assets", "/research/material-assets", "/research/space-assets", "/research/vam", "/research/rijksmuseum", "/research/fonts", "/research/creatures", "/research/music-metadata", "/research/archive", "/research/weather-light", "/research/open-data"])) return "assets";
  if (pathname.includes("/review") || family(pathname, ["/reviews", "/feedback"])) return "review";
  if (pathname.includes("/publish") || family(pathname, ["/showcase", "/create"])) return "publish";
  if (family(pathname, ["/studio/manual", "/studio/environment", "/learn", "/help", "/guide", "/references", "/research", "/about/workflow", "/about/technology"])) return "learn";
  if (exact(pathname, ["/studio/toolchain", "/studio/engines", "/studio/jobs"])) return "production";
  if (exact(pathname, ["/studio/new", "/studio/import", "/studio/templates"])) return "create";
  if (exact(pathname, ["/studio/ai-settings"])) return "manage";
  if (exact(pathname, ["/studio/ecosystem", "/studio/growth-ip"])) return "workflow";
  if (family(pathname, ["/collaborate", "/community", "/messages", "/contact", "/support"])) return "connect";
  if (family(pathname, ["/library", "/my", "/me", "/settings"])) return "manage";
  if (exact(pathname, ["/about", "/accessibility", "/about/data", "/about/crawler", "/copyright", "/design", "/privacy", "/sitemap", "/terms"])) return "trust";
  return fallbackKind(resolveSiteRouteMetadata(pathname).purpose);
}

export function resolveSiteRouteVisual(input: string): SiteRouteVisualProfile {
  return PROFILES[resolveSiteRouteVisualKind(input)];
}
