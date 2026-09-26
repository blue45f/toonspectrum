import type {
  StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";
import type {
  StudioWorldInteractionDefinition,
} from "./studio-virtual-space-world-manifest";

export const STUDIO_VIRTUAL_PLACE_CATEGORIES = [
  "all",
  "creation",
  "review",
  "community",
  "collaboration",
  "archive",
  "rest",
  "play",
  "production",
] as const;

export type StudioVirtualPlaceCategory = typeof STUDIO_VIRTUAL_PLACE_CATEGORIES[number];

export interface StudioVirtualPlaceDefinition {
  readonly id: string;
  readonly roomId: StudioVirtualSpaceZoneId;
  readonly category: Exclude<StudioVirtualPlaceCategory, "all">;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly previewUrl: string;
  readonly action?: StudioWorldInteractionDefinition["action"];
  readonly projectOnly?: boolean;
  readonly recommended?: boolean;
}

const ROOT = "/assets/virtual-studio/imagegen25-v7/places";
const place = (definition: Omit<StudioVirtualPlaceDefinition, "previewUrl">): StudioVirtualPlaceDefinition =>
  Object.freeze({ ...definition, previewUrl: `${ROOT}/${definition.id}.webp` });

export const STUDIO_VIRTUAL_PLACES: readonly StudioVirtualPlaceDefinition[] = Object.freeze([
  place({ id: "skyport", roomId: "skyport", category: "community", labelKo: "스카이 포트", labelEn: "Sky Port",
    descriptionKo: "입장 부두와 월드 이동 게이트가 있는 시작 장소.", descriptionEn: "The arrival dock and gateway to every studio district.", action: "community", recommended: true }),
  place({ id: "creator-plaza", roomId: "creator-plaza", category: "community", labelKo: "창작자 광장", labelEn: "Creator Plaza",
    descriptionKo: "이벤트와 공지가 모이는 가상스튜디오의 중심 광장.", descriptionEn: "The central plaza for announcements, events and meetups.", action: "live", recommended: true }),
  place({ id: "personal-atelier", roomId: "personal-atelier", category: "creation", labelKo: "개인 아틀리에", labelEn: "Personal Atelier",
    descriptionKo: "드로잉과 캐릭터 제작을 이어가는 개인 작업실.", descriptionEn: "A private atelier for drawing and character production.", action: "canvas", recommended: true }),
  place({ id: "story-lab", roomId: "story-lab", category: "creation", labelKo: "스토리 랩", labelEn: "Story Lab",
    descriptionKo: "대본과 아이디어를 함께 정리하는 공동 집필 공간.", descriptionEn: "A collaborative writing room for scripts and story ideas.", action: "story", recommended: true }),
  place({ id: "creator-cafe", roomId: "creator-cafe", category: "rest", labelKo: "크리에이터 카페", labelEn: "Creator Cafe",
    descriptionKo: "짧은 대화와 휴식을 위한 정원형 카페.", descriptionEn: "A garden cafe for brief conversations and breaks.", action: "community" }),
  place({ id: "team-meeting", roomId: "team-meeting", category: "collaboration", labelKo: "팀 미팅 로프트", labelEn: "Team Meeting Loft",
    descriptionKo: "팀 회의와 화면 공유를 위한 비공개 협업실.", descriptionEn: "A private team room for meetings and screen sharing.", action: "community", projectOnly: true }),
  place({ id: "tree-library", roomId: "tree-library", category: "archive", labelKo: "트리 라이브러리", labelEn: "Tree Library",
    descriptionKo: "레퍼런스와 제작 에셋을 보관하는 수목 도서관.", descriptionEn: "A tree-top library for references and production assets.", action: "assets" }),
  place({ id: "review-gallery", roomId: "review-gallery", category: "review", labelKo: "리뷰 갤러리", labelEn: "Review Gallery",
    descriptionKo: "버전 비교와 공동 검수를 진행하는 전시형 공간.", descriptionEn: "A gallery for version comparison and collaborative review.", action: "review", recommended: true }),
  place({ id: "garden", roomId: "garden", category: "rest", labelKo: "창작 정원", labelEn: "Creator Garden",
    descriptionKo: "아이디어를 정리하고 잠시 쉬어가는 폭포 정원.", descriptionEn: "A waterfall garden for reflection and quiet breaks.", action: "assistant" }),
  place({ id: "observatory", roomId: "observatory", category: "review", labelKo: "스토리 관측소", labelEn: "Story Observatory",
    descriptionKo: "프로젝트 흐름과 품질 상태를 멀리서 조망하는 곳.", descriptionEn: "An observatory for project flow and quality signals.", action: "review" }),
  place({ id: "arcade", roomId: "arcade", category: "play", labelKo: "크리에이터 아케이드", labelEn: "Creator Arcade",
    descriptionKo: "작업 데이터와 분리된 짧은 놀이와 영감 공간.", descriptionEn: "A lightweight play space kept separate from production data.", action: "comic" }),
  place({ id: "beach", roomId: "beach", category: "rest", labelKo: "해변 아틀리에", labelEn: "Beach Atelier",
    descriptionKo: "파도와 석양을 보며 쉬는 해변 작업 공간.", descriptionEn: "A seaside work-and-rest space with waves and sunset views.", action: "community" }),
  place({ id: "event-stage", roomId: "event-stage", category: "community", labelKo: "이벤트 스테이지", labelEn: "Event Stage",
    descriptionKo: "발표와 라이브 행사를 진행하는 공개 무대.", descriptionEn: "A public stage for presentations and live events.", action: "live" }),
  place({ id: "production-control", roomId: "production-control", category: "production", labelKo: "프로덕션 관제실", labelEn: "Production Control",
    descriptionKo: "일정, 작업 배정과 병목을 확인하는 제작 관제실.", descriptionEn: "A production room for schedules, assignments and bottlenecks.", action: "assistant", projectOnly: true }),
]);

export function studioVirtualPlacesForMode(personal: boolean): readonly StudioVirtualPlaceDefinition[] {
  return personal ? STUDIO_VIRTUAL_PLACES.filter((item) => !item.projectOnly) : STUDIO_VIRTUAL_PLACES;
}

export function studioVirtualPlaceByRoom(roomId: StudioVirtualSpaceZoneId): StudioVirtualPlaceDefinition | undefined {
  return STUDIO_VIRTUAL_PLACES.find((item) => item.roomId === roomId);
}
