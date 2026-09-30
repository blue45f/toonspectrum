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
 * - desk: 앉아 있으면 일어나기, 서 있으면 앉기
 * - cafeteria: 휴식 중이면 복귀, 아니면 휴식
 * - meeting-door: 회의실 입장 이벤트
 * - whiteboard: 협업 보드 열기 이벤트
 * - bulletin-board: 공지 보기 이벤트
 */
export function activateOfficeObject(
  object: StudioOfficeObject,
  seatState: StudioSeatState,
  userStatus: StudioUserStatus,
  at: number,
): {
  readonly result: StudioOfficeInteractionResult;
  readonly seatState: StudioSeatState;
  readonly userStatus: StudioUserStatus;
  readonly statusChangedAt: number;
} {
  switch (object.kind) {
    case "desk": {
      if (seatState.seated && seatState.deskId === object.id) {
        // 일어나기
        return {
          result: Object.freeze({ kind: "stand" }),
          seatState: STANDING_SEAT_STATE,
          userStatus,
          statusChangedAt: at,
        };
      }
      const seatPoint = object.seatPoint ?? object.position;
      return {
        result: Object.freeze({ kind: "sit", objectId: object.id, seatPoint }),
        seatState: Object.freeze({ seated: true, deskId: object.id, seatPoint }),
        userStatus,
        statusChangedAt: at,
      };
    }
    case "cafeteria": {
      if (userStatus === "break") {
        return {
          result: Object.freeze({ kind: "stop-rest" }),
          seatState,
          userStatus: "available",
          statusChangedAt: at,
        };
      }
      return {
        result: Object.freeze({ kind: "rest", objectId: object.id }),
        seatState: STANDING_SEAT_STATE, // 휴식하면 의자에서 일어난다
        userStatus: "break",
        statusChangedAt: at,
      };
    }
    case "meeting-door":
      return {
        result: Object.freeze({ kind: "enter-meeting", objectId: object.id }),
        seatState,
        userStatus: "in-meeting",
        statusChangedAt: at,
      };
    case "whiteboard":
      return {
        result: Object.freeze({ kind: "open-whiteboard", objectId: object.id }),
        seatState,
        userStatus,
        statusChangedAt: at,
      };
    case "bulletin-board":
      return {
        result: Object.freeze({ kind: "open-notices", objectId: object.id }),
        seatState,
        userStatus,
        statusChangedAt: at,
      };
  }
}

/**
 * 이동하면 앉은 상태가 해제된다 (책상에서 멀어지면).
 * 호출 측에서 매 프레임/이동 시 확인한다.
 */
export function shouldStandUp(
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
    default:
      return null;
  }
}
