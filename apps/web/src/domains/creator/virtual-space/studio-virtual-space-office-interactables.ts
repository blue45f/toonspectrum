import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 사무실 상호작용 오브젝트
 *
 * 진짜 사무실처럼 꾸미기 위한 가구 상호작용:
 * - 회의실 문: 다가가면 입장 프롬프트 ("들어 가기")
 * - 화이트보드: 다가가면 협업 보드 열기
 * - 책상: 다가가면 앉기 (스프라이트가 앉은 자세로 변경)
 * - 카페테리아: 휴식 상태로 전환 (☕)
 * - 게시판: 공지사항 보기
 *
 * 기존 studio-virtual-space-interactable-objects.ts(X키 오브젝트),
 * studio-virtual-space-meeting-objects.ts(자동 입장)와 역할이 다르다:
 * 이 모듈은 "가구 상태 전이"에 집중한다.
 *
 * 순수 로직 모듈. 실제 렌더링·키 바인딩은 호출 측에서 담당한다.
 */

/** 사무실 오브젝트 종류. */
export type StudioOfficeObjectKind =
  | "meeting-door"   // 회의실 문
  | "whiteboard"     // 화이트보드 (협업 보드)
  | "desk"           // 책상 (앉기)
  | "cafeteria"      // 카페테리아 (휴식)
  | "bulletin-board";// 게시판 (공지)

export interface StudioOfficeObject {
  readonly id: string;
  readonly kind: StudioOfficeObjectKind;
  readonly position: StudioVirtualSpacePoint;
  /** 상호작용 반경. */
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 책상 앉기용: 앉는 위치 (desk 전용). */
  readonly seatPoint?: StudioVirtualSpacePoint;
}

const KIND_ACTION_KO: Record<StudioOfficeObjectKind, string> = {
  "meeting-door": "들어가기",
  "whiteboard": "협업 보드 열기",
  "desk": "앉기",
  "cafeteria": "휴식하기",
  "bulletin-board": "공지 보기",
};

const KIND_ACTION_EN: Record<StudioOfficeObjectKind, string> = {
  "meeting-door": "Enter",
  "whiteboard": "Open collaboration board",
  "desk": "Sit down",
  "cafeteria": "Take a break",
  "bulletin-board": "View notices",
};

/** 프롬프트 표시 반경. */
export const STUDIO_OFFICE_PROMPT_RADIUS = 80;

/**
 * 가장 가까운 사무실 오브젝트를 찾는다.
 */
export function findNearestOfficeObject(
  objects: readonly StudioOfficeObject[],
  avatarPoint: StudioVirtualSpacePoint,
): StudioOfficeObject | null {
  let nearest: StudioOfficeObject | null = null;
  let nearestDistance = Infinity;
  for (const object of objects) {
    const distance = studioVirtualSpaceDistance(avatarPoint, object.position);
    const promptRadius = Math.max(object.radius, STUDIO_OFFICE_PROMPT_RADIUS);
    if (distance <= promptRadius && distance < nearestDistance) {
      nearest = object;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** 액션 버튼 문구. */
export function officeActionText(
  object: StudioOfficeObject,
): { readonly ko: string; readonly en: string } {
  return {
    ko: KIND_ACTION_KO[object.kind],
    en: KIND_ACTION_EN[object.kind],
  };
}

/** 가구 상호작용 결과. */
export type StudioOfficeInteractionResult =
  | { readonly kind: "enter-meeting"; readonly objectId: string }
  | { readonly kind: "open-whiteboard"; readonly objectId: string }
  | { readonly kind: "sit"; readonly objectId: string; readonly seatPoint: StudioVirtualSpacePoint }
  | { readonly kind: "stand" }
  | { readonly kind: "rest"; readonly objectId: string }
  | { readonly kind: "stop-rest" }
  | { readonly kind: "open-notices"; readonly objectId: string };

/** 앉은 상태. */
export interface StudioSeatState {
  readonly seated: boolean;
  /** 앉은 책상 id (null이면 서 있음). */
  readonly deskId: string | null;
  readonly seatPoint: StudioVirtualSpacePoint | null;
}

export const STANDING_SEAT_STATE: StudioSeatState = Object.freeze({
  seated: false,
  deskId: null,
  seatPoint: null,
});

/**
 * 가구 액션을 실행한다. 현재 앉은 상태와 사용자 상태를 함께 갱신한다.
 *
 * - desk/chair: 앉아 있으면 일어나기, 서 있으면 앉기
 * - cafeteria: 휴식 중이면 복귀, 아니면 휴식
 * - meeting-door: 회의실 입장 이벤트
 * - whiteboard: 협업 보드 열기 이벤트
 * - bulletin-board: 공지 보기 이벤트
 * - door/light-switch/coffee-machine: furniture 인자로 전달된 상태 키를 전이한다.
 *   furniture가 없으면 초기 상태로 간주한다. 커피 추출 완료(8초 경과)는
 *   활성화 시점에 자동으로 ready로 올린다.
 */
export function activateOfficeObject(
  object: StudioOfficeObject,
  seatState: StudioSeatState,
  userStatus: StudioUserStatus,
  at: number,
  furniture?: { readonly stateKey: string; readonly changedAt: number },
): {
  readonly result: StudioOfficeInteractionResult;
  readonly seatState: StudioSeatState;
  readonly userStatus: StudioUserStatus;
  readonly statusChangedAt: number;
  /** 상태 유지형 가구(chair/door/light-switch/coffee-machine)의 전이 후 상태. */
  readonly furnitureState: { readonly stateKey: string; readonly changedAt: number } | null;
} {
  const furnitureStateFor = (stateKey: string): { readonly stateKey: string; readonly changedAt: number } =>
    Object.freeze({ stateKey, changedAt: at });
  const noFurniture = {
    seatState, userStatus, statusChangedAt: at,
    furnitureState: null as { readonly stateKey: string; readonly changedAt: number } | null,
  };
  switch (object.kind) {
    case "desk":
    case "chair": {
      if (seatState.seated && seatState.deskId === object.id) {
        // 일어나기
        return {
          result: Object.freeze({ kind: "stand" }),
          seatState: STANDING_SEAT_STATE,
          userStatus,
          statusChangedAt: at,
          furnitureState: object.kind === "chair" ? furnitureStateFor("chair:empty") : null,
        };
      }
      const seatPoint = object.seatPoint ?? object.position;
      return {
        result: Object.freeze({ kind: "sit", objectId: object.id, seatPoint }),
        seatState: Object.freeze({ seated: true, deskId: object.id, seatPoint }),
        userStatus,
        statusChangedAt: at,
        furnitureState: object.kind === "chair" ? furnitureStateFor("chair:occupied") : null,
      };
    }
    case "door": {
      const open = officeFurnitureStateKey(object.kind, furniture) === "door:open";
      return {
        result: Object.freeze({ kind: "toggle-door", objectId: object.id, open: !open }),
        ...noFurniture,
        furnitureState: furnitureStateFor(open ? "door:closed" : "door:open"),
      };
    }
    case "light-switch": {
      const on = officeFurnitureStateKey(object.kind, furniture) === "light:on";
      return {
        result: Object.freeze({ kind: "toggle-light", objectId: object.id, on: !on }),
        ...noFurniture,
        furnitureState: furnitureStateFor(on ? "light:off" : "light:on"),
      };
    }
    case "coffee-machine": {
      const resolved = officeFurnitureStateKey(object.kind, furniture, at);
      if (resolved === "coffee:ready") {
        return {
          result: Object.freeze({ kind: "take-coffee", objectId: object.id }),
          ...noFurniture,
          furnitureState: furnitureStateFor("coffee:idle"),
        };
      }
      if (resolved === "coffee:brewing") {
        // 아직 추출 중 — 상태 유지, 알림만
        return {
          result: Object.freeze({ kind: "brew-coffee", objectId: object.id }),
          ...noFurniture,
          furnitureState: furniture ? { stateKey: resolved, changedAt: furniture.changedAt } : furnitureStateFor("coffee:brewing"),
        };
      }
      return {
        result: Object.freeze({ kind: "brew-coffee", objectId: object.id }),
        ...noFurniture,
        furnitureState: furnitureStateFor("coffee:brewing"),
      };
    }
    case "cafeteria": {
      if (userStatus === "break") {
        return {
          result: Object.freeze({ kind: "stop-rest" }),
          seatState,
          userStatus: "available",
          statusChangedAt: at,
          furnitureState: null,
        };
      }
      return {
        result: Object.freeze({ kind: "rest", objectId: object.id }),
        seatState: STANDING_SEAT_STATE, // 휴식하면 의자에서 일어난다
        userStatus: "break",
        statusChangedAt: at,
        furnitureState: null,
      };
    }
    case "meeting-door":
      return {
        result: Object.freeze({ kind: "enter-meeting", objectId: object.id }),
        seatState,
        userStatus: "in-meeting",
        statusChangedAt: at,
        furnitureState: null,
      };
    case "whiteboard":
      return {
        result: Object.freeze({ kind: "open-whiteboard", objectId: object.id }),
        seatState,
        userStatus,
        statusChangedAt: at,
        furnitureState: null,
      };
    case "bulletin-board":
      return {
        result: Object.freeze({ kind: "open-notices", objectId: object.id }),
        seatState,
        userStatus,
        statusChangedAt: at,
        furnitureState: null,
      };
  }
}

/** 상태 유지형 가구의 상태 키. */
export type StudioOfficeFurnitureStateKey =
  | "chair:empty" | "chair:occupied"
  | "door:closed" | "door:open"
  | "light:off" | "light:on"
  | "coffee:idle" | "coffee:brewing" | "coffee:ready";

/** 커피 추출 완료까지 걸리는 시간 (ms). */
export const STUDIO_OFFICE_COFFEE_BREW_MS = 8_000;

const OFFICE_FURNITURE_INITIAL: Record<"chair" | "door" | "light-switch" | "coffee-machine", StudioOfficeFurnitureStateKey> = {
  chair: "chair:empty",
  door: "door:closed",
  "light-switch": "light:off",
  "coffee-machine": "coffee:idle",
};

/** 상태 유지형 가구의 초기 상태 키. */
export function officeFurnitureInitialState(
  kind: "chair" | "door" | "light-switch" | "coffee-machine",
): StudioOfficeFurnitureStateKey {
  return OFFICE_FURNITURE_INITIAL[kind];
}

/**
 * 현재 가구 상태 키를 구한다. furniture가 없으면 초기 상태.
 * at이 주어지면 커피 추출 완료(brewing→ready)를 시간 경과로 올린다.
 */
export function officeFurnitureStateKey(
  kind: "chair" | "door" | "light-switch" | "coffee-machine",
  furniture: { readonly stateKey: string; readonly changedAt: number } | undefined,
  at?: number,
): StudioOfficeFurnitureStateKey {
  const initial = officeFurnitureInitialState(kind);
  const current = furniture?.stateKey;
  const resolved = current === "chair:empty" || current === "chair:occupied"
    || current === "door:closed" || current === "door:open"
    || current === "light:off" || current === "light:on"
    || current === "coffee:idle" || current === "coffee:brewing" || current === "coffee:ready"
    ? current as StudioOfficeFurnitureStateKey
    : initial;
  if (resolved === "coffee:brewing" && at !== undefined && furniture
    && Number.isFinite(at) && at - furniture.changedAt >= STUDIO_OFFICE_COFFEE_BREW_MS) {
    return "coffee:ready";
  }
  return resolved;
}

/** 상태 의존 액션 문구 (예: 의자 occupied → "일어서기"). */
export function officeActionTextForState(
  object: StudioOfficeObject,
  stateKey: string,
): { readonly ko: string; readonly en: string } {
  switch (stateKey) {
    case "chair:occupied": return { ko: "일어서기", en: "Stand up" };
    case "chair:empty": return { ko: "앉기", en: "Sit down" };
    case "door:open": return { ko: "닫기", en: "Close" };
    case "door:closed": return { ko: "열기", en: "Open" };
    case "light:on": return { ko: "끄기", en: "Turn off" };
    case "light:off": return { ko: "켜기", en: "Turn on" };
    case "coffee:brewing": return { ko: "추출 중…", en: "Brewing…" };
    case "coffee:ready": return { ko: "커피 가져가기", en: "Take coffee" };
    case "coffee:idle": return { ko: "커피 내리기", en: "Brew coffee" };
    default: return officeActionText(object);
  }
}

/**
 * 이동하면 앉은 상태가 해제된다 (책상에서 멀어지면).
 * 호출 측에서 매 프레임/이동 시 확인한다.
 */export function shouldStandUp(
  seatState: StudioSeatState,
  avatarPoint: StudioVirtualSpacePoint,
  moved: boolean,
): boolean {
  if (!seatState.seated || seatState.seatPoint === null) return false;
  if (!moved) return false;
  // 앉은 위치에서 24px 이상 움직이면 일어난다
  return studioVirtualSpaceDistance(avatarPoint, seatState.seatPoint) > 24;
}

/** 상호작용 결과 알림 문구. */
export function officeInteractionNotice(
  result: StudioOfficeInteractionResult,
  labelKo: string,
  labelEn: string,
): { readonly ko: string; readonly en: string } | null {
  switch (result.kind) {
    case "sit":
      return { ko: `"${labelKo}"에 앉았어요.`, en: `You're now seated at "${labelEn}".` };
    case "stand":
      return { ko: "자리에서 일어났어요.", en: "You stood up." };
    case "rest":
      return { ko: "휴식 중이에요. ☕", en: "You're on a break. ☕" };
    case "stop-rest":
      return { ko: "휴식을 마쳤어요.", en: "Break over." };
    case "enter-meeting":
      return { ko: `"${labelKo}"에 입장했어요.`, en: `You entered "${labelEn}".` };
    case "toggle-door":
      return result.open
        ? { ko: `"${labelKo}"을(를) 열었어요.`, en: `You opened "${labelEn}".` }
        : { ko: `"${labelKo}"을(를) 닫았어요.`, en: `You closed "${labelEn}".` };
    case "toggle-light":
      return result.on
        ? { ko: `"${labelKo}"을(를) 켰어요. 💡`, en: `You turned on "${labelEn}". 💡` }
        : { ko: `"${labelKo}"을(를) 껐어요.`, en: `You turned off "${labelEn}".` };
    case "brew-coffee":
      return { ko: "커피를 내리는 중이에요… ☕", en: "Brewing coffee… ☕" };
    case "take-coffee":
      return { ko: "따뜻한 커피를 가져갔어요. ☕", en: "You took a warm coffee. ☕" };
    default:
      return null;
  }
}

// ── 기본 오피스 가구 배치 (Track C) ────────────────────────────────────────
// 이벤트 디렉터(B 트랙 계약)의 interactables 입력은 아래 두 레지스트리에서 공급한다.
// X키 오브젝트 레지스트리(studio-virtual-space-interactable-objects.ts)와 물리적으로
// 겹칠 수 있으나 레이어가 다르다: 여기는 "가구 상태 전이" 레이어다.

const officeObject = (value: StudioOfficeObject): StudioOfficeObject => Object.freeze(value);

/** 기본 오피스 가구 배치 (기본 월드 1280x960 좌표). */
export const STUDIO_OFFICE_OBJECT_REGISTRY: readonly StudioOfficeObject[] = Object.freeze([
  officeObject({ id: "office-meeting-door", kind: "meeting-door", position: { x: 1150, y: 800 }, radius: 60, labelKo: "회의실 문", labelEn: "Meeting room door" }),
  officeObject({ id: "office-whiteboard", kind: "whiteboard", position: { x: 900, y: 470 }, radius: 60, labelKo: "리뷰 화이트보드", labelEn: "Review whiteboard" }),
  officeObject({ id: "office-desk", kind: "desk", position: { x: 560, y: 440 }, radius: 55, labelKo: "작화 책상", labelEn: "Drawing desk", seatPoint: { x: 560, y: 470 } }),
  officeObject({ id: "office-cafeteria", kind: "cafeteria", position: { x: 645, y: 760 }, radius: 65, labelKo: "카페테리아", labelEn: "Cafeteria" }),
  officeObject({ id: "office-bulletin", kind: "bulletin-board", position: { x: 700, y: 880 }, radius: 60, labelKo: "공지 게시판", labelEn: "Notice board" }),
  officeObject({ id: "office-chair", kind: "chair", position: { x: 540, y: 720 }, radius: 55, labelKo: "휴게 의자", labelEn: "Lounge chair", seatPoint: { x: 540, y: 742 } }),
  officeObject({ id: "office-door", kind: "door", position: { x: 1180, y: 200 }, radius: 60, labelKo: "출고실 문", labelEn: "Release room door" }),
  officeObject({ id: "office-light", kind: "light-switch", position: { x: 860, y: 880 }, radius: 50, labelKo: "로비 조명 스위치", labelEn: "Lobby light switch" }),
  officeObject({ id: "office-coffee", kind: "coffee-machine", position: { x: 645, y: 715 }, radius: 55, labelKo: "커피 머신", labelEn: "Coffee machine" }),
]);
