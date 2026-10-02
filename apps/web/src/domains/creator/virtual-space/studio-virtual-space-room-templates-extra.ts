import type {
  StudioThemePropAction,
  StudioThemeRoomTemplate,
} from "./studio-virtual-space-room-catalog";
import {
  placeFurniture,
} from "./studio-virtual-space-furniture-catalog";
import {
  createOfficeZone,
  officeZoneBounds,
  validateOfficeZones,
  type StudioOfficeZone,
  type StudioOfficeZoneType,
} from "./studio-virtual-space-office-zones";

/**
 * 추가 방 템플릿 5종 (게더타운 방 템플릿처럼 원클릭으로 만드는 테마 공간)
 *
 * 기존 STUDIO_THEME_ROOM_TEMPLATES(콘티룸·녹음부스·전시관)와 같은
 * StudioThemeRoomTemplate 인터페이스를 따르며, 기본 캠퍼스 비공개 음향 구역
 * (review 670/300/290/230, meeting 950/590/290/260)과 겹치지 않게 배치했다.
 * 1280x960 월드 좌표계를 공유한다.
 */

export type StudioExtraRoomTemplateKind =
  | "meeting-room"     // 회의실
  | "lounge"           // 휴게실
  | "personal-studio"  // 개인 작업실
  | "rooftop"          // 옥상
  | "lobby"            // 로비
  | "startup-office"   // 스타트업 오피스 (Track D)
  | "broadcast-studio" // 방송 스튜디오 (Track D)
  | "design-academy";  // 디자인 아카데미 (Track D)

export interface StudioExtraRoomTemplate extends Omit<StudioThemeRoomTemplate, "kind"> {
  readonly kind: StudioExtraRoomTemplateKind;
}

function prop(def: NonNullable<StudioThemeRoomTemplate["furniture"]>[number]) {
  return Object.freeze(def);
}

/** 상호작용 가구 카탈로그 스펙으로 템플릿 가구를 만든다. */
const CATALOG_ACTIONS: Record<string, StudioThemePropAction> = {
  "whiteboard": "review",
  "display-screen": "live",
  "coffee-machine": "community",
  "bookshelf": "assets",
  "desk-standard": "canvas",
  "meeting-table": "live",
};

function catalogProp(
  prefix: string,
  specId: string,
  x: number,
  y: number,
  overrides?: { readonly id?: string; readonly labelKo?: string; readonly labelEn?: string },
): NonNullable<StudioThemeRoomTemplate["furniture"]>[number] {
  const placed: ReturnType<typeof placeFurniture> = placeFurniture(specId, x, y);
  if (!placed) throw new Error(`unknown furniture spec: ${specId}`);
  return prop({
    id: overrides?.id ?? `${prefix}-${specId}`,
    kind: placed.interactable ? "interactive" : placed.collider ? "solid" : "decor",
    labelKo: overrides?.labelKo ?? placed.labelKo,
    labelEn: overrides?.labelEn ?? placed.labelEn,
    x: placed.x,
    y: placed.y,
    depth: placed.depth,
    ...(placed.collider ? { collider: placed.collider } : {}),
    ...(CATALOG_ACTIONS[specId] ? { action: CATALOG_ACTIONS[specId]! } : {}),
    ...(placed.interactionRadius ? { interactionRadius: placed.interactionRadius } : {}),
  });
}

/** 템플릿 존 프리셋을 만든다. 좌표는 템플릿 룸과 같은 1280x960 월드 절대 좌표. */
function templateZone(def: {
  readonly id: string;
  readonly type: StudioOfficeZoneType;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly roomId: string;
  readonly rules: readonly (readonly [string, "info" | "suggestion" | "required", string, string])[];
  readonly ambientHintKo: string;
  readonly ambientHintEn: string;
  readonly suggestMuteOnEnter?: true;
  readonly privateAudio?: true;
}): StudioOfficeZone {
  const created = createOfficeZone({
    id: def.id,
    type: def.type,
    labelKo: def.labelKo,
    labelEn: def.labelEn,
    descriptionKo: def.descriptionKo,
    descriptionEn: def.descriptionEn,
    shape: { kind: "rect", x: def.x, y: def.y, width: def.width, height: def.height },
    roomId: def.roomId,
    rules: def.rules.map(([id, severity, labelKo, labelEn]) => ({ id, severity, labelKo, labelEn })),
    ambientHintKo: def.ambientHintKo,
    ambientHintEn: def.ambientHintEn,
    ...(def.suggestMuteOnEnter ? { suggestMuteOnEnter: true } : {}),
    ...(def.privateAudio ? { privateAudio: true } : {}),
  });
  if (!created) throw new Error(`invalid template zone: ${def.id}`);
  return created;
}

export const STUDIO_EXTRA_ROOM_TEMPLATES: readonly StudioExtraRoomTemplate[] = Object.freeze([
  {
    kind: "meeting-room",
    labelKo: "회의실",
    labelEn: "Meeting room",
    descriptionKo: "비공개 음향 구역의 회의 테이블·화이트보드·화면 공유 스크린으로 집중 회의를 열어요.",
    descriptionEn: "Hold focused meetings with a conference table, whiteboard and screen-share display in a private acoustic zone.",
    room: {
      id: "meeting-room", labelKo: "회의실", labelEn: "Meeting room",
      descriptionKo: "문을 닫으면 외부 소리가 차단되는 비공개 회의 공간이에요.",
      descriptionEn: "A private meeting space sealed from outside sound when the door closes.",
      action: "live", x: 60, y: 80, width: 480, height: 380,
    },
    spawn: { x: 300, y: 400, facing: "up" },
    acoustic: { id: "meeting-room-audio", policy: "private", doorId: "meeting-room-door",
      x: 90, y: 110, width: 420, height: 320 },
    furniture: [
      prop({ id: "meeting-table", kind: "solid", labelKo: "회의 테이블", labelEn: "Conference table",
        x: 300, y: 270, depth: "y-sort", collider: { x: 220, y: 245, width: 160, height: 50 } }),
      prop({ id: "meeting-chair-n1", kind: "solid", labelKo: "의자 · 북서", labelEn: "Chair · northwest",
        x: 250, y: 215, depth: "y-sort", collider: { x: 235, y: 205, width: 30, height: 20 } }),
      prop({ id: "meeting-chair-n2", kind: "solid", labelKo: "의자 · 북동", labelEn: "Chair · northeast",
        x: 350, y: 215, depth: "y-sort", collider: { x: 335, y: 205, width: 30, height: 20 } }),
      prop({ id: "meeting-chair-s1", kind: "solid", labelKo: "의자 · 남서", labelEn: "Chair · southwest",
        x: 250, y: 325, depth: "y-sort", collider: { x: 235, y: 315, width: 30, height: 20 } }),
      prop({ id: "meeting-chair-s2", kind: "solid", labelKo: "의자 · 남동", labelEn: "Chair · southeast",
        x: 350, y: 325, depth: "y-sort", collider: { x: 335, y: 315, width: 30, height: 20 } }),
      prop({ id: "meeting-whiteboard", kind: "interactive", labelKo: "회의 화이트보드", labelEn: "Meeting whiteboard",
        x: 300, y: 115, depth: "fixed", action: "review", interactionRadius: 90,
        collider: { x: 220, y: 100, width: 160, height: 30 } }),
      prop({ id: "meeting-screen", kind: "interactive", labelKo: "화면 공유 스크린", labelEn: "Screen-share display",
        x: 480, y: 115, depth: "fixed", action: "live", interactionRadius: 80,
        collider: { x: 450, y: 100, width: 60, height: 30 } }),
      prop({ id: "meeting-door", kind: "interactive", labelKo: "회의실 문", labelEn: "Meeting room door",
        x: 300, y: 445, depth: "fixed", action: "community", interactionRadius: 70,
        collider: { x: 280, y: 435, width: 40, height: 20 } }),
      prop({ id: "meeting-plant", kind: "decor", labelKo: "관엽식물", labelEn: "Potted plant",
        x: 100, y: 400, depth: "y-sort" }),
    ],
    seats: [
      { id: "meeting-seat-n1", labelKo: "회의실 좌석 · 북서", labelEn: "Meeting seat · northwest",
        approachPoint: { x: 250, y: 245 }, anchorPoint: { x: 250, y: 238 }, exitPoint: { x: 250, y: 260 },
        facing: "down", radius: 10 },
      { id: "meeting-seat-n2", labelKo: "회의실 좌석 · 북동", labelEn: "Meeting seat · northeast",
        approachPoint: { x: 350, y: 245 }, anchorPoint: { x: 350, y: 238 }, exitPoint: { x: 350, y: 260 },
        facing: "down", radius: 10 },
      { id: "meeting-seat-s1", labelKo: "회의실 좌석 · 남서", labelEn: "Meeting seat · southwest",
        approachPoint: { x: 250, y: 295 }, anchorPoint: { x: 250, y: 302 }, exitPoint: { x: 250, y: 280 },
        facing: "up", radius: 10 },
      { id: "meeting-seat-s2", labelKo: "회의실 좌석 · 남동", labelEn: "Meeting seat · southeast",
        approachPoint: { x: 350, y: 295 }, anchorPoint: { x: 350, y: 302 }, exitPoint: { x: 350, y: 280 },
        facing: "up", radius: 10 },
    ],
    npc: { id: "meeting-facilitator", skinKey: "npc-guide", x: 140, y: 270, facing: "right",
      behavior: "talk" },
  },
  {
    kind: "lounge",
    labelKo: "휴게실",
    labelEn: "Lounge",
    descriptionKo: "소파·커피 테이블·북셸프에서 쉬어가며 가볍게 수다를 나눠요.",
    descriptionEn: "Rest on sofas around the coffee table and chat lightly by the bookshelf.",
    room: {
      id: "lounge", labelKo: "휴게실", labelEn: "Lounge",
      descriptionKo: "편하게 쉬어가는 공용 휴게 공간이에요.",
      descriptionEn: "A cozy common lounge for recharging.",
      action: "community", x: 60, y: 500, width: 480, height: 380,
    },
    spawn: { x: 300, y: 820, facing: "up" },
    acoustic: { id: "lounge-audio", policy: "public", x: 90, y: 530, width: 420, height: 320 },
    furniture: [
      prop({ id: "lounge-sofa-west", kind: "solid", labelKo: "소파 · 서", labelEn: "Sofa · west",
        x: 180, y: 690, depth: "y-sort", collider: { x: 130, y: 670, width: 100, height: 40 } }),
      prop({ id: "lounge-sofa-east", kind: "solid", labelKo: "소파 · 동", labelEn: "Sofa · east",
        x: 420, y: 690, depth: "y-sort", collider: { x: 370, y: 670, width: 100, height: 40 } }),
      prop({ id: "lounge-coffee-table", kind: "solid", labelKo: "커피 테이블", labelEn: "Coffee table",
        x: 300, y: 690, depth: "y-sort", collider: { x: 270, y: 678, width: 60, height: 24 } }),
      prop({ id: "lounge-rug", kind: "decor", labelKo: "러그", labelEn: "Rug",
        x: 300, y: 690, depth: "fixed", alpha: 0.9 }),
      prop({ id: "lounge-bookshelf", kind: "decor", labelKo: "북셸프", labelEn: "Bookshelf",
        x: 300, y: 535, depth: "fixed", collider: { x: 240, y: 525, width: 120, height: 20 } }),
      prop({ id: "lounge-coffee-machine", kind: "interactive", labelKo: "커피 머신", labelEn: "Coffee machine",
        x: 480, y: 560, depth: "y-sort", action: "community", interactionRadius: 70,
        collider: { x: 465, y: 550, width: 30, height: 20 } }),
      prop({ id: "lounge-plant-nw", kind: "decor", labelKo: "관엽식물 · 북서", labelEn: "Potted plant · northwest",
        x: 100, y: 560, depth: "y-sort" }),
      prop({ id: "lounge-plant-se", kind: "decor", labelKo: "관엽식물 · 남동", labelEn: "Potted plant · southeast",
        x: 500, y: 820, depth: "y-sort" }),
      prop({ id: "lounge-floor-lamp", kind: "decor", labelKo: "플로어 스탠드", labelEn: "Floor lamp",
        x: 120, y: 760, depth: "y-sort" }),
    ],
    seats: [
      { id: "lounge-seat-w", labelKo: "휴게실 좌석 · 서", labelEn: "Lounge seat · west",
        approachPoint: { x: 180, y: 730 }, anchorPoint: { x: 180, y: 712 }, exitPoint: { x: 180, y: 750 },
        facing: "up", radius: 10 },
      { id: "lounge-seat-e", labelKo: "휴게실 좌석 · 동", labelEn: "Lounge seat · east",
        approachPoint: { x: 420, y: 730 }, anchorPoint: { x: 420, y: 712 }, exitPoint: { x: 420, y: 750 },
        facing: "up", radius: 10 },
    ],
    npc: { id: "lounge-barista", skinKey: "npc-concierge", x: 450, y: 620, facing: "left",
      behavior: "idle" },
  },
  {
    kind: "personal-studio",
    labelKo: "개인 작업실",
    labelEn: "Personal studio",
    descriptionKo: "나만의 책상·타블렛·레퍼런스 선반으로 집중 작업 공간을 만들어요.",
    descriptionEn: "Build a focused workspace with your own desk, tablet and reference shelf.",
    room: {
      id: "personal-studio", labelKo: "개인 작업실", labelEn: "Personal studio",
      descriptionKo: "혼자 집중하는 비공개 개인 공간이에요.",
      descriptionEn: "A private personal space for focused solo work.",
      action: "canvas", x: 580, y: 580, width: 360, height: 320,
    },
    spawn: { x: 640, y: 860, facing: "up" },
    acoustic: { id: "personal-studio-audio", policy: "private", doorId: "personal-studio-door",
      x: 610, y: 610, width: 300, height: 260 },
    furniture: [
      prop({ id: "studio-desk", kind: "solid", labelKo: "작업 책상", labelEn: "Work desk",
        x: 760, y: 700, depth: "y-sort", collider: { x: 710, y: 685, width: 100, height: 30 } }),
      prop({ id: "studio-tablet", kind: "interactive", labelKo: "드로잉 태블릿", labelEn: "Drawing tablet",
        x: 760, y: 692, depth: "y-sort", action: "canvas", interactionRadius: 70 }),
      prop({ id: "studio-chair", kind: "solid", labelKo: "작업 의자", labelEn: "Work chair",
        x: 760, y: 745, depth: "y-sort", collider: { x: 745, y: 735, width: 30, height: 20 } }),
      prop({ id: "studio-desk-lamp", kind: "decor", labelKo: "책상 스탠드", labelEn: "Desk lamp",
        x: 800, y: 685, depth: "y-sort" }),
      prop({ id: "studio-shelf", kind: "decor", labelKo: "레퍼런스 선반", labelEn: "Reference shelf",
        x: 760, y: 615, depth: "fixed", collider: { x: 700, y: 605, width: 120, height: 20 } }),
      prop({ id: "studio-poster", kind: "decor", labelKo: "포스터", labelEn: "Poster",
        x: 630, y: 640, depth: "fixed" }),
      prop({ id: "studio-plant", kind: "decor", labelKo: "작은 화분", labelEn: "Small plant",
        x: 900, y: 850, depth: "y-sort" }),
      prop({ id: "studio-door", kind: "interactive", labelKo: "작업실 문", labelEn: "Studio door",
        x: 640, y: 885, depth: "fixed", action: "community", interactionRadius: 70,
        collider: { x: 620, y: 875, width: 40, height: 20 } }),
    ],
    seats: [
      { id: "studio-seat", labelKo: "작업실 좌석", labelEn: "Studio seat",
        approachPoint: { x: 760, y: 775 }, anchorPoint: { x: 760, y: 762 }, exitPoint: { x: 760, y: 790 },
        facing: "up", radius: 10 },
    ],
  },
  {
    kind: "rooftop",
    labelKo: "옥상",
    labelEn: "Rooftop",
    descriptionKo: "스트링 라이트 아래 벤치에 앉아 하늘을 보며 쉬어요.",
    descriptionEn: "Rest on benches under string lights and watch the sky.",
    room: {
      id: "rooftop", labelKo: "옥상", labelEn: "Rooftop",
      descriptionKo: "탁 트인 하늘 아래 휴식하는 개방 공간이에요.",
      descriptionEn: "An open-air space for resting under the open sky.",
      x: 980, y: 80, width: 240, height: 240,
    },
    spawn: { x: 1100, y: 280, facing: "up" },
    acoustic: { id: "rooftop-audio", policy: "public", x: 1000, y: 100, width: 200, height: 200 },
    furniture: [
      prop({ id: "rooftop-railing", kind: "solid", labelKo: "난간", labelEn: "Railing",
        x: 1100, y: 95, depth: "fixed", collider: { x: 990, y: 88, width: 220, height: 14 } }),
      prop({ id: "rooftop-bench-west", kind: "solid", labelKo: "벤치 · 서", labelEn: "Bench · west",
        x: 1040, y: 200, depth: "y-sort", collider: { x: 1015, y: 190, width: 50, height: 20 } }),
      prop({ id: "rooftop-bench-east", kind: "solid", labelKo: "벤치 · 동", labelEn: "Bench · east",
        x: 1160, y: 200, depth: "y-sort", collider: { x: 1135, y: 190, width: 50, height: 20 } }),
      prop({ id: "rooftop-string-lights", kind: "decor", labelKo: "스트링 라이트", labelEn: "String lights",
        x: 1100, y: 150, depth: "foreground", alpha: 0.85 }),
      prop({ id: "rooftop-planter", kind: "decor", labelKo: "플랜터", labelEn: "Planter",
        x: 1000, y: 280, depth: "y-sort" }),
      prop({ id: "rooftop-telescope", kind: "interactive", labelKo: "망원경", labelEn: "Telescope",
        x: 1190, y: 130, depth: "y-sort", action: "assets", interactionRadius: 60,
        collider: { x: 1182, y: 122, width: 16, height: 16 } }),
    ],
    seats: [
      { id: "rooftop-seat-w", labelKo: "옥상 좌석 · 서", labelEn: "Rooftop seat · west",
        approachPoint: { x: 1040, y: 230 }, anchorPoint: { x: 1040, y: 214 }, exitPoint: { x: 1040, y: 250 },
        facing: "up", radius: 10 },
      { id: "rooftop-seat-e", labelKo: "옥상 좌석 · 동", labelEn: "Rooftop seat · east",
        approachPoint: { x: 1160, y: 230 }, anchorPoint: { x: 1160, y: 214 }, exitPoint: { x: 1160, y: 250 },
        facing: "up", radius: 10 },
    ],
    npc: { id: "rooftop-stargazer", skinKey: "npc-artist", x: 1100, y: 240, facing: "up",
      behavior: "idle" },
  },
  {
    kind: "lobby",
    labelKo: "로비",
    labelEn: "Lobby",
    descriptionKo: "안내 데스크·대기 의자·디렉토리 보드로 방문객을 맞이해요.",
    descriptionEn: "Greet visitors with a reception desk, waiting chairs and a directory board.",
    room: {
      id: "lobby", labelKo: "로비", labelEn: "Lobby",
      descriptionKo: "방문객을 맞이하는 공용 현관 공간이에요.",
      descriptionEn: "A common entrance space welcoming visitors.",
      action: "assistant", x: 980, y: 340, width: 240, height: 230,
    },
    spawn: { x: 1100, y: 530, facing: "up" },
    acoustic: { id: "lobby-audio", policy: "public", x: 1000, y: 360, width: 200, height: 190 },
    furniture: [
      prop({ id: "lobby-desk", kind: "solid", labelKo: "안내 데스크", labelEn: "Reception desk",
        x: 1100, y: 450, depth: "y-sort", collider: { x: 1050, y: 438, width: 100, height: 24 } }),
      prop({ id: "lobby-directory", kind: "interactive", labelKo: "디렉토리 보드", labelEn: "Directory board",
        x: 1100, y: 365, depth: "fixed", action: "assistant", interactionRadius: 80,
        collider: { x: 1060, y: 355, width: 80, height: 20 } }),
      prop({ id: "lobby-chair-1", kind: "solid", labelKo: "대기 의자 1", labelEn: "Waiting chair 1",
        x: 1030, y: 510, depth: "y-sort", collider: { x: 1018, y: 500, width: 24, height: 20 } }),
      prop({ id: "lobby-chair-2", kind: "solid", labelKo: "대기 의자 2", labelEn: "Waiting chair 2",
        x: 1100, y: 510, depth: "y-sort", collider: { x: 1088, y: 500, width: 24, height: 20 } }),
      prop({ id: "lobby-chair-3", kind: "solid", labelKo: "대기 의자 3", labelEn: "Waiting chair 3",
        x: 1170, y: 510, depth: "y-sort", collider: { x: 1158, y: 500, width: 24, height: 20 } }),
      prop({ id: "lobby-rug", kind: "decor", labelKo: "로비 러그", labelEn: "Lobby rug",
        x: 1100, y: 490, depth: "fixed", alpha: 0.9 }),
      prop({ id: "lobby-plant", kind: "decor", labelKo: "로비 화분", labelEn: "Lobby plant",
        x: 1000, y: 540, depth: "y-sort" }),
    ],
    seats: [
      { id: "lobby-seat-1", labelKo: "로비 좌석 1", labelEn: "Lobby seat 1",
        approachPoint: { x: 1030, y: 535 }, anchorPoint: { x: 1030, y: 524 }, exitPoint: { x: 1030, y: 550 },
        facing: "up", radius: 10 },
      { id: "lobby-seat-2", labelKo: "로비 좌석 2", labelEn: "Lobby seat 2",
        approachPoint: { x: 1100, y: 535 }, anchorPoint: { x: 1100, y: 524 }, exitPoint: { x: 1100, y: 550 },
        facing: "up", radius: 10 },
      { id: "lobby-seat-3", labelKo: "로비 좌석 3", labelEn: "Lobby seat 3",
        approachPoint: { x: 1170, y: 535 }, anchorPoint: { x: 1170, y: 524 }, exitPoint: { x: 1170, y: 550 },
        facing: "up", radius: 10 },
    ],
    npc: { id: "lobby-concierge", skinKey: "npc-concierge", x: 1100, y: 420, facing: "down",
      behavior: "talk" },
  },
  {
    kind: "startup-office",
    labelKo: "스타트업 오피스",
    labelEn: "Startup Office",
    descriptionKo: "오픈 데스크·집중존·통화부스·휴게 코너를 한 번에 갖춘 스타트업형 오피스예요.",
    descriptionEn: "A startup-style office with open desks, a focus zone, a call booth and a lounge corner.",
    room: {
      id: "startup-office", labelKo: "스타트업 오피스", labelEn: "Startup Office",
      descriptionKo: "일하고 쉬고 통화하는 동선이 한 공간에 모인 오피스예요.",
      descriptionEn: "An office where work, rest and calls flow in one space.",
      action: "community", x: 560, y: 60, width: 360, height: 220,
    },
    spawn: { x: 740, y: 255, facing: "up" },
    acoustic: { id: "startup-office-audio", policy: "public", x: 580, y: 80, width: 320, height: 180 },
    zones: [
      templateZone({
        id: "startup-lounge", type: "lounge", labelKo: "휴게 코너", labelEn: "Lounge corner",
        descriptionKo: "커피와 함께 잠시 쉬어가는 코너예요.",
        descriptionEn: "A corner to rest with coffee.",
        x: 560, y: 60, width: 100, height: 220, roomId: "startup-office",
        rules: [["casual", "info", "수다는 자유롭게, 볼륨은 살짝 낮게.", "Chat freely, keep the volume low-ish."]],
        ambientHintKo: "나긋한 재즈가 흘러요.", ambientHintEn: "Mellow jazz plays here.",
      }),
      templateZone({
        id: "startup-focus", type: "focus-zone", labelKo: "집중존", labelEn: "Focus Zone",
        descriptionKo: "깊이 집중하는 조용한 구역이에요.",
        descriptionEn: "A quiet area for deep focus.",
        x: 660, y: 60, width: 260, height: 90, roomId: "startup-office",
        rules: [
          ["mute", "suggestion", "입장하면 자동 음소거를 권장해요.", "Muting on entry is recommended."],
          ["quiet", "required", "큰 소리는 삼가 주세요.", "Please keep it quiet."],
        ],
        ambientHintKo: "빗소리 같은 백색소음이 은은하게.", ambientHintEn: "Faint white noise, like soft rain.",
        suggestMuteOnEnter: true,
      }),
      templateZone({
        id: "startup-phone", type: "phone-booth", labelKo: "통화부스", labelEn: "Phone Booth",
        descriptionKo: "1인용 비공개 통화 공간이에요.",
        descriptionEn: "A private one-person booth for calls.",
        x: 860, y: 150, width: 60, height: 70, roomId: "startup-office",
        rules: [["call-only", "required", "통화할 때만 이용해요.", "Calls only."]],
        ambientHintKo: "밖 소리가 차단된 고요함.", ambientHintEn: "Sealed quiet, cut off from outside.",
        privateAudio: true,
      }),
    ],
    furniture: [
      catalogProp("startup", "desk-standard", 700, 160),
      catalogProp("startup", "desk-standard", 800, 160, { id: "startup-desk-2" }),
      catalogProp("startup", "desk-standard", 700, 215, { id: "startup-desk-3" }),
      catalogProp("startup", "desk-standard", 800, 215, { id: "startup-desk-4" }),
      catalogProp("startup", "chair-basic", 700, 192, { id: "startup-chair-1", labelKo: "의자 1", labelEn: "Chair 1" }),
      catalogProp("startup", "chair-basic", 800, 192, { id: "startup-chair-2", labelKo: "의자 2", labelEn: "Chair 2" }),
      catalogProp("startup", "whiteboard", 790, 85, { labelKo: "아이디어 보드", labelEn: "Idea board" }),
      catalogProp("startup", "sofa-two", 610, 200, { labelKo: "휴게 소파", labelEn: "Lounge sofa" }),
      catalogProp("startup", "rug-round", 610, 185, { labelKo: "휴게 러그", labelEn: "Lounge rug" }),
      catalogProp("startup", "coffee-machine", 595, 100, { labelKo: "커피 머신", labelEn: "Coffee machine" }),
      catalogProp("startup", "phone-pod", 875, 195, { labelKo: "통화 부스", labelEn: "Call booth" }),
      catalogProp("startup", "plant-pot", 575, 75, { id: "startup-plant-w", labelKo: "화분 · 서", labelEn: "Plant · west" }),
      catalogProp("startup", "plant-pot", 905, 75, { id: "startup-plant-e", labelKo: "화분 · 동", labelEn: "Plant · east" }),
      catalogProp("startup", "floor-lamp", 645, 245, { labelKo: "스탠드", labelEn: "Lamp" }),
    ],
    seats: [
      { id: "startup-seat-d1", labelKo: "오피스 좌석 1", labelEn: "Office seat 1",
        approachPoint: { x: 700, y: 222 }, anchorPoint: { x: 700, y: 212 }, exitPoint: { x: 700, y: 236 },
        facing: "up", radius: 10 },
      { id: "startup-seat-sofa", labelKo: "휴게 소파 좌석", labelEn: "Lounge sofa seat",
        approachPoint: { x: 610, y: 232 }, anchorPoint: { x: 610, y: 220 }, exitPoint: { x: 610, y: 248 },
        facing: "up", radius: 10 },
    ],
    npc: { id: "startup-mentor", skinKey: "npc-guide", x: 790, y: 120, facing: "down",
      behavior: "talk" },
  },
  {
    kind: "broadcast-studio",
    labelKo: "방송 스튜디오",
    labelEn: "Broadcast Studio",
    descriptionKo: "무대·관객석·대기 공간으로 라이브 방송을 여는 스튜디오예요.",
    descriptionEn: "A studio for live broadcasts with a stage, audience seats and a waiting area.",
    room: {
      id: "broadcast-studio", labelKo: "방송 스튜디오", labelEn: "Broadcast Studio",
      descriptionKo: "녹화·라이브가 열리는 스튜디오예요. 빨간불이 켜지면 조용히 해 주세요.",
      descriptionEn: "A studio for recording and live shows. Stay quiet when the red light is on.",
      action: "live", x: 940, y: 60, width: 300, height: 220,
    },
    spawn: { x: 1190, y: 255, facing: "up" },
    acoustic: { id: "broadcast-studio-audio", policy: "private", doorId: "broadcast-studio-door",
      x: 960, y: 80, width: 260, height: 180 },
    zones: [
      templateZone({
        id: "broadcast-stage", type: "studio", labelKo: "스튜디오", labelEn: "Studio",
        descriptionKo: "녹화·라이브가 이뤄지는 무대 구역이에요.",
        descriptionEn: "The stage area for recording and live shows.",
        x: 940, y: 60, width: 180, height: 220, roomId: "broadcast-studio",
        rules: [["on-air", "required", "빨간불이 켜지면 들어오지 마세요.", "Do not enter while the red light is on."]],
        ambientHintKo: "장비 팬 돌아가는 소리와 긴장감.", ambientHintEn: "Humming gear and a focused tension.",
      }),
      templateZone({
        id: "broadcast-hall", type: "event-hall", labelKo: "관객석", labelEn: "Audience Hall",
        descriptionKo: "방송을 관람하는 관객 구역이에요.",
        descriptionEn: "The audience area for watching broadcasts.",
        x: 1120, y: 60, width: 120, height: 220, roomId: "broadcast-studio",
        rules: [["applause", "suggestion", "방송이 끝나면 이모티콘으로 박수를 보내 보세요.", "Send applause emotes when the show ends."]],
        ambientHintKo: "웅성거리는 기대감이 감돌아요.", ambientHintEn: "A buzz of anticipation fills the air.",
      }),
      templateZone({
        id: "broadcast-reception", type: "reception", labelKo: "리셉션", labelEn: "Reception",
        descriptionKo: "관객을 맞이하는 접수 공간이에요.",
        descriptionEn: "A check-in space welcoming the audience.",
        x: 1120, y: 240, width: 100, height: 40, roomId: "broadcast-studio",
        rules: [["greet", "suggestion", "처음 온 관객에게 자리를 안내해 주세요.", "Guide first-time viewers to seats."]],
        ambientHintKo: "밝은 환영 멜로디가 흘러요.", ambientHintEn: "A bright welcoming melody plays here.",
      }),
    ],
    furniture: [
      catalogProp("broadcast", "display-screen", 1030, 90, { labelKo: "메인 스크린", labelEn: "Main screen" }),
      catalogProp("broadcast", "rug-round", 1030, 160, { labelKo: "무대 러그", labelEn: "Stage rug" }),
      catalogProp("broadcast", "floor-lamp", 960, 100, { id: "broadcast-lamp-w", labelKo: "조명 · 서", labelEn: "Light · west" }),
      catalogProp("broadcast", "floor-lamp", 1100, 100, { id: "broadcast-lamp-e", labelKo: "조명 · 동", labelEn: "Light · east" }),
      catalogProp("broadcast", "partition", 1120, 150, { labelKo: "무대 파티션", labelEn: "Stage partition" }),
      catalogProp("broadcast", "chair-basic", 1150, 140, { id: "broadcast-chair-1", labelKo: "관객 의자 1", labelEn: "Audience chair 1" }),
      catalogProp("broadcast", "chair-basic", 1190, 140, { id: "broadcast-chair-2", labelKo: "관객 의자 2", labelEn: "Audience chair 2" }),
      catalogProp("broadcast", "chair-basic", 1150, 180, { id: "broadcast-chair-3", labelKo: "관객 의자 3", labelEn: "Audience chair 3" }),
      catalogProp("broadcast", "chair-basic", 1190, 180, { id: "broadcast-chair-4", labelKo: "관객 의자 4", labelEn: "Audience chair 4" }),
      catalogProp("broadcast", "sofa-two", 1180, 225, { labelKo: "게스트 소파", labelEn: "Guest sofa" }),
      catalogProp("broadcast", "plant-pot", 950, 250, { id: "broadcast-plant-w", labelKo: "화분 · 서", labelEn: "Plant · west" }),
      catalogProp("broadcast", "plant-pot", 1230, 250, { id: "broadcast-plant-e", labelKo: "화분 · 동", labelEn: "Plant · east" }),
      catalogProp("broadcast", "coffee-machine", 950, 120, { labelKo: "대기실 커피 머신", labelEn: "Greenroom coffee machine" }),
    ],
    seats: [
      { id: "broadcast-seat-a1", labelKo: "관객석 1", labelEn: "Audience seat 1",
        approachPoint: { x: 1150, y: 162 }, anchorPoint: { x: 1150, y: 152 }, exitPoint: { x: 1150, y: 176 },
        facing: "up", radius: 10 },
      { id: "broadcast-seat-guest", labelKo: "게스트 소파 좌석", labelEn: "Guest sofa seat",
        approachPoint: { x: 1180, y: 252 }, anchorPoint: { x: 1180, y: 240 }, exitPoint: { x: 1180, y: 262 },
        facing: "up", radius: 10 },
    ],
    npc: { id: "broadcast-host", skinKey: "npc-artist", x: 1030, y: 130, facing: "down",
      behavior: "talk" },
  },
  {
    kind: "design-academy",
    labelKo: "디자인 아카데미",
    labelEn: "Design Academy",
    descriptionKo: "자료실·카페·실습 공간으로 배우고 나누는 아카데미예요.",
    descriptionEn: "An academy for learning and sharing with a library, cafe and practice space.",
    room: {
      id: "design-academy", labelKo: "디자인 아카데미", labelEn: "Design Academy",
      descriptionKo: "조용히 배우고 편하게 나누는 학습 공간이에요.",
      descriptionEn: "A learning space to study quietly and share comfortably.",
      action: "canvas", x: 60, y: 300, width: 280, height: 170,
    },
    spawn: { x: 200, y: 445, facing: "up" },
    acoustic: { id: "design-academy-audio", policy: "public", x: 80, y: 320, width: 240, height: 130 },
    zones: [
      templateZone({
        id: "academy-library", type: "library", labelKo: "자료실", labelEn: "Library",
        descriptionKo: "레퍼런스를 조용히 열람하는 공간이에요.",
        descriptionEn: "A quiet space to browse references.",
        x: 60, y: 300, width: 140, height: 170, roomId: "design-academy",
        rules: [
          ["mute", "suggestion", "입장하면 자동 음소거를 권장해요.", "Muting on entry is recommended."],
          ["quiet-reading", "required", "열람 중 대화는 속삭이거나 채팅으로.", "Whisper or use chat while browsing."],
        ],
        ambientHintKo: "종이 넘기는 소리 같은 정적.", ambientHintEn: "A paper-quiet stillness.",
        suggestMuteOnEnter: true,
      }),
      templateZone({
        id: "academy-cafe", type: "cafe", labelKo: "카페", labelEn: "Cafe",
        descriptionKo: "배운 것을 나누며 쉬어가는 카페예요.",
        descriptionEn: "A cafe to rest and share what you learned.",
        x: 200, y: 300, width: 140, height: 170, roomId: "design-academy",
        rules: [["order", "suggestion", "커피 머신에서 음료를 골라 보세요.", "Pick a drink at the coffee machine."]],
        ambientHintKo: "커피 향과 잔 부딪히는 소리.", ambientHintEn: "Coffee aroma and clinking cups.",
      }),
    ],
    furniture: [
      catalogProp("academy", "bookshelf", 130, 322, { labelKo: "레퍼런스 책장", labelEn: "Reference shelf" }),
      catalogProp("academy", "desk-standard", 130, 390, { labelKo: "학습 책상", labelEn: "Study desk" }),
      catalogProp("academy", "chair-basic", 130, 420, { labelKo: "학습 의자", labelEn: "Study chair" }),
      catalogProp("academy", "plant-pot", 75, 445, { id: "academy-plant-w", labelKo: "화분 · 서", labelEn: "Plant · west" }),
      catalogProp("academy", "coffee-machine", 270, 340, { labelKo: "카페 커피 머신", labelEn: "Cafe coffee machine" }),
      catalogProp("academy", "sofa-two", 270, 410, { labelKo: "카페 소파", labelEn: "Cafe sofa" }),
      catalogProp("academy", "rug-round", 270, 392, { labelKo: "카페 러그", labelEn: "Cafe rug" }),
      catalogProp("academy", "display-screen", 260, 318, { labelKo: "강의 스크린", labelEn: "Lecture screen" }),
      catalogProp("academy", "plant-pot", 325, 445, { id: "academy-plant-e", labelKo: "화분 · 동", labelEn: "Plant · east" }),
      catalogProp("academy", "floor-lamp", 215, 450, { labelKo: "스탠드", labelEn: "Lamp" }),
    ],
    seats: [
      { id: "academy-seat-study", labelKo: "학습 좌석", labelEn: "Study seat",
        approachPoint: { x: 130, y: 448 }, anchorPoint: { x: 130, y: 436 }, exitPoint: { x: 130, y: 460 },
        facing: "up", radius: 10 },
      { id: "academy-seat-cafe", labelKo: "카페 좌석", labelEn: "Cafe seat",
        approachPoint: { x: 270, y: 438 }, anchorPoint: { x: 270, y: 426 }, exitPoint: { x: 270, y: 452 },
        facing: "up", radius: 10 },
    ],
    npc: { id: "academy-librarian", skinKey: "npc-concierge", x: 130, y: 360, facing: "down",
      behavior: "talk" },
  },
]);

const SAFE_ID = /^[a-z][a-z0-9-]{1,79}$/u;
const EXTRA_KINDS = new Set<StudioExtraRoomTemplateKind>([
  "meeting-room", "lounge", "personal-studio", "rooftop", "lobby",
  "startup-office", "broadcast-studio", "design-academy",
]);
const THEME_ACTIONS = new Set<StudioThemePropAction>([
  "assistant", "assets", "canvas", "community", "comic", "live", "review", "story",
]);

/** 기본 캠퍼스 비공개 음향 구역과 겹치지 않는지 검사. */
const DEFAULT_PRIVATE_RECTS = Object.freeze([
  { x: 670, y: 300, width: 290, height: 230 },  // review
  { x: 950, y: 590, width: 290, height: 260 },  // meeting
]);

function rectsOverlap(
  a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  b: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function studioExtraRoomTemplateByKind(
  kind: StudioExtraRoomTemplateKind,
): StudioExtraRoomTemplate | null {
  return STUDIO_EXTRA_ROOM_TEMPLATES.find((template) => template.kind === kind) ?? null;
}

export function validateStudioExtraRoomTemplates(
  templates: readonly StudioExtraRoomTemplate[] = STUDIO_EXTRA_ROOM_TEMPLATES,
): readonly string[] {
  const errors: string[] = [];
  const kinds = new Set<string>();
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const pointValid = (point: { readonly x: number; readonly y: number } | undefined) =>
    Boolean(point && finite(point.x) && finite(point.y));
  const rectValid = (rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined) =>
    Boolean(rect && pointValid(rect) && finite(rect.width) && finite(rect.height) && rect.width > 0 && rect.height > 0);
  for (const template of templates) {
    if (!EXTRA_KINDS.has(template.kind)) errors.push(`unknown extra template kind: ${String(template.kind)}`);
    if (kinds.has(template.kind)) errors.push(`duplicate extra template kind: ${template.kind}`);
    kinds.add(template.kind);
    if (!template.labelKo.trim() || !template.labelEn.trim()
      || !template.descriptionKo.trim() || !template.descriptionEn.trim()) {
      errors.push(`missing extra template copy: ${template.kind}`);
    }
    const room = template.room;
    if (!SAFE_ID.test(room.id) || !room.labelKo.trim() || !room.labelEn.trim() || !rectValid(room)
      || (room.action !== undefined && !THEME_ACTIONS.has(room.action))) {
      errors.push(`invalid extra room: ${template.kind}`);
    }
    if (rectValid(room)) {
      for (const privateRect of DEFAULT_PRIVATE_RECTS) {
        if (rectsOverlap(room, privateRect)) {
          errors.push(`extra room overlaps default private zone: ${template.kind}`);
        }
      }
    }
    const acoustic = template.acoustic;
    if (!SAFE_ID.test(acoustic.id) || !rectValid(acoustic)
      || (acoustic.policy !== "public" && acoustic.policy !== "private")
      || (acoustic.doorId !== undefined && !SAFE_ID.test(acoustic.doorId))) {
      errors.push(`invalid extra acoustic zone: ${template.kind}`);
    }
    if (!pointValid(template.spawn)) errors.push(`invalid extra spawn: ${template.kind}`);
    const propIds = new Set<string>();
    for (const furnitureProp of template.furniture) {
      if (!SAFE_ID.test(furnitureProp.id) || propIds.has(furnitureProp.id)) {
        errors.push(`invalid extra prop id: ${template.kind}/${String(furnitureProp.id)}`);
        continue;
      }
      propIds.add(furnitureProp.id);
      if (!furnitureProp.labelKo.trim() || !furnitureProp.labelEn.trim() || !pointValid(furnitureProp)
        || !["decor", "solid", "interactive"].includes(furnitureProp.kind)
        || !["fixed", "y-sort", "foreground"].includes(furnitureProp.depth)
        || (furnitureProp.alpha !== undefined && (!finite(furnitureProp.alpha) || furnitureProp.alpha <= 0 || furnitureProp.alpha > 1))
        || (furnitureProp.collider !== undefined && !rectValid(furnitureProp.collider))
        || (furnitureProp.action !== undefined && !THEME_ACTIONS.has(furnitureProp.action))
        || (furnitureProp.interactionRadius !== undefined
          && (!finite(furnitureProp.interactionRadius) || furnitureProp.interactionRadius <= 0))) {
        errors.push(`invalid extra prop: ${template.kind}/${furnitureProp.id}`);
      }
    }
    const seatIds = new Set<string>();
    for (const seat of template.seats ?? []) {
      if (!SAFE_ID.test(seat.id) || seatIds.has(seat.id)) {
        errors.push(`invalid extra seat id: ${template.kind}/${String(seat.id)}`);
        continue;
      }
      seatIds.add(seat.id);
      if (!seat.labelKo.trim() || !seat.labelEn.trim() || !["down", "left", "right", "up"].includes(seat.facing)
        || !finite(seat.radius) || seat.radius <= 0 || seat.radius > 24
        || !pointValid(seat.approachPoint) || !pointValid(seat.anchorPoint) || !pointValid(seat.exitPoint)) {
        errors.push(`invalid extra seat: ${template.kind}/${seat.id}`);
      }
    }
    const npc = template.npc;
    if (npc !== undefined && (!SAFE_ID.test(npc.id) || !npc.skinKey.trim() || !pointValid(npc)
      || !["idle", "talk", "draw", "review", "patrol"].includes(npc.behavior)
      || (npc.patrol !== undefined && (!Array.isArray(npc.patrol) || npc.patrol.some((point) => !pointValid(point)))))) {
      errors.push(`invalid extra npc: ${template.kind}`);
    }
    if (template.zones !== undefined) {
      if (!Array.isArray(template.zones)) errors.push(`invalid extra zones: ${template.kind}`);
      else {
        for (const message of validateOfficeZones(template.zones, { width: 1280, height: 960 })) {
          errors.push(`extra zone: ${message}`);
        }
        if (rectValid(template.room)) {
          for (const zone of template.zones) {
            if (!zone || typeof zone !== "object" || !zone.shape) continue;
            const bounds = officeZoneBounds(zone);
            if (bounds.x < template.room.x || bounds.y < template.room.y
              || bounds.x + bounds.width > template.room.x + template.room.width
              || bounds.y + bounds.height > template.room.y + template.room.height) {
              errors.push(`extra zone outside room: ${template.kind}/${zone.id}`);
            }
          }
        }
      }
    }
  }
  return Object.freeze(errors);
}
