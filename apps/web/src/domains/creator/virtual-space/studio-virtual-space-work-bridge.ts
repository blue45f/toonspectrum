import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import { studioVirtualSpaceDestination } from "./studio-virtual-space-model";
import type {
  StudioOfficeInteractionResult,
  StudioOfficeObjectKind,
} from "./studio-virtual-space-office-interactables";
import type { StudioVirtualWorkspacePanel } from "./studio-virtual-space-panel-scope";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 업무 브리지 (Track J)
 *
 * 오피스 오브젝트 상호작용 결과를 실제 업무 동선으로 바꾸는 해석기.
 * office-interactables는 "가구 상태 전이"까지만 책임지고, 그 결과가 어느 화면·상태로
 * 이어지는지는 여기서 한 번만 정한다. 페이지(HUD)는 결정 목록을 순서대로 실행만 한다.
 *
 * 동선 원칙:
 * - 화이트보드 → 프로젝트 협업 캔버스 (개인 공간이면 내 스튜디오 홈)
 * - 회의실 문·회의 테이블 → "회의 중" 상태 + 허들(화상 회의 준비) 패널
 * - 프로젝트 보드 → 오늘 보드 패널 (작업 목록·다음 작업)
 * - 내 책상 앉기 → "집중 중" 상태 + 집중 세션 시작, 일어나면 세션 중단 + 상태 복원
 * - 커피 가져가기·카페테리아 → 휴식 이모트 + "휴식 중" 상태
 * - 책장 → 자료 탐색 화면 (/research/material-assets)
 *
 * 어떤 결정도 사용자 행동(상호작용 실행·제안 수락) 없이 실행되지 않는다.
 */

/** 상호작용 결과가 만드는 실행 결정. 페이지는 이 목록을 순서대로 적용한다. */
export type StudioWorkDecision =
  | { readonly kind: "route"; readonly href: string }
  | { readonly kind: "panel"; readonly panel: StudioVirtualWorkspacePanel }
  /** 이름표 상태 전이. activity가 있으면 도크 활동(집중/자리 비움)도 함께 맞춘다. */
  | { readonly kind: "status"; readonly userStatus: StudioUserStatus; readonly activity?: "focused" | "available" }
  | { readonly kind: "emote"; readonly emoteId: StudioSpaceEmoteId }
  | { readonly kind: "focus"; readonly command: "start" | "stop" }
  /** 화상 회의 진입 지점(허들 패널)을 연다. 장치 선택·참가 확정은 패널에서 사용자가 한다. */
  | { readonly kind: "huddle" }
  /** 화면 이동 없이 알림 문구만으로 충분한 결과. */
  | { readonly kind: "notice" };

export interface StudioWorkBridgeContext {
  readonly projectId: string;
  /** 개인 공간이면 프로젝트 경로 대신 개인 동선을 쓴다. */
  readonly personal: boolean;
  /** sit/stand처럼 결과만으로 대상을 알 수 없는 경우의 오브젝트 종류. */
  readonly objectKind: StudioOfficeObjectKind | null;
}

/** 자료 탐색 화면의 정본 경로 (research/material-assets 라우트). */
export const STUDIO_MATERIALS_HREF = "/research/material-assets";

const decision = <T extends StudioWorkDecision>(value: T): T => Object.freeze(value);
const NOTICE_ONLY: readonly StudioWorkDecision[] = Object.freeze([decision({ kind: "notice" })]);

function canvasHref(context: StudioWorkBridgeContext): string {
  if (context.personal) return "/studio";
  return studioVirtualSpaceDestination(context.projectId, "canvas") ?? "/studio";
}

/**
 * 오피스 상호작용 결과 1건을 업무 결정 목록으로 해석한다.
 * 상태 전이는 activateOfficeObject가 이미 계산한 userStatus와 이중으로 어긋나지 않게
 * "그 전이를 presence/HUD에 실제로 적용하라"는 명령으로만 표현한다.
 */
export function resolveOfficeWorkDecisions(
  result: StudioOfficeInteractionResult,
  context: StudioWorkBridgeContext,
): readonly StudioWorkDecision[] {
  switch (result.kind) {
    case "open-whiteboard":
      return Object.freeze([decision({ kind: "route", href: canvasHref(context) })]);
    case "enter-meeting":
    case "start-huddle":
      return Object.freeze([
        decision({ kind: "status", userStatus: "in-meeting" }),
        decision({ kind: "huddle" }),
      ]);
    case "open-project-board":
      return Object.freeze([decision({ kind: "panel", panel: "today" })]);
    case "open-materials":
      return Object.freeze([decision({ kind: "route", href: STUDIO_MATERIALS_HREF })]);
    case "open-notices":
      return Object.freeze([decision({ kind: "panel", panel: "today" })]);
    case "sit":
      // 내 책상에 앉으면 집중 상태 + 집중 세션. 그 외 의자는 앉기 알림만.
      return context.objectKind === "desk"
        ? Object.freeze([
          decision({ kind: "status", userStatus: "focusing", activity: "focused" }),
          decision({ kind: "focus", command: "start" }),
        ])
        : NOTICE_ONLY;
    case "stand":
      return context.objectKind === "desk"
        ? Object.freeze([
          decision({ kind: "focus", command: "stop" }),
          decision({ kind: "status", userStatus: "available", activity: "available" }),
        ])
        : NOTICE_ONLY;
    case "rest":
      return Object.freeze([
        decision({ kind: "status", userStatus: "break" }),
        decision({ kind: "emote", emoteId: "coffee" }),
      ]);
    case "stop-rest":
      return Object.freeze([decision({ kind: "status", userStatus: "available" })]);
    case "take-coffee":
      return Object.freeze([
        decision({ kind: "emote", emoteId: "coffee" }),
        decision({ kind: "status", userStatus: "break" }),
      ]);
    case "brew-coffee":
    case "toggle-door":
    case "toggle-light":
      return NOTICE_ONLY;
  }
}
