/**
 * 제작 프로젝트의 탭(화면) 정보 구조.
 *
 * 자주 쓰는 다섯 화면(개요·공정 보드·회차·원고·검수)을 앞에 두고 나머지는 "더보기"에 모은다.
 * 각 화면은 한 줄 설명과 "다음 단계" 행동 하나를 가진다. 다음 단계는 제작 흐름
 * (개요 → 공정 보드 → 회차 룸 → 원고 비교 → 검수 → 공유)으로 자연스럽게 이어지도록 고른다.
 */
import {
  BookOpenText,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardCheck,
  GitBranch,
  Handshake,
  Kanban,
  Layers3,
  LayoutDashboard,
  PanelTopOpen,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { BilingualLabel } from "./production-labels";

export type ProductionProjectSurface =
  | "overview"
  | "planning"
  | "episodes"
  | "manuscripts"
  | "production"
  | "schedule"
  | "control"
  | "handoff"
  | "review"
  | "procurement"
  | "rights"
  | "settings";

/** 다음 단계 링크. 화면 id 또는 프로젝트 밖 절대 경로. */
export type ProductionSurfaceTarget =
  | { readonly kind: "surface"; readonly surface: ProductionProjectSurface; readonly query?: string }
  | { readonly kind: "episode-room" }
  | { readonly kind: "path"; readonly path: string };

export interface ProductionSurfaceDefinition {
  readonly id: ProductionProjectSurface;
  readonly label: BilingualLabel;
  readonly description: BilingualLabel;
  readonly icon: LucideIcon;
  readonly core: boolean;
  readonly next: { readonly label: BilingualLabel; readonly target: ProductionSurfaceTarget };
}

type SurfaceContent = Omit<ProductionSurfaceDefinition, "id">;

const SURFACE_CONTENT: Readonly<Record<ProductionProjectSurface, SurfaceContent>> = Object.freeze({
  overview: {
    core: true,
    icon: LayoutDashboard,
    label: { ko: "개요", en: "Overview" },
    description: { ko: "진행률·마감 임박 회차·내 할 일·최근 피드백을 한눈에 봅니다.", en: "Progress, upcoming episodes, your tasks and recent feedback at a glance." },
    next: { label: { ko: "공정 보드 열기", en: "Open the board" }, target: { kind: "surface", surface: "production" } },
  },
  production: {
    core: true,
    icon: Kanban,
    label: { ko: "공정 보드", en: "Board" },
    description: { ko: "콘티부터 식자까지 공정별 담당·마감·상태를 옮기며 관리합니다.", en: "Move work through each process with owners, due dates and status." },
    next: { label: { ko: "회차 룸에서 원고 보기", en: "Open the episode room" }, target: { kind: "episode-room" } },
  },
  episodes: {
    core: true,
    icon: PanelTopOpen,
    label: { ko: "회차", en: "Episodes" },
    description: { ko: "회차별 공정 진행, 게시 마감, 남은 작업량을 비교합니다.", en: "Compare process progress, release dates and remaining work per episode." },
    next: { label: { ko: "가장 급한 회차 룸", en: "Most urgent episode room" }, target: { kind: "episode-room" } },
  },
  manuscripts: {
    core: true,
    icon: Layers3,
    label: { ko: "원고·버전", en: "Manuscripts" },
    description: { ko: "공정별 원고의 최신본·최종본·버전 비교와 공유를 관리합니다.", en: "Latest and final versions, comparisons and sharing for every process." },
    next: { label: { ko: "검수로 이동", en: "Go to review" }, target: { kind: "surface", surface: "review" } },
  },
  review: {
    core: true,
    icon: ClipboardCheck,
    label: { ko: "검수", en: "Review" },
    description: { ko: "원고 위 핀 코멘트, 역할별 승인, 게시를 막는 수정 요청을 확인합니다.", en: "Pinned comments, approvals per role and changes that block publishing." },
    next: { label: { ko: "외부 검수 링크 공유", en: "Share an external review link" }, target: { kind: "surface", surface: "manuscripts", query: "manuscriptView=delivery" } },
  },
  planning: {
    core: false,
    icon: BookOpenText,
    label: { ko: "기획", en: "Planning" },
    description: { ko: "작품·시즌·회차·장면 기준을 최신 버전으로 정리합니다.", en: "Keep series, season, episode and scene plans current." },
    next: { label: { ko: "회차 진행 보기", en: "See episodes" }, target: { kind: "surface", surface: "episodes" } },
  },
  schedule: {
    core: false,
    icon: CalendarClock,
    label: { ko: "일정", en: "Schedule" },
    description: { ko: "마감과 작업량을 보고 일정을 다시 배치합니다.", en: "Check deadlines and workload, then rebalance." },
    next: { label: { ko: "막힌 작업 보기", en: "See blocked work" }, target: { kind: "surface", surface: "production", query: "boardFocus=blocked" } },
  },
  control: {
    core: false,
    icon: GitBranch,
    label: { ko: "운영 제어", en: "Operations" },
    description: { ko: "임계 경로·연재 계획·자동화·위험 대응을 관리합니다.", en: "Critical path, release plans, automation and risk response." },
    next: { label: { ko: "일정 확인", en: "Check the schedule" }, target: { kind: "surface", surface: "schedule" } },
  },
  handoff: {
    core: false,
    icon: Handshake,
    label: { ko: "작업 넘기기", en: "Handoff" },
    description: { ko: "다음 작업자가 꼭 지킬 내용과 막힌 질문을 정리합니다.", en: "What the next artist must keep, and open questions." },
    next: { label: { ko: "회차 룸에서 답하기", en: "Answer in the episode room" }, target: { kind: "episode-room" } },
  },
  procurement: {
    core: false,
    icon: BriefcaseBusiness,
    label: { ko: "외주·발주", en: "Outsourcing" },
    description: { ko: "외주 범위·제안·계약·납품 상태를 따로 기록합니다.", en: "Scope, proposals, contracts and deliveries for outside work." },
    next: { label: { ko: "구인·의뢰 게시판", en: "Hiring board" }, target: { kind: "path", path: "/collaborate" } },
  },
  rights: {
    core: false,
    icon: Scale,
    label: { ko: "계약·정산", en: "Rights & pay" },
    description: { ko: "공개 크레딧·권리 동의·보상 기준을 계약 버전과 함께 확인합니다.", en: "Credits, rights consent and compensation tied to contract versions." },
    next: { label: { ko: "외주 계약 보기", en: "See outsourcing contracts" }, target: { kind: "surface", surface: "procurement" } },
  },
  settings: {
    core: false,
    icon: Users,
    label: { ko: "팀 설정", en: "Team" },
    description: { ko: "참여자와 역할, 각 역할이 할 수 있는 일을 확인합니다.", en: "Members, roles and what each role can do." },
    next: { label: { ko: "사람·권한 관리", en: "Manage people & access" }, target: { kind: "path", path: "/team/people" } },
  },
});

/** 화면 순서: 핵심 다섯 개가 먼저, 나머지는 더보기. */
const SURFACE_ORDER: readonly ProductionProjectSurface[] = Object.freeze([
  "overview",
  "production",
  "episodes",
  "manuscripts",
  "review",
  "planning",
  "schedule",
  "control",
  "handoff",
  "procurement",
  "rights",
  "settings",
]);

export const PRODUCTION_SURFACES: readonly ProductionSurfaceDefinition[] = Object.freeze(
  SURFACE_ORDER.map((id) => ({ id, ...SURFACE_CONTENT[id] })),
);

export const PRODUCTION_CORE_SURFACES = PRODUCTION_SURFACES.filter((surface) => surface.core);
export const PRODUCTION_MORE_SURFACES = PRODUCTION_SURFACES.filter((surface) => !surface.core);

export function productionSurfaceDefinition(id: ProductionProjectSurface): ProductionSurfaceDefinition {
  return { id, ...SURFACE_CONTENT[id] };
}

export function productionSurfacePath(projectId: string, surface: ProductionProjectSurface, query?: string): string {
  const base = `/production/projects/${encodeURIComponent(projectId)}/${surface}`;
  return query ? `${base}?${query}` : base;
}

export function productionEpisodeRoomPath(projectId: string, episodeId: string): string {
  return `/production/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`;
}
