import type { StudioVirtualSpaceZoneId } from "./studio-virtual-space-model";

export type StudioSpaceModuleCategory =
  | "collaboration"
  | "production"
  | "interview"
  | "rest"
  | "fortune"
  | "play";
export type StudioSpaceModulePrivacy = "team" | "invite-only" | "private" | "public";
export type StudioSpaceModulePanel = "people" | "board" | "sessions";

export type StudioSpaceModuleEntry =
  | { readonly type: "panel"; readonly panel: StudioSpaceModulePanel }
  | { readonly type: "route"; readonly href: string }
  | { readonly type: "zone"; readonly zoneId: StudioVirtualSpaceZoneId };

export interface StudioSpaceModule {
  readonly id: string;
  readonly category: StudioSpaceModuleCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly privacy: StudioSpaceModulePrivacy;
  readonly transport: "p2p-direct" | "none";
  readonly capacity: number | null;
  readonly requiresProject: boolean;
  readonly entry: StudioSpaceModuleEntry;
}
export const STUDIO_SPACE_MODULES: readonly StudioSpaceModule[] = Object.freeze([
  {
    id: "p2p-huddle",
    category: "collaboration",
    labelKo: "빠른 P2P 허들",
    labelEn: "Quick P2P huddle",
    descriptionKo: "최대 4명이 전원 동의 후 대화·음성·영상·화면 공유를 시작합니다.",
    descriptionEn: "Up to four people start chat, media and screen sharing after everyone consents.",
    privacy: "team",
    transport: "p2p-direct",
    capacity: 4,
    requiresProject: true,
    entry: { type: "panel", panel: "people" },
  },
  {
    id: "p2p-whiteboard",
    category: "collaboration",
    labelKo: "P2P 화이트보드",
    labelEn: "P2P whiteboard",
    descriptionKo: "획과 메모를 서버 보드 저장 없이 현재 팀원에게 직접 동기화합니다.",
    descriptionEn: "Synchronize strokes and notes directly without a server-side board store.",
    privacy: "team",
    transport: "p2p-direct",
    capacity: 9,
    requiresProject: true,
    entry: { type: "panel", panel: "board" },
  },
  {
    id: "work-session-room",
    category: "production",
    labelKo: "공동 작업 세션룸",
    labelEn: "Work session room",
    descriptionKo: "리딩·콘티·검수·소재 논의를 고정 입력과 결정 기록으로 남깁니다.",
    descriptionEn: "Record readings, storyboards, reviews and asset decisions against pinned inputs.",
    privacy: "team",
    transport: "none",
    capacity: null,
    requiresProject: true,
    entry: { type: "panel", panel: "sessions" },
  },
  {
    id: "interview-waiting",
    category: "interview",
    labelKo: "면접·협업 대기실",
    labelEn: "Interview & collaboration waiting room",
    descriptionKo: "지원·공고·초대 권위가 있는 채용 센터에서 먼저 대기 상태를 확인합니다.",
    descriptionEn: "Confirm application and invitation status in the authorized hiring center first.",
    privacy: "invite-only",
    transport: "none",
    capacity: null,
    requiresProject: false,
    entry: { type: "route", href: "/collaborate/workspace?panel=rooms" },
  },
  {
    id: "interview-room",
    category: "interview",
    labelKo: "비공개 P2P 면접실",
    labelEn: "Private P2P interview room",
    descriptionKo: "승인된 프로젝트 참여자만 명단 전체에 동의한 뒤 미디어를 직접 켭니다.",
    descriptionEn: "Authorized project members accept the exact roster before enabling media.",
    privacy: "invite-only",
    transport: "p2p-direct",
    capacity: 4,
    requiresProject: true,
    entry: { type: "panel", panel: "people" },
  },
  {
    id: "quiet-lounge",
    category: "rest",
    labelKo: "조용한 휴게 라운지",
    labelEn: "Quiet lounge",
    descriptionKo: "라운지로 이동해 휴식 상태를 직접 선택하고 장식 알림을 줄입니다.",
    descriptionEn: "Walk to the lounge, choose an away state and reduce ambient interruptions.",
    privacy: "team",
    transport: "none",
    capacity: null,
    requiresProject: false,
    entry: { type: "zone", zoneId: "lounge" },
  },
  {
    id: "tarot-table",
    category: "fortune",
    labelKo: "타로 테이블",
    labelEn: "Tarot table",
    descriptionKo: "개인 입력을 공개 공간에 투영하지 않는 타로 콘텐츠로 이동합니다.",
    descriptionEn: "Open tarot content without projecting private inputs into the public world.",
    privacy: "private",
    transport: "none",
    capacity: 1,
    requiresProject: false,
    entry: { type: "route", href: "/fortune?content=tarot" },
  },
  {
    id: "saju-room",
    category: "fortune",
    labelKo: "사주·전통 읽기방",
    labelEn: "Traditional reading room",
    descriptionKo: "생년월일 등 민감 입력의 저장 여부를 확인한 뒤 개인 콘텐츠를 엽니다.",
    descriptionEn: "Review storage choices before opening private traditional-reading content.",
    privacy: "private",
    transport: "none",
    capacity: 1,
    requiresProject: false,
    entry: { type: "route", href: "/fortune?content=saju" },
  },
  {
    id: "arcade",
    category: "play",
    labelKo: "간단 오락실",
    labelEn: "Mini arcade",
    descriptionKo: "작업 데이터와 분리된 짧은 놀이 콘텐츠를 엽니다.",
    descriptionEn: "Open short play experiences isolated from production data.",
    privacy: "public",
    transport: "none",
    capacity: null,
    requiresProject: false,
    entry: { type: "route", href: "/play" },
  },
]);

const SAFE_ROUTE = /^\/(?!\/)[^\\]*$/u;
const SAFE_ID = /^[a-z][a-z0-9-]{1,79}$/u;

function hasRouteControl(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32);
}
export function validateStudioSpaceModules(
  modules: readonly StudioSpaceModule[] = STUDIO_SPACE_MODULES,
): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const module of modules) {
    if (!SAFE_ID.test(module.id)) errors.push(`invalid module id: ${module.id}`);
    if (ids.has(module.id)) errors.push(`duplicate module id: ${module.id}`);
    ids.add(module.id);
    if (!module.labelKo.trim() || !module.labelEn.trim()) {
      errors.push(`missing module label: ${module.id}`);
    }
    if (module.transport === "p2p-direct"
      && (module.capacity === null || module.capacity < 2 || module.capacity > 24)) {
      errors.push(`invalid P2P capacity: ${module.id}`);
    }
    if (module.entry.type === "route"
      && (!SAFE_ROUTE.test(module.entry.href)
        || hasRouteControl(module.entry.href)
        || module.entry.href.includes("#")
        || /(?:^|[?&])(?:token|invite|code|secret)=/iu.test(module.entry.href))) {
      errors.push(`unsafe module route: ${module.id}`);
    }
    if (module.category === "interview" && module.privacy === "public") {
      errors.push(`public interview module: ${module.id}`);
    }
  }
  return Object.freeze(errors);
}
