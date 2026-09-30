import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 창작 상호작용 공간 (크리에이티브 존)
 *
 * 가상 오피스를 진짜 창작 공간처럼 만드는 4종의 상호작용 공간:
 * - 드로잉 존: 이젤 앞에 서면 스튜디오 캔버스로 바로가기
 * - 휴게실: 소파에 앉으면 휴식 상태 (🛋️)
 * - 전시관: 작품 액자 앞에서 작품 감상 모드
 * - 회의실: 화이트보드 앞에서 협업 보드 열기
 *
 * office-interactables.ts(가구 상태 전이)와 역할이 다르다:
 * 이 모듈은 "공간(zone) 단위의 창작 활동 연결"에 집중한다.
 *
 * 순수 로직 모듈. 실제 렌더링·키 바인딩은 호출 측에서 담당한다.
 */

/** 창작 공간 종류. */
export type StudioCreativeZoneKind = "drawing" | "lounge" | "gallery" | "meeting";

export interface StudioCreativeZone {
  readonly id: string;
  readonly kind: StudioCreativeZoneKind;
  readonly position: StudioVirtualSpacePoint;
  /** 입장 판정 반경. */
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 프롬프트 표시 반경. */
export const STUDIO_CREATIVE_ZONE_PROMPT_RADIUS = 90;

const KIND_ACTION_KO: Record<StudioCreativeZoneKind, string> = {
  drawing: "캔버스 열기",
  lounge: "휴식하기",
  gallery: "작품 감상",
  meeting: "협업 보드 열기",
};

const KIND_ACTION_EN: Record<StudioCreativeZoneKind, string> = {
  drawing: "Open canvas",
  lounge: "Take a break",
  gallery: "View artworks",
  meeting: "Open collaboration board",
};

/**
 * 아바타가 속한 창작 공간을 찾는다 (입장 판정).
 * 여러 개 겹치면 가장 가까운 하나만.
 */
export function resolveCreativeZone(
  zones: readonly StudioCreativeZone[],
  avatarPoint: StudioVirtualSpacePoint,
): StudioCreativeZone | null {
  let nearest: StudioCreativeZone | null = null;
  let nearestDistance = Infinity;
  for (const zone of zones) {
    const distance = studioVirtualSpaceDistance(avatarPoint, zone.position);
    if (distance <= zone.radius && distance < nearestDistance) {
      nearest = zone;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * 프롬프트 표시용: 입장 반경보다 넓게 가장 가까운 공간을 찾는다.
 */
export function findNearestCreativeZone(
  zones: readonly StudioCreativeZone[],
  avatarPoint: StudioVirtualSpacePoint,
): StudioCreativeZone | null {
  let nearest: StudioCreativeZone | null = null;
  let nearestDistance = Infinity;
  for (const zone of zones) {
    const distance = studioVirtualSpaceDistance(avatarPoint, zone.position);
    const promptRadius = Math.max(zone.radius, STUDIO_CREATIVE_ZONE_PROMPT_RADIUS);
    if (distance <= promptRadius && distance < nearestDistance) {
      nearest = zone;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** 액션 버튼 문구. */
export function creativeZoneActionText(
  zone: StudioCreativeZone,
  userStatus?: StudioUserStatus,
): { readonly ko: string; readonly en: string } {
  // 휴게실은 휴식 중이면 "휴식 마치기"로 바뀐다
  if (zone.kind === "lounge" && userStatus === "break") {
    return { ko: "휴식 마치기", en: "End break" };
  }
  return { ko: KIND_ACTION_KO[zone.kind], en: KIND_ACTION_EN[zone.kind] };
}

/** 공간 상호작용 결과. */
export type StudioCreativeZoneResult =
  | { readonly kind: "open-canvas"; readonly zoneId: string }
  | { readonly kind: "rest"; readonly zoneId: string }
  | { readonly kind: "stop-rest"; readonly zoneId: string }
  | { readonly kind: "open-gallery"; readonly zoneId: string }
  | { readonly kind: "open-board"; readonly zoneId: string };

/**
 * 창작 공간 액션을 실행한다.
 *
 * - drawing: 스튜디오 캔버스 열기 이벤트 (호출 측에서 라우팅)
 * - lounge: 휴식 토글 (break ↔ available)
 * - gallery: 작품 감상 모드 열기 이벤트
 * - meeting: 협업 보드 열기 이벤트
 */
export function activateCreativeZone(
  zone: StudioCreativeZone,
  userStatus: StudioUserStatus,
  at: number,
): {
  readonly result: StudioCreativeZoneResult;
  readonly userStatus: StudioUserStatus;
  readonly statusChangedAt: number;
} {
  switch (zone.kind) {
    case "drawing":
      return {
        result: Object.freeze({ kind: "open-canvas", zoneId: zone.id }),
        userStatus,
        statusChangedAt: at,
      };
    case "lounge": {
      if (userStatus === "break") {
        return {
          result: Object.freeze({ kind: "stop-rest", zoneId: zone.id }),
          userStatus: "available",
          statusChangedAt: at,
        };
      }
      return {
        result: Object.freeze({ kind: "rest", zoneId: zone.id }),
        userStatus: "break",
        statusChangedAt: at,
      };
    }
    case "gallery":
      return {
        result: Object.freeze({ kind: "open-gallery", zoneId: zone.id }),
        userStatus,
        statusChangedAt: at,
      };
    case "meeting":
      return {
        result: Object.freeze({ kind: "open-board", zoneId: zone.id }),
        userStatus,
        statusChangedAt: at,
      };
  }
}

/** 공간 입장/퇴장 이벤트. */
export type StudioCreativeZoneTransition =
  | { readonly kind: "zone-entered"; readonly zoneId: string }
  | { readonly kind: "zone-exited"; readonly zoneId: string };

/**
 * 아바타의 공간 이동을 입장/퇴장 이벤트로 변환한다.
 * 입장 시 공간 안내를 띄우는 용도다.
 */
export function diffCreativeZone(
  previous: StudioCreativeZone | null,
  current: StudioCreativeZone | null,
): readonly StudioCreativeZoneTransition[] {
  if (previous?.id === current?.id) return Object.freeze([]);
  const events: StudioCreativeZoneTransition[] = [];
  if (previous !== null) {
    events.push(Object.freeze({ kind: "zone-exited", zoneId: previous.id }));
  }
  if (current !== null) {
    events.push(Object.freeze({ kind: "zone-entered", zoneId: current.id }));
  }
  return Object.freeze(events);
}

/** 공간 입장 안내 문구. */
export function creativeZoneEnterNotice(
  zone: StudioCreativeZone,
): { readonly ko: string; readonly en: string } {
  switch (zone.kind) {
    case "drawing":
      return {
        ko: `드로잉 존에 들어왔어요. 이젤 앞에서 캔버스를 열어보세요.`,
        en: `You entered the drawing zone. Open the canvas at the easel.`,
      };
    case "lounge":
      return {
        ko: `휴게실이에요. 소파에서 잠시 쉬어가세요. 🛋️`,
        en: `This is the lounge. Rest on the sofa. 🛋️`,
      };
    case "gallery":
      return {
        ko: `전시관이에요. 액자 앞에서 작품을 감상해보세요.`,
        en: `This is the gallery. Enjoy the artworks at the frames.`,
      };
    case "meeting":
      return {
        ko: `회의 공간이에요. 화이트보드에서 협업 보드를 열어보세요.`,
        en: `This is the meeting space. Open the collaboration board at the whiteboard.`,
      };
  }
}

/** 상호작용 결과 알림 문구. */
export function creativeZoneResultNotice(
  result: StudioCreativeZoneResult,
  labelKo: string,
  labelEn: string,
): { readonly ko: string; readonly en: string } | null {
  switch (result.kind) {
    case "rest":
      return { ko: `소파에 앉아 휴식 중이에요. 🛋️`, en: `Resting on the sofa. 🛋️` };
    case "stop-rest":
      return { ko: "휴식을 마쳤어요.", en: "Break over." };
    case "open-canvas":
      return { ko: `"${labelKo}" — 캔버스로 이동합니다.`, en: `"${labelEn}" — opening the canvas.` };
    case "open-gallery":
      return { ko: `"${labelKo}" — 작품 감상을 시작합니다.`, en: `"${labelEn}" — starting artwork viewing.` };
    case "open-board":
      return { ko: `"${labelKo}" — 협업 보드를 엽니다.`, en: `"${labelEn}" — opening the collaboration board.` };
  }
}
