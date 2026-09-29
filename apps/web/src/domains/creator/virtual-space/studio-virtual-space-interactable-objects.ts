import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";

/**
 * G-3. 상호작용 오브젝트 (X키 인터랙션)
 *
 * Gather Town식 "X를 눌러 상호작용" 오브젝트의 toonstudio 적용:
 * - 오브젝트 접근 시 프롬프트 표시 ("X를 눌러 상호작용")
 * - X키 → 오브젝트를 전체화면/모달로 열기
 * - 웹툰 특화: 콘티 보드, 레퍼런스 이미지 보드
 *
 * 순수 로직 모듈. 실제 렌더링·키 바인딩은 호출 측에서 담당한다.
 */

/** 상호작용 오브젝트 종류. */
export type StudioInteractableObjectKind =
  | "whiteboard"   // 함께 그리기 화이트보드
  | "youtube"      // 함께 보기 YouTube
  | "document"     // 공유 문서
  | "storyboard"   // 웹툰 특화: 콘티 보드
  | "reference";   // 웹툰 특화: 레퍼런스 이미지 보드

export interface StudioInteractableObject {
  readonly id: string;
  readonly kind: StudioInteractableObjectKind;
  readonly position: StudioVirtualSpacePoint;
  /** 상호작용 가능 반경. */
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 프롬프트 표시 반경 (오브젝트 radius와 별개, UI 힌트용). */
export const STUDIO_INTERACT_PROMPT_RADIUS = 90;

const KIND_PROMPT_KO: Record<StudioInteractableObjectKind, string> = {
  whiteboard: "X를 눌러 화이트보드 열기",
  youtube: "X를 눌러 함께 보기",
  document: "X를 눌러 문서 열기",
  storyboard: "X를 눌러 콘티 보드 열기",
  reference: "X를 눌러 레퍼런스 보드 열기",
};

const KIND_PROMPT_EN: Record<StudioInteractableObjectKind, string> = {
  whiteboard: "Press X to open whiteboard",
  youtube: "Press X to watch together",
  document: "Press X to open document",
  storyboard: "Press X to open storyboard",
  reference: "Press X to open reference board",
};

/**
 * 아바타 위치에서 상호작용 가능한 가장 가까운 오브젝트를 찾는다.
 * 프롬프트 반경 안에 없으면 null.
 */
export function findNearestInteractable(
  objects: readonly StudioInteractableObject[],
  avatarPoint: StudioVirtualSpacePoint,
): StudioInteractableObject | null {
  let nearest: StudioInteractableObject | null = null;
  let nearestDistance = Infinity;
  for (const object of objects) {
    const distance = studioVirtualSpaceDistance(avatarPoint, object.position);
    const promptRadius = Math.max(object.radius, STUDIO_INTERACT_PROMPT_RADIUS);
    if (distance <= promptRadius && distance < nearestDistance) {
      nearest = object;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** X키 프롬프트 문구. */
export function interactPromptText(
  object: StudioInteractableObject,
): { readonly ko: string; readonly en: string } {
  return {
    ko: KIND_PROMPT_KO[object.kind],
    en: KIND_PROMPT_EN[object.kind],
  };
}

export type StudioInteractEvent =
  | { readonly kind: "prompt-shown"; readonly objectId: string; readonly at: number }
  | { readonly kind: "prompt-hidden"; readonly objectId: string; readonly at: number }
  | { readonly kind: "opened"; readonly objectId: string; readonly objectKind: StudioInteractableObjectKind; readonly at: number }
  | { readonly kind: "closed"; readonly objectId: string; readonly at: number };

/**
 * 이전/현재 포커스 오브젝트를 비교해 프롬프트 표시·숨김 이벤트를 뽑는다.
 */
export function diffInteractFocus(
  previous: StudioInteractableObject | null,
  current: StudioInteractableObject | null,
  at: number,
): readonly StudioInteractEvent[] {
  if (previous?.id === current?.id) return Object.freeze([]);
  const events: StudioInteractEvent[] = [];
  if (previous !== null) {
    events.push(Object.freeze({ kind: "prompt-hidden", objectId: previous.id, at }));
  }
  if (current !== null) {
    events.push(Object.freeze({ kind: "prompt-shown", objectId: current.id, at }));
  }
  return Object.freeze(events);
}

/**
 * X키 입력을 상호작용 열기 이벤트로 변환한다.
 * 포커스된 오브젝트가 없으면 null (무시).
 */
export function handleInteractKey(
  focused: StudioInteractableObject | null,
  at: number,
): StudioInteractEvent | null {
  if (focused === null) return null;
  return Object.freeze({
    kind: "opened",
    objectId: focused.id,
    objectKind: focused.kind,
    at,
  });
}
