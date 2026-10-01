import type { StudioVirtualSpaceZoneId } from "./studio-virtual-space-model";
import { officeZoneBounds, validateOfficeZones, type StudioOfficeZone } from "./studio-virtual-space-office-zones";

export type StudioSpaceModuleCategory =
  | "collaboration"
  | "production"
  | "interview"
  | "rest"
  | "fortune"
  | "play"
  | "template";
export type StudioSpaceModulePrivacy = "team" | "invite-only" | "private" | "public";
export type StudioSpaceModulePanel = "people" | "board" | "sessions";

/** Theme-space templates that build a whole world in one click. */
export type StudioThemeTemplateKind = "storyboard-room" | "recording-booth" | "gallery";
export type StudioThemePropKind = "decor" | "solid" | "interactive";
export type StudioThemePropDepth = "fixed" | "y-sort" | "foreground";
export type StudioThemePropAction =
  | "assistant" | "assets" | "canvas" | "community" | "comic" | "live" | "review" | "story";
export type StudioThemeFacing = "down" | "left" | "right" | "up";
export type StudioThemeAcousticPolicy = "public" | "private";

export interface StudioThemePropDefinition {
  readonly id: string;
  readonly kind: StudioThemePropKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly x: number;
  readonly y: number;
  readonly depth: StudioThemePropDepth;
  /** Below 1.0 reads as translucent treatment (soundproofing, spotlight glow). */
  readonly alpha?: number;
  readonly collider?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly action?: StudioThemePropAction;
  readonly interactionRadius?: number;
}
export interface StudioThemeSeatDefinition {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly approachPoint: { readonly x: number; readonly y: number };
  readonly anchorPoint: { readonly x: number; readonly y: number };
  readonly seatAttachmentPoint?: { readonly x: number; readonly y: number };
  readonly exitPoint: { readonly x: number; readonly y: number };
  readonly facing: StudioThemeFacing;
  readonly radius: number;
}
export interface StudioThemeNpcDefinition {
  readonly id: string;
  readonly skinKey: string;
  readonly x: number;
  readonly y: number;
  readonly facing?: StudioThemeFacing;
  readonly behavior: "idle" | "talk" | "draw" | "review" | "patrol";
  readonly patrol?: readonly { readonly x: number; readonly y: number }[];
}
export interface StudioThemeRoomTemplate {
  readonly kind: StudioThemeTemplateKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly room: {
    readonly id: string;
    readonly labelKo: string;
    readonly labelEn: string;
    readonly descriptionKo?: string;
    readonly descriptionEn?: string;
    readonly action?: StudioThemePropAction;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly spawn: { readonly x: number; readonly y: number; readonly facing?: StudioThemeFacing };
  readonly acoustic: {
    readonly id: string;
    readonly policy: StudioThemeAcousticPolicy;
    readonly doorId?: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly furniture: readonly StudioThemePropDefinition[];
  readonly seats?: readonly StudioThemeSeatDefinition[];
  readonly npc?: StudioThemeNpcDefinition;
  /** 존 프리셋 (Track D). 템플릿 룸 안에 배치되는 오피스 존 오버레이. optional. */
  readonly zones?: readonly StudioOfficeZone[];
}

function themeProp(prop: StudioThemePropDefinition): StudioThemePropDefinition {
  return Object.freeze(prop);
}

/** Focused single-room worlds. Coordinates share the 1280x960 world space and keep clear
 * of the default campus private acoustic rects (review 670/300/290/230, meeting 950/590/290/260)
 * so privacy retention never overlaps a theme zone. */
export const STUDIO_THEME_ROOM_TEMPLATES: readonly StudioThemeRoomTemplate[] = Object.freeze([
  {
    kind: "storyboard-room",
    labelKo: "콘티룸",
    labelEn: "Storyboard room",
    descriptionKo: "대형 리뷰 보드에 핀 리뷰를 남기고 협업 테이블·의자 세트에서 함께 검수해요.",
    descriptionEn: "Leave pin reviews on the large review board and inspect together at the collaboration table set.",
    room: {
      id: "storyboard-room", labelKo: "콘티룸", labelEn: "Storyboard room",
      descriptionKo: "콘티 흐름을 대형 보드에서 함께 검토하는 협업 공간이에요.",
      descriptionEn: "A collaboration space for reviewing panel flow on the large board.",
      action: "review", x: 60, y: 120, width: 520, height: 640,
    },
    spawn: { x: 320, y: 700, facing: "up" },
    acoustic: { id: "storyboard-room-audio", policy: "public", x: 80, y: 140, width: 480, height: 600 },
    furniture: [
      themeProp({ id: "storyboard-review-board", kind: "interactive", labelKo: "대형 리뷰 보드", labelEn: "Large review board",
        x: 320, y: 165, depth: "fixed", action: "review", interactionRadius: 90, collider: { x: 140, y: 130, width: 360, height: 36 } }),
      themeProp({ id: "storyboard-pin-tray", kind: "decor", labelKo: "핀 트레이", labelEn: "Pin tray",
        x: 540, y: 165, depth: "fixed" }),
      themeProp({ id: "storyboard-table", kind: "solid", labelKo: "협업 테이블", labelEn: "Collaboration table",
        x: 320, y: 480, depth: "y-sort", collider: { x: 250, y: 450, width: 140, height: 60 } }),
      themeProp({ id: "storyboard-chair-north", kind: "solid", labelKo: "의자 · 북", labelEn: "Chair · north",
        x: 320, y: 405, depth: "y-sort", collider: { x: 300, y: 390, width: 40, height: 30 } }),
      themeProp({ id: "storyboard-chair-south", kind: "solid", labelKo: "의자 · 남", labelEn: "Chair · south",
        x: 320, y: 555, depth: "y-sort", collider: { x: 300, y: 540, width: 40, height: 30 } }),
      themeProp({ id: "storyboard-chair-west", kind: "solid", labelKo: "의자 · 서", labelEn: "Chair · west",
        x: 205, y: 470, depth: "y-sort", collider: { x: 185, y: 455, width: 40, height: 30 } }),
      themeProp({ id: "storyboard-chair-east", kind: "solid", labelKo: "의자 · 동", labelEn: "Chair · east",
        x: 435, y: 470, depth: "y-sort", collider: { x: 415, y: 455, width: 40, height: 30 } }),
    ],
    seats: [
      { id: "storyboard-seat-north", labelKo: "콘티룸 좌석 · 북", labelEn: "Storyboard seat · north",
        approachPoint: { x: 270, y: 432 }, anchorPoint: { x: 320, y: 432 }, seatAttachmentPoint: { x: 320, y: 405 },
        exitPoint: { x: 370, y: 432 }, facing: "down", radius: 10 },
      { id: "storyboard-seat-south", labelKo: "콘티룸 좌석 · 남", labelEn: "Storyboard seat · south",
        approachPoint: { x: 270, y: 528 }, anchorPoint: { x: 320, y: 528 }, seatAttachmentPoint: { x: 320, y: 555 },
        exitPoint: { x: 370, y: 528 }, facing: "up", radius: 10 },
      { id: "storyboard-seat-west", labelKo: "콘티룸 좌석 · 서", labelEn: "Storyboard seat · west",
        approachPoint: { x: 238, y: 420 }, anchorPoint: { x: 238, y: 470 }, seatAttachmentPoint: { x: 205, y: 470 },
        exitPoint: { x: 238, y: 520 }, facing: "right", radius: 10 },
      { id: "storyboard-seat-east", labelKo: "콘티룸 좌석 · 동", labelEn: "Storyboard seat · east",
        approachPoint: { x: 402, y: 420 }, anchorPoint: { x: 402, y: 470 }, seatAttachmentPoint: { x: 435, y: 470 },
        exitPoint: { x: 402, y: 520 }, facing: "left", radius: 10 },
    ],
    npc: { id: "storyboard-editor", skinKey: "npc-editor", x: 200, y: 300, facing: "right",
      behavior: "patrol", patrol: [{ x: 200, y: 300 }, { x: 440, y: 300 }] },
  },
  {
    kind: "recording-booth",
    labelKo: "녹음부스",
    labelEn: "Recording booth",
    descriptionKo: "비공개 음향 구역의 방음 부스에서 대본 스탠드를 두드려 대본을 확인해요.",
    descriptionEn: "Check the script at the script stand inside the soundproof booth on a private acoustic zone.",
    room: {
      id: "recording-booth", labelKo: "녹음부스", labelEn: "Recording booth",
      descriptionKo: "외부 소리를 차단한 비공개 녹음 공간이에요.",
      descriptionEn: "A private recording space sealed from outside sound.",
      x: 60, y: 120, width: 420, height: 420,
    },
    spawn: { x: 120, y: 480, facing: "right" },
    acoustic: { id: "recording-booth-audio", policy: "private", doorId: "recording-booth-door",
      x: 190, y: 220, width: 220, height: 180 },
    furniture: [
      themeProp({ id: "booth-wall-north", kind: "solid", labelKo: "방음 벽 패널 · 북", labelEn: "Soundproof wall · north",
        x: 300, y: 210, depth: "fixed", alpha: 0.96, collider: { x: 170, y: 200, width: 260, height: 20 } }),
      themeProp({ id: "booth-wall-south-west", kind: "solid", labelKo: "방음 벽 패널 · 남서", labelEn: "Soundproof wall · southwest",
        x: 220, y: 410, depth: "fixed", alpha: 0.96, collider: { x: 170, y: 400, width: 100, height: 20 } }),
      themeProp({ id: "booth-wall-south-east", kind: "solid", labelKo: "방음 벽 패널 · 남동", labelEn: "Soundproof wall · southeast",
        x: 380, y: 410, depth: "fixed", alpha: 0.96, collider: { x: 330, y: 400, width: 100, height: 20 } }),
      themeProp({ id: "booth-wall-west", kind: "solid", labelKo: "방음 벽 패널 · 서", labelEn: "Soundproof wall · west",
        x: 180, y: 310, depth: "fixed", alpha: 0.96, collider: { x: 170, y: 200, width: 20, height: 220 } }),
      themeProp({ id: "booth-wall-east", kind: "solid", labelKo: "방음 벽 패널 · 동", labelEn: "Soundproof wall · east",
        x: 420, y: 310, depth: "fixed", alpha: 0.96, collider: { x: 410, y: 200, width: 20, height: 220 } }),
      themeProp({ id: "booth-script-stand", kind: "interactive", labelKo: "대본 스탠드", labelEn: "Script stand",
        x: 300, y: 310, depth: "y-sort", action: "story", interactionRadius: 70, collider: { x: 285, y: 300, width: 30, height: 20 } }),
      themeProp({ id: "booth-mic", kind: "solid", labelKo: "부스 마이크", labelEn: "Booth microphone",
        x: 300, y: 255, depth: "y-sort", collider: { x: 292, y: 247, width: 16, height: 16 } }),
      themeProp({ id: "booth-onair-sign", kind: "decor", labelKo: "ON AIR 사인", labelEn: "ON AIR sign",
        x: 300, y: 185, depth: "foreground", alpha: 0.9 }),
      themeProp({ id: "booth-absorber-west", kind: "decor", labelKo: "흡음 패널 · 서", labelEn: "Absorber panel · west",
        x: 205, y: 310, depth: "fixed", alpha: 0.85 }),
      themeProp({ id: "booth-absorber-east", kind: "decor", labelKo: "흡음 패널 · 동", labelEn: "Absorber panel · east",
        x: 395, y: 310, depth: "fixed", alpha: 0.85 }),
    ],
  },
  {
    kind: "gallery",
    labelKo: "전시관",
    labelEn: "Gallery",
    descriptionKo: "스포트라이트 아래 완성 원고 프레임을 따라 관람 동선을 걸어보세요.",
    descriptionEn: "Walk the viewing route past finished-artwork frames under spotlights.",
    room: {
      id: "gallery-hall", labelKo: "전시관", labelEn: "Gallery",
      descriptionKo: "완성 원고를 전시하는 갤러리 홀이에요.",
      descriptionEn: "A gallery hall exhibiting finished manuscripts.",
      action: "comic", x: 60, y: 560, width: 860, height: 340,
    },
    spawn: { x: 120, y: 730, facing: "right" },
    acoustic: { id: "gallery-hall-audio", policy: "public", x: 90, y: 590, width: 800, height: 280 },
    furniture: [
      themeProp({ id: "gallery-frame-n1", kind: "interactive", labelKo: "전시 프레임 1", labelEn: "Gallery frame 1",
        x: 220, y: 600, depth: "fixed", action: "comic", interactionRadius: 70, collider: { x: 180, y: 585, width: 80, height: 30 } }),
      themeProp({ id: "gallery-frame-n2", kind: "interactive", labelKo: "전시 프레임 2", labelEn: "Gallery frame 2",
        x: 490, y: 600, depth: "fixed", action: "comic", interactionRadius: 70, collider: { x: 450, y: 585, width: 80, height: 30 } }),
      themeProp({ id: "gallery-frame-n3", kind: "interactive", labelKo: "전시 프레임 3", labelEn: "Gallery frame 3",
        x: 760, y: 600, depth: "fixed", action: "comic", interactionRadius: 70, collider: { x: 720, y: 585, width: 80, height: 30 } }),
      themeProp({ id: "gallery-frame-s1", kind: "interactive", labelKo: "전시 프레임 4", labelEn: "Gallery frame 4",
        x: 220, y: 860, depth: "fixed", action: "comic", interactionRadius: 70, collider: { x: 180, y: 845, width: 80, height: 30 } }),
      themeProp({ id: "gallery-frame-s2", kind: "interactive", labelKo: "전시 프레임 5", labelEn: "Gallery frame 5",
        x: 490, y: 860, depth: "fixed", action: "comic", interactionRadius: 70, collider: { x: 450, y: 845, width: 80, height: 30 } }),
      themeProp({ id: "gallery-frame-s3", kind: "interactive", labelKo: "전시 프레임 6", labelEn: "Gallery frame 6",
        x: 760, y: 860, depth: "fixed", action: "comic", interactionRadius: 70, collider: { x: 720, y: 845, width: 80, height: 30 } }),
      themeProp({ id: "gallery-spot-n1", kind: "decor", labelKo: "스포트라이트 1", labelEn: "Spotlight 1",
        x: 220, y: 645, depth: "foreground", alpha: 0.55 }),
      themeProp({ id: "gallery-spot-n2", kind: "decor", labelKo: "스포트라이트 2", labelEn: "Spotlight 2",
        x: 490, y: 645, depth: "foreground", alpha: 0.55 }),
      themeProp({ id: "gallery-spot-n3", kind: "decor", labelKo: "스포트라이트 3", labelEn: "Spotlight 3",
        x: 760, y: 645, depth: "foreground", alpha: 0.55 }),
      themeProp({ id: "gallery-spot-s1", kind: "decor", labelKo: "스포트라이트 4", labelEn: "Spotlight 4",
        x: 220, y: 815, depth: "foreground", alpha: 0.55 }),
      themeProp({ id: "gallery-spot-s2", kind: "decor", labelKo: "스포트라이트 5", labelEn: "Spotlight 5",
        x: 490, y: 815, depth: "foreground", alpha: 0.55 }),
      themeProp({ id: "gallery-spot-s3", kind: "decor", labelKo: "스포트라이트 6", labelEn: "Spotlight 6",
        x: 760, y: 815, depth: "foreground", alpha: 0.55 }),
      themeProp({ id: "gallery-bench", kind: "solid", labelKo: "관람 벤치", labelEn: "Viewing bench",
        x: 490, y: 730, depth: "y-sort", collider: { x: 440, y: 715, width: 100, height: 30 } }),
    ],
    npc: { id: "gallery-guide", skinKey: "npc-concierge", x: 150, y: 730, facing: "right",
      behavior: "patrol", patrol: [{ x: 150, y: 730 }, { x: 490, y: 680 }, { x: 830, y: 730 }, { x: 490, y: 780 }] },
  },
]);

export type StudioSpaceModuleEntry =
  | { readonly type: "panel"; readonly panel: StudioSpaceModulePanel }
  | { readonly type: "route"; readonly href: string }
  | { readonly type: "zone"; readonly zoneId: StudioVirtualSpaceZoneId }
  | { readonly type: "template"; readonly template: StudioThemeTemplateKind };

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
    entry: { type: "route", href: "/team/recruiting?panel=rooms" },
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
  {
    id: "theme-storyboard-room",
    category: "template",
    labelKo: "콘티룸 만들기",
    labelEn: "Create a storyboard room",
    descriptionKo: "대형 리뷰 보드와 협업 테이블·의자 세트로 콘티 검수 공간을 만듭니다.",
    descriptionEn: "Create a storyboard review space with a large review board and a collaboration table set.",
    privacy: "team",
    transport: "none",
    capacity: null,
    requiresProject: true,
    entry: { type: "template", template: "storyboard-room" },
  },
  {
    id: "theme-recording-booth",
    category: "template",
    labelKo: "녹음부스 만들기",
    labelEn: "Create a recording booth",
    descriptionKo: "방음 부스·대본 스탠드·비공개 음향 구역으로 녹음 공간을 만듭니다.",
    descriptionEn: "Create a recording space with a soundproof booth, script stand and a private acoustic zone.",
    privacy: "team",
    transport: "none",
    capacity: null,
    requiresProject: true,
    entry: { type: "template", template: "recording-booth" },
  },
  {
    id: "theme-gallery",
    category: "template",
    labelKo: "전시관 만들기",
    labelEn: "Create a gallery",
    descriptionKo: "완성 원고 갤러리 프레임·스포트라이트·관람 동선으로 전시 공간을 만듭니다.",
    descriptionEn: "Create an exhibition space with finished-artwork frames, spotlights and a viewing route.",
    privacy: "team",
    transport: "none",
    capacity: null,
    requiresProject: true,
    entry: { type: "template", template: "gallery" },
  },
]);

const SAFE_ROUTE = /^\/(?!\/)[^\\]*$/u;
const SAFE_ID = /^[a-z][a-z0-9-]{1,79}$/u;
const THEME_KINDS = new Set<StudioThemeTemplateKind>(["storyboard-room", "recording-booth", "gallery"]);
const THEME_ACTIONS = new Set(["assistant", "assets", "canvas", "community", "comic", "live", "review", "story"]);

function hasRouteControl(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32);
}
export function validateStudioThemeRoomTemplates(
  templates: readonly StudioThemeRoomTemplate[] = STUDIO_THEME_ROOM_TEMPLATES,
): readonly string[] {
  const errors: string[] = [];
  const kinds = new Set<string>();
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const pointValid = (point: { readonly x: number; readonly y: number } | undefined) =>
    Boolean(point && finite(point.x) && finite(point.y));
  const rectValid = (rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined) =>
    Boolean(rect && pointValid(rect) && finite(rect.width) && finite(rect.height) && rect.width > 0 && rect.height > 0);
  for (const template of templates) {
    if (!THEME_KINDS.has(template.kind)) errors.push(`unknown theme template kind: ${String(template.kind)}`);
    if (kinds.has(template.kind)) errors.push(`duplicate theme template kind: ${template.kind}`);
    kinds.add(template.kind);
    if (!template.labelKo.trim() || !template.labelEn.trim()
      || !template.descriptionKo.trim() || !template.descriptionEn.trim()) {
      errors.push(`missing theme template copy: ${template.kind}`);
    }
    const room = template.room;
    if (!SAFE_ID.test(room.id) || !room.labelKo.trim() || !room.labelEn.trim() || !rectValid(room)
      || (room.action !== undefined && !THEME_ACTIONS.has(room.action))) {
      errors.push(`invalid theme room: ${template.kind}`);
    }
    const acoustic = template.acoustic;
    if (!SAFE_ID.test(acoustic.id) || !rectValid(acoustic)
      || (acoustic.policy !== "public" && acoustic.policy !== "private")
      || (acoustic.doorId !== undefined && !SAFE_ID.test(acoustic.doorId))) {
      errors.push(`invalid theme acoustic zone: ${template.kind}`);
    }
    if (!pointValid(template.spawn)) errors.push(`invalid theme spawn: ${template.kind}`);
    const propIds = new Set<string>();
    for (const prop of template.furniture) {
      if (!SAFE_ID.test(prop.id) || propIds.has(prop.id)) { errors.push(`invalid theme prop id: ${template.kind}/${String(prop.id)}`); continue; }
      propIds.add(prop.id);
      if (!prop.labelKo.trim() || !prop.labelEn.trim() || !pointValid(prop)
        || !["decor", "solid", "interactive"].includes(prop.kind)
        || !["fixed", "y-sort", "foreground"].includes(prop.depth)
        || (prop.alpha !== undefined && (!finite(prop.alpha) || prop.alpha <= 0 || prop.alpha > 1))
        || (prop.collider !== undefined && !rectValid(prop.collider))
        || (prop.action !== undefined && !THEME_ACTIONS.has(prop.action))
        || (prop.interactionRadius !== undefined && (!finite(prop.interactionRadius) || prop.interactionRadius <= 0))) {
        errors.push(`invalid theme prop: ${template.kind}/${prop.id}`);
      }
    }
    const seatIds = new Set<string>();
    for (const seat of template.seats ?? []) {
      if (!SAFE_ID.test(seat.id) || seatIds.has(seat.id)) { errors.push(`invalid theme seat id: ${template.kind}/${String(seat.id)}`); continue; }
      seatIds.add(seat.id);
      if (!seat.labelKo.trim() || !seat.labelEn.trim() || !["down", "left", "right", "up"].includes(seat.facing)
        || !finite(seat.radius) || seat.radius <= 0 || seat.radius > 24
        || !pointValid(seat.approachPoint) || !pointValid(seat.anchorPoint) || !pointValid(seat.exitPoint)
        || (seat.seatAttachmentPoint !== undefined && !pointValid(seat.seatAttachmentPoint))) {
        errors.push(`invalid theme seat: ${template.kind}/${seat.id}`);
      }
    }
    const npc = template.npc;
    if (npc !== undefined && (!SAFE_ID.test(npc.id) || !npc.skinKey.trim() || !pointValid(npc)
      || !["idle", "talk", "draw", "review", "patrol"].includes(npc.behavior)
      || (npc.patrol !== undefined && (!Array.isArray(npc.patrol) || npc.patrol.some((point) => !pointValid(point)))))) {
      errors.push(`invalid theme npc: ${template.kind}`);
    }
    if (template.zones !== undefined) {
      if (!Array.isArray(template.zones)) errors.push(`invalid theme zones: ${template.kind}`);
      else {
        for (const message of validateOfficeZones(template.zones, { width: 1280, height: 960 })) {
          errors.push(`theme zone: ${message}`);
        }
        if (rectValid(room)) {
          for (const zone of template.zones) {
            if (!zone || typeof zone !== "object" || !zone.shape) continue;
            const bounds = officeZoneBounds(zone);
            if (bounds.x < room.x || bounds.y < room.y
              || bounds.x + bounds.width > room.x + room.width || bounds.y + bounds.height > room.y + room.height) {
              errors.push(`theme zone outside room: ${template.kind}/${zone.id}`);
            }
          }
        }
      }
    }
  }
  return Object.freeze(errors);
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
    if (module.entry.type === "template" && !THEME_KINDS.has(module.entry.template)) {
      errors.push(`unknown template entry: ${module.id}`);
    }
    if (module.category === "interview" && module.privacy === "public") {
      errors.push(`public interview module: ${module.id}`);
    }
  }
  return Object.freeze(errors);
}
