import type {
  StudioScreenObject,
  StudioScreenShareBinding,
} from "./studio-virtual-space-object-runtime";

/**
 * A-6 대형 스크린 오브젝트 상호작용 슬롯: 화면 공유 시작/연결/해제 액션.
 *
 * 슬롯은 순수 데이터로 계산되며, 실제 화면 캡처(`getDisplayMedia`)나 송출은
 * 다루지 않는다. 허용 여부 판정은 이 모듈의 순수 함수로 수행하고,
 * 사용자 문구는 호출 측 UI에서 `bt("한글", "English")` 패턴으로 표시한다.
 */

export type StudioScreenSlotAction = "start-screen-share" | "connect-screen" | "disconnect-screen";

export interface StudioScreenInteractionSlot {
  readonly slotId: string;
  readonly screenId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly actions: readonly StudioScreenSlotAction[];
}

function slotActionsFor(share: StudioScreenShareBinding | null): readonly StudioScreenSlotAction[] {
  if (share && share.trackState === "live") return Object.freeze(["connect-screen", "disconnect-screen"]);
  return Object.freeze(["start-screen-share"]);
}

/** 스크린 오브젝트 목록에서 상호작용 슬롯 목록을 만든다. */
export function studioScreenInteractionSlots(
  screens: readonly StudioScreenObject[],
): readonly StudioScreenInteractionSlot[] {
  return Object.freeze(screens.map((screen) => Object.freeze({
    slotId: `screen-slot:${screen.id}`,
    screenId: screen.id,
    labelKo: "대형 스크린",
    labelEn: "Large screen",
    actions: slotActionsFor(screen.share),
  })));
}

export type StudioScreenSlotActionDenialReason =
  | "no-share"
  | "share-ended"
  | "already-sharing"
  | "out-of-range"
  | "not-sharer"
  | "unknown-action";

export type StudioScreenSlotActionVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: StudioScreenSlotActionDenialReason };

export interface StudioScreenSlotActionQuery {
  readonly action: StudioScreenSlotAction;
  readonly screen: StudioScreenObject;
  /** 슬롯을 여는 아바타의 id. */
  readonly viewerId: string;
  /** 아바타와 스크린 사이의 거리(px). */
  readonly distance: number;
}

const ALLOWED: StudioScreenSlotActionVerdict = Object.freeze({ allowed: true });

function denied(reason: StudioScreenSlotActionDenialReason): StudioScreenSlotActionVerdict {
  return Object.freeze({ allowed: false, reason });
}

/**
 * 스크린 슬롯 액션의 허용 여부를 판정한다.
 * - start-screen-share: 스크린에 라이브 공유가 없을 때만 허용.
 * - connect-screen: 라이브 공유 중이고 가시 반경 안에 있을 때만 허용.
 * - disconnect-screen: 공유자 본인만 허용.
 */
export function resolveStudioScreenSlotAction(
  query: StudioScreenSlotActionQuery,
): StudioScreenSlotActionVerdict {
  const { action, screen, viewerId, distance } = query;
  const share = screen.share;
  if (action === "start-screen-share") {
    if (share && share.trackState === "live") return denied("already-sharing");
    return ALLOWED;
  }
  if (action === "connect-screen") {
    if (!share) return denied("no-share");
    if (share.trackState !== "live") return denied("share-ended");
    if (!Number.isFinite(distance) || distance < 0 || distance > screen.visibilityRadius) {
      return denied("out-of-range");
    }
    return ALLOWED;
  }
  if (action === "disconnect-screen") {
    if (!share) return denied("no-share");
    if (viewerId !== share.sharerId) return denied("not-sharer");
    return ALLOWED;
  }
  return denied("unknown-action");
}
