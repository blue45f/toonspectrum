import { BookOpenText, ClipboardCheck, Handshake, LayoutGrid, MessageSquareText, MonitorUp, PenTool, type LucideIcon } from "lucide-react";

import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import type { StudioWorldInteractionDefinition } from "../studio-virtual-space-world-manifest";

/**
 * 웹툰 협업 동선: 지금 있는 구역에서 바로 이어지는 일.
 * 회의실은 회차 보드·원고 검토·피드백·화면 공유, 작업실은 내 원고·회차 보드·같이 작업하기로 이어진다.
 * 링크는 기존 제작 관리(production-hub)·스튜디오 경로만 쓰고, 패널은 HUD 패널을 그대로 연다.
 */
export type SpaceZoneWorkKind = "meeting" | "atelier" | "story" | "review";

export type SpaceZoneWorkItem =
  | { readonly id: string; readonly kind: "href"; readonly href: string; readonly labelKo: string; readonly labelEn: string; readonly icon: LucideIcon }
  | { readonly id: string; readonly kind: "panel"; readonly panel: StudioVirtualWorkspacePanel; readonly labelKo: string; readonly labelEn: string; readonly icon: LucideIcon }
  | { readonly id: string; readonly kind: "cowork" | "share"; readonly labelKo: string; readonly labelEn: string; readonly icon: LucideIcon };

const ZONE_KIND: Readonly<Record<string, SpaceZoneWorkKind>> = {
  "team-meeting": "meeting",
  meeting: "meeting",
  "personal-atelier": "atelier",
  drawing: "atelier",
  storyboard: "atelier",
  "story-lab": "story",
  writers: "story",
  "review-gallery": "review",
  review: "review",
};

const ACTION_KIND: Partial<Record<StudioWorldInteractionDefinition["action"], SpaceZoneWorkKind>> = {
  live: "meeting",
  canvas: "atelier",
  comic: "atelier",
  story: "story",
  review: "review",
};

/** 구역(방 id)과 그 방의 기본 동작으로 협업 동선 종류를 고른다. 해당 없으면 null. */
export function spaceZoneWorkKind(roomId: string | null | undefined, roomAction?: StudioWorldInteractionDefinition["action"]): SpaceZoneWorkKind | null {
  return (roomId ? ZONE_KIND[roomId] : undefined) ?? (roomAction ? ACTION_KIND[roomAction] : undefined) ?? null;
}

export const SPACE_ZONE_WORK_TITLES: Readonly<Record<SpaceZoneWorkKind, { readonly ko: string; readonly en: string }>> = {
  meeting: { ko: "회의실에서 바로", en: "From the meeting room" },
  atelier: { ko: "작업실에서 바로", en: "From the studio" },
  story: { ko: "공동 작업실에서 바로", en: "From the co-work room" },
  review: { ko: "갤러리에서 바로", en: "From the gallery" },
};

export interface SpaceZoneWorkContext {
  readonly projectId: string;
  /** 제작 관리 프로젝트가 연결돼 있으면 production-hub 경로를 쓴다. */
  readonly productionProjectId: string | null;
  readonly personal: boolean;
}

function boardHref({ projectId, productionProjectId }: SpaceZoneWorkContext): string {
  return productionProjectId
    ? `/production/projects/${encodeURIComponent(productionProjectId)}/episodes`
    : `/studio/p/${encodeURIComponent(projectId)}/production`;
}

function reviewHref({ projectId, productionProjectId }: SpaceZoneWorkContext): string {
  return productionProjectId
    ? `/production/projects/${encodeURIComponent(productionProjectId)}/review`
    : `/studio/p/${encodeURIComponent(projectId)}/review?view=inbox`;
}

/** 구역 종류별 바로 가기(최대 4개). 개인 공간은 팀 전용 동선(피드백·같이 작업하기·화면 공유)을 뺀다. */
export function spaceZoneWorkItems(kind: SpaceZoneWorkKind, context: SpaceZoneWorkContext): readonly SpaceZoneWorkItem[] {
  if (context.personal) {
    const manuscript: SpaceZoneWorkItem = { id: "manuscript", kind: "href", href: "/studio", labelKo: "내 원고 열기", labelEn: "Open my pages", icon: PenTool };
    return kind === "story"
      ? [{ id: "story", kind: "href", href: "/studio/new", labelKo: "새 이야기 시작", labelEn: "Start a new story", icon: BookOpenText }, manuscript]
      : [manuscript];
  }
  const encoded = encodeURIComponent(context.projectId);
  const board: SpaceZoneWorkItem = { id: "board", kind: "href", href: boardHref(context), labelKo: "회차 보드", labelEn: "Episode board", icon: LayoutGrid };
  const review: SpaceZoneWorkItem = { id: "review", kind: "href", href: reviewHref(context), labelKo: "원고 검토", labelEn: "Page review", icon: ClipboardCheck };
  const feedback: SpaceZoneWorkItem = { id: "feedback", kind: "panel", panel: "work", labelKo: "피드백·검수함", labelEn: "Feedback inbox", icon: MessageSquareText };
  const cowork: SpaceZoneWorkItem = { id: "cowork", kind: "cowork", labelKo: "같이 작업하기", labelEn: "Work together", icon: Handshake };
  switch (kind) {
    case "meeting":
      return [board, review, feedback, { id: "share", kind: "share", labelKo: "화면 공유", labelEn: "Share screen", icon: MonitorUp }];
    case "atelier":
      return [{ id: "manuscript", kind: "href", href: `/studio/work/${encoded}/canvas`, labelKo: "내 원고 열기", labelEn: "Open my pages", icon: PenTool }, board, cowork];
    case "story":
      return [{ id: "story", kind: "href", href: `/studio/p/${encoded}/story?view=script`, labelKo: "대본·콘티", labelEn: "Script & storyboard", icon: BookOpenText }, board, cowork];
    case "review":
      return [review, feedback, cowork];
  }
}
