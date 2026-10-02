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
  | "reference"    // 웹툰 특화: 레퍼런스 이미지 보드
  | "chair"        // 의자 (앉기/일어서기)
  | "door"         // 문 (열림/닫힘)
  | "bulletin"     // 게시판 (읽기)
  | "light-switch" // 조명 스위치 (켜기/끄기)
  | "coffee-machine"; // 커피 머신 (내리기/가져가기)

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
  chair: "X를 눌러 의자에 앉기",
  door: "X를 눌러 문 열기/닫기",
  bulletin: "X를 눌러 게시판 읽기",
  "light-switch": "X를 눌러 조명 켜기/끄기",
  "coffee-machine": "X를 눌러 커피 내리기",
};

const KIND_PROMPT_EN: Record<StudioInteractableObjectKind, string> = {
  whiteboard: "Press X to open whiteboard",
  youtube: "Press X to watch together",
  document: "Press X to open document",
  storyboard: "Press X to open storyboard",
  reference: "Press X to open reference board",
  chair: "Press X to use the chair",
  door: "Press X to toggle the door",
  bulletin: "Press X to read the board",
  "light-switch": "Press X to toggle the light",
  "coffee-machine": "Press X to brew coffee",
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

// ── 가구형 오브젝트 상태 머신 (Track C) ─────────────────────────────────────
// 의자/문/게시판/조명/커피머신은 "열기"가 아니라 상태를 가진다.
// 모든 전이는 아래 순수 함수로 수행하며, 렌더링은 호출 측이 담당한다.

/** 상태 키. "종류:상태" 형태. */
export type StudioInteractableStateKey =
  | "chair:empty" | "chair:occupied"
  | "door:closed" | "door:open"
  | "bulletin:unread" | "bulletin:read"
  | "light:off" | "light:on"
  | "coffee:idle" | "coffee:brewing" | "coffee:ready"
  | "media:closed" | "media:open";

/** 커피 추출에 걸리는 시간 (ms). */
export const STUDIO_COFFEE_BREW_MS = 8_000;

const INTERACTABLE_INITIAL_STATE: Record<StudioInteractableObjectKind, StudioInteractableStateKey> = {
  whiteboard: "media:closed",
  youtube: "media:closed",
  document: "media:closed",
  storyboard: "media:closed",
  reference: "media:closed",
  chair: "chair:empty",
  door: "door:closed",
  bulletin: "bulletin:unread",
  "light-switch": "light:off",
  "coffee-machine": "coffee:idle",
};

/** 종류별 초기 상태 키. */
export function interactableInitialState(kind: StudioInteractableObjectKind): StudioInteractableStateKey {
  return INTERACTABLE_INITIAL_STATE[kind];
}

/** 오브젝트 런타임 상태 (불변). */
export interface StudioInteractableRuntime {
  readonly objectId: string;
  readonly kind: StudioInteractableObjectKind;
  readonly stateKey: StudioInteractableStateKey;
  readonly stateChangedAt: number;
}

/** 런타임 상태를 만든다. */
export function createInteractableRuntime(
  objectId: string,
  kind: StudioInteractableObjectKind,
  at: number,
): StudioInteractableRuntime {
  return Object.freeze({
    objectId,
    kind,
    stateKey: interactableInitialState(kind),
    stateChangedAt: Number.isFinite(at) ? at : 0,
  });
}

/** 상태 키가 해당 종류의 유효한 키인지 검사한다. */
export function isInteractableStateKeyFor(
  kind: StudioInteractableObjectKind,
  stateKey: string,
): stateKey is StudioInteractableStateKey {
  const prefix = kind === "light-switch" ? "light:"
    : kind === "coffee-machine" ? "coffee:"
      : ["whiteboard", "youtube", "document", "storyboard", "reference"].includes(kind) ? "media:"
        : `${kind}:`;
  return stateKey.startsWith(prefix);
}

/** X키 액션에 따른 상태 전이. 전이 없으면 같은 상태를 돌려준다 (멱등). */
export function transitionInteractableState(
  kind: StudioInteractableObjectKind,
  stateKey: StudioInteractableStateKey,
): StudioInteractableStateKey {
  switch (kind) {
    case "chair":
      return stateKey === "chair:empty" ? "chair:occupied" : "chair:empty";
    case "door":
      return stateKey === "door:closed" ? "door:open" : "door:closed";
    case "bulletin":
      return stateKey === "bulletin:unread" ? "bulletin:read" : "bulletin:read";
    case "light-switch":
      return stateKey === "light:off" ? "light:on" : "light:off";
    case "coffee-machine":
      if (stateKey === "coffee:idle") return "coffee:brewing";
      if (stateKey === "coffee:ready") return "coffee:idle";
      return "coffee:brewing";
    default:
      return stateKey === "media:closed" ? "media:open" : "media:closed";
  }
}

/**
 * 시간 경과에 따른 자동 전이 (커피 추출 완료).
 * brewing 시작 후 STUDIO_COFFEE_BREW_MS가 지나면 ready가 된다.
 */
export function advanceInteractableRuntime(
  runtime: StudioInteractableRuntime,
  at: number,
): StudioInteractableRuntime {
  const safeAt = Number.isFinite(at) ? at : runtime.stateChangedAt;
  if (runtime.kind === "coffee-machine"
    && runtime.stateKey === "coffee:brewing"
    && safeAt - runtime.stateChangedAt >= STUDIO_COFFEE_BREW_MS) {
    return Object.freeze({ ...runtime, stateKey: "coffee:ready", stateChangedAt: safeAt });
  }
  return runtime;
}

/** X키 1회에 대한 전이 결과 (순수). */
export function activateInteractableRuntime(
  runtime: StudioInteractableRuntime,
  at: number,
): { readonly runtime: StudioInteractableRuntime; readonly changed: boolean; readonly notice: { readonly ko: string; readonly en: string } } {
  const safeAt = Number.isFinite(at) ? at : runtime.stateChangedAt;
  const nextKey = transitionInteractableState(runtime.kind, runtime.stateKey);
  const changed = nextKey !== runtime.stateKey;
  const next = changed
    ? Object.freeze({ ...runtime, stateKey: nextKey, stateChangedAt: safeAt })
    : runtime;
  return { runtime: next, changed, notice: interactableStateNotice(runtime.kind, nextKey) };
}

/** 상태 전이 결과 알림 문구. */
export function interactableStateNotice(
  kind: StudioInteractableObjectKind,
  stateKey: StudioInteractableStateKey,
): { readonly ko: string; readonly en: string } {
  switch (stateKey) {
    case "chair:occupied": return { ko: "의자에 앉았어요.", en: "You're seated." };
    case "chair:empty": return { ko: "의자에서 일어났어요.", en: "You stood up." };
    case "door:open": return { ko: "문을 열었어요.", en: "The door is open." };
    case "door:closed": return { ko: "문을 닫았어요.", en: "The door is closed." };
    case "bulletin:read": return { ko: "게시판을 읽었어요.", en: "You've read the board." };
    case "light:on": return { ko: "조명을 켰어요. 💡", en: "Lights on. 💡" };
    case "light:off": return { ko: "조명을 껐어요.", en: "Lights off." };
    case "coffee:brewing": return { ko: "커피를 내리는 중이에요… ☕", en: "Brewing coffee… ☕" };
    case "coffee:ready": return { ko: "커피가 준비됐어요! ☕", en: "Your coffee is ready! ☕" };
    case "coffee:idle": return kind === "coffee-machine"
      ? { ko: "커피를 가져갔어요.", en: "You took the coffee." }
      : { ko: "닫았어요.", en: "Closed." };
    case "media:open": return { ko: "열었어요.", en: "Opened." };
    default: return { ko: "닫았어요.", en: "Closed." };
  }
}

/** 현재 상태에서 X키를 눌렀을 때의 액션 문구 (상태 의존). */
export function interactableStateActionText(
  kind: StudioInteractableObjectKind,
  stateKey: StudioInteractableStateKey,
): { readonly ko: string; readonly en: string } {
  switch (stateKey) {
    case "chair:empty": return { ko: "앉기", en: "Sit down" };
    case "chair:occupied": return { ko: "일어서기", en: "Stand up" };
    case "door:closed": return { ko: "열기", en: "Open" };
    case "door:open": return { ko: "닫기", en: "Close" };
    case "bulletin:unread": return { ko: "읽기", en: "Read" };
    case "bulletin:read": return { ko: "다시 읽기", en: "Read again" };
    case "light:off": return { ko: "켜기", en: "Turn on" };
    case "light:on": return { ko: "끄기", en: "Turn off" };
    case "coffee:idle": return { ko: "커피 내리기", en: "Brew coffee" };
    case "coffee:brewing": return { ko: "추출 중…", en: "Brewing…" };
    case "coffee:ready": return { ko: "커피 가져가기", en: "Take coffee" };
    case "media:closed": return { ko: "열기", en: "Open" };
    default: return { ko: "닫기", en: "Close" };
  }
}

// ── 상호작용 오브젝트 레지스트리 (Track C) ─────────────────────────────────
// 이벤트 디렉터(B 트랙 계약)의 interactables 입력은 이 레지스트리에서 공급한다.
// 좌표는 기본 월드(1280x960) 기준이며, B 트랙이 실제 월드에 맞게 매핑한다.

export interface StudioInteractableRegistryEntry {
  readonly id: string;
  readonly kind: StudioInteractableObjectKind;
  readonly position: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

const registryEntry = (entry: StudioInteractableRegistryEntry): StudioInteractableRegistryEntry => Object.freeze(entry);

/** 기본 상호작용 오브젝트 배치. */
export const STUDIO_INTERACTABLE_OBJECT_REGISTRY: readonly StudioInteractableRegistryEntry[] = Object.freeze([
  registryEntry({ id: "lobby-bulletin", kind: "bulletin", position: { x: 700, y: 880 }, radius: 60, labelKo: "오늘의 공지 게시판", labelEn: "Today's notice board" }),
  registryEntry({ id: "lobby-light", kind: "light-switch", position: { x: 860, y: 880 }, radius: 50, labelKo: "로비 조명 스위치", labelEn: "Lobby light switch" }),
  registryEntry({ id: "lounge-chair", kind: "chair", position: { x: 540, y: 720 }, radius: 55, labelKo: "휴게 의자", labelEn: "Lounge chair" }),
  registryEntry({ id: "lounge-coffee", kind: "coffee-machine", position: { x: 645, y: 715 }, radius: 55, labelKo: "커피 머신", labelEn: "Coffee machine" }),
  registryEntry({ id: "meeting-door", kind: "door", position: { x: 1150, y: 800 }, radius: 60, labelKo: "회의실 문", labelEn: "Meeting room door" }),
  registryEntry({ id: "drawing-chair", kind: "chair", position: { x: 560, y: 470 }, radius: 55, labelKo: "작화 의자", labelEn: "Drawing chair" }),
  registryEntry({ id: "review-whiteboard", kind: "whiteboard", position: { x: 900, y: 470 }, radius: 60, labelKo: "리뷰 화이트보드", labelEn: "Review whiteboard" }),
  registryEntry({ id: "storyboard-board", kind: "storyboard", position: { x: 560, y: 200 }, radius: 60, labelKo: "콘티 보드", labelEn: "Storyboard board" }),
  registryEntry({ id: "assets-reference", kind: "reference", position: { x: 260, y: 200 }, radius: 60, labelKo: "레퍼런스 보드", labelEn: "Reference board" }),
  registryEntry({ id: "writers-document", kind: "document", position: { x: 260, y: 480 }, radius: 60, labelKo: "공유 대본 문서", labelEn: "Shared script document" }),
  registryEntry({ id: "live-screen", kind: "youtube", position: { x: 860, y: 770 }, radius: 65, labelKo: "함께 보기 스크린", labelEn: "Watch-together screen" }),
  registryEntry({ id: "production-light", kind: "light-switch", position: { x: 890, y: 200 }, radius: 50, labelKo: "프로덕션 조명 스위치", labelEn: "Production light switch" }),
  registryEntry({ id: "release-door", kind: "door", position: { x: 1180, y: 200 }, radius: 60, labelKo: "출고실 문", labelEn: "Release room door" }),
]);

/** 레지스트리에서 id로 조회한다. */
export function studioInteractableRegistryById(id: string): StudioInteractableRegistryEntry | null {
  return STUDIO_INTERACTABLE_OBJECT_REGISTRY.find((entry) => entry.id === id) ?? null;
}
