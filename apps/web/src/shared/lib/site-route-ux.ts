import { defineBilingualAutoText } from "./i18n-bilingual-copy";
import {
  canonicalSitePath,
  resolveSiteRouteMetadata,
  type SiteRoutePurpose,
} from "./site-route-metadata";

export type SiteRouteContextLevel = "global" | "project" | "episode" | "scene" | "cut";
export type SiteRouteMobilePolicy = "full" | "review" | "preview" | "desktop-required";
export type SiteRouteRecoveryPolicy = "none" | "resume-recent" | "preserve-draft" | "restore-revision";
export type SiteRouteAudience = "solo-creator" | "team" | "specialist" | "reviewer" | "reader";

/** Global i18n key for route-level user-facing copy. */
export type SiteRouteUxText = string;

export interface SiteRouteUxContract {
  readonly canonicalPath: string;
  readonly pagePurpose: SiteRouteUxText;
  readonly primaryAction: SiteRouteUxText | null;
  readonly contextLevel: SiteRouteContextLevel;
  readonly mobilePolicy: SiteRouteMobilePolicy;
  readonly helpPath: string;
  readonly recoveryPolicy: SiteRouteRecoveryPolicy;
  readonly audiences: readonly SiteRouteAudience[];
}

interface SiteRouteUxOverride extends Omit<SiteRouteUxContract, "canonicalPath"> {
  readonly matches: (pathname: string) => boolean;
}

const text = (ko: string, en: string): SiteRouteUxText =>
  defineBilingualAutoText("siteRouteUx", ko, en);
const exact = (route: string) => (pathname: string) => pathname === route;
const family = (route: string) => (pathname: string) => pathname === route || pathname.startsWith(`${route}/`);

const PURPOSE_DEFAULTS: Record<SiteRoutePurpose, Omit<SiteRouteUxContract, "canonicalPath">> = {
  create: {
    pagePurpose: text("작품을 직접 만들고 편집합니다.", "Create and edit the work directly."),
    primaryAction: text("작업 시작", "Start creating"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help",
    recoveryPolicy: "preserve-draft",
    audiences: ["solo-creator", "team", "specialist"],
  },
  discover: {
    pagePurpose: text("작품·소재·정보를 찾아 다음 작업에 활용합니다.", "Find stories, assets and insight for the next task."),
    primaryAction: text("찾아보기", "Explore"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help",
    recoveryPolicy: "none",
    audiences: ["solo-creator", "team", "reader"],
  },
  learn: {
    pagePurpose: text("현재 제작 단계에 필요한 사용법을 확인합니다.", "Learn what you need for the current production step."),
    primaryAction: text("가이드 보기", "Open guide"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help",
    recoveryPolicy: "none",
    audiences: ["solo-creator", "team", "specialist"],
  },
  connect: {
    pagePurpose: text("함께 만들 사람과 의견을 연결합니다.", "Connect the people and feedback needed to finish the work."),
    primaryAction: text("함께하기", "Collaborate"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help",
    recoveryPolicy: "none",
    audiences: ["solo-creator", "team", "specialist", "reviewer"],
  },
  manage: {
    pagePurpose: text("작품·회차·파일과 제작 진행을 한곳에서 관리합니다.", "Manage the work, episodes, files and production progress in one place."),
    primaryAction: text("다음 작업 열기", "Open next task"),
    contextLevel: "project",
    mobilePolicy: "review",
    helpPath: "/help",
    recoveryPolicy: "resume-recent",
    audiences: ["solo-creator", "team", "specialist"],
  },
  trust: {
    pagePurpose: text("서비스의 정책·지원 범위와 안전 기준을 확인합니다.", "Review service policies, support scope and safety standards."),
    primaryAction: null,
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help",
    recoveryPolicy: "none",
    audiences: ["solo-creator", "team", "specialist", "reviewer", "reader"],
  },
};

export const SITE_ROUTE_UX_OVERRIDES: readonly SiteRouteUxOverride[] = [
  {
    matches: exact("/"),
    pagePurpose: text("기획부터 연재까지 웹툰 제작의 전체 흐름을 이해하고 시작합니다.", "Understand and start the complete webtoon workflow from planning to publishing."),
    primaryAction: text("새 작품 시작", "Start a new work"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help",
    recoveryPolicy: "resume-recent",
    audiences: ["solo-creator", "team", "specialist"],
  },
  {
    matches: family("/production/projects"),
    pagePurpose: text("회차·역할·일정·작업물·검토 상태를 하나의 제작 흐름으로 운영합니다.", "Run episodes, roles, schedules, deliverables and review as one production flow."),
    primaryAction: text("다음 작업 시작", "Start next task"),
    contextLevel: "project",
    mobilePolicy: "review",
    helpPath: "/help?topic=production",
    recoveryPolicy: "restore-revision",
    audiences: ["solo-creator", "team", "specialist", "reviewer"],
  },
  {
    matches: exact("/production"),
    pagePurpose: text("기획·작화·협업·검수·연재 준비를 작품별로 이어갑니다.", "Connect planning, art, collaboration, review and publishing for each work."),
    primaryAction: text("제작 프로젝트 열기", "Open a production project"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help?topic=production",
    recoveryPolicy: "resume-recent",
    audiences: ["solo-creator", "team", "specialist"],
  },
  {
    matches: exact("/story-lab"),
    pagePurpose: text("작품 설정·캐릭터·시즌·회차와 대본을 제작 기준으로 정리합니다.", "Shape the world, characters, seasons, episodes and scripts as production-ready source material."),
    primaryAction: text("첫 회차 구성", "Build the first episode"),
    contextLevel: "project",
    mobilePolicy: "full",
    helpPath: "/help?topic=planning",
    recoveryPolicy: "preserve-draft",
    audiences: ["solo-creator", "team"],
  },
  {
    matches: exact("/studio/new"),
    pagePurpose: text("현재 가진 아이디어·대본·원고에서 새 작품을 시작합니다.", "Start a new work from the idea, script or files you already have."),
    primaryAction: text("작품 만들기", "Create work"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help?topic=getting-started",
    recoveryPolicy: "preserve-draft",
    audiences: ["solo-creator", "team"],
  },
  {
    matches: exact("/studio/bg3d"),
    pagePurpose: text("웹툰 컷에 사용할 3D 배경·소품·카메라 구도를 직접 만듭니다.", "Build 3D backgrounds, props and camera compositions for webtoon panels."),
    primaryAction: text("3D 장면 만들기", "Create a 3D scene"),
    contextLevel: "scene",
    mobilePolicy: "desktop-required",
    helpPath: "/help?topic=3d-background",
    recoveryPolicy: "preserve-draft",
    audiences: ["solo-creator", "team", "specialist"],
  },
  {
    matches: family("/studio/assets"),
    pagePurpose: text("브러시·캐릭터·배경·폰트·오디오와 사용 권리를 함께 관리합니다.", "Manage brushes, characters, backgrounds, fonts, audio and usage rights together."),
    primaryAction: text("소재 추가", "Add an asset"),
    contextLevel: "project",
    mobilePolicy: "full",
    helpPath: "/help?topic=assets",
    recoveryPolicy: "none",
    audiences: ["solo-creator", "team", "specialist"],
  },
  {
    matches: exact("/studio/publish"),
    pagePurpose: text("승인본을 기준으로 규격·권리를 검사하고 게시본을 만듭니다.", "Check format and rights against an approved version and create the release."),
    primaryAction: text("게시 준비 검사", "Run publishing checks"),
    contextLevel: "episode",
    mobilePolicy: "review",
    helpPath: "/help?topic=publishing",
    recoveryPolicy: "restore-revision",
    audiences: ["solo-creator", "team", "reviewer"],
  },
  {
    matches: family("/studio/p"),
    pagePurpose: text("현재 작품의 기획·원고·3D·소재·검토와 연재 준비를 이어갑니다.", "Continue planning, art, 3D, assets, review and publishing for the current work."),
    primaryAction: text("이어서 작업", "Continue working"),
    contextLevel: "project",
    mobilePolicy: "review",
    helpPath: "/help?topic=project",
    recoveryPolicy: "restore-revision",
    audiences: ["solo-creator", "team", "specialist", "reviewer"],
  },
  {
    matches: exact("/studio"),
    pagePurpose: text("최근 작품·공유 작업·복구 가능한 초안에서 바로 이어서 작업합니다.", "Continue recent projects, shared work and recoverable drafts."),
    primaryAction: text("이어서 작업", "Continue working"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help?topic=projects",
    recoveryPolicy: "resume-recent",
    audiences: ["solo-creator", "team", "specialist"],
  },
  {
    matches: family("/market"),
    pagePurpose: text("현재 작품에 바로 사용할 소재를 찾고 권리를 확인합니다.", "Find assets ready for the current work and verify usage rights."),
    primaryAction: text("소재 찾아보기", "Browse assets"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help?topic=market",
    recoveryPolicy: "none",
    audiences: ["solo-creator", "team", "specialist"],
  },
  {
    matches: family("/collaborate"),
    pagePurpose: text("작업 범위·역할·마감과 완료 기준으로 함께 만들 사람을 연결합니다.", "Connect collaborators through clear scope, roles, deadlines and completion criteria."),
    primaryAction: text("협업 시작", "Start collaborating"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help?topic=collaboration",
    recoveryPolicy: "none",
    audiences: ["solo-creator", "team", "specialist"],
  },
  {
    matches: family("/learn"),
    pagePurpose: text("현재 제작 단계와 막힌 문제에서 필요한 사용법을 찾습니다.", "Find guidance from the current production step or the problem blocking you."),
    primaryAction: text("필요한 도움 찾기", "Find help"),
    contextLevel: "global",
    mobilePolicy: "full",
    helpPath: "/help",
    recoveryPolicy: "none",
    audiences: ["solo-creator", "team", "specialist", "reviewer"],
  },
] as const;

export const BANNED_USER_FACING_ROUTE_TERMS = [
  "ProjectGraph",
  "ScopeRef",
  "Artifact",
  "Workcell",
  "Preflight",
  "Provenance",
  "Capability Gate",
] as const;

export function resolveSiteRouteUxContract(input: string): SiteRouteUxContract {
  const canonicalPath = canonicalSitePath(input);
  const override = SITE_ROUTE_UX_OVERRIDES.find((candidate) => candidate.matches(canonicalPath));
  if (override) {
    return {
      canonicalPath,
      pagePurpose: override.pagePurpose,
      primaryAction: override.primaryAction,
      contextLevel: override.contextLevel,
      mobilePolicy: override.mobilePolicy,
      helpPath: override.helpPath,
      recoveryPolicy: override.recoveryPolicy,
      audiences: override.audiences,
    };
  }

  const metadata = resolveSiteRouteMetadata(canonicalPath);
  const defaults = PURPOSE_DEFAULTS[metadata.purpose];
  return {
    canonicalPath,
    ...defaults,
    contextLevel: metadata.projectContext === "required" ? "project" : defaults.contextLevel,
    mobilePolicy: metadata.device === "desktop-first" ? "desktop-required" : defaults.mobilePolicy,
  };
}
