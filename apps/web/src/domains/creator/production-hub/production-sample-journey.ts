/**
 * 샘플 프로젝트 체험 순서. 제작 흐름(개요 → 공정 보드 → 회차 룸 → 원고 → 검수 → 팀)과 같은 순서다.
 */
import {
  ClipboardCheck,
  Kanban,
  Layers3,
  LayoutDashboard,
  MessageSquareMore,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { BilingualLabel } from "./production-labels";
import { productionEpisodeRoomPath, productionSurfacePath, type ProductionProjectSurface } from "./production-project-surfaces";

export const PRODUCTION_SAMPLE_PROJECT_ID = "sample-project";
export const PRODUCTION_SAMPLE_EPISODE_ID = "episode-12";

/** 샘플 체험에서 지금 보고 있는 위치. 회차 룸은 프로젝트 탭 밖의 화면이다. */
export type ProductionSampleLocation = ProductionProjectSurface | "episode-room";

interface SampleStep {
  readonly id: string;
  readonly label: BilingualLabel;
  readonly hint: BilingualLabel;
  readonly icon: LucideIcon;
  readonly location: ProductionSampleLocation;
  readonly href: string;
}

export const PRODUCTION_SAMPLE_STEPS: readonly SampleStep[] = Object.freeze([
  {
    id: "overview",
    label: { ko: "개요", en: "Overview" },
    hint: { ko: "진행률과 지금 급한 일", en: "Progress and what's urgent" },
    icon: LayoutDashboard,
    location: "overview",
    href: productionSurfacePath(PRODUCTION_SAMPLE_PROJECT_ID, "overview"),
  },
  {
    id: "board",
    label: { ko: "공정 보드", en: "Board" },
    hint: { ko: "콘티·선화·채색 담당과 마감", en: "Owners and due dates per process" },
    icon: Kanban,
    location: "production",
    href: productionSurfacePath(PRODUCTION_SAMPLE_PROJECT_ID, "production"),
  },
  {
    id: "room",
    label: { ko: "회차 룸", en: "Episode room" },
    hint: { ko: "원고 위 핀 코멘트", en: "Pinned comments on pages" },
    icon: MessageSquareMore,
    location: "episode-room",
    href: productionEpisodeRoomPath(PRODUCTION_SAMPLE_PROJECT_ID, PRODUCTION_SAMPLE_EPISODE_ID),
  },
  {
    id: "compare",
    label: { ko: "원고·버전", en: "Versions" },
    hint: { ko: "최신본과 최종본 구분", en: "Latest vs. final versions" },
    icon: Layers3,
    location: "manuscripts",
    href: productionSurfacePath(PRODUCTION_SAMPLE_PROJECT_ID, "manuscripts"),
  },
  {
    id: "review",
    label: { ko: "검수·승인", en: "Review" },
    hint: { ko: "역할별 승인과 게시 차단", en: "Approvals that gate publishing" },
    icon: ClipboardCheck,
    location: "review",
    href: productionSurfacePath(PRODUCTION_SAMPLE_PROJECT_ID, "review"),
  },
  {
    id: "team",
    label: { ko: "팀·권한", en: "Team" },
    hint: { ko: "역할별로 할 수 있는 일", en: "What each role can do" },
    icon: Users,
    location: "settings",
    href: productionSurfacePath(PRODUCTION_SAMPLE_PROJECT_ID, "settings"),
  },
]);
