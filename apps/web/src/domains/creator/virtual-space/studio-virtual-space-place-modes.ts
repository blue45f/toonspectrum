/**
 * 장소 기반 업무 모드 (Track 6).
 *
 * "걷다가 자연스럽게 일이 이어지는" 핵심 기능의 타입·매핑·문구 레이어다.
 * 순수 함수만 두며, 상태머신은 studio-virtual-space-place-mode-director.ts,
 * 미디어 세션은 studio-virtual-space-place-media.ts가 담당한다.
 *
 * - PlaceWorkMode: zone이 지정하는 업무 모드 (conference | focus-desk | stage | lounge | none)
 * - placeWorkModeForZoneType: workMode가 없는 존의 폴백 매핑
 * - placeModeAutoStatus: 모드 진입 시 presence에 자동 반영할 사용자 상태
 * - placeModeEntryCopy / placeModeExitCopy: 진입·이탈 UX 문구 (ko/en)
 *
 * 벤치마크 반영 (2026-10-01 VIRTUAL_SPACE_BENCHMARK):
 * - Gather private space: "You have entered a private space" 진입 안내 + 영역 하이라이트
 * - Gather spotlight tile: 발표자는 방 전체에 방송
 * - Zoom tiled/spotlight: 좌석 기반 타일 배치 + 발언자 스포트라이트
 * - Zoom focus mode: 청중은 발표자만 본다 (리액션만 가능)
 * - Gather quiet mode: 집중 공간 DND
 */

import type { StudioOfficeZoneType } from "./studio-virtual-space-office-zones";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 장소 업무 모드.
 * - conference: 회의실 — 참여 확인 후 화상 세션
 * - focus-desk: 책상/좌석 — 앉으면 집중 모드 + DND 자동 표시
 * - stage: 스테이지 — 발표 모드, 발표자 스포트라이트
 * - lounge: 휴게실 — 가벼운 음성 채팅방
 * - none: 업무 모드 없음
 */
export type PlaceWorkMode = "conference" | "focus-desk" | "stage" | "lounge" | "none";

export const PLACE_WORK_MODES: readonly PlaceWorkMode[] = Object.freeze([
  "conference", "focus-desk", "stage", "lounge", "none",
]);

const WORK_MODE_PATTERN = /^(conference|focus-desk|stage|lounge|none)$/u;

/** workMode 값을 검증한다. 모르는 값은 null. */
export function parsePlaceWorkMode(value: unknown): PlaceWorkMode | null {
  return typeof value === "string" && WORK_MODE_PATTERN.test(value) ? (value as PlaceWorkMode) : null;
}

/**
 * 존 종류 → 업무 모드 폴백 매핑.
 * 존 정의에 workMode가 명시되면 그 값이 우선하고, 없을 때만 이 매핑을 쓴다.
 */
export function placeWorkModeForZoneType(type: StudioOfficeZoneType): PlaceWorkMode {
  switch (type) {
    case "meeting-room": return "conference";
    case "focus-zone": return "focus-desk";
    case "library": return "focus-desk";
    case "event-hall": return "stage";
    case "studio": return "stage";
    case "lounge": return "lounge";
    case "cafe": return "lounge";
    case "lobby":
    case "reception":
    case "phone-booth":
    default: return "none";
  }
}

export interface PlaceWorkModeMeta {
  readonly mode: PlaceWorkMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 진입 배너 아이콘 (이모지, 텍스트 기반이라 에셋 불필요). */
  readonly icon: string;
}

const WORK_MODE_METAS: Record<PlaceWorkMode, PlaceWorkModeMeta> = {
  conference: {
    mode: "conference", icon: "🎥",
    labelKo: "회의 모드", labelEn: "Meeting mode",
    descriptionKo: "화상 회의 세션에 참여해요. 발언하지 않을 땐 마이크를 꺼 두는 게 좋아요.",
    descriptionEn: "Join a video meeting session. Keep your mic off when you are not speaking.",
  },
  "focus-desk": {
    mode: "focus-desk", icon: "🎯",
    labelKo: "집중 모드", labelEn: "Focus mode",
    descriptionKo: "방해금지(DND)가 자동으로 표시돼요. 대화는 채팅으로 먼저 시도해 보세요.",
    descriptionEn: "Do-not-disturb is shown automatically. Try chat first for conversations.",
  },
  stage: {
    mode: "stage", icon: "🎤",
    labelKo: "발표 모드", labelEn: "Stage mode",
    descriptionKo: "무대 위 발표자에게 스포트라이트가 켜져요. 청중은 리액션으로 응원해요.",
    descriptionEn: "The spotlight follows the presenter on stage. The audience cheers with reactions.",
  },
  lounge: {
    mode: "lounge", icon: "☕",
    labelKo: "휴게 모드", labelEn: "Lounge mode",
    descriptionKo: "가벼운 음성 채팅방에 입장해요. 1:1 대화는 프라이빗 버블을 이용해 보세요.",
    descriptionEn: "Join a light voice chat room. Use a private bubble for 1:1 conversations.",
  },
  none: {
    mode: "none", icon: "🚶",
    labelKo: "일반 이동", labelEn: "Roaming",
    descriptionKo: "업무 모드가 없는 공간이에요. 자유롭게 이동하세요.",
    descriptionEn: "A space without a work mode. Move around freely.",
  },
};

/** 업무 모드 메타데이터 조회. */
export function placeWorkModeMeta(mode: PlaceWorkMode): PlaceWorkModeMeta {
  return WORK_MODE_METAS[mode];
}

/**
 * 모드별 자동 presence 상태.
 * 퇴장 시 이전 상태로 복원하므로, 진입 시점의 상태는 디렉터가 따로 저장한다.
 * - conference → in-meeting (회의 중)
 * - stage → presenting (발표 중)
 * - focus-desk → focusing (집중 중)
 * - lounge → break (휴식 중)
 * - none → null (변경 없음)
 */
export function placeModeAutoStatus(mode: PlaceWorkMode): StudioUserStatus | null {
  switch (mode) {
    case "conference": return "in-meeting";
    case "stage": return "presenting";
    case "focus-desk": return "focusing";
    case "lounge": return "break";
    case "none": return null;
  }
}

/**
 * 진입 시 "참여하기" 확인 UX가 필요한 모드.
 * 너무 자동이면 당황스러우니 회의실·스테이지는 확인을 거친다 (사용자 요청).
 * 책상·휴게실은 걷는 흐름을 끊지 않도록 자동 진입한다.
 */
export function placeModeNeedsJoinConfirm(mode: PlaceWorkMode): boolean {
  return mode === "conference" || mode === "stage";
}

/** 진입 배너/프롬프트 문구. */
export function placeModeEntryCopy(
  mode: PlaceWorkMode,
  zoneLabel: { readonly ko: string; readonly en: string },
  locale: "ko" | "en" = "ko",
): { readonly title: string; readonly body: string } {
  const label = locale === "ko" ? zoneLabel.ko : zoneLabel.en;
  switch (mode) {
    case "conference":
      return locale === "ko"
        ? { title: `${label}에 들어왔어요 🎥`, body: "화상 회의에 참여할까요? 마이크·카메라 권한을 확인해 주세요." }
        : { title: `You entered ${label} 🎥`, body: "Join the video meeting? Please check your mic and camera permissions." };
    case "focus-desk":
      return locale === "ko"
        ? { title: `${label} · 집중 모드 🎯`, body: "방해금지(DND)가 표시됐어요. 화면 공유는 책상 메뉴에서 시작할 수 있어요." }
        : { title: `${label} · Focus mode 🎯`, body: "Do-not-disturb is on. You can start screen sharing from the desk menu." };
    case "stage":
      return locale === "ko"
        ? { title: `${label} 무대에 올랐어요 🎤`, body: "발표를 시작할까요? 올라가면 모두에게 스포트라이트가 켜져요." }
        : { title: `You stepped onto the ${label} stage 🎤`, body: "Start presenting? The spotlight will follow you for everyone." };
    case "lounge":
      return locale === "ko"
        ? { title: `${label}에 들어왔어요 ☕`, body: "가벼운 음성 채팅방에 입장했어요. 편하게 쉬어가세요." }
        : { title: `You entered ${label} ☕`, body: "You joined the casual voice chat. Take it easy." };
    case "none":
      return locale === "ko"
        ? { title: label, body: "" }
        : { title: label, body: "" };
  }
}

/** 이탈 정리 토스트 문구. */
export function placeModeExitCopy(
  mode: PlaceWorkMode,
  zoneLabel: { readonly ko: string; readonly en: string },
  locale: "ko" | "en" = "ko",
): { readonly title: string; readonly body: string } {
  const label = locale === "ko" ? zoneLabel.ko : zoneLabel.en;
  switch (mode) {
    case "conference":
      return locale === "ko"
        ? { title: "회의에서 나왔어요", body: "마이크·카메라를 껐고, 상태도 원래대로 돌려놨어요." }
        : { title: "You left the meeting", body: "Mic and camera are off, and your status is restored." };
    case "focus-desk":
      return locale === "ko"
        ? { title: "집중 모드 종료", body: "방해금지 표시를 껐어요." }
        : { title: "Focus mode off", body: "Do-not-disturb is off." };
    case "stage":
      return locale === "ko"
        ? { title: "무대에서 내려왔어요", body: "스포트라이트를 껐어요. 수고했어요! 👏" }
        : { title: "You stepped off the stage", body: "Spotlight off. Well done! 👏" };
    case "lounge":
      return locale === "ko"
        ? { title: `${label}에서 나왔어요`, body: "음성 채팅방에서 나왔어요." }
        : { title: `You left ${label}`, body: "You left the voice chat." };
    case "none":
      return locale === "ko" ? { title: label, body: "" } : { title: label, body: "" };
  }
}

/** 화이트보드 제안 문구 (회의 세션 중, 트랙2 화이트보드 확장점). */
export function placeModeWhiteboardCopy(locale: "ko" | "en" = "ko"): { readonly title: string; readonly body: string; readonly cta: string } {
  return locale === "ko"
    ? { title: "같이 그려볼까요? 🖊️", body: "회의실 화이트보드를 열어 브레인스토밍을 시작해 보세요.", cta: "화이트보드 열기" }
    : { title: "Want to sketch together? 🖊️", body: "Open the meeting room whiteboard to start brainstorming.", cta: "Open whiteboard" };
}

/** 진입 확정 디바운스: 같은 모드 존에 이 시간만큼 머물러야 진입으로 친다 (경계 깜빡임 방지). */
export const PLACE_MODE_ENTER_STABLE_MS = 600;
/** 이탈 확정 디바운스: 존 밖에서 이 시간만큼 있어야 이탈로 친다 (문 앞 왔다갔다 방지). */
export const PLACE_MODE_EXIT_STABLE_MS = 1_200;

/**
 * 청중 시점 카메라 타깃 (스테이지 모드).
 * 발표자가 있으면 카메라가 발표자 쪽으로 살짝 당겨져 "고정된 느낌"의
 * 스포트라이트 연출이 된다. Phaser 씬이 카메라 디렉터 입력에 섞어 쓴다.
 * blend 0~1 (기본 0.35). reduced-motion이면 호출 측이 0으로 둔다.
 */
export function placeModeAudienceCameraTarget(
  self: StudioVirtualSpacePoint,
  presenter: StudioVirtualSpacePoint | null,
  blend = 0.35,
): StudioVirtualSpacePoint {
  if (!presenter || !Number.isFinite(presenter.x) || !Number.isFinite(presenter.y)) return self;
  const clamped = Number.isFinite(blend) ? Math.min(1, Math.max(0, blend)) : 0.35;
  return Object.freeze({
    x: self.x + (presenter.x - self.x) * clamped,
    y: self.y + (presenter.y - self.y) * clamped,
  });
}
